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
};
export interface UseTurnstileWidgetReturn {
  enabled: boolean;
  ready: Readonly<Ref<boolean>>;
  getToken: () => Promise<string | null>;
  reset: () => void;
}
export const TOKEN_WAIT_TIMEOUT_MS = 8000;
export const SCRIPT_LOAD_RETRY_MS = 5000;
export const MAX_SCRIPT_LOAD_ATTEMPTS = 3;
let scriptPromise: Promise<TurnstileApi | null> | null = null;
function readTurnstileApi(): TurnstileApi | null {
  return (window as typeof window & { turnstile?: TurnstileApi }).turnstile ?? null;
}
function loadTurnstileApi(): Promise<TurnstileApi | null> {
  const existing = readTurnstileApi();
  if (existing) return Promise.resolve(existing);
  if (!scriptPromise) {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${TURNSTILE_SCRIPT_URL}"]`
    );
    if (existingScript) existingScript.remove();
    scriptPromise = new Promise<TurnstileApi | null>((resolvePromise) => {
      const script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        const loadedApi = readTurnstileApi();
        if (!loadedApi) scriptPromise = null;
        resolvePromise(loadedApi);
      };
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
export function useTurnstileWidget(container: Ref<HTMLElement | null>): UseTurnstileWidgetReturn {
  const config = useRuntimeConfig();
  const siteKey =
    typeof config.public.turnstileSiteKey === 'string' ? config.public.turnstileSiteKey.trim() : '';
  const enabled = siteKey.length > 0;
  const ready = ref(!enabled);
  let api: TurnstileApi | null = null;
  let widgetId: string | undefined;
  let latestToken: string | null = null;
  let renderGeneration = 0;
  let scriptLoadAttempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let waiters: Array<(token: string | null) => void> = [];
  const flushWaiters = (token: string | null): void => {
    const pending = waiters;
    waiters = [];
    for (const resolveWaiter of pending) resolveWaiter(token);
  };
  const removeWidget = (): void => {
    renderGeneration += 1;
    scriptLoadAttempts = 0;
    ready.value = !enabled;
    latestToken = null;
    flushWaiters(null);
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (api && widgetId !== undefined) {
      try {
        api.remove(widgetId);
      } catch (error) {
        logger.debug('[Turnstile] Failed to remove widget:', error);
      }
    }
    widgetId = undefined;
  };
  const renderWidget = async (element: HTMLElement): Promise<void> => {
    const generation = ++renderGeneration;
    scriptLoadAttempts += 1;
    const loadedApi = await loadTurnstileApi();
    if (generation !== renderGeneration || container.value !== element) return;
    if (!loadedApi) {
      if (scriptLoadAttempts >= MAX_SCRIPT_LOAD_ATTEMPTS) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        const currentContainer = container.value;
        if (currentContainer) void renderWidget(currentContainer);
      }, SCRIPT_LOAD_RETRY_MS);
      return;
    }
    scriptLoadAttempts = 0;
    api = loadedApi;
    try {
      widgetId = api.render(element, {
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
      ready.value = widgetId !== undefined;
    } catch (error) {
      logger.warn('[Turnstile] Failed to render widget:', error);
    }
  };
  if (enabled) {
    watch(
      container,
      (element, previousElement) => {
        if (element === previousElement) return;
        removeWidget();
        if (element) void renderWidget(element);
      },
      { flush: 'post', immediate: true }
    );
  }
  onUnmounted(removeWidget);
  const getToken = (): Promise<string | null> => {
    if (!enabled) return Promise.resolve(null);
    if (latestToken) return Promise.resolve(latestToken);
    if (!ready.value || !api || widgetId === undefined) return Promise.resolve(null);
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
  };
  const reset = (): void => {
    latestToken = null;
    if (api && widgetId !== undefined) {
      try {
        api.reset(widgetId);
      } catch (error) {
        logger.debug('[Turnstile] Failed to reset widget:', error);
      }
    }
  };
  return { enabled, getToken, ready, reset };
}
