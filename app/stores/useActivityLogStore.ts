import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { useTarkovStore } from '@/stores/useTarkov';
import { logger } from '@/utils/logger';
import { sanitizeManualActivityHistory } from '@/utils/progressSanitizers';
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '@/utils/storageKeys';
import {
  getCurrentSupabaseUserId,
  parseUserScopedStorage,
  serializeUserScopedStorage,
} from '@/utils/userScopedStorage';
import type { ApiUpdateMeta, ManualActivityEntry } from '@/types/progress';
export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  source: 'api' | 'manual';
  type: 'task' | 'hideout' | 'item' | 'system';
  action:
    | 'complete'
    | 'uncomplete'
    | 'fail'
    | 'reset_failed'
    | 'upgrade'
    | 'needed'
    | 'sync'
    | 'available';
  title: string;
  details?: string;
  metadata?: unknown;
}
const ACTIVITY_LOG_DISPLAY_LIMIT = 50;
const parseLegacyJson = <T>(raw: string, fallback: T): T => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};
const activityLogTimestampSerializer = {
  read: (raw: string): number => {
    const currentUserId = getCurrentSupabaseUserId();
    const wrapped = parseUserScopedStorage<number>(raw);
    if (wrapped) {
      return wrapped._userId === currentUserId && typeof wrapped.data === 'number'
        ? wrapped.data
        : 0;
    }
    const legacyTimestamp = parseLegacyJson<unknown>(raw, 0);
    return typeof legacyTimestamp === 'number' ? legacyTimestamp : 0;
  },
  write: (value: number): string => serializeUserScopedStorage(value, getCurrentSupabaseUserId()),
};
const toActivityLogEntry = (entry: ManualActivityEntry): ActivityLogEntry => ({
  id: entry.id,
  timestamp: entry.timestamp,
  source: 'manual',
  type: entry.type,
  action: entry.action,
  title: entry.title,
  ...(entry.details ? { details: entry.details } : {}),
});
/**
 * Read manual activity entries left behind by the pre-#445 standalone
 * `useStorage` ref. Returns `null` when the payload belongs to another user, so
 * the caller leaves the key in place until the matching session loads instead of
 * discarding another account's entries.
 */
const readLegacyManualEntries = (raw: string): ManualActivityEntry[] | null => {
  const wrapped = parseUserScopedStorage<unknown>(raw);
  if (wrapped) {
    return wrapped._userId === getCurrentSupabaseUserId()
      ? sanitizeManualActivityHistory(wrapped.data)
      : null;
  }
  return sanitizeManualActivityHistory(parseLegacyJson<unknown>(raw, []));
};
export const useActivityLogStore = defineStore('activityLog', {
  state: () => ({
    // Read state is intentionally device-local: the unread badge tracks what
    // this browser has seen, not what the account has seen. Manual entries
    // themselves live in the synced per-mode progress blob (issue #445).
    lastReadTimestamp: useStorage<number>(STORAGE_KEYS.activityLogLastRead, 0, undefined, {
      serializer: activityLogTimestampSerializer,
    }),
  }),
  getters: {
    manualEntries(): ActivityLogEntry[] {
      return useTarkovStore().getManualActivityHistory().map(toActivityLogEntry);
    },
    allEntries(): ActivityLogEntry[] {
      const tarkovStore = useTarkovStore();
      const currentData = tarkovStore.getCurrentProgressData();
      const apiEntries: ActivityLogEntry[] = (currentData?.apiUpdateHistory || []).map(
        (entry: ApiUpdateMeta) => ({
          id: entry.id,
          timestamp: entry.at,
          source: 'api',
          type: 'system',
          action: 'sync',
          title: 'activity_log.api_synced',
          metadata: entry,
        })
      );
      const combined = [...apiEntries, ...this.manualEntries];
      return combined
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, ACTIVITY_LOG_DISPLAY_LIMIT);
    },
    unreadCount(): number {
      const tarkovStore = useTarkovStore();
      const currentData = tarkovStore.getCurrentProgressData();
      const apiUnreadCount = (currentData?.apiUpdateHistory || []).reduce(
        (count: number, entry: ApiUpdateMeta) =>
          entry.at > this.lastReadTimestamp ? count + 1 : count,
        0
      );
      const manualUnreadCount = tarkovStore
        .getManualActivityHistory()
        .reduce(
          (count, entry) => (entry.timestamp > this.lastReadTimestamp ? count + 1 : count),
          0
        );
      return apiUnreadCount + manualUnreadCount;
    },
    hasUnread(): boolean {
      const tarkovStore = useTarkovStore();
      const currentData = tarkovStore.getCurrentProgressData();
      return (
        (currentData?.apiUpdateHistory || []).some(
          (entry: ApiUpdateMeta) => entry.at > this.lastReadTimestamp
        ) ||
        tarkovStore
          .getManualActivityHistory()
          .some((entry) => entry.timestamp > this.lastReadTimestamp)
      );
    },
  },
  actions: {
    addManualEntry(entry: Omit<ActivityLogEntry, 'timestamp' | 'source'>) {
      useTarkovStore().addManualActivityEntries([
        {
          id: entry.id,
          timestamp: Date.now(),
          type: entry.type,
          action: entry.action,
          title: entry.title,
          ...(entry.details ? { details: entry.details } : {}),
        },
      ]);
    },
    markAllAsRead() {
      const tarkovStore = useTarkovStore();
      const currentData = tarkovStore.getCurrentProgressData();
      const latestApiTimestamp = (currentData?.apiUpdateHistory || []).reduce(
        (latest: number, entry: ApiUpdateMeta) => Math.max(latest, entry.at),
        0
      );
      const latestManualTimestamp = tarkovStore
        .getManualActivityHistory()
        .reduce((latest, entry) => Math.max(latest, entry.timestamp), 0);
      this.lastReadTimestamp = Math.max(latestApiTimestamp, latestManualTimestamp, Date.now());
    },
    clearLog() {
      useTarkovStore().clearManualActivityHistory();
      this.lastReadTimestamp = Date.now();
    },
    /**
     * Reset only the device-local read marker. Manual entries now follow the
     * progress store's own session lifecycle, so this no longer writes an empty
     * list to localStorage — the write that used to destroy entries whenever
     * auth state changed before the scoped read resolved.
     */
    resetForSession() {
      this.lastReadTimestamp = 0;
    },
    /**
     * One-time move of pre-#445 manual entries into the selected mode's synced
     * progress blob. Idempotent: the legacy keys are removed once their entries
     * have been adopted, and a payload owned by another user is left untouched
     * for that user's session to claim.
     */
    migrateLegacyManualEntries(): boolean {
      if (!import.meta.client) return false;
      let migrated = false;
      for (const key of [STORAGE_KEYS.activityLogManual, LEGACY_STORAGE_KEYS.activityLogManual]) {
        let raw: string | null;
        try {
          raw = localStorage.getItem(key);
        } catch (error) {
          logger.warn('[useActivityLogStore] Could not read legacy manual activity log', error);
          continue;
        }
        if (raw === null) continue;
        const legacyEntries = readLegacyManualEntries(raw);
        if (!legacyEntries) continue;
        if (legacyEntries.length > 0) {
          useTarkovStore().addManualActivityEntries(legacyEntries);
          migrated = true;
        }
        try {
          localStorage.removeItem(key);
        } catch (error) {
          logger.warn('[useActivityLogStore] Could not clear legacy manual activity log', error);
        }
      }
      return migrated;
    },
  },
});
