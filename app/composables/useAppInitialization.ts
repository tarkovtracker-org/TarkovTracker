import { useSupporter } from '@/composables/useSupporter';
import { useToastI18n } from '@/composables/useToastI18n';
import { initializeProgressAuthority } from '@/stores/tarkov/progressAuthority';
import {
  hasPendingCloudChanges,
  markCloudSyncUnavailable,
} from '@/stores/tarkov/progressSaveStatus';
import { useActivityLogStore } from '@/stores/useActivityLogStore';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import {
  initializeTarkovSync,
  hasPendingProgressHandoff,
  mayHoldUnsyncedProgress,
  preserveUnsavedSessionProgress,
  resetTarkovStoreForSessionTransition,
  resetTarkovSync,
  settlePendingProgressHandoffs,
  useTarkovStore,
} from '@/stores/useTarkov';
import { logger } from '@/utils/logger';
interface AccountActivityResponse {
  recorded: boolean;
}
/**
 * Bounded same-session retry for a failed authenticated initial sync. The auth
 * watcher only reruns on identity changes, so without this cycle a transient
 * failure would strand the deferred legacy activity adoption until the next
 * login. A fixed 30-second interval keeps the retry deterministic; five
 * attempts cover roughly 2.5 minutes of transient unavailability without
 * retrying forever against a hard-down server.
 */
export const SYNC_RETRY_DELAY_MS = 30_000;
export const SYNC_RETRY_MAX_ATTEMPTS = 5;
/**
 * Handles app-level initialization:
 * - Locale setup from user preferences
 * - Supabase sync initialization for authenticated users
 * - Legacy data migration
 */
