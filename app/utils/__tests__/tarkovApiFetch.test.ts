// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureTarkovAccess,
  getTarkovAccessState,
  rawTarkovRequest,
  requestGateRetry,
  resetTarkovAccessForTests,
  submitGateToken,
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
  it.each([403, 429, 500])('does not retry ordinary %i failures automatically', async (status) => {
    network.mockResolvedValueOnce(json({}, status));
    await expect(ensureTarkovAccess()).rejects.toThrow();
    await expect(ensureTarkovAccess()).rejects.toThrow();
    expect(network).toHaveBeenCalledTimes(1);
    network.mockResolvedValueOnce(json());
    await requestGateRetry();
    expect(await ensureTarkovAccess()).toBe(2);
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
