import { useAnalyticsEvents } from '@/composables/useAnalyticsEvents';
import type { OAuthProvider } from '@/composables/useOAuthLogin';
import type { TaskActionPayload } from '@/composables/useTaskActions';
const PENDING_LOGIN_PROVIDER_STORAGE_KEY = 'tt-pending-login-provider';
type ProductAnalyticsPrimitive = boolean | number | string;
const normalizeErrorType = (error: unknown): string => {
  if (error instanceof Error && error.name) {
    return error.name;
  }
  return 'unknown';
};
const readPendingLoginProvider = (): OAuthProvider | undefined => {
  if (!import.meta.client) {
    return undefined;
  }
  const pendingProvider = window.localStorage.getItem(PENDING_LOGIN_PROVIDER_STORAGE_KEY);
  if (
    pendingProvider === 'discord' ||
    pendingProvider === 'github' ||
    pendingProvider === 'google' ||
    pendingProvider === 'twitch'
  ) {
    return pendingProvider;
  }
  return undefined;
};
const clearPendingLoginProvider = () => {
  if (!import.meta.client) {
    return;
  }
  window.localStorage.removeItem(PENDING_LOGIN_PROVIDER_STORAGE_KEY);
};
export function useProductAnalytics(): {
  clearPendingLoginProvider: () => void;
  trackDisplayNameSaved: (options: { gameMode: string; length: number }) => void;
  trackLoginFailed: (provider: OAuthProvider, error?: unknown) => void;
  trackLoginStarted: (provider: OAuthProvider) => void;
  trackLoginSucceeded: (provider?: OAuthProvider) => void;
  trackNeededItemsView: (input: {
    cardStyle?: 'compact' | 'expanded';
    previousView?: 'combined' | 'grid' | 'list';
    source: 'change' | 'page_load';
    view: 'combined' | 'grid' | 'list';
  }) => void;
  trackSettingChanged: (input: {
    area: string;
    name: string;
    value?: ProductAnalyticsPrimitive;
  }) => void;
  trackTaskAction: (payload: TaskActionPayload) => void;
} {
  const { trackEvent } = useAnalyticsEvents();
  const writePendingLoginProvider = (provider: OAuthProvider) => {
    if (!import.meta.client) {
      return;
    }
    window.localStorage.setItem(PENDING_LOGIN_PROVIDER_STORAGE_KEY, provider);
  };
  const trackLoginStarted = (provider: OAuthProvider) => {
    writePendingLoginProvider(provider);
    trackEvent('login_start', {
      method: provider,
    });
  };
  const trackLoginFailed = (provider: OAuthProvider, error?: unknown) => {
    clearPendingLoginProvider();
    trackEvent('login_error', {
      error_type: normalizeErrorType(error),
      method: provider,
    });
  };
  const trackLoginSucceeded = (provider?: OAuthProvider) => {
    const resolvedProvider = provider ?? readPendingLoginProvider();
    clearPendingLoginProvider();
    trackEvent('login', {
      method: resolvedProvider ?? 'unknown',
    });
  };
  const trackNeededItemsView = ({
    cardStyle,
    previousView,
    source,
    view,
  }: {
    cardStyle?: 'compact' | 'expanded';
    previousView?: 'combined' | 'grid' | 'list';
    source: 'change' | 'page_load';
    view: 'combined' | 'grid' | 'list';
  }) => {
    trackEvent('needed_items_view', {
      card_style: view === 'grid' ? cardStyle : undefined,
      previous_view_mode: previousView,
      source,
      view_mode: view,
    });
  };
  const trackTaskAction = (payload: TaskActionPayload) => {
    if (payload.undoKey) {
      return;
    }
    trackEvent(`task_${payload.action}`, {
      was_manual_fail: payload.wasManualFail,
      ...payload.analyticsParams,
      task_id: payload.taskId,
      task_name: payload.taskName,
    });
  };
  const trackSettingChanged = ({
    area,
    name,
    value,
  }: {
    area: string;
    name: string;
    value?: ProductAnalyticsPrimitive;
  }) => {
    trackEvent('settings_change', {
      setting_area: area,
      setting_name: name,
      setting_value: value,
    });
  };
  const trackDisplayNameSaved = ({ gameMode, length }: { gameMode: string; length: number }) => {
    trackEvent('profile_update', {
      display_name_length: length,
      game_mode: gameMode.toLowerCase(),
      profile_field: 'display_name',
    });
  };
  return {
    clearPendingLoginProvider,
    trackDisplayNameSaved,
    trackLoginFailed,
    trackLoginStarted,
    trackLoginSucceeded,
    trackNeededItemsView,
    trackSettingChanged,
    trackTaskAction,
  };
}
