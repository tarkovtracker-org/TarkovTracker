import { useI18n } from 'vue-i18n';
import { useToastI18n } from '@/composables/useToastI18n';
import { usePreferencesStore } from '@/stores/usePreferences';
import { initializeTarkovSync, resetTarkovSync, useTarkovStore } from '@/stores/useTarkov';
import { logger } from '@/utils/logger';
/**
 * Handles app-level initialization:
 * - Locale setup from user preferences
 * - Supabase sync initialization for authenticated users
 * - Legacy data migration
 */
export function useAppInitialization() {
  const { $supabase } = useNuxtApp();
  const preferencesStore = usePreferencesStore();
  const { availableLocales, locale, setLocale } = useI18n({ useScope: 'global' });
  const { showLoadFailed } = useToastI18n();
  const isAvailableLocale = (value: string): value is typeof locale.value =>
    (availableLocales as readonly string[]).includes(value);
  const applyLocaleOverride = async (localeOverride: string | null) => {
    if (!localeOverride || !isAvailableLocale(localeOverride) || localeOverride === locale.value) {
      return;
    }
    try {
      await setLocale(localeOverride);
    } catch (error) {
      logger.error('[useAppInitialization] Failed to apply locale override:', error);
    }
  };
  let syncStarted = false;
  let migrationAttempted = false;
  const startSyncIfNeeded = async () => {
    if (!import.meta.client || !$supabase.user.loggedIn || syncStarted) return;
    syncStarted = true;
    try {
      await initializeTarkovSync();
    } catch (error) {
      syncStarted = false;
      logger.error('[useAppInitialization] Error initializing Supabase sync:', error);
      showLoadFailed();
    }
  };
  const runMigrationIfNeeded = async () => {
    if (!import.meta.client || !$supabase.user.loggedIn || migrationAttempted) return;
    try {
      const store = useTarkovStore();
      await store.migrateDataIfNeeded?.();
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
      const [prevLoggedIn, prevUserId] = previous ?? [false, null];
      if (!loggedIn) {
        if (prevLoggedIn) {
          resetTarkovSync('logout');
        }
        syncStarted = false;
        migrationAttempted = false;
        return;
      }
      if (prevUserId && userId && prevUserId !== userId) {
        resetTarkovSync('user switched');
        syncStarted = false;
        migrationAttempted = false;
      }
      await startSyncIfNeeded();
      await runMigrationIfNeeded();
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
  onMounted(async () => {
    await startSyncIfNeeded();
    await runMigrationIfNeeded();
  });
}
