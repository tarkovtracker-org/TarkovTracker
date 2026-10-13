export interface TwitchPlayerInstance {
  destroy(): void;
  addEventListener(event: string, listener: () => void): void;
  removeEventListener(event: string, listener: () => void): void;
}
interface TwitchPlayerConstructor {
  new (
    element: HTMLElement,
    options: {
      channel: string;
      parent: string[];
      width: string;
      height: number;
      autoplay: boolean;
      muted: boolean;
    }
  ): TwitchPlayerInstance;
  READY: string;
  OFFLINE: string;
}
let pending: Promise<TwitchPlayerConstructor> | undefined;
const getPlayer = (): TwitchPlayerConstructor | undefined =>
  (window as Window & { Twitch?: { Player: TwitchPlayerConstructor } }).Twitch?.Player;
export function loadTwitchPlayer(): Promise<TwitchPlayerConstructor> {
  const player = getPlayer();
  if (player) return Promise.resolve(player);
  pending ??= loadScript().catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}
function loadScript(): Promise<TwitchPlayerConstructor> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const cleanup = (): void => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      script.remove();
    };
    const fail = (): void => {
      cleanup();
      reject(new Error('Twitch player script unavailable'));
    };
    const timer = setTimeout(fail, 10_000);
    script.src = 'https://player.twitch.tv/js/embed/v1.js';
    script.async = true;
    script.onerror = fail;
    script.onload = () => {
      const player = getPlayer();
      if (!player) return fail();
      cleanup();
      resolve(player);
    };
    document.head.appendChild(script);
  });
}
