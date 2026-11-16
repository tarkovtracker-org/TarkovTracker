// @vitest-environment node
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/server/api/logs/progress.post';
import { MAX_CLIENT_LOG_BYTES } from '@/server/utils/clientLogBody';
import type { H3Event } from 'h3';
import {
  clientDiagnosticBody,
  diagnosticEvent,
} from '~~/scripts/checks/progress-diagnostic-fixture';
const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  stream: vi.fn(),
  status: vi.fn(),
  header: vi.fn(),
  consume: vi.fn(),
  handle: vi.fn(),
  limiter: vi.fn(),
  identity: vi.fn(),
}));
vi.mock('h3', async () => ({
  ...(await vi.importActual<typeof import('h3')>('h3')),
  defineEventHandler: (handler: unknown) => handler,
  setResponseStatus: mocks.status,
  setResponseHeader: mocks.header,
}));
mockNuxtImport('useRuntimeConfig', () => mocks.config);
vi.mock('@/server/utils/clientLogRequestStream', () => ({ clientLogRequestStream: mocks.stream }));
vi.mock('@/server/utils/requestIdentity', () => ({
  getProxyAwareClientIdentifier: mocks.identity,
}));
vi.mock('@/server/utils/sharedEdgeStore', () => ({
  consumeSharedRateLimit: mocks.consume,
  createSharedCacheHandle: mocks.handle,
  getRateLimiterBinding: mocks.limiter,
}));
describe('private progress diagnostic delivery', () => {
  let event: H3Event;
  const fetch = vi.fn();
  const body = (value: unknown) =>
    mocks.stream.mockReturnValue(new Blob([JSON.stringify(value)]).stream());
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.mockReturnValue({
      public: { appUrl: 'https://tarkovtracker.org' },
      apiProtection: { trustProxy: true },
    });
    fetch.mockResolvedValue(new Response(null, { status: 204 }));
    event = {
      node: {
        req: { headers: { host: 'tarkovtracker.org' }, url: '/api/logs/progress?private=query' },
      },
      context: { cloudflare: { env: { PROGRESS_DIAGNOSTICS: { fetch } } } },
      web: {
        request: new Request('https://tarkovtracker.org/api/logs/progress?private=query', {
          headers: {
            Cookie: 'private-cookie',
            Authorization: 'private-token',
            Referer: 'private-referrer',
          },
        }),
      },
    } as unknown as H3Event;
    mocks.limiter.mockReturnValue({ limiter: true });
    mocks.handle.mockReturnValue({ handle: true });
    mocks.identity.mockReturnValue('private-client-ip');
    mocks.consume.mockResolvedValue(true);
    body(clientDiagnosticBody());
  });
  it('sends only reconstructed aggregates with fresh constant request metadata', async () => {
    const input = clientDiagnosticBody();
    const payload = input.args[1] as ReturnType<typeof diagnosticEvent>;
    Object.assign(input, {
      href: 'private-location',
      referrer: 'private-referrer',
      userId: 'private-user',
    });
    Object.assign(payload, { profile: { secretKey: 'raw-content' }, token: 'private-token' });
    Object.assign(payload.modes.pvp, { raw: 'private-profile' });
    Object.assign(payload.modes.pvp.counts, { privateKey: 123 });
    body(input);
    await handler(event);
    expect(fetch).toHaveBeenCalledExactlyOnceWith('https://progress-diagnostics.internal/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(diagnosticEvent()),
    });
    expect(mocks.handle).toHaveBeenCalledWith('https://tarkovtracker.org', { limiter: true });
    expect(mocks.identity).toHaveBeenCalledWith(event, true);
    expect(mocks.consume).toHaveBeenCalledWith(
      { handle: true },
      'progress-diagnostics-rate',
      'progress-diagnostics:ip:private-client-ip',
      10,
      60_000,
      expect.any(Function)
    );
    expect(mocks.status).toHaveBeenCalledWith(event, 204);
  });
  it('awaits private delivery before finishing the Pages invocation', async () => {
    let release!: (response: Response) => void;
    fetch.mockReturnValue(
      new Promise<Response>((resolve) => {
        release = resolve;
      })
    );
    let finished = false;
    const pending = handler(event).then(() => {
      finished = true;
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(finished).toBe(false);
    release(new Response(null, { status: 204 }));
    await pending;
    expect(finished).toBe(true);
  });
  it.each(['denied', 'missing limiter', 'missing collector', 'limiter error', 'limiter throws'])(
    'fails closed before reading the body when %s',
    async (kind) => {
      if (kind === 'denied') mocks.consume.mockResolvedValue(false);
      if (kind === 'missing limiter') mocks.limiter.mockReturnValue(null);
      if (kind === 'missing collector') delete event.context.cloudflare.env.PROGRESS_DIAGNOSTICS;
      if (kind === 'limiter throws') mocks.consume.mockRejectedValue(new Error('private-error'));
      if (kind === 'limiter error')
        mocks.consume.mockImplementation(async (...args: unknown[]) => {
          (args[5] as () => void)();
          return true;
        });
      await handler(event);
      expect(mocks.stream).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    }
  );
  it.each(['bytes', 'depth', 'malformed', 'invalid schema'])(
    'drops %s without delivery or arbitrary error logs',
    async (kind) => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const raw = {
        bytes: JSON.stringify({
          ...clientDiagnosticBody(),
          ignored: 'x'.repeat(MAX_CLIENT_LOG_BYTES),
        }),
        depth:
          JSON.stringify(clientDiagnosticBody()).slice(0, -1) +
          ',"ignored":' +
          '['.repeat(10_000) +
          '0' +
          ']'.repeat(10_000) +
          '}',
        malformed: '{private-error',
        'invalid schema': JSON.stringify({ args: ['progress_sync_payload', { token: 'private' }] }),
      }[kind]!;
      mocks.stream.mockReturnValue(new Blob([raw]).stream());
      await handler(event);
      expect(fetch).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    }
  );
  it('drops generic client log envelopes instead of collecting their contents', async () => {
    body({ args: ['private-client-message', diagnosticEvent()] });
    await handler(event);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not log identifying cache keys or arbitrary limiter failures', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.consume.mockImplementation(async (...args: unknown[]) => {
      (args[5] as (failure: unknown) => void)({
        action: 'read',
        key: 'private-client-ip',
        error: new Error('private-token'),
      });
      return true;
    });
    await handler(event);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    'tarkovtracker.pages.dev',
    'hash.tarkovtracker.pages.dev',
    'preview.tarkovtracker.pages.dev',
  ])('drops deployment host %s even with forged forwarding headers', async (host) => {
    Object.assign(event.node.req.headers, {
      host,
      'x-forwarded-host': 'tarkovtracker.org',
      forwarded: 'host=tarkovtracker.org;proto=https',
    });
    await handler(event);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([undefined, '', 'invalid-url', 'http://tarkovtracker.org'])(
    'drops unconfigured or invalid canonical APP_URL %s',
    async (appUrl) => {
      mocks.config.mockReturnValue({ public: { appUrl } });
      await handler(event);
      expect(mocks.consume).not.toHaveBeenCalled();
      expect(mocks.stream).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    }
  );
  it.each([
    '/api%2flogs/progress',
    '/API/logs/progress',
    '//api/logs/progress',
    '/api/logs/progress/',
    '/api/logs/%70rogress',
  ])('drops noncanonical raw path %s before the limiter and body', async (url) => {
    event.node.req.url = url;
    await handler(event);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses the original raw pathname before any router rewrite', async () => {
    event.node.req.originalUrl = '/api%2flogs/progress';
    await handler(event);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('never logs the binding rejection or returns it to the browser', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch.mockRejectedValue(new Error('private-token private-content'));
    expect(await handler(event)).toBeNull();
    expect(error).not.toHaveBeenCalled();
    expect(mocks.status).toHaveBeenCalledWith(event, 204);
  });
});
