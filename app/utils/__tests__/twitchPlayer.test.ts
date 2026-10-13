// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
let appendedScript: HTMLScriptElement | undefined;
const script = (): HTMLScriptElement => {
  if (!appendedScript) throw new Error('Expected the Twitch SDK script');
  return appendedScript;
};
beforeEach(() => {
  appendedScript = undefined;
  vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
    if (node instanceof HTMLScriptElement) appendedScript = node;
    return node;
  });
});
const setSdk = (): void => {
  Object.defineProperty(window, 'Twitch', { configurable: true, value: { Player: vi.fn() } });
};
afterEach(() => {
  Reflect.deleteProperty(window, 'Twitch');
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('loadTwitchPlayer', () => {
  it('loads the script once for concurrent and subsequent players', async () => {
    vi.resetModules();
    const { loadTwitchPlayer } = await import('@/utils/twitchPlayer');
    const first = loadTwitchPlayer();
    const second = loadTwitchPlayer();
    expect(first).toBe(second);
    expect(document.head.appendChild).toHaveBeenCalledTimes(1);
    expect(script().src).toBe('https://player.twitch.tv/js/embed/v1.js');
    const remove = vi.spyOn(script(), 'remove');
    setSdk();
    script().dispatchEvent(new Event('load'));
    expect(await first).toBe(await second);
    expect(await loadTwitchPlayer()).toBe(await first);
    expect(remove).toHaveBeenCalledOnce();
    expect(script().onload).toBeNull();
    expect(script().onerror).toBeNull();
  });
  it('rejects a stalled script and allows a later mount to retry', async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const { loadTwitchPlayer } = await import('@/utils/twitchPlayer');
    const first = loadTwitchPlayer();
    const rejection = expect(first).rejects.toThrow('unavailable');
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
    const retry = loadTwitchPlayer();
    setSdk();
    script().dispatchEvent(new Event('load'));
    await expect(retry).resolves.toBeDefined();
  });
  it('rejects script errors and a load without the expected SDK global', async () => {
    vi.resetModules();
    const { loadTwitchPlayer } = await import('@/utils/twitchPlayer');
    const first = loadTwitchPlayer();
    script().dispatchEvent(new Event('error'));
    await expect(first).rejects.toThrow('unavailable');
    const retry = loadTwitchPlayer();
    script().dispatchEvent(new Event('load'));
    await expect(retry).rejects.toThrow('unavailable');
  });
});
