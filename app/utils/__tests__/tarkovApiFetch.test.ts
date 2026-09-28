// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  abandonSharedWait,
  buildTarkovApiUrl,
  dismissTarkovAccessGate,
  ensureTarkovAccess,
  getTarkovAccessState,
  isTarkovAccessEnabled,
  rawTarkovRequest,
  readTarkovApiJson,
  renewTarkovAccess,
  reportGateWidgetUnavailable,
  requestGateRetry,
  resetTarkovAccessForTests,
  resolveTarkovAccessSiteKey,
  submitGateToken,
  TarkovAccessError,
  TarkovApiInvalidResponseError,
  TarkovApiStatusError,
  tarkovApiFetch,
} from '@/utils/tarkovApiFetch';
const { config } = vi.hoisted(() => ({ config: vi.fn() }));
mockNuxtImport('useRuntimeConfig', () => config);
vi.mock('@/utils/logger', () => ({ logger: { warn: vi.fn(), debug: vi.fn() } }));
const json = (body: unknown = { ok: true }, status = 200) =>
  new Response(JSON.stringify(body), { status });
const challenge = () =>
  new Response('NOT JSON', {
    status: 403,
    headers: { 'cf-mitigated': 'challenge' },
  });
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
let network: ReturnType<typeof vi.fn>;
beforeEach(() => {
  resetTarkovAccessForTests();
  config.mockReturnValue({ public: { tarkovAccessEnabled: true } });
  network = vi.fn();
  vi.stubGlobal('fetch', network);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('Tarkov browser access', () => {
  it('preserves disabled transport', async () => {
    config.mockReturnValue({ public: { tarkovAccessEnabled: false } });
    const direct = vi.fn().mockResolvedValue({ data: [] });
    vi.stubGlobal('$fetch', direct);
    expect(await tarkovApiFetch('/api/tarkov/items')).toEqual({ data: [] });
    expect(network).not.toHaveBeenCalled();
  });
  it('shares the initial probe and reuses its release', async () => {
    network.mockResolvedValueOnce(json());
    expect(await Promise.all([ensureTarkovAccess(), ensureTarkovAccess()])).toEqual([1, 1]);
    expect(await ensureTarkovAccess()).toBe(1);
    expect(network).toHaveBeenCalledTimes(1);
  });
  it('validates one token for concurrent waiters then repeats the probe', async () => {
    network
      .mockResolvedValueOnce(challenge())
      .mockResolvedValueOnce(json())
      .mockResolvedValueOnce(json());
    const waiting = Promise.all([ensureTarkovAccess(), ensureTarkovAccess()]);
    await flush();
    expect(getTarkovAccessState().phase.value).toBe('challenge');
    submitGateToken('one-use');
    submitGateToken('ignored');
    await waiting;
    expect(network).toHaveBeenCalledTimes(3);
    expect(network.mock.calls[1]?.[1].body).toBe(JSON.stringify({ token: 'one-use' }));
  });
  it.each([
    [403, 'blocked'],
    [429, 'rate_limited'],
    [500, 'failed'],
  ])('does not retry ordinary %i failures automatically', async (status, kind) => {
    network.mockResolvedValueOnce(json({}, status));
    await expect(Promise.all([ensureTarkovAccess(), ensureTarkovAccess()])).rejects.toMatchObject({
      kind,
    });
    expect(network).toHaveBeenCalledTimes(1);
    expect(getTarkovAccessState().phase.value).toBe('idle');
    network.mockResolvedValueOnce(json());
    expect(await ensureTarkovAccess()).toBe(2);
    expect(network).toHaveBeenCalledTimes(2);
  });
  it('probes again on the next request after a network failure', async () => {
    network.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(json());
    await expect(ensureTarkovAccess()).rejects.toMatchObject({ kind: 'failed' });
    expect(await ensureTarkovAccess()).toBe(2);
  });
  it('rejects instead of parking when a renewal probe fails after an earlier challenge', async () => {
    network
      .mockResolvedValueOnce(challenge())
      .mockResolvedValueOnce(json())
      .mockResolvedValueOnce(json());
    const initial = ensureTarkovAccess();
    await flush();
    submitGateToken('token');
    expect(await initial).toBe(1);
    network.mockResolvedValueOnce(challenge()).mockResolvedValueOnce(json({}, 500));
    await expect(tarkovApiFetch('/api/tarkov/items')).rejects.toMatchObject({ kind: 'failed' });
    expect(getTarkovAccessState().challengeSeen.value).toBe(true);
    expect(getTarkovAccessState().phase.value).toBe('idle');
    network.mockResolvedValueOnce(json()).mockResolvedValueOnce(json({ value: 3 }));
    expect(await tarkovApiFetch('/api/tarkov/items')).toEqual({ value: 3 });
  });
  it('parks waiters behind a visible failure after a challenged re-probe', async () => {
    network
      .mockResolvedValueOnce(challenge())
      .mockResolvedValueOnce(json())
      .mockResolvedValueOnce(json({}, 429));
    let settled = false;
    const waiting = ensureTarkovAccess().finally(() => {
      settled = true;
    });
    await flush();
    submitGateToken('token');
    await flush();
    expect(getTarkovAccessState().phase.value).toBe('rate_limited');
    const joined = ensureTarkovAccess();
    await flush();
    expect(settled).toBe(false);
    expect(network).toHaveBeenCalledTimes(3);
    network.mockResolvedValueOnce(json());
    await requestGateRetry();
    expect(await Promise.all([waiting, joined])).toEqual([2, 2]);
  });
  it('renewal waits for the manual retry of a parked flow', async () => {
    network.mockResolvedValueOnce(json());
    await ensureTarkovAccess();
    network.mockResolvedValueOnce(challenge()).mockResolvedValueOnce(challenge());
    const request = tarkovApiFetch('/api/tarkov/items');
    await flush();
    expect(getTarkovAccessState().phase.value).toBe('challenge');
    reportGateWidgetUnavailable();
    await flush();
    expect(getTarkovAccessState().attemptsExhausted.value).toBe(true);
    const renewal = renewTarkovAccess(1);
    await flush();
    expect(network).toHaveBeenCalledTimes(3);
    network.mockResolvedValueOnce(json()).mockResolvedValueOnce(json({ value: 4 }));
    await requestGateRetry();
    await renewal;
    expect(await request).toEqual({ value: 4 });
  });
  it('parks a failed verification and permits explicit retry', async () => {
    network.mockResolvedValueOnce(challenge()).mockResolvedValueOnce(json({}, 503));
    const waiting = ensureTarkovAccess().catch((error: unknown) => error);
    await flush();
    submitGateToken('token');
    await flush();
    expect(getTarkovAccessState().attemptsExhausted.value).toBe(true);
    network.mockResolvedValueOnce(json());
    await requestGateRetry();
    expect(getTarkovAccessState().phase.value).toBe('released');
    expect(await waiting).toBe(2);
  });
  it('renews once for concurrent challenged data requests', async () => {
    network.mockResolvedValueOnce(json());
    await ensureTarkovAccess();
    network
      .mockResolvedValueOnce(challenge())
      .mockResolvedValueOnce(challenge())
      .mockResolvedValueOnce(json())
      .mockResolvedValueOnce(json({ value: 1 }))
      .mockResolvedValueOnce(json({ value: 2 }));
    const results = await Promise.all([
      tarkovApiFetch('/api/tarkov/items'),
      tarkovApiFetch('/api/tarkov/tasks-core'),
    ]);
    expect(results).toEqual([{ value: 1 }, { value: 2 }]);
    expect(network.mock.calls.filter(([url]) => String(url).endsWith('access-check'))).toHaveLength(
      2
    );
  });
  it('retries a challenged data request at most once', async () => {
    network
      .mockResolvedValueOnce(json())
      .mockResolvedValueOnce(challenge())
      .mockResolvedValueOnce(json())
      .mockResolvedValueOnce(challenge());
    await expect(tarkovApiFetch('/api/tarkov/items')).rejects.toThrow('one retry');
    expect(network).toHaveBeenCalledTimes(4);
  });
  it('aborting a waiter does not cancel other waiters', async () => {
    network
      .mockResolvedValueOnce(challenge())
      .mockResolvedValueOnce(json())
      .mockResolvedValueOnce(json());
    const controller = new AbortController();
    const impatient = ensureTarkovAccess(controller.signal).catch((error: unknown) => error);
    const patient = ensureTarkovAccess();
    await flush();
    controller.abort();
    expect(await impatient).toMatchObject({ name: 'AbortError' });
    submitGateToken('token');
    expect(await patient).toBe(1);
  });
  it('does not start a flow for an already cancelled caller', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(ensureTarkovAccess(controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(network).not.toHaveBeenCalled();
  });
  it('keeps the timeout active while reading the response body', async () => {
    vi.useFakeTimers();
    network.mockImplementation((_url: string, options: RequestInit) =>
      Promise.resolve({
        headers: new Headers(),
        arrayBuffer: () =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      })
    );
    const result = rawTarkovRequest('/api/tarkov/items', { timeout: 25 }).catch(
      (error: unknown) => error
    );
    await vi.advanceTimersByTimeAsync(25);
    expect(await result).toMatchObject({ name: 'TimeoutError' });
  });
});
const hangUntilAbort = (_url: string, init: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    if (init.signal?.aborted) reject(new Error('aborted'));
  });
const captureRejection = (pending: Promise<unknown>) => pending.catch((error: unknown) => error);
describe('Tarkov API transport', () => {
  it('builds same-origin URLs and skips nullish query values', () => {
    const origin = window.location.origin;
    expect(buildTarkovApiUrl('/api/tarkov/items')).toBe(`${origin}/api/tarkov/items`);
    expect(
      buildTarkovApiUrl('/api/tarkov/items', {
        lang: 'en',
        limit: 5,
        lite: true,
        gameMode: undefined,
        page: null,
      })
    ).toBe(`${origin}/api/tarkov/items?lang=en&limit=5&lite=true`);
  });
  it('sends string bodies as-is with merged headers and query', async () => {
    network.mockResolvedValueOnce(json({ saved: true }, 201));
    const response = await rawTarkovRequest('/api/tarkov/items', {
      method: 'POST',
      body: 'raw-body',
      headers: { 'x-trace': 'abc' },
      query: { lang: 'de' },
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ saved: true });
    const [url, init] = network.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/tarkov\/items\?lang=de$/);
    expect(init).toMatchObject({
      method: 'POST',
      body: 'raw-body',
      headers: { 'content-type': 'application/json', 'x-trace': 'abc' },
    });
    expect(init).not.toHaveProperty('cache');
  });
  it('rejects an already cancelled request with an AbortError', async () => {
    network.mockImplementation(hangUntilAbort);
    const controller = new AbortController();
    controller.abort('navigated away');
    await expect(
      rawTarkovRequest('/api/tarkov/items', { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError', message: 'Tarkov API request aborted' });
  });
  it('forwards a caller abort that happens mid-request', async () => {
    network.mockImplementation(hangUntilAbort);
    const controller = new AbortController();
    const reason = new Error('caller left');
    const pending = captureRejection(
      rawTarkovRequest('/api/tarkov/items', { signal: controller.signal })
    );
    controller.abort(reason);
    expect(await pending).toBe(reason);
  });
  it('wraps non-Error network failures', async () => {
    network.mockRejectedValueOnce('socket closed');
    await expect(rawTarkovRequest('/api/tarkov/items', {})).rejects.toEqual(
      new Error('socket closed')
    );
  });
  it('reports non-ok responses with a truncated body snippet', async () => {
    const error = await captureRejection(
      readTarkovApiJson(
        new Response(`  ${'x'.repeat(150)}  `, { status: 502 }),
        '/api/tarkov/items'
      )
    );
    expect(error).toBeInstanceOf(TarkovApiStatusError);
    expect(error).toMatchObject({
      status: 502,
      endpoint: '/api/tarkov/items',
      message: `Tarkov API request to /api/tarkov/items failed with status 502: ${'x'.repeat(100)}…`,
    });
  });
  it('omits the snippet when a failed response body cannot be read', async () => {
    const unreadable = {
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error('stream broke')),
    } as unknown as Response;
    await expect(readTarkovApiJson(unreadable, '/api/tarkov/items')).rejects.toThrow(
      /^Tarkov API request to \/api\/tarkov\/items failed with status 500$/
    );
  });
  it.each([
    [
      '<html>oops</html>',
      'Tarkov API request to /api/tarkov/items returned a non-JSON response: <html>oops</html>',
    ],
    ['', 'Tarkov API request to /api/tarkov/items returned a non-JSON response'],
  ])('rejects non-JSON success body %j', async (body, message) => {
    const error = await captureRejection(
      readTarkovApiJson(new Response(body), '/api/tarkov/items')
    );
    expect(error).toBeInstanceOf(TarkovApiInvalidResponseError);
    expect(error).toMatchObject({ endpoint: '/api/tarkov/items', message });
  });
  it('surfaces ordinary data failures without renewing access', async () => {
    network.mockResolvedValueOnce(json()).mockResolvedValueOnce(json({ error: 'denied' }, 403));
    await expect(tarkovApiFetch('/api/tarkov/items')).rejects.toBeInstanceOf(TarkovApiStatusError);
    expect(network).toHaveBeenCalledTimes(2);
    expect(getTarkovAccessState().phase.value).toBe('released');
  });
  it('rejects non-JSON data responses after release', async () => {
    network.mockResolvedValueOnce(json()).mockResolvedValueOnce(new Response('<html></html>'));
    await expect(tarkovApiFetch('/api/tarkov/items')).rejects.toBeInstanceOf(
      TarkovApiInvalidResponseError
    );
  });
  it('rejects an already cancelled data request before probing', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      tarkovApiFetch('/api/tarkov/items', { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(network).not.toHaveBeenCalled();
  });
});
describe('Tarkov access runtime config', () => {
  it('accepts string flags and trims the site key', () => {
    config.mockReturnValue({
      public: { tarkovAccessEnabled: 'true', tarkovAccessSiteKey: '  site-key  ' },
    });
    expect(isTarkovAccessEnabled()).toBe(true);
    expect(resolveTarkovAccessSiteKey()).toBe('site-key');
  });
  it('falls back to the last captured config outside the Nuxt context', () => {
    config.mockReturnValue({
      public: { tarkovAccessEnabled: true, tarkovAccessSiteKey: 'site-key' },
    });
    expect(isTarkovAccessEnabled()).toBe(true);
    config.mockImplementation(() => {
      throw new Error('outside Nuxt');
    });
    expect(isTarkovAccessEnabled()).toBe(true);
    expect(resolveTarkovAccessSiteKey()).toBe('site-key');
    resetTarkovAccessForTests();
    expect(isTarkovAccessEnabled()).toBe(false);
    expect(resolveTarkovAccessSiteKey()).toBe('');
  });
  it('treats every controller entry point as a no-op while disabled', async () => {
    config.mockReturnValue({ public: { tarkovAccessEnabled: false } });
    expect(await ensureTarkovAccess()).toBe(0);
    await expect(renewTarkovAccess(0)).resolves.toBeUndefined();
    await expect(requestGateRetry()).resolves.toBeUndefined();
    expect(network).not.toHaveBeenCalled();
    expect(getTarkovAccessState().phase.value).toBe('idle');
  });
});
describe('Tarkov access controller edge cases', () => {
  it('wraps non-Error probe failures', async () => {
    network.mockRejectedValueOnce('offline');
    const error = await captureRejection(ensureTarkovAccess());
    expect(error).toBeInstanceOf(TarkovAccessError);
    expect(error).toMatchObject({ kind: 'failed', message: 'The access check failed.' });
    expect((error as TarkovAccessError).cause).toEqual(new Error('offline'));
  });
  it('parks when the verification request itself is challenged', async () => {
    network.mockResolvedValueOnce(challenge()).mockResolvedValueOnce(challenge());
    const waiting = ensureTarkovAccess();
    await flush();
    submitGateToken('token');
    await flush();
    const state = getTarkovAccessState();
    expect(state.attemptsExhausted.value).toBe(true);
    expect(state.lastError.value).toMatchObject({ kind: 'challenge_exhausted' });
    expect(state.lastError.value?.cause).toMatchObject({ kind: 'challenge' });
    network.mockResolvedValueOnce(json());
    await requestGateRetry();
    expect(await waiting).toBe(2);
  });
  it('keeps the verification token out of failure messages', async () => {
    network
      .mockResolvedValueOnce(challenge())
      .mockResolvedValueOnce(json({ echoed: 'secret-token' }, 400));
    void ensureTarkovAccess();
    await flush();
    submitGateToken('secret-token');
    await flush();
    const cause = getTarkovAccessState().lastError.value?.cause;
    expect(cause).toBeInstanceOf(TarkovApiStatusError);
    expect(cause).toMatchObject({
      status: 400,
      message: 'Tarkov API request to /api/security/tarkov-verify failed with status 400',
    });
  });
  it('parks when the re-probe stays challenged after verification', async () => {
    network
      .mockResolvedValueOnce(challenge())
      .mockResolvedValueOnce(json())
      .mockResolvedValueOnce(challenge());
    const waiting = ensureTarkovAccess();
    await flush();
    submitGateToken('token');
    await flush();
    expect(getTarkovAccessState().phase.value).toBe('challenge');
    expect(getTarkovAccessState().lastError.value).toMatchObject({ kind: 'challenge_exhausted' });
    network.mockResolvedValueOnce(json());
    await requestGateRetry();
    expect(await waiting).toBe(2);
    expect(network).toHaveBeenCalledTimes(4);
  });
  it('joins an in-flight flow from a manual retry', async () => {
    network.mockResolvedValueOnce(challenge());
    const waiting = ensureTarkovAccess();
    await flush();
    const controller = new AbortController();
    const abandoned = captureRejection(requestGateRetry(controller.signal));
    const retry = requestGateRetry();
    controller.abort();
    expect(await abandoned).toMatchObject({ name: 'AbortError' });
    network.mockResolvedValueOnce(json()).mockResolvedValueOnce(json());
    submitGateToken('token');
    await retry;
    expect(await waiting).toBe(1);
    expect(network).toHaveBeenCalledTimes(3);
    expect(getTarkovAccessState().attemptEpoch.value).toBe(1);
  });
  it('treats a manual retry as a no-op while access is current', async () => {
    network.mockResolvedValueOnce(json());
    await ensureTarkovAccess();
    await requestGateRetry();
    expect(network).toHaveBeenCalledTimes(1);
    expect(getTarkovAccessState().phase.value).toBe('released');
  });
  it('ignores gate tokens and widget failures without a waiting flow', async () => {
    submitGateToken('stray');
    reportGateWidgetUnavailable();
    network.mockResolvedValueOnce(json());
    const waiting = ensureTarkovAccess();
    submitGateToken('early');
    reportGateWidgetUnavailable();
    expect(await waiting).toBe(1);
    expect(network).toHaveBeenCalledTimes(1);
    expect(getTarkovAccessState().attemptsExhausted.value).toBe(false);
  });
  it('skips renewal once a newer generation was released', async () => {
    network.mockResolvedValueOnce(json()).mockResolvedValueOnce(json());
    expect(await ensureTarkovAccess()).toBe(1);
    await renewTarkovAccess(1);
    await renewTarkovAccess(1);
    expect(network).toHaveBeenCalledTimes(2);
    expect(await ensureTarkovAccess()).toBe(2);
  });
  it('waits for shared runs only as long as the caller allows', async () => {
    const shared = Promise.resolve('value');
    expect(abandonSharedWait(shared)).toBe(shared);
    await expect(abandonSharedWait(shared, new AbortController().signal)).resolves.toBe('value');
    await expect(
      abandonSharedWait(Promise.reject('flow failed'), new AbortController().signal)
    ).rejects.toEqual(new Error('flow failed'));
    const aborted = new AbortController();
    const reason = new Error('gone');
    aborted.abort(reason);
    await expect(abandonSharedWait(shared, aborted.signal)).rejects.toBe(reason);
  });
  it('releases pending gate waiters on reset so the flow parks', async () => {
    network.mockResolvedValueOnce(challenge());
    void ensureTarkovAccess();
    await flush();
    resetTarkovAccessForTests();
    await flush();
    submitGateToken('token');
    expect(network).toHaveBeenCalledTimes(1);
    expect(getTarkovAccessState().lastError.value).toMatchObject({ kind: 'challenge_exhausted' });
  });
});
describe('gated transport parity and recovery', () => {
  const release = async () => {
    network.mockResolvedValueOnce(json());
    await ensureTarkovAccess();
  };
  it.each([
    ['503', () => Promise.resolve(json({}, 503))],
    ['network error', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('retries a GET once after a transient %s', async (_label, respond) => {
    await release();
    network.mockImplementationOnce(respond).mockResolvedValueOnce(json({ value: 1 }));
    expect(await tarkovApiFetch('/api/tarkov/items')).toEqual({ value: 1 });
    expect(network).toHaveBeenCalledTimes(3);
  });
  it('stops after the default single transient retry', async () => {
    await release();
    network.mockResolvedValueOnce(json({}, 502)).mockResolvedValueOnce(json({}, 503));
    await expect(tarkovApiFetch('/api/tarkov/items')).rejects.toMatchObject({ status: 503 });
    expect(network).toHaveBeenCalledTimes(3);
  });
  it.each([
    ['payload methods', { method: 'POST' as const }],
    ['an explicit zero budget', { retry: 0 }],
  ])('does not retry %s', async (_label, options) => {
    await release();
    network.mockResolvedValueOnce(json({}, 503));
    await expect(tarkovApiFetch('/api/tarkov/items', options)).rejects.toMatchObject({
      status: 503,
    });
    expect(network).toHaveBeenCalledTimes(2);
  });
  it('does not retry non-transient statuses or caller cancellation', async () => {
    await release();
    network.mockResolvedValueOnce(json({}, 404));
    await expect(tarkovApiFetch('/api/tarkov/items')).rejects.toMatchObject({ status: 404 });
    const controller = new AbortController();
    network.mockImplementationOnce(() => {
      controller.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    });
    await expect(
      tarkovApiFetch('/api/tarkov/items', { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(network).toHaveBeenCalledTimes(3);
  });
  it('reports a timeout even when fetch rejects with a read-only DOMException', async () => {
    vi.useFakeTimers();
    network.mockImplementation(
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError'))
          );
        })
    );
    const result = rawTarkovRequest('/api/tarkov/items', { timeout: 25 }).catch(
      (error: unknown) => error
    );
    await vi.advanceTimersByTimeAsync(25);
    expect(await result).toMatchObject({
      name: 'TimeoutError',
      cause: expect.objectContaining({ name: 'AbortError' }),
    });
  });
  it('re-parks waiters when a manual retry fails without a challenge', async () => {
    network.mockResolvedValueOnce(challenge());
    let settled = false;
    const waiting = ensureTarkovAccess().finally(() => {
      settled = true;
    });
    await flush();
    reportGateWidgetUnavailable();
    await flush();
    network.mockResolvedValueOnce(json({}, 429));
    await requestGateRetry().catch(() => undefined);
    await flush();
    expect(getTarkovAccessState().phase.value).toBe('rate_limited');
    expect(settled).toBe(false);
    network.mockResolvedValueOnce(json());
    await requestGateRetry();
    expect(await waiting).toBe(3);
  });
  it('dismissal releases parked waiters and the next request probes again', async () => {
    network.mockResolvedValueOnce(challenge());
    const waiting = ensureTarkovAccess().catch((error: unknown) => error);
    await flush();
    reportGateWidgetUnavailable();
    await flush();
    dismissTarkovAccessGate();
    expect(await waiting).toMatchObject({ kind: 'challenge' });
    expect(getTarkovAccessState().phase.value).toBe('idle');
    await expect(tarkovApiFetch('/api/tarkov/hideout')).rejects.toMatchObject({
      kind: 'challenge',
    });
    await expect(renewTarkovAccess(0)).rejects.toMatchObject({ kind: 'challenge' });
    expect(network).toHaveBeenCalledTimes(1);
    expect(getTarkovAccessState().phase.value).toBe('idle');
    network.mockResolvedValueOnce(json());
    await requestGateRetry();
    expect(await ensureTarkovAccess()).toBe(2);
  });
  it('dismissal during an open challenge rejects without parking', async () => {
    network.mockResolvedValueOnce(challenge());
    const waiting = ensureTarkovAccess().catch((error: unknown) => error);
    await flush();
    dismissTarkovAccessGate();
    expect(await waiting).toMatchObject({ kind: 'challenge' });
    expect(getTarkovAccessState().attemptsExhausted.value).toBe(false);
    expect(network).toHaveBeenCalledTimes(1);
  });
  it('dismissal is a no-op without a pending challenge or parked failure', async () => {
    dismissTarkovAccessGate();
    await release();
    dismissTarkovAccessGate();
    expect(getTarkovAccessState().phase.value).toBe('released');
  });
  it('parks a rate-limited verification with the server retry delay', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    network
      .mockResolvedValueOnce(challenge())
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '42' } }));
    void ensureTarkovAccess().catch(() => {});
    await flush();
    submitGateToken('token');
    await flush();
    const state = getTarkovAccessState();
    expect(state.phase.value).toBe('rate_limited');
    expect(state.lastError.value).toMatchObject({ kind: 'rate_limited' });
    expect(state.retryAvailableAt.value).toBe(1_042_000);
  });
  it('falls back to a bounded delay without a usable Retry-After', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    network.mockResolvedValueOnce(challenge()).mockResolvedValueOnce(json({}, 429));
    void ensureTarkovAccess().catch(() => {});
    await flush();
    submitGateToken('token');
    await flush();
    expect(getTarkovAccessState().retryAvailableAt.value).toBe(60_000);
  });
  it('bumps the recovery epoch when a later probe recovers from an ordinary failure', async () => {
    network.mockRejectedValueOnce(new TypeError('offline'));
    await expect(ensureTarkovAccess()).rejects.toMatchObject({ kind: 'failed' });
    const state = getTarkovAccessState();
    expect(state.recoveryEpoch.value).toBe(0);
    network.mockResolvedValueOnce(json());
    await ensureTarkovAccess();
    expect(state.recoveryEpoch.value).toBe(1);
  });
  it('bumps the recovery epoch once at the first release after a dismissal', async () => {
    network.mockResolvedValueOnce(challenge());
    void ensureTarkovAccess().catch(() => {});
    await flush();
    dismissTarkovAccessGate();
    await flush();
    const state = getTarkovAccessState();
    network.mockResolvedValueOnce(json({}, 503));
    await requestGateRetry().catch(() => {});
    await flush();
    expect(state.recoveryEpoch.value).toBe(0);
    network.mockResolvedValueOnce(json());
    await requestGateRetry();
    await flush();
    expect(state.recoveryEpoch.value).toBe(1);
    network.mockResolvedValueOnce(challenge()).mockResolvedValueOnce(json());
    await renewTarkovAccess(2).catch(() => {});
    expect(state.recoveryEpoch.value).toBe(1);
  });
  it('rejects a manual retry for an already cancelled caller without probing', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(requestGateRetry(controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(network).not.toHaveBeenCalled();
  });
});
