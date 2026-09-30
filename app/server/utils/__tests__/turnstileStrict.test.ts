import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/server/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));
/**
 * Focused suite for the strict verifier powering POST /api/security/tarkov-verify.
 * Unlike the legacy fail-open verifier (covered in turnstile.test.ts), every failure
 * here must classify strictly so the endpoint can fail closed (4xx / 503 — never ok).
 */
describe('verifyTurnstileTokenStrict', () => {
  const fetchMock = vi.fn();
  const siteverifyResponse = (body: unknown, status = 200) => ({
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    ok: status >= 200 && status < 300,
    status,
  });
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const loadUtil = async () => {
    vi.resetModules();
    return (await import('@/server/utils/turnstile')) as typeof import('@/server/utils/turnstile');
  };
  it('accepts tokens siteverify validates against the exact expected context', async () => {
    fetchMock.mockResolvedValue(
      siteverifyResponse({
        hostname: 'tarkovtracker.org',
        action: 'tarkov_data_access',
        success: true,
      })
    );
    const { verifyTurnstileTokenStrict, TARKOV_DATA_ACCESS_ACTION } = await loadUtil();
    await expect(
      verifyTurnstileTokenStrict({
        expectedAction: TARKOV_DATA_ACCESS_ACTION,
        expectedHostnames: ['tarkovtracker.org'],
        remoteIp: '203.0.113.5',
        secretKey: 'secret',
        token: ' token ',
      })
    ).resolves.toEqual({ ok: true });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = (init.body as URLSearchParams).toString();
    expect(body).toContain('response=token');
    expect(body).toContain('remoteip=203.0.113.5');
  });
  it('rejects tokens minted for another action', async () => {
    fetchMock.mockResolvedValue(
      siteverifyResponse({ hostname: 'tarkovtracker.org', action: 'other_action', success: true })
    );
    const { verifyTurnstileTokenStrict, TARKOV_DATA_ACCESS_ACTION } = await loadUtil();
    await expect(
      verifyTurnstileTokenStrict({
        expectedAction: TARKOV_DATA_ACCESS_ACTION,
        expectedHostnames: ['tarkovtracker.org'],
        secretKey: 'secret',
        token: 'token',
      })
    ).resolves.toEqual({ ok: false, reason: 'action-mismatch' });
  });
  it('treats an omitted upstream action as a context mismatch', async () => {
    fetchMock.mockResolvedValue(
      siteverifyResponse({ hostname: 'tarkovtracker.org', success: true })
    );
    const { verifyTurnstileTokenStrict, TARKOV_DATA_ACCESS_ACTION } = await loadUtil();
    await expect(
      verifyTurnstileTokenStrict({
        expectedAction: TARKOV_DATA_ACCESS_ACTION,
        expectedHostnames: ['tarkovtracker.org'],
        secretKey: 'secret',
        token: 'token',
      })
    ).resolves.toEqual({ ok: false, reason: 'action-mismatch' });
  });
  it('rejects tokens minted for other, absent, or subdomain hostnames', async () => {
    const { verifyTurnstileTokenStrict, TARKOV_DATA_ACCESS_ACTION } = await loadUtil();
    const cases: Array<[unknown, string]> = [
      [
        { hostname: 'evil.example', action: 'tarkov_data_access', success: true },
        'hostname-mismatch',
      ],
      [{ action: 'tarkov_data_access', success: true }, 'hostname-mismatch'],
      [
        { hostname: 'www.tarkovtracker.org', action: 'tarkov_data_access', success: true },
        'hostname-mismatch',
      ],
    ];
    for (const [body, expectedReason] of cases) {
      fetchMock.mockResolvedValue(siteverifyResponse(body));
      await expect(
        verifyTurnstileTokenStrict({
          expectedAction: TARKOV_DATA_ACCESS_ACTION,
          expectedHostnames: ['tarkovtracker.org'],
          secretKey: 'secret',
          token: 'token',
        })
      ).resolves.toEqual({ ok: false, reason: expectedReason });
    }
  });
  it('classifies siteverify rejection codes into replay/expiry/invalid', async () => {
    const { verifyTurnstileTokenStrict, TARKOV_DATA_ACCESS_ACTION } = await loadUtil();
    const cases: Array<[string[], string]> = [
      [['timeout-or-duplicate'], 'replayed-token'],
      [['expired-token'], 'expired-token'],
      [['invalid-input-response'], 'invalid-token'],
      [[], 'invalid-token'],
    ];
    for (const [errorCodes, expectedReason] of cases) {
      fetchMock.mockResolvedValue(
        siteverifyResponse({ 'error-codes': errorCodes, success: false })
      );
      await expect(
        verifyTurnstileTokenStrict({
          expectedAction: TARKOV_DATA_ACCESS_ACTION,
          expectedHostnames: ['tarkovtracker.org'],
          secretKey: 'secret',
          token: 'token',
        })
      ).resolves.toEqual({ ok: false, reason: expectedReason });
    }
  });
  it('reports transport failures, server errors, and undecodable payloads as unavailable', async () => {
    const { verifyTurnstileTokenStrict, TARKOV_DATA_ACCESS_ACTION } = await loadUtil();
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(
      verifyTurnstileTokenStrict({
        expectedAction: TARKOV_DATA_ACCESS_ACTION,
        expectedHostnames: ['tarkovtracker.org'],
        secretKey: 'secret',
        token: 'token',
      })
    ).resolves.toEqual({ ok: false, reason: 'siteverify-unavailable' });
    fetchMock.mockResolvedValue(siteverifyResponse('ignored body', 503));
    await expect(
      verifyTurnstileTokenStrict({
        expectedAction: TARKOV_DATA_ACCESS_ACTION,
        expectedHostnames: ['tarkovtracker.org'],
        secretKey: 'secret',
        token: 'token',
      })
    ).resolves.toEqual({ ok: false, reason: 'siteverify-unavailable' });
    fetchMock.mockResolvedValue(siteverifyResponse('not json'));
    await expect(
      verifyTurnstileTokenStrict({
        expectedAction: TARKOV_DATA_ACCESS_ACTION,
        expectedHostnames: ['tarkovtracker.org'],
        secretKey: 'secret',
        token: 'token',
      })
    ).resolves.toEqual({ ok: false, reason: 'siteverify-unavailable' });
  });
  it('reports malformed successful payloads instead of trusting them', async () => {
    const { verifyTurnstileTokenStrict, TARKOV_DATA_ACCESS_ACTION } = await loadUtil();
    const cases: Array<[unknown, string]> = [
      [{ hostname: 42, action: 'tarkov_data_access', success: true }, 'siteverify-malformed'],
      [{ action: 'tarkov_data_access', hostname: true, success: true }, 'siteverify-malformed'],
    ];
    for (const [body, expectedReason] of cases) {
      fetchMock.mockResolvedValue(siteverifyResponse(body));
      await expect(
        verifyTurnstileTokenStrict({
          expectedAction: TARKOV_DATA_ACCESS_ACTION,
          expectedHostnames: ['tarkovtracker.org'],
          secretKey: 'secret',
          token: 'token',
        })
      ).resolves.toEqual({ ok: false, reason: expectedReason });
    }
  });
  it('rejects missing and oversized tokens before any upstream call', async () => {
    const { verifyTurnstileTokenStrict, TARKOV_DATA_ACCESS_ACTION } = await loadUtil();
    await expect(
      verifyTurnstileTokenStrict({
        expectedAction: TARKOV_DATA_ACCESS_ACTION,
        expectedHostnames: ['tarkovtracker.org'],
        secretKey: 'secret',
        token: '   ',
      })
    ).resolves.toEqual({ ok: false, reason: 'missing-token' });
    await expect(
      verifyTurnstileTokenStrict({
        expectedAction: TARKOV_DATA_ACCESS_ACTION,
        expectedHostnames: ['tarkovtracker.org'],
        secretKey: 'secret',
        token: 'x'.repeat(2049),
      })
    ).resolves.toEqual({ ok: false, reason: 'oversized-token' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects an empty hostname allowlist regardless of action', async () => {
    fetchMock.mockResolvedValue(
      siteverifyResponse({ action: 'tarkov_data_access', success: true })
    );
    const { verifyTurnstileTokenStrict, TARKOV_DATA_ACCESS_ACTION } = await loadUtil();
    await expect(
      verifyTurnstileTokenStrict({
        expectedAction: TARKOV_DATA_ACCESS_ACTION,
        expectedHostnames: [],
        secretKey: 'secret',
        token: 'token',
      })
    ).resolves.toEqual({ ok: false, reason: 'hostname-mismatch' });
    fetchMock.mockResolvedValue(
      siteverifyResponse({ action: 'other', success: true, hostname: undefined })
    );
    await expect(
      verifyTurnstileTokenStrict({
        expectedAction: TARKOV_DATA_ACCESS_ACTION,
        expectedHostnames: [],
        secretKey: 'secret',
        token: 'token',
      })
    ).resolves.toEqual({ ok: false, reason: 'hostname-mismatch' });
  });
  it.each(['internal-error', 'invalid-input-secret', 'missing-input-secret'])(
    'reports Siteverify %s as service unavailability',
    async (code) => {
      fetchMock.mockResolvedValue(siteverifyResponse({ success: false, 'error-codes': [code] }));
      const { verifyTurnstileTokenStrict, TARKOV_DATA_ACCESS_ACTION } = await loadUtil();
      await expect(
        verifyTurnstileTokenStrict({
          expectedAction: TARKOV_DATA_ACCESS_ACTION,
          expectedHostnames: ['tarkovtracker.org'],
          secretKey: 'secret',
          token: 'token',
        })
      ).resolves.toEqual({ ok: false, reason: 'siteverify-unavailable' });
    }
  );
});
