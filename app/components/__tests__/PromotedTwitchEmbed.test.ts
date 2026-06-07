// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
const { fetchMock, runtimeConfig } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  runtimeConfig: {
    public: {
      promotedTwitch: {
        channel: 'teststreamer',
        displayName: 'TestStreamer',
        enabled: true,
        endsAt: '2999-01-01T00:00:00+00:00',
      } as {
        channel?: string;
        displayName?: string;
        enabled?: boolean;
        endsAt?: string;
      },
    },
  },
}));
mockNuxtImport('useRuntimeConfig', () => () => runtimeConfig);
mockNuxtImport('useI18n', () => () => ({
  t: (key: string, fallbackOrParams?: unknown) =>
    typeof fallbackOrParams === 'string' ? fallbackOrParams : key,
}));
vi.stubGlobal('$fetch', fetchMock);
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
  // Resolve the onMounted checkLive() microtasks before assertions.
  await flushPromises();
  await nextTick();
  return wrapper;
};
describe('PromotedTwitchEmbed', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ isLive: true });
    runtimeConfig.public.promotedTwitch = {
      channel: 'teststreamer',
      displayName: 'TestStreamer',
      enabled: true,
      endsAt: '2999-01-01T00:00:00+00:00',
    };
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('does not check live status or render when disabled', async () => {
    runtimeConfig.public.promotedTwitch.enabled = false;
    const wrapper = await mountEmbed();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.find('iframe').exists()).toBe(false);
  });
  it('does not render once the promotion end date has passed', async () => {
    runtimeConfig.public.promotedTwitch.endsAt = '2000-01-01T00:00:00+00:00';
    const wrapper = await mountEmbed();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.find('iframe').exists()).toBe(false);
  });
  it('renders the player iframe when the channel is live', async () => {
    const wrapper = await mountEmbed();
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
    fetchMock.mockResolvedValue({ isLive: false });
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
    // Invoke the registered poll callback directly to avoid real timer waits.
    const pollCallback = setIntervalSpy.mock.calls[0]?.[0] as () => void;
    pollCallback();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
