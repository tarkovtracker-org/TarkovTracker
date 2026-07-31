import { logger } from '@/utils/logger';
import { TURNSTILE_SCRIPT_URL } from '@/utils/turnstileKeys';
type TurnstileRenderOptions = {
  sitekey: string;
  callback: (token: string) => void;
  'error-callback': () => void;
  'expired-callback': () => void;
  appearance: 'always' | 'execute' | 'interaction-only';
  'refresh-expired': 'auto' | 'manual' | 'never';
  size: 'normal' | 'flexible' | 'compact';
  theme: 'auto' | 'light' | 'dark';
};
type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string | undefined;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
  getResponse: (widgetId?: string) => string | undefined;
};
export interface TurnstileTokenProvider {
  getToken: () => Promise<string | null>;
  reset: () => void;
}
export interface UseTurnstileWidgetReturn {
  enabled: boolean;
}
const TOKEN_WAIT_TIMEOUT_MS = 8000;
let scriptPromise: Promise<TurnstileApi | null> | null = null;
let activeProvider: TurnstileTokenProvider | null = null;
function readTurnstileApi(): TurnstileApi | null {
  return (window as typeof window & { turnstile?: TurnstileApi }).turnstile ?? null;
}
function loadTurnstileApi(): Promise<TurnstileApi | null> {
  const existing = readTurnstileApi();
  if (existing) return Promise.resolve(existing);
  if (!scriptPromise) {
    scriptPromise = new Promise<TurnstileApi | null>((resolvePromise) => {
      const script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolvePromise(readTurnstileApi());
      script.onerror = () => {
        logger.warn('[Turnstile] Failed to load the Turnstile script');
        scriptPromise = null;
        resolvePromise(null);
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}
export function requestTurnstileToken(): Promise<string | null> {
  return activeProvider ? activeProvider.getToken() : Promise.resolve(null);
}
export function notifyTurnstileTokenConsumed(): void {
  activeProvider?.reset();
}
export function useTurnstileWidget(container: Ref<HTMLElement | null>): UseTurnstileWidgetReturn {
  const config = useRuntimeConfig();
  const siteKey =
    typeof config.public.turnstileSiteKey === 'string' ? config.public.turnstileSiteKey.trim() : '';
  const enabled = siteKey.length > 0;
  if (!enabled) {
    return { enabled };
  }
  let api: TurnstileApi | null = null;
  let widgetId: string | undefined;
  let latestToken: string | null = null;
  let waiters: Array<(token: string | null) => void> = [];
  const flushWaiters = (token: string | null): void => {
    const pending = waiters;
    waiters = [];
    for (const resolveWaiter of pending) resolveWaiter(token);
  };
  const provider: TurnstileTokenProvider = {
    getToken: () => {
      if (latestToken) return Promise.resolve(latestToken);
      if (!api || widgetId === undefined) return Promise.resolve(null);
      return new Promise<string | null>((resolveToken) => {
        const timeout = setTimeout(() => {
          waiters = waiters.filter((waiter) => waiter !== resolveWithCleanup);
          resolveToken(null);
        }, TOKEN_WAIT_TIMEOUT_MS);
        const resolveWithCleanup = (token: string | null): void => {
          clearTimeout(timeout);
          resolveToken(token);
        };
        waiters.push(resolveWithCleanup);
      });
    },
    reset: () => {
      latestToken = null;
      if (api && widgetId !== undefined) {
        try {
          api.reset(widgetId);
        } catch (error) {
          logger.debug('[Turnstile] Failed to reset widget:', error);
        }
      }
    },
  };
  onMounted(async () => {
    api = await loadTurnstileApi();
    if (!api || !container.value) return;
    try {
      widgetId = api.render(container.value, {
        sitekey: siteKey,
        callback: (token: string) => {
          latestToken = token;
          flushWaiters(token);
        },
        'error-callback': () => {
          latestToken = null;
          flushWaiters(null);
        },
        'expired-callback': () => {
          latestToken = null;
        },
        appearance: 'interaction-only',
        'refresh-expired': 'auto',
        size: 'flexible',
        theme: 'auto',
      });
      activeProvider = provider;
    } catch (error) {
      logger.warn('[Turnstile] Failed to render widget:', error);
    }
  });
  onUnmounted(() => {
    if (activeProvider === provider) {
      activeProvider = null;
    }
    flushWaiters(null);
    if (api && widgetId !== undefined) {
      try {
        api.remove(widgetId);
      } catch (error) {
        logger.debug('[Turnstile] Failed to remove widget:', error);
      }
      widgetId = undefined;
    }
  });
  return { enabled };
}
