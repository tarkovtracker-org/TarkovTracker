import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { useTarkovStore } from '@/stores/useTarkov';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import {
  getCurrentSupabaseUserId,
  parseUserScopedStorage,
  serializeUserScopedStorage,
} from '@/utils/userScopedStorage';
import type { ApiUpdateMeta } from '@/types/progress';
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
const parseLegacyJson = <T>(raw: string, fallback: T): T => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};
const activityLogEntriesSerializer = {
  read: (raw: string): ActivityLogEntry[] => {
    const currentUserId = getCurrentSupabaseUserId();
    const wrapped = parseUserScopedStorage<ActivityLogEntry[]>(raw);
    if (wrapped) {
      return wrapped._userId === currentUserId && Array.isArray(wrapped.data) ? wrapped.data : [];
    }
    const legacyEntries = parseLegacyJson<unknown>(raw, []);
    return Array.isArray(legacyEntries) ? (legacyEntries as ActivityLogEntry[]) : [];
  },
  write: (value: ActivityLogEntry[]): string =>
    serializeUserScopedStorage(value, getCurrentSupabaseUserId()),
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
export const useActivityLogStore = defineStore('activityLog', {
  state: () => ({
    manualEntries: useStorage<ActivityLogEntry[]>(STORAGE_KEYS.activityLogManual, [], undefined, {
      serializer: activityLogEntriesSerializer,
    }),
    lastReadTimestamp: useStorage<number>(STORAGE_KEYS.activityLogLastRead, 0, undefined, {
      serializer: activityLogTimestampSerializer,
    }),
  }),
  getters: {
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
      return combined.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
    },
    unreadCount(): number {
      const tarkovStore = useTarkovStore();
      const currentData = tarkovStore.getCurrentProgressData();
      const apiUnreadCount = (currentData?.apiUpdateHistory || []).reduce(
        (count: number, entry: ApiUpdateMeta) =>
          entry.at > this.lastReadTimestamp ? count + 1 : count,
        0
      );
      const manualUnreadCount = this.manualEntries.reduce(
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
        ) || this.manualEntries.some((entry) => entry.timestamp > this.lastReadTimestamp)
      );
    },
  },
  actions: {
    addManualEntry(entry: Omit<ActivityLogEntry, 'timestamp' | 'source'>) {
      this.manualEntries.unshift({
        ...entry,
        timestamp: Date.now(),
        source: 'manual',
      });
      // Cap manual entries to prevent memory leak
      if (this.manualEntries.length > 50) {
        this.manualEntries = this.manualEntries.slice(0, 50);
      }
    },
    markAllAsRead() {
      const tarkovStore = useTarkovStore();
      const currentData = tarkovStore.getCurrentProgressData();
      const latestApiTimestamp = (currentData?.apiUpdateHistory || []).reduce(
        (latest: number, entry: ApiUpdateMeta) => Math.max(latest, entry.at),
        0
      );
      const latestManualTimestamp = this.manualEntries.reduce(
        (latest, entry) => Math.max(latest, entry.timestamp),
        0
      );
      this.lastReadTimestamp = Math.max(latestApiTimestamp, latestManualTimestamp, Date.now());
    },
    clearLog() {
      this.manualEntries = [];
      this.lastReadTimestamp = Date.now();
    },
    resetForSession() {
      this.manualEntries = [];
      this.lastReadTimestamp = 0;
    },
  },
});