export function useAppInitialization() {
  const { $supabase } = useNuxtApp();
  const activityLogStore = useActivityLogStore();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const supporter = useSupporter();
  const { availableLocales, locale, setLocale } = useI18n({ useScope: 'global' });
  const { showLoadFailed } = useToastI18n();
  const isAvailableLocale = (value: string): value is typeof locale.value =>
    (availableLocales as readonly string[]).includes(value);
  const syncMetadataLocale = async (nextLocale: string) => {
    const previousLanguageCode = metadataStore.languageCode;
    metadataStore.updateLanguageAndGameMode(nextLocale);
    if (!metadataStore.hasInitialized || metadataStore.languageCode === previousLanguageCode) {
      return;
    }
    try {
      await metadataStore.fetchAllData(false);
    } catch (error) {
      logger.error('[useAppInitialization] Failed to refresh metadata after locale change:', error);
      showLoadFailed();
    }
  };
  const applyLocaleOverride = async (localeOverride: string | null) => {
    if (!localeOverride || !isAvailableLocale(localeOverride) || localeOverride === locale.value) {
      return;
    }
    try {
      await setLocale(localeOverride);
      await syncMetadataLocale(localeOverride);
    } catch (error) {
      logger.error('[useAppInitialization] Failed to apply locale override:', error);
    }
  };
  const getAuthenticatedUserId = () => {
    if (!import.meta.client || !$supabase.user.loggedIn) {
      return null;
    }
    return $supabase.user.id ?? null;
  };
  let syncStarted = false;
  let migrationAttempted = false;
  let syncRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let syncRetryAttempts = 0;
  const activityRecordedAt = new Map<string, number>();
  const activityRequests = new Map<string, number>();
  let disposed = false;
  let supporterLoadedForUserId: string | null = null;
  let authChangeToken = 0;
  const cancelSyncRetry = () => {
    if (syncRetryTimer !== null) {
      clearTimeout(syncRetryTimer);
      syncRetryTimer = null;
    }
  };
  // True when a guarded initialization step would act on a stale session or a
  // superseded auth change, matching the guards inside each step.
  const isStaleInitialization = (expectedUserId?: string, expectedToken?: number) =>
    (expectedUserId !== undefined && getAuthenticatedUserId() !== expectedUserId) ||
    (expectedToken !== undefined && expectedToken !== authChangeToken);
  const reportSyncFailure = () => {
    if (syncRetryAttempts === 0) {
      showLoadFailed();
      return;
    }
    logger.warn(
      `[useAppInitialization] Initial sync retry ${syncRetryAttempts}/${SYNC_RETRY_MAX_ATTEMPTS} failed`
    );
  };
  const scheduleSyncRetry = (expectedUserId?: string, expectedToken?: number) => {
    cancelSyncRetry();
    syncRetryTimer = setTimeout(() => {
      syncRetryTimer = null;
      void retryAuthenticatedInitialization(expectedUserId, expectedToken);
    }, SYNC_RETRY_DELAY_MS);
    syncRetryAttempts += 1;
  };
  const handleSyncFailure = (expectedUserId?: string, expectedToken?: number) => {
    const userId = getAuthenticatedUserId();
    if (isStaleInitialization(expectedUserId, expectedToken) || !userId) return;
    // A failure after the sync controller or realtime listener was created
    // leaves them partially initialized; the same-user guard inside
    // initializeTarkovSync would then skip listener setup on the retry and
    // disconnect cross-device updates. Tear the machinery down so the retry
    // starts from a clean slate.
    resetTarkovSync('initial sync failed', { preserveStorageBaselineForUserId: userId });
    // A failed load is not a failed save unless local progress may be waiting for the cloud.
    if (mayHoldUnsyncedProgress(userId)) {
      markCloudSyncUnavailable(() => retrySyncNow(expectedUserId, expectedToken));
    }
    reportSyncFailure();
    if (syncRetryAttempts >= SYNC_RETRY_MAX_ATTEMPTS) {
      showLoadFailed();
      return;
    }
    scheduleSyncRetry(expectedUserId, expectedToken);
  };
  /** Manual retry from the save indicator: restart initialization now with a fresh budget. */
  const retrySyncNow = async (expectedUserId?: string, expectedToken?: number) => {
    cancelSyncRetry();
    syncRetryAttempts = 0;
    await retryAuthenticatedInitialization(expectedUserId, expectedToken);
    return !hasPendingCloudChanges();
  };
  /** A retry must not let the startup load rehydrate over edits held only in memory. */
  const retryAuthenticatedInitialization = async (
    expectedUserId?: string,
    expectedToken?: number
  ) => {
    if (expectedUserId && !isStaleInitialization(expectedUserId, expectedToken)) {
      preserveUnsavedSessionProgress(expectedUserId);
    }
    await runAuthenticatedInitialization(expectedUserId, expectedToken);
  };
  const runAuthenticatedInitialization = async (
    expectedUserId?: string,
    expectedToken?: number
  ) => {
    await startSyncIfNeeded(expectedUserId, expectedToken);
    if (isStaleInitialization(expectedUserId, expectedToken)) return;
    await runMigrationIfNeeded(expectedUserId, expectedToken);
    if (isStaleInitialization(expectedUserId, expectedToken)) return;
    await loadSupporterStatusIfNeeded(expectedUserId, expectedToken);
    if (isStaleInitialization(expectedUserId, expectedToken)) return;
    await recordAccountActivityIfNeeded(expectedUserId, expectedToken);
  };
  onScopeDispose(cancelSyncRetry);
  const resetTarkovState = async (reason: string, previousUserId: string | null = null) => {
    try {
      const transition = resetTarkovStoreForSessionTransition(previousUserId, reason);
      activityLogStore.resetForSession();
      await transition;
      return true;
    } catch (error) {
      logger.error('[useAppInitialization] Failed to transition progress owner:', error);
      return false;
    }
  };
  const resetInitializationState = (loggedIn: boolean) => {
    syncStarted = false;
    migrationAttempted = false;
    cancelSyncRetry();
    syncRetryAttempts = 0;
    supporterLoadedForUserId = null;
    supporter.reset();
    if (!loggedIn) activityLogStore.migrateLegacyManualEntries();
  };
  const isCurrentSupporterRequest = (expectedUserId?: string, expectedToken?: number) =>
    (!expectedUserId || getAuthenticatedUserId() === expectedUserId) &&
    (expectedToken === undefined || expectedToken === authChangeToken);
  const loadSupporterStatusIfNeeded = async (expectedUserId?: string, expectedToken?: number) => {
    const authenticatedUserId = getAuthenticatedUserId();
    if (!isCurrentSupporterRequest(expectedUserId, expectedToken)) return;
    if (!authenticatedUserId) return;
    if (supporterLoadedForUserId === authenticatedUserId) return;
    try {
      let loaded = await supporter.subscribe(authenticatedUserId);
      if (!isCurrentSupporterRequest(expectedUserId, expectedToken)) return;
      // An unclean channel leave can decline the subscription before any status
      // request runs. Supporter status remains available over the normal read.
      if (!loaded) loaded = await supporter.fetchStatus(authenticatedUserId);
      if (!isCurrentSupporterRequest(expectedUserId, expectedToken)) return;
      if (loaded) supporterLoadedForUserId = authenticatedUserId;
    } catch (error) {
      logger.error('[useAppInitialization] Failed to load supporter status:', error);
    }
  };
  const isCurrentActivityRequest = (userId: string, token: number) =>
    !disposed && getAuthenticatedUserId() === userId && authChangeToken === token;
  const isActivityThrottled = (userId: string, token: number) =>
    Date.now() - (activityRecordedAt.get(userId) ?? -Infinity) < 86_400_000 ||
    activityRequests.get(userId) === token;
  const markRecordedActivity = (
    response: AccountActivityResponse,
    userId: string,
    token: number
  ) => {
    if (response.recorded && isCurrentActivityRequest(userId, token)) {
      activityRecordedAt.set(userId, Date.now());
    }
  };
  const sendAccountActivity = async (userId: string, authToken: number) => {
    const { data } = await $supabase.client.auth.getSession();
    if (!isCurrentActivityRequest(userId, authToken)) return;
    const token = data.session?.access_token;
    if (!token) return;
    const response = await $fetch<AccountActivityResponse>('/api/account/activity', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    markRecordedActivity(response, userId, authToken);
  };
  const finishActivityRequest = (userId: string, token: number) => {
    if (activityRequests.get(userId) === token) activityRequests.delete(userId);
  };
  const tryAccountActivity = async (userId: string, token: number) => {
    activityRequests.set(userId, token);
    try {
      await sendAccountActivity(userId, token);
    } catch (error) {
      logger.warn('[useAppInitialization] Failed to record account activity:', { userId, error });
    } finally {
      finishActivityRequest(userId, token);
    }
  };
  const canRecordActivity = (userId: string, token: number) =>
    isCurrentActivityRequest(userId, token) && !isActivityThrottled(userId, token);
  const recordAccountActivityIfNeeded = async (expectedUserId?: string, expectedToken?: number) => {
    const userId = getAuthenticatedUserId();
    if (!userId) return;
    if (isStaleInitialization(expectedUserId, expectedToken)) return;
    const token = authChangeToken;
    if (!canRecordActivity(userId, token)) return;
    await tryAccountActivity(userId, token);
  };
  const recordForegroundActivity = () => {
    if (document.visibilityState !== 'visible') return;
    const userId = getAuthenticatedUserId();
    if (userId) void recordAccountActivityIfNeeded(userId, authChangeToken);
  };
  if (import.meta.client) document.addEventListener('visibilitychange', recordForegroundActivity);
  onScopeDispose(() => {
    disposed = true;
    if (import.meta.client)
      document.removeEventListener('visibilitychange', recordForegroundActivity);
  });
  const startSyncIfNeeded = async (expectedUserId?: string, expectedToken?: number) => {
    const authenticatedUserId = getAuthenticatedUserId();
    if (expectedUserId && authenticatedUserId !== expectedUserId) return;
    if (expectedToken !== undefined && expectedToken !== authChangeToken) return;
    if (!authenticatedUserId || syncStarted) return;
    syncStarted = true;
    try {
      await initializeProgressAuthority(
        authenticatedUserId,
        false,
        () => !isStaleInitialization(expectedUserId, expectedToken)
      );
      if (isStaleInitialization(expectedUserId, expectedToken)) return;
      await initializeTarkovSync();
      // The replacement session owns syncStarted; stale completions must not clear it.
      if (isStaleInitialization(expectedUserId, expectedToken)) return;
      activityLogStore.migrateLegacyManualEntries();
      cancelSyncRetry();
      syncRetryAttempts = 0;
    } catch (error) {
      // Cancel silently rather than reporting failure or resetting a newer session.
      if (isStaleInitialization(expectedUserId, expectedToken)) return;
      syncStarted = false;
      logger.error('[useAppInitialization] Error initializing Supabase sync:', error);
      handleSyncFailure(expectedUserId, expectedToken);
    }
  };
  const runMigrationIfNeeded = async (expectedUserId?: string, expectedToken?: number) => {
    const authenticatedUserId = getAuthenticatedUserId();
    if (expectedUserId && authenticatedUserId !== expectedUserId) return;
    if (expectedToken !== undefined && expectedToken !== authChangeToken) return;
    if (!authenticatedUserId || migrationAttempted) return;
    try {
      const store = useTarkovStore();
      await store.migrateDataIfNeeded?.();
      if (expectedUserId && getAuthenticatedUserId() !== expectedUserId) return;
      if (expectedToken !== undefined && expectedToken !== authChangeToken) return;
      migrationAttempted = true;
    } catch (error) {
      migrationAttempted = false;
      logger.error('[useAppInitialization] Error running data migration:', error);
      showLoadFailed();
    }
  };
  // React to authentication changes so login-after-load users get sync/migration too.
  // The transition branches are named helpers: fallow's new-only gate attributes
  // complexity findings of anonymous arrows by position, and each helper also
  // stays below the CRAP threshold for uncovered code.
  const resetForPreviousUser = (loggedIn: boolean, prevUserId: string) => {
    void resetTarkovState(loggedIn ? 'user unavailable' : 'logout', prevUserId);
  };
  const resetForAuthLoss = (
    loggedIn: boolean,
    prevLoggedIn: boolean,
    prevUserId: string | null
  ) => {
    if (!prevLoggedIn) {
      resetInitializationState(loggedIn);
      return;
    }
    if (prevUserId) {
      resetForPreviousUser(loggedIn, prevUserId);
    } else if (!loggedIn) {
      void resetTarkovState('logout');
    }
    resetInitializationState(loggedIn);
  };
  const didSwitchUser = (previousUserId: string | null, currentUserId: string): boolean =>
    Boolean(previousUserId) && previousUserId !== currentUserId;
  const resolvePreviousAuthState = (previous?: readonly [boolean, string | null]) =>
    previous ?? ([false, null] as const);
  watch(
    () => [$supabase.user.loggedIn, $supabase.user.id] as const,
    async ([loggedIn, userId], previous) => {
      const token = ++authChangeToken;
      const [prevLoggedIn, prevUserId] = resolvePreviousAuthState(previous);
      if (!loggedIn || !userId) {
        resetForAuthLoss(loggedIn, prevLoggedIn, prevUserId);
        return;
      }
      if (didSwitchUser(prevUserId, userId)) {
        resetInitializationState(loggedIn);
        if (!(await resetTarkovState('user switched', prevUserId))) return;
        if (token !== authChangeToken) return;
      } else if (hasPendingProgressHandoff()) {
        await settlePendingProgressHandoffs();
        if (token !== authChangeToken) return;
      }
      await runAuthenticatedInitialization(userId, token);
    },
    { immediate: true }
  );
  watch(
    () => preferencesStore.localeOverride,
    async (localeOverride) => {
      await applyLocaleOverride(localeOverride);
    },
    { immediate: true }
  );
}
