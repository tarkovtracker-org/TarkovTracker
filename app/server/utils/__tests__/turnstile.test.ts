import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/server/utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));
const fetchMock = vi.fn();
const siteverifyResponse = (body: unknown, status = 200) => ({
  json: async () => body,
  ok: status >= 200 && status < 300,
  status,
});
describe('verifyTurnstileToken', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const loadUtil = async () => {
    vi.resetModules();
    return (await import('@/server/utils/turnstile')).verifyTurnstileToken;
  };
  it('rejects missing tokens without calling siteverify', async () => {
    const verifyTurnstileToken = await loadUtil();
    await expect(verifyTurnstileToken({ secretKey: 'secret', token: '' })).resolves.toEqual({
      ok: false,
      reason: 'missing-token',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects oversized tokens without calling siteverify', async () => {
    const verifyTurnstileToken = await loadUtil();
    await expect(
      verifyTurnstileToken({ secretKey: 'secret', token: 'x'.repeat(2049) })
    ).resolves.toEqual({
      ok: false,
      reason: 'invalid-token',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('accepts tokens that siteverify validates', async () => {
    fetchMock.mockResolvedValue(
      siteverifyResponse({ hostname: 'tarkovtracker.org', success: true })
    );
    const verifyTurnstileToken = await loadUtil();
    await expect(
      verifyTurnstileToken({
        allowedHostnames: ['tarkovtracker.org'],
        secretKey: 'secret',
        token: 'token',
      })
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({ method: 'POST' })
    );
  });
  it('passes the client IP to siteverify when available', async () => {
    fetchMock.mockResolvedValue(
      siteverifyResponse({ hostname: 'tarkovtracker.org', success: true })
    );
    const verifyTurnstileToken = await loadUtil();
    await verifyTurnstileToken({
      allowedHostnames: ['tarkovtracker.org'],
      remoteIp: '203.0.113.10',
      secretKey: 'secret',
      token: 'token',
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body?.toString()).toContain('remoteip=203.0.113.10');
  });
  it('rejects tokens that siteverify declines', async () => {
    fetchMock.mockResolvedValue(
      siteverifyResponse({ 'error-codes': ['invalid-input-response'], success: false })
    );
    const verifyTurnstileToken = await loadUtil();
    await expect(verifyTurnstileToken({ secretKey: 'secret', token: 'token' })).resolves.toEqual({
      ok: false,
      reason: 'invalid-token',
    });
  });
  it('rejects tokens minted for other hostnames', async () => {
    fetchMock.mockResolvedValue(siteverifyResponse({ hostname: 'evil.example', success: true }));
    const verifyTurnstileToken = await loadUtil();
    await expect(
      verifyTurnstileToken({
        allowedHostnames: ['tarkovtracker.org'],
        secretKey: 'secret',
        token: 'token',
      })
    ).resolves.toEqual({ ok: false, reason: 'hostname-mismatch' });
  });
  it('rejects successful responses without a hostname when a hostname allowlist is configured', async () => {
    fetchMock.mockResolvedValue(siteverifyResponse({ success: true }));
    const verifyTurnstileToken = await loadUtil();
    await expect(
      verifyTurnstileToken({
        allowedHostnames: ['tarkovtracker.org'],
        secretKey: 'secret',
        token: 'token',
      })
    ).resolves.toEqual({ ok: false, reason: 'hostname-mismatch' });
  });
  it('rejects subdomains that are not explicitly allowlisted', async () => {
    fetchMock.mockResolvedValue(
      siteverifyResponse({ hostname: 'www.tarkovtracker.org', success: true })
    );
    const verifyTurnstileToken = await loadUtil();
    await expect(
      verifyTurnstileToken({
        allowedHostnames: ['tarkovtracker.org'],
        secretKey: 'secret',
        token: 'token',
      })
    ).resolves.toEqual({ ok: false, reason: 'hostname-mismatch' });
  });
  it('fails open when siteverify is unavailable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const verifyTurnstileToken = await loadUtil();
    await expect(verifyTurnstileToken({ secretKey: 'secret', token: 'token' })).resolves.toEqual({
      ok: true,
    });
  });
  it('fails open when siteverify returns a server error', async () => {
    fetchMock.mockResolvedValue(siteverifyResponse(null, 503));
    const verifyTurnstileToken = await loadUtil();
    await expect(verifyTurnstileToken({ secretKey: 'secret', token: 'token' })).resolves.toEqual({
      ok: true,
    });
  });
  it('fails closed when siteverify returns malformed successful JSON', async () => {
    fetchMock.mockResolvedValue(siteverifyResponse(null));
    const verifyTurnstileToken = await loadUtil();
    await expect(verifyTurnstileToken({ secretKey: 'secret', token: 'token' })).resolves.toEqual({
      ok: false,
      reason: 'invalid-token',
    });
  });
  it('fails closed when siteverify returns malformed response fields', async () => {
    fetchMock.mockResolvedValue(siteverifyResponse({ hostname: 42, success: true }));
    const verifyTurnstileToken = await loadUtil();
    await expect(verifyTurnstileToken({ secretKey: 'secret', token: 'token' })).resolves.toEqual({
      ok: false,
      reason: 'invalid-token',
    });
  });
});
