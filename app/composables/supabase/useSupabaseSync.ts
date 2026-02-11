import { delay } from '@/utils/async';
import { debounce, isDebounceRejection } from '@/utils/debounce';
import { logger } from '@/utils/logger';
import type { Store } from 'pinia';
import type { UserProgressData } from '~/stores/progressState';
type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};
const ABORT_RETRY_DELAY_MS = 150;
export interface SupabaseSyncConfig {
  store: Store;
  table: string;
  transform?: (state: Record<string, unknown>) => Record<string, unknown> | null;
  debounceMs?: number;
}
// Type for the transformed data that gets sent to Supabase
interface SupabaseUserData {
  user_id?: string;
  current_game_mode?: string;
  game_edition?: number;
  pvp_data?: UserProgressData;
  pve_data?: UserProgressData;
  [key: string]: unknown;
}
// Fast hash for change detection - avoids full JSON comparison
function hashState(obj: unknown): string {
  const str = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}
function getMissingColumnName(error: SupabaseErrorLike): string | null {
  const combined = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`;
  const schemaCacheMatch = combined.match(/could not find the ['"]([^'"]+)['"] column/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];
  const quotedColumnMatch = combined.match(/column ['"]([^'"]+)['"] does not exist/i);
  if (quotedColumnMatch?.[1]) return quotedColumnMatch[1];
  const bareColumnMatch = combined.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  if (bareColumnMatch?.[1]) return bareColumnMatch[1];
  return null;
}
function isMissingColumnError(error: SupabaseErrorLike): boolean {
  if (error.code === 'PGRST204') return true;
  const combined =
    `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
  return combined.includes('column') && combined.includes('does not exist');
}
function isAbortRequestError(error: SupabaseErrorLike): boolean {
  const combined =
    `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
  return (
    combined.includes('aborterror') ||
    combined.includes('aborted') ||
    combined.includes('signal is aborted') ||
    combined.includes('request was aborted')
  );
}
function getFallbackPreferencesPayload(
  payload: Record<string, unknown>,
  missingColumn: string
): Record<string, unknown> | null {
  if (missingColumn in payload) {
    const missingValue = payload[missingColumn];
    const fallbackPayload = Object.fromEntries(
      Object.entries(payload).filter(([key]) => key !== missingColumn)
    );
    if (
      missingColumn === 'only_tasks_with_required_keys' &&
      !('only_tasks_with_suggested_keys' in fallbackPayload)
    ) {
      fallbackPayload.only_tasks_with_suggested_keys = missingValue;
    }
    return fallbackPayload;
  }
  if (missingColumn === 'only_tasks_with_required_keys') {
    const { only_tasks_with_required_keys: missingValue, ...fallbackPayload } = payload;
    if (typeof missingValue === 'boolean') {
      fallbackPayload.only_tasks_with_suggested_keys = missingValue;
      return fallbackPayload;
    }
  }
  return null;
}
function formatSupabaseError(error: SupabaseErrorLike) {
  return {
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    message: error.message ?? null,
  };
}
export function useSupabaseSync({
  store,
  table,
  transform,
  debounceMs = 1000,
}: SupabaseSyncConfig) {
  logger.debug(`[Sync] useSupabaseSync initialized for table: ${table}, debounce: ${debounceMs}ms`);
  const { $supabase } = useNuxtApp();
  const isSyncing = ref(false);
  const isPaused = ref(false);
  let lastSyncedHash: string | null = null;
  const syncToSupabase = async (inputState: unknown) => {
    const state = inputState as Record<string, unknown>;
    logger.debug('[Sync] syncToSupabase called', {
      loggedIn: $supabase.user.loggedIn,
      isPaused: isPaused.value,
    });
    if (isPaused.value) {
      logger.debug('[Sync] Skipping - sync is paused');
      return;
    }
    if (!$supabase.user.loggedIn || !$supabase.user.id) {
      logger.debug('[Sync] Skipping - user not logged in');
      return;
    }
    isSyncing.value = true;
    try {
      const dataToSave = transform ? transform(state) : state;
      // Skip if transform returned null (e.g., during initial load)
      if (!dataToSave) {
        logger.debug('[Sync] Skipping - transform returned null');
        isSyncing.value = false;
        return;
      }
      // Ensure user_id is present if not already
      if (!dataToSave.user_id) {
        dataToSave.user_id = $supabase.user.id;
      }
      // Skip sync if data hasn't changed (reduces egress significantly)
      const currentHash = hashState(dataToSave);
      if (currentHash === lastSyncedHash) {
        logger.debug('[Sync] Skipping - data unchanged');
        isSyncing.value = false;
        return;
      }
      // Log detailed info about what we're syncing (dev only)
      if (import.meta.env.DEV) {
        if (table === 'user_progress') {
          const userData = dataToSave as SupabaseUserData;
          const pvpTasks = Object.keys(userData.pvp_data?.taskCompletions || {}).length;
          const pveTasks = Object.keys(userData.pve_data?.taskCompletions || {}).length;
          logger.debug(`[Sync] About to upsert to ${table}:`, {
            gameMode: userData.current_game_mode,
            pvpLevel: userData.pvp_data?.level,
            pvpTasksCompleted: pvpTasks,
            pveLevel: userData.pve_data?.level,
            pveTasksCompleted: pveTasks,
          });
        } else {
          logger.debug('[Sync] About to upsert to', table);
        }
      }
      const upsert = async (payload: Record<string, unknown>) =>
        $supabase.client.from(table).upsert(payload);
      const upsertWithFallback = async (payload: Record<string, unknown>) => {
        let payloadToSync: Record<string, unknown> | null = payload;
        let error: SupabaseErrorLike | null = null;
        let synced = false;
        const removedMissingColumns = new Set<string>();
        while (payloadToSync) {
          const { error: syncError } = await upsert(payloadToSync);
          if (!syncError) {
            synced = true;
            break;
          }
          error = syncError;
          if (table !== 'user_preferences' || !isMissingColumnError(syncError)) {
            break;
          }
          const missingColumn = getMissingColumnName(syncError);
          if (!missingColumn || removedMissingColumns.has(missingColumn)) {
            break;
          }
          const fallbackPayload = getFallbackPreferencesPayload(payloadToSync, missingColumn);
          if (!fallbackPayload) {
            break;
          }
          removedMissingColumns.add(missingColumn);
          payloadToSync = fallbackPayload;
        }
        return { synced, error, removedMissingColumns };
      };
      let syncResult = await upsertWithFallback(dataToSave);
      if (
        !syncResult.synced &&
        syncResult.error &&
        isAbortRequestError(syncResult.error) &&
        !isPaused.value
      ) {
        await delay(ABORT_RETRY_DELAY_MS);
        if (!isPaused.value && $supabase.user.loggedIn && $supabase.user.id) {
          syncResult = await upsertWithFallback(dataToSave);
        }
      }
      if (syncResult.synced && syncResult.removedMissingColumns.size) {
        logger.warn(
          `[Sync] ${table} fallback sync succeeded after removing missing columns: ${Array.from(syncResult.removedMissingColumns).join(', ')}`
        );
      }
      if (!syncResult.synced && syncResult.error) {
        if (isAbortRequestError(syncResult.error)) {
          logger.warn(`[Sync] Sync to ${table} was aborted; retry did not succeed yet`, {
            ...formatSupabaseError(syncResult.error),
            retryDelayMs: ABORT_RETRY_DELAY_MS,
          });
        } else {
          logger.error(`[Sync] Error syncing to ${table}:`, formatSupabaseError(syncResult.error));
        }
      }
      if (syncResult.synced) {
        lastSyncedHash = currentHash;
        logger.debug(`[Sync] ✅ Successfully synced to ${table}`);
      }
    } catch (err) {
      logger.error('[Sync] Unexpected error:', err);
    } finally {
      isSyncing.value = false;
    }
  };
  const snapshotState = (state: unknown) => {
    try {
      // Avoid cloning Vue proxies directly
      const raw = typeof state === 'object' ? toRaw(state) : state;
      if (typeof structuredClone === 'function') {
        return structuredClone(raw);
      }
      if (Array.isArray(raw)) return raw.slice();
      if (raw && typeof raw === 'object') return { ...(raw as Record<string, unknown>) };
      return raw;
    } catch (e) {
      logger.warn('[Sync] structuredClone failed, trying JSON clone', e);
      try {
        return JSON.parse(JSON.stringify(state));
      } catch (jsonErr) {
        logger.error('[Sync] All cloning methods failed, using original state', jsonErr);
        return state;
      }
    }
  };
  const debouncedSync = debounce(syncToSupabase, debounceMs);
  const unwatch = watch(
    () => store.$state,
    (newState) => {
      logger.debug(`[Sync] Store state changed for ${table}, triggering debounced sync`);
      const clonedState = snapshotState(newState);
      void debouncedSync(clonedState).catch((error) => {
        if (isDebounceRejection(error)) return;
        logger.error(`[Sync] Debounced sync failed for ${table}:`, error);
      });
    },
    { deep: true }
  );
  const cleanup = () => {
    debouncedSync.cancel();
    unwatch();
  };
  if (getCurrentInstance()) {
    onUnmounted(cleanup);
  }
  const pause = () => {
    logger.debug(`[Sync] Pausing sync for ${table}`);
    isPaused.value = true;
    debouncedSync.cancel();
  };
  const resume = () => {
    logger.debug(`[Sync] Resuming sync for ${table}`);
    isPaused.value = false;
  };
  return {
    isSyncing,
    isPaused,
    cleanup,
    pause,
    resume,
  };
}
