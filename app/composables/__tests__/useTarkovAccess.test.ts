// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useTarkovAccess } from '@/composables/useTarkovAccess';
import {
  getTarkovAccessState,
  resetTarkovAccessForTests,
  TARKOV_ACCESS_WIDGET_ACTION,
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
let network: Mock;
beforeEach(async () => {
  resetTarkovAccessForTests();
  await flushPromises();
  resetTarkovAccessForTests();
  config.mockReturnValue({ public: { tarkovAccessEnabled: true, tarkovAccessSiteKey: 'key' } });
  network = vi.fn();
  vi.stubGlobal('fetch', network);
});
afterEach(() => {
  vi.unstubAllGlobals();
});
describe('useTarkovAccess', () => {
  it('exposes the shared controller state and the configured widget', () => {
    config.mockReturnValue({
      public: { tarkovAccessEnabled: 'true', tarkovAccessSiteKey: '  site-key  ' },
    });
    const access = useTarkovAccess();
    const state = getTarkovAccessState();
    expect(access.phase).toBe(state.phase);
    expect(access.attemptEpoch).toBe(state.attemptEpoch);
    expect(access.attemptsExhausted).toBe(state.attemptsExhausted);
    expect(access.challengeSeen).toBe(state.challengeSeen);
    expect(access).toMatchObject({
      accessEnabled: true,
      widgetAvailable: true,
      widgetSiteKey: 'site-key',
      widgetAction: TARKOV_ACCESS_WIDGET_ACTION,
    });
  });
  it('reports a disabled gate without a widget and never touches the network', async () => {
    config.mockReturnValue({ public: {} });
    const access = useTarkovAccess();
    expect(access).toMatchObject({
      accessEnabled: false,
      widgetAvailable: false,
      widgetSiteKey: '',
    });
    expect(await access.probe()).toBe(0);
    await expect(access.retry()).resolves.toBeUndefined();
    expect(network).not.toHaveBeenCalled();
  });
  it('releases a challenged probe with a submitted token', async () => {
    network
      .mockResolvedValueOnce(challenge())
      .mockResolvedValueOnce(json())
      .mockResolvedValueOnce(json());
    const access = useTarkovAccess();
    const probe = access.probe();
    await flushPromises();
    expect(access.phase.value).toBe('challenge');
    expect(access.challengeSeen.value).toBe(true);
    expect(access.attemptEpoch.value).toBe(1);
    access.submitToken('token');
    expect(await probe).toBe(1);
    expect(access.phase.value).toBe('released');
    expect(network.mock.calls[1]?.[1].body).toBe(JSON.stringify({ token: 'token' }));
  });
  it('parks an unavailable widget until the manual retry releases access', async () => {
    network.mockResolvedValueOnce(challenge());
    const access = useTarkovAccess();
    const probe = access.probe();
    await flushPromises();
    access.reportWidgetUnavailable();
    await flushPromises();
    expect(access.attemptsExhausted.value).toBe(true);
    expect(network).toHaveBeenCalledTimes(1);
    network.mockResolvedValueOnce(json());
    await access.retry();
    expect(access.phase.value).toBe('released');
    expect(await probe).toBe(2);
  });
  it('ends only the caller wait when its signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(useTarkovAccess().probe(controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(network).not.toHaveBeenCalled();
  });
});
