// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { usePromotedTwitch } from '@/composables/usePromotedTwitch';
import { logger } from '@/utils/logger';
const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));
mockNuxtImport('useRuntimeConfig', () => () => ({
  public: {
    promotedTwitch: {
      channel: 'teststreamer',
      displayName: 'TestStreamer',
      enabled: true,
    },
  },
}));
mockNuxtImport('useI18n', () => () => ({
  t: (key: string, fallbackOrParams?: unknown) =>
    typeof fallbackOrParams === 'string' ? fallbackOrParams : key,
}));
vi.stubGlobal('$fetch', fetchMock);
let twitchConfig: { channel: string; displayName: string; enabled: boolean; version: number };
let liveResult: { isLive: boolean };
const UButtonStub = {
  inheritAttrs: false,
  props: ['icon', 'to'],
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
};
const UIconStub = { template: '<span />' };
const mountEmbed = async () => {
  const { default: PromotedTwitchEmbed } = await import('@/components/PromotedTwitchEmbed.vue');
  const wrapper = mount(PromotedTwitchEmbed, {
    global: {
      stubs: {
        ClientOnly: { template: '<div><slot /></div>' },
        UButton: UButtonStub,
        UIcon: UIconStub,
      },
    },
  });
  await flushPromises();
  await nextTick();
  return wrapper;
};
describe('PromotedTwitchEmbed', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url === '/api/twitch/config' ? twitchConfig : liveResult)
    );
    twitchConfig = {
      channel: 'teststreamer',
      displayName: 'TestStreamer',
      enabled: true,
      version: 1,
    };
    liveResult = { isLive: true };
    sessionStorage.clear();
    usePromotedTwitch().resetConfig();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('fetches config without checking or polling live status when disabled', async () => {
    twitchConfig.enabled = false;
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const wrapper = await mountEmbed();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/twitch/config');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/twitch/live', expect.anything());
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 300_000);
    expect(setIntervalSpy).not.toHaveBeenCalledWith(expect.any(Function), 60_000);
    expect(wrapper.find('iframe').exists()).toBe(false);
    wrapper.unmount();
  });
  it('refreshes config for a continuously visible tab while the stream is disabled', async () => {
    twitchConfig.enabled = false;
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const wrapper = await mountEmbed();
    twitchConfig = {
      channel: 'replacement',
      displayName: 'Replacement',
      enabled: true,
      version: 2,
    };
    const configCallback = setIntervalSpy.mock.calls.find((call) => call[1] === 300_000)?.[0] as
      (() => void) | undefined;
    configCallback?.();
    await flushPromises();
    await nextTick();
    expect(fetchMock.mock.calls.filter((call) => call[0] === '/api/twitch/config')).toHaveLength(2);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/twitch/live', {
      query: { channel: 'replacement' },
    });
    expect(wrapper.find('iframe').attributes('src')).toContain('channel=replacement');
    wrapper.unmount();
  });
  it('renders the player iframe when the channel is live', async () => {
    const wrapper = await mountEmbed();
    expect(fetchMock).toHaveBeenCalledWith('/api/twitch/config');
    expect(fetchMock).toHaveBeenCalledWith('/api/twitch/live', {
      query: { channel: 'teststreamer' },
    });
    const iframe = wrapper.find('iframe');
    expect(iframe.exists()).toBe(true);
    expect(iframe.attributes('src')).toContain('player.twitch.tv');
    expect(iframe.attributes('src')).toContain('channel=teststreamer');
    expect(iframe.attributes('src')).toContain('muted=true');
    wrapper.unmount();
  });
  it('stays hidden when the channel is offline', async () => {
    liveResult = { isLive: false };
    const wrapper = await mountEmbed();
    expect(wrapper.find('iframe').exists()).toBe(false);
    wrapper.unmount();
  });
  it('hides the player and persists dismissal when closed', async () => {
    const wrapper = await mountEmbed();
    await wrapper.get('button[aria-label="Close player"]').trigger('click');
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(sessionStorage.getItem('tt-twitch-dismissed')).toBe('1');
    expect(wrapper.find('button[aria-label="Reopen stream"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('does not auto-show when a prior dismissal is stored', async () => {
    sessionStorage.setItem('tt-twitch-dismissed', '1');
    const wrapper = await mountEmbed();
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Reopen stream"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('reopens the player after being dismissed', async () => {
    sessionStorage.setItem('tt-twitch-dismissed', '1');
    const wrapper = await mountEmbed();
    await wrapper.get('button[aria-label="Reopen stream"]').trigger('click');
    await nextTick();
    expect(wrapper.find('iframe').exists()).toBe(true);
    expect(sessionStorage.getItem('tt-twitch-dismissed')).toBeNull();
    wrapper.unmount();
  });
  it('polls live status independently from the slower config refresh', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const wrapper = await mountEmbed();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.filter((call) => call[0] === '/api/twitch/config')).toHaveLength(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
    const pollCallback = setIntervalSpy.mock.calls.find(
      (call) => call[1] === 60_000
    )?.[0] as () => void;
    pollCallback();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/twitch/live');
    wrapper.unmount();
  });
  it('applies an admin save immediately through the shared state', async () => {
    const wrapper = await mountEmbed();
    usePromotedTwitch().applyConfig({
      channel: 'replacement',
      displayName: 'Replacement',
      enabled: true,
      version: 2,
    });
    await flushPromises();
    await nextTick();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/twitch/live', {
      query: { channel: 'replacement' },
    });
    expect(wrapper.find('iframe').attributes('src')).toContain('channel=replacement');
    wrapper.unmount();
  });
  it('does not let an older focus response overwrite an admin save', async () => {
    const wrapper = await mountEmbed();
    let resolveConfig: ((value: typeof twitchConfig) => void) | undefined;
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/twitch/config') {
        return new Promise((resolve) => {
          resolveConfig = resolve;
        });
      }
      return Promise.resolve(liveResult);
    });
    document.dispatchEvent(new Event('visibilitychange'));
    usePromotedTwitch().applyConfig({
      channel: 'replacement',
      displayName: 'Replacement',
      enabled: true,
      version: 2,
    });
    await nextTick();
    resolveConfig?.(twitchConfig);
    await flushPromises();
    await nextTick();
    expect(wrapper.find('iframe').attributes('src')).toContain('channel=replacement');
    wrapper.unmount();
  });
  it('hides an active player and stops polling when the shared config disables the stream', async () => {
    const wrapper = await mountEmbed();
    usePromotedTwitch().applyConfig({
      channel: 'teststreamer',
      displayName: 'TestStreamer',
      enabled: false,
      version: 2,
    });
    await flushPromises();
    await nextTick();
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
  it('keeps a stored dismissal when the first resolved channel differs from the fallback', async () => {
    sessionStorage.setItem('tt-twitch-dismissed', '1');
    twitchConfig = {
      channel: 'dbstreamer',
      displayName: 'DB Streamer',
      enabled: true,
      version: 1,
    };
    const wrapper = await mountEmbed();
    expect(sessionStorage.getItem('tt-twitch-dismissed')).toBe('1');
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Reopen stream"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('clears a stored dismissal when the promoted channel changes via shared state', async () => {
    sessionStorage.setItem('tt-twitch-dismissed', '1');
    const wrapper = await mountEmbed();
    expect(wrapper.find('iframe').exists()).toBe(false);
    usePromotedTwitch().applyConfig({
      channel: 'replacement',
      displayName: 'Replacement',
      enabled: true,
      version: 2,
    });
    await flushPromises();
    await nextTick();
    expect(sessionStorage.getItem('tt-twitch-dismissed')).toBeNull();
    expect(wrapper.find('iframe').attributes('src')).toContain('channel=replacement');
    wrapper.unmount();
  });
  it('keeps one live check in flight when polls overlap', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const wrapper = await mountEmbed();
    let releaseLive: (() => void) | undefined;
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/twitch/live') {
        return new Promise((resolve) => {
          releaseLive = () => resolve(liveResult);
        });
      }
      return Promise.resolve(twitchConfig);
    });
    const pollCallback = setIntervalSpy.mock.calls.find(
      (call) => call[1] === 60_000
    )?.[0] as () => void;
    pollCallback();
    pollCallback();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    releaseLive?.();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    wrapper.unmount();
  });
  it('discards a stale live result when the channel changes mid-flight', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const wrapper = await mountEmbed();
    const liveResolvers: Array<(value: { isLive: boolean }) => void> = [];
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/twitch/live') {
        return new Promise((resolve) => {
          liveResolvers.push(resolve);
        });
      }
      return Promise.resolve(twitchConfig);
    });
    const pollCallback = setIntervalSpy.mock.calls.find(
      (call) => call[1] === 60_000
    )?.[0] as () => void;
    pollCallback();
    usePromotedTwitch().applyConfig({
      channel: 'replacement',
      displayName: 'Replacement',
      enabled: true,
      version: 2,
    });
    await flushPromises();
    await nextTick();
    liveResolvers[0]?.({ isLive: true });
    await flushPromises();
    await nextTick();
    expect(wrapper.find('iframe').exists()).toBe(false);
    wrapper.unmount();
  });
  it('discards a stale A to B to A live result', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const wrapper = await mountEmbed();
    const liveResolvers: Array<(value: { isLive: boolean }) => void> = [];
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/twitch/live') {
        return new Promise((resolve) => {
          liveResolvers.push(resolve);
        });
      }
      return Promise.resolve(twitchConfig);
    });
    const pollCallback = setIntervalSpy.mock.calls.find(
      (call) => call[1] === 60_000
    )?.[0] as () => void;
    pollCallback();
    usePromotedTwitch().applyConfig({
      channel: 'replacement',
      displayName: 'Replacement',
      enabled: true,
      version: 2,
    });
    await nextTick();
    usePromotedTwitch().applyConfig({
      channel: 'teststreamer',
      displayName: 'TestStreamer',
      enabled: true,
      version: 3,
    });
    await flushPromises();
    await nextTick();
    liveResolvers[0]?.({ isLive: true });
    await flushPromises();
    expect(wrapper.find('iframe').exists()).toBe(false);
    liveResolvers[2]?.({ isLive: true });
    await flushPromises();
    await nextTick();
    expect(wrapper.find('iframe').attributes('src')).toContain('channel=teststreamer');
    wrapper.unmount();
  });
  it('logs a warning when clearing a stored dismissal fails', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const removeItemSpy = vi.spyOn(sessionStorage, 'removeItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    const wrapper = await mountEmbed();
    await wrapper.get('button[aria-label="Close player"]').trigger('click');
    await wrapper.get('button[aria-label="Reopen stream"]').trigger('click');
    expect(warnSpy).toHaveBeenCalledWith(
      '[PromotedTwitchEmbed] Failed to clear stored dismissal',
      expect.any(Error)
    );
    expect(wrapper.find('iframe').exists()).toBe(true);
    removeItemSpy.mockRestore();
    wrapper.unmount();
  });
  it('logs a warning when the config fetch fails', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    fetchMock.mockImplementation((url: string) =>
      url === '/api/twitch/config'
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(liveResult)
    );
    const wrapper = await mountEmbed();
    expect(warnSpy).toHaveBeenCalledWith(
      '[PromotedTwitchEmbed] Failed to refresh promoted stream config',
      expect.any(Error)
    );
    wrapper.unmount();
  });
  it('logs live-status failures with action and channel context', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const error = new Error('offline');
    fetchMock.mockImplementation((url: string) =>
      url === '/api/twitch/config' ? Promise.resolve(twitchConfig) : Promise.reject(error)
    );
    const wrapper = await mountEmbed();
    expect(warnSpy).toHaveBeenCalledWith(
      '[PromotedTwitchEmbed] Failed to check promoted stream status',
      {
        action: 'check_promoted_twitch_live',
        channel: 'teststreamer',
        error,
      }
    );
    wrapper.unmount();
  });
  it('stops polling while the tab is hidden and resumes with a refresh on focus', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const wrapper = await mountEmbed();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    let hidden = false;
    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    try {
      hidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
      await flushPromises();
      expect(clearIntervalSpy).toHaveBeenCalled();
      const callsWhileHidden = fetchMock.mock.calls.length;
      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
      await flushPromises();
      await nextTick();
      expect(fetchMock.mock.calls.length).toBeGreaterThan(callsWhileHidden);
      expect(fetchMock.mock.calls[callsWhileHidden]?.[0]).toBe('/api/twitch/config');
      expect(fetchMock).toHaveBeenLastCalledWith('/api/twitch/live', expect.anything());
      expect(setIntervalSpy.mock.calls.filter((call) => call[1] === 300_000)).toHaveLength(2);
      expect(setIntervalSpy.mock.calls.filter((call) => call[1] === 60_000)).toHaveLength(2);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(document, 'hidden', originalDescriptor);
      } else {
        delete (document as { hidden?: boolean }).hidden;
      }
    }
    wrapper.unmount();
  });
});
