import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event } from 'h3';
const {
  mockGetMethod,
  mockGetRequestHeader,
  mockGetRequestWebStream,
  mockReadRawBody,
  mockSetResponseHeader,
  mockLogger,
  mockResolveTarkovAccessServerConfig,
  mockToPositiveInteger,
  mockGetClientAddress,
  mockConsumeSharedRateLimitWithReset,
  mockCreateSharedCacheHandle,
  mockGetRateLimiterBinding,
  mockVerifyTurnstileTokenStrict,
} = vi.hoisted(() => ({
  mockGetMethod: vi.fn(),
  mockGetRequestHeader: vi.fn(),
  mockGetRequestWebStream: vi.fn(),
  mockReadRawBody: vi.fn(),
  mockSetResponseHeader: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  mockResolveTarkovAccessServerConfig: vi.fn(),
  mockToPositiveInteger: vi.fn(),
  mockGetClientAddress: vi.fn(),
  mockConsumeSharedRateLimitWithReset: vi.fn(),
  mockCreateSharedCacheHandle: vi.fn(),
  mockGetRateLimiterBinding: vi.fn(),
  mockVerifyTurnstileTokenStrict: vi.fn(),
}));
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3');
  return {
    ...actual,
    defineEventHandler: (handler: unknown) => handler,
    getMethod: mockGetMethod,
    getRequestHeader: mockGetRequestHeader,
    getRequestWebStream: mockGetRequestWebStream,
    readRawBody: mockReadRawBody,
    setResponseHeader: mockSetResponseHeader,
  };
});
vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({
    apiProtection: { trustProxy: true },
    public: { appUrl: 'https://tarkovtracker.org' },
  }),
}));
vi.mock('@/server/utils/logger', () => ({
  createLogger: () => mockLogger,
}));
vi.mock('@/server/utils/requestIdentity', () => ({
  // The endpoint must sign Siteverify with the sanitized client IP; a null address
  // simply omits the remoteip binding.
  getClientAddress: mockGetClientAddress,
}));
vi.mock('@/server/utils/tarkovAccessConfig', () => ({
  resolveTarkovAccessServerConfig: mockResolveTarkovAccessServerConfig,
  toPositiveInteger: mockToPositiveInteger,
}));
vi.mock('@/server/utils/sharedEdgeStore', () => ({
  consumeSharedRateLimitWithReset: mockConsumeSharedRateLimitWithReset,
  createSharedCacheHandle: mockCreateSharedCacheHandle,
  getRateLimiterBinding: mockGetRateLimiterBinding,
}));
vi.mock('@/server/utils/turnstile', () => ({
  verifyTurnstileTokenStrict: mockVerifyTurnstileTokenStrict,
}));
describe('POST /api/security/tarkov-verify', () => {
  const event = {} as unknown as H3Event;
  const strictAccess = {
    enabled: true,
    expectedAction: 'tarkov_data_access',
    expectedHostnames: ['tarkovtracker.org'],
    flagEnabled: true,
    secretKey: 'secret-key',
    siteKey: 'site-key',
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMethod.mockReturnValue('POST');
    mockGetRequestHeader.mockImplementation((_event: unknown, name: string) =>
      name === 'content-type' ? 'application/json' : undefined
    );
    mockGetRequestWebStream.mockReturnValue(null);
    mockReadRawBody.mockResolvedValue(Buffer.from(JSON.stringify({ token: 'tok' })));
    mockGetClientAddress.mockReturnValue('198.51.100.4');
    mockGetRateLimiterBinding.mockReturnValue(null);
    mockCreateSharedCacheHandle.mockReturnValue({ cache: null, origin: {} });
    mockToPositiveInteger.mockImplementation((value: unknown, fallback: number) =>
      typeof value === 'number' && value > 0 ? value : fallback
    );
    mockResolveTarkovAccessServerConfig.mockReturnValue(strictAccess);
    mockConsumeSharedRateLimitWithReset.mockResolvedValue({
      allowed: true,
      resetAt: Date.now() + 60_000,
    });
    mockVerifyTurnstileTokenStrict.mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('answers no-store siteverify success for a well-formed token', async () => {
    const { default: handler } = await import('@/server/api/security/tarkov-verify.post');
    await expect(handler(event)).resolves.toEqual({ ok: true });
    expect(mockSetResponseHeader).toHaveBeenCalledWith(event, 'Cache-Control', 'no-store');
    expect(mockVerifyTurnstileTokenStrict).toHaveBeenCalledTimes(1);
  });
  it('answers 503 before consuming a body when the strict gate is not configured', async () => {
    mockResolveTarkovAccessServerConfig.mockReturnValue({ ...strictAccess, enabled: false });
    const { default: handler } = await import('@/server/api/security/tarkov-verify.post');
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 503 });
    expect(mockReadRawBody).not.toHaveBeenCalled();
    expect(mockGetRequestWebStream).not.toHaveBeenCalled();
    expect(mockVerifyTurnstileTokenStrict).not.toHaveBeenCalled();
  });
  it('rejects non-POST methods with 405', async () => {
    mockGetMethod.mockReturnValue('GET');
    const { default: handler } = await import('@/server/api/security/tarkov-verify.post');
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 405 });
  });
  it.each(['application/x-www-form-urlencoded', 'text/plain;x=application/json', ''])(
    'rejects non-JSON content type %j with 415',
    async (contentType) => {
      mockGetRequestHeader.mockImplementation((_event: unknown, name: string) =>
        name === 'content-type' ? contentType : undefined
      );
      const { default: handler } = await import('@/server/api/security/tarkov-verify.post');
      await expect(handler(event)).rejects.toMatchObject({ statusCode: 415 });
      expect(mockReadRawBody).not.toHaveBeenCalled();
    }
  );
  it('accepts a JSON content type with parameters', async () => {
    mockGetRequestHeader.mockImplementation((_event: unknown, name: string) =>
      name === 'content-type' ? 'Application/JSON; charset=utf-8' : undefined
    );
    const { default: handler } = await import('@/server/api/security/tarkov-verify.post');
    await expect(handler(event)).resolves.toBeDefined();
  });
  it('rejects rate-limited requests with 429 and a Retry-After hint', async () => {
    mockConsumeSharedRateLimitWithReset.mockResolvedValue({
      allowed: false,
      resetAt: Date.now() + 30_000,
    });
    const { default: handler } = await import('@/server/api/security/tarkov-verify.post');
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 429 });
    const retryCall = mockSetResponseHeader.mock.calls.find(([, name]) => name === 'Retry-After');
    expect(retryCall?.[2]).toBeGreaterThanOrEqual(1);
    expect(retryCall?.[2]).toBeLessThanOrEqual(60);
    expect(mockReadRawBody).not.toHaveBeenCalled();
    expect(mockVerifyTurnstileTokenStrict).not.toHaveBeenCalled();
  });
  it('rejects requests without a resolved client address before rate limiting', async () => {
    mockGetClientAddress.mockReturnValue(null);
    const { default: handler } = await import('@/server/api/security/tarkov-verify.post');
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockConsumeSharedRateLimitWithReset).not.toHaveBeenCalled();
    expect(mockVerifyTurnstileTokenStrict).not.toHaveBeenCalled();
  });
  it('rejects declared content lengths past the cap with 413 before any read', async () => {
    mockGetRequestHeader.mockImplementation((_event: unknown, name: string) =>
      name === 'content-type'
        ? 'application/json'
        : name === 'content-length'
          ? String(64 * 1024)
          : undefined
    );
    const { default: handler } = await import('@/server/api/security/tarkov-verify.post');
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 413 });
    expect(mockReadRawBody).not.toHaveBeenCalled();
    expect(mockGetRequestWebStream).not.toHaveBeenCalled();
  });
  it('cancels unbounded chunked streams past the cap with 413', async () => {
    mockGetRequestHeader.mockImplementation((_event: unknown, name: string) =>
      name === 'content-type' ? 'application/json' : undefined
    );
    mockGetRequestWebStream.mockReturnValue(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(17 * 1024).fill(0x41));
          controller.close();
        },
      })
    );
    const { default: handler } = await import('@/server/api/security/tarkov-verify.post');
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 413 });
    expect(mockReadRawBody).not.toHaveBeenCalled();
    expect(mockVerifyTurnstileTokenStrict).not.toHaveBeenCalled();
  });
  it('rejects unreadable, malformed, and wrongly shaped bodies with 400', async () => {
    const { default: handler } = await import('@/server/api/security/tarkov-verify.post');
    mockReadRawBody.mockRejectedValueOnce(new Error('aborted'));
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
    mockReadRawBody.mockResolvedValueOnce(Buffer.from('{bad'));
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
    mockReadRawBody.mockResolvedValueOnce(Buffer.from(JSON.stringify(['tok'])));
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
    mockReadRawBody.mockResolvedValueOnce(Buffer.from(JSON.stringify({ tok: 'tok' })));
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
    expect(mockVerifyTurnstileTokenStrict).not.toHaveBeenCalled();
  });
  it('passes the strict context and sanitized client IP to Siteverify', async () => {
    const { default: handler } = await import('@/server/api/security/tarkov-verify.post');
    await handler(event);
    expect(mockVerifyTurnstileTokenStrict).toHaveBeenCalledWith({
      expectedAction: 'tarkov_data_access',
      expectedHostnames: ['tarkovtracker.org'],
      remoteIp: '198.51.100.4',
      secretKey: 'secret-key',
      token: 'tok',
    });
  });
  it('maps strict rejections to 403 and outages to 503 without internal errors', async () => {
    const { default: handler } = await import('@/server/api/security/tarkov-verify.post');
    mockVerifyTurnstileTokenStrict.mockResolvedValue({ ok: false, reason: 'invalid-token' });
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 });
    mockVerifyTurnstileTokenStrict.mockResolvedValue({ ok: false, reason: 'missing-token' });
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
    mockVerifyTurnstileTokenStrict.mockResolvedValue({
      ok: false,
      reason: 'siteverify-unavailable',
    });
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 503 });
    mockVerifyTurnstileTokenStrict.mockResolvedValue({ ok: false, reason: 'siteverify-malformed' });
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 503 });
  });
});
