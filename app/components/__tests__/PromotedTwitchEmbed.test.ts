// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
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
let twitchConfig: { channel: string; displayName: string; enabled: boolean };
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
    twitchConfig = { channel: 'teststreamer', displayName: 'TestStreamer', enabled: true };
    liveResult = { isLive: true };
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('does not check live status or render when disabled', async () => {
    twitchConfig.enabled = false;
    const wrapper = await mountEmbed();
    expect(fetchMock).toHaveBeenCalledWith('/api/twitch/config');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/twitch/live', expect.anything());
    expect(wrapper.find('iframe').exists()).toBe(false);
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
  });
  it('stays hidden when the channel is offline', async () => {
    liveResult = { isLive: false };
    const wrapper = await mountEmbed();
    expect(wrapper.find('iframe').exists()).toBe(false);
  });
  it('hides the player and persists dismissal when closed', async () => {
    const wrapper = await mountEmbed();
    await wrapper.get('button[aria-label="Close player"]').trigger('click');
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(sessionStorage.getItem('tt-twitch-dismissed')).toBe('1');
    expect(wrapper.find('button[aria-label="Reopen stream"]').exists()).toBe(true);
  });
  it('does not auto-show when a prior dismissal is stored', async () => {
    sessionStorage.setItem('tt-twitch-dismissed', '1');
    const wrapper = await mountEmbed();
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Reopen stream"]').exists()).toBe(true);
  });
  it('reopens the player after being dismissed', async () => {
    sessionStorage.setItem('tt-twitch-dismissed', '1');
    const wrapper = await mountEmbed();
    await wrapper.get('button[aria-label="Reopen stream"]').trigger('click');
    await nextTick();
    expect(wrapper.find('iframe').exists()).toBe(true);
    expect(sessionStorage.getItem('tt-twitch-dismissed')).toBeNull();
  });
  it('polls live status on an interval', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const wrapper = await mountEmbed();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
    const pollCallback = setIntervalSpy.mock.calls[0]?.[0] as () => void;
    pollCallback();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    wrapper.unmount();
  });
  it('applies config changes on the next poll', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const wrapper = await mountEmbed();
    twitchConfig = { channel: 'replacement', displayName: 'Replacement', enabled: true };
    const pollCallback = setIntervalSpy.mock.calls[0]?.[0] as () => void;
    pollCallback();
    await flushPromises();
    await nextTick();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/twitch/live', {
      query: { channel: 'replacement' },
    });
    expect(wrapper.find('iframe').attributes('src')).toContain('channel=replacement');
    wrapper.unmount();
  });
  it('hides an active player when config is disabled on the next poll', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const wrapper = await mountEmbed();
    twitchConfig.enabled = false;
    const pollCallback = setIntervalSpy.mock.calls[0]?.[0] as () => void;
    pollCallback();
    await flushPromises();
    await nextTick();
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    wrapper.unmount();
  });
  it('clears a stored dismissal when the promoted channel changes', async () => {
    sessionStorage.setItem('tt-twitch-dismissed', '1');
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const wrapper = await mountEmbed();
    expect(wrapper.find('iframe').exists()).toBe(false);
    twitchConfig = { channel: 'replacement', displayName: 'Replacement', enabled: true };
    const pollCallback = setIntervalSpy.mock.calls[0]?.[0] as () => void;
    pollCallback();
    await flushPromises();
    await nextTick();
    expect(sessionStorage.getItem('tt-twitch-dismissed')).toBeNull();
    expect(wrapper.find('iframe').attributes('src')).toContain('channel=replacement');
    wrapper.unmount();
  });
  it('keeps one refresh in flight when polls overlap', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const wrapper = await mountEmbed();
    let releaseConfig: (() => void) | undefined;
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/twitch/config') {
        return new Promise((resolve) => {
          releaseConfig = () => resolve(twitchConfig);
        });
      }
      return Promise.resolve(liveResult);
    });
    const pollCallback = setIntervalSpy.mock.calls[0]?.[0] as () => void;
    pollCallback();
    pollCallback();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    releaseConfig?.();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    wrapper.unmount();
  });
  it('logs a warning when the config refresh fails', async () => {
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
});
