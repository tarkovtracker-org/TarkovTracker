// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TwitchStreamPlayer from '@/components/TwitchStreamPlayer.vue';
const { loadMock } = vi.hoisted(() => ({ loadMock: vi.fn() }));
vi.mock('@/utils/twitchPlayer', () => ({ loadTwitchPlayer: loadMock }));
const listeners = new Map<string, () => void>();
const destroy = vi.fn();
const construct = vi.fn();
class Player {
  static READY = 'ready';
  static OFFLINE = 'offline';
  constructor(element: HTMLElement, options: unknown) {
    construct(options);
    element.appendChild(document.createElement('iframe'));
  }
  addEventListener(event: string, listener: () => void) {
    listeners.set(event, listener);
  }
  removeEventListener(event: string) {
    listeners.delete(event);
  }
  destroy() {
    destroy();
  }
}
const props = { channel: 'teststreamer', title: 'Test stream' };
describe('TwitchStreamPlayer', () => {
  beforeEach(() => {
    listeners.clear();
    construct.mockClear();
    destroy.mockClear();
    loadMock.mockReset().mockResolvedValue(Player);
  });
  it('forwards player events and destroys the SDK player when removed', async () => {
    const wrapper = mount(TwitchStreamPlayer, { props });
    await flushPromises();
    expect(construct).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'teststreamer',
        parent: [window.location.hostname],
        muted: true,
      })
    );
    listeners.get('ready')?.();
    expect(wrapper.emitted('ready')).toHaveLength(1);
    expect(wrapper.get('iframe').attributes('title')).toBe('Test stream');
    listeners.get('offline')?.();
    expect(wrapper.emitted('offline')).toHaveLength(1);
    wrapper.unmount();
    expect(listeners.size).toBe(0);
    expect(destroy).toHaveBeenCalledOnce();
  });
  it('updates the iframe title without recreating the player after a display name change', async () => {
    const wrapper = mount(TwitchStreamPlayer, { props });
    await flushPromises();
    listeners.get('ready')?.();
    await wrapper.setProps({ title: 'Renamed stream' });
    expect(wrapper.get('iframe').attributes('title')).toBe('Renamed stream');
    expect(construct).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
  it('shows a titled loading indicator while the SDK script is pending', async () => {
    let finish: (value: typeof Player) => void = () => {};
    loadMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const wrapper = mount(TwitchStreamPlayer, { props });
    expect(wrapper.get('[role="status"]').attributes('aria-label')).toBe('Test stream');
    finish(Player);
    await flushPromises();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('does not create a player when the script resolves after unmount', async () => {
    let finish: (value: typeof Player) => void = () => {};
    loadMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const wrapper = mount(TwitchStreamPlayer, { props });
    wrapper.unmount();
    finish(Player);
    await flushPromises();
    expect(construct).not.toHaveBeenCalled();
  });
  it('falls back to a direct iframe without stopping status polling if the SDK fails', async () => {
    loadMock.mockRejectedValue(new Error('blocked'));
    const wrapper = mount(TwitchStreamPlayer, { props });
    await flushPromises();
    const url = new URL(wrapper.get('iframe').attributes('src')!);
    expect(url.origin).toBe('https://player.twitch.tv');
    expect(url.searchParams.get('channel')).toBe('teststreamer');
    expect(url.searchParams.get('parent')).toBe(window.location.hostname);
    expect(wrapper.emitted('ready')).toBeUndefined();
    wrapper.unmount();
  });
});
