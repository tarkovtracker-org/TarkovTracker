import { useSupporter } from '@/composables/useSupporter';
import { useToastI18n } from '@/composables/useToastI18n';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import {
  initializeTarkovSync,
  resetTarkovStoreForSessionTransition,
  useTarkovStore,
} from '@/stores/useTarkov';
import { logger } from '@/utils/logger';
/**
 * Handles app-level initialization:
 * - Locale setup from user preferences
 * - Supabase sync initialization for authenticated users
 * - Legacy data migration
 */
export function useAppInitialization() {
  const { $supabase } = useNuxtApp();
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
  let supporterLoadedForUserId: string | null = null;
  let authChangeToken = 0;
  const resetTarkovState = (reason: string, previousUserId: string | null = null) => {
    resetTarkovStoreForSessionTransition(previousUserId, reason);
  };
  const loadSupporterStatusIfNeeded = async (expectedUserId?: string, expectedToken?: number) => {
    const authenticatedUserId = getAuthenticatedUserId();
    if (expectedUserId && authenticatedUserId !== expectedUserId) return;
    if (expectedToken !== undefined && expectedToken !== authChangeToken) return;
    if (!authenticatedUserId) return;
    if (supporterLoadedForUserId === authenticatedUserId) return;
    try {
      await supporter.fetchStatus(authenticatedUserId);
      if (expectedUserId && getAuthenticatedUserId() !== expectedUserId) return;
      if (expectedToken !== undefined && expectedToken !== authChangeToken) return;
      supporter.subscribe(authenticatedUserId);
      supporterLoadedForUserId = authenticatedUserId;
    } catch (error) {
      logger.error('[useAppInitialization] Failed to load supporter status:', error);
    }
  };
  const startSyncIfNeeded = async (expectedUserId?: string, expectedToken?: number) => {
    const authenticatedUserId = getAuthenticatedUserId();
    if (expectedUserId && authenticatedUserId !== expectedUserId) return;
    if (expectedToken !== undefined && expectedToken !== authChangeToken) return;
    if (!authenticatedUserId || syncStarted) return;
    syncStarted = true;
    try {
      await initializeTarkovSync();
      if (expectedUserId && getAuthenticatedUserId() !== expectedUserId) {
        syncStarted = false;
        return;
      }
      if (expectedToken !== undefined && expectedToken !== authChangeToken) {
        syncStarted = false;
      }
    } catch (error) {
      syncStarted = false;
      logger.error('[useAppInitialization] Error initializing Supabase sync:', error);
      showLoadFailed();
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
  // React to authentication changes so login-after-load users get sync/migration too
  watch(
    () => [$supabase.user.loggedIn, $supabase.user.id] as const,
    async ([loggedIn, userId], previous) => {
      const token = ++authChangeToken;
      const [prevLoggedIn, prevUserId] = previous ?? [false, null];
      if (!loggedIn || !userId) {
        if (prevLoggedIn && prevUserId) {
          resetTarkovState(!loggedIn ? 'logout' : 'user unavailable', prevUserId);
        } else if (!loggedIn && prevLoggedIn) {
          resetTarkovState('logout');
        }
        syncStarted = false;
        migrationAttempted = false;
        supporterLoadedForUserId = null;
        supporter.reset();
        return;
      }
      if (prevUserId && userId && prevUserId !== userId) {
        resetTarkovState('user switched', prevUserId);
        syncStarted = false;
        migrationAttempted = false;
        supporterLoadedForUserId = null;
        supporter.reset();
      }
      await startSyncIfNeeded(userId, token);
      if (token !== authChangeToken) return;
      await runMigrationIfNeeded(userId, token);
      if (token !== authChangeToken) return;
      await loadSupporterStatusIfNeeded(userId, token);
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
