import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { useTarkovStore } from '@/stores/useTarkov';
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
export const useActivityLogStore = defineStore('activityLog', {
  state: () => ({
    manualEntries: useStorage<ActivityLogEntry[]>('activity_log_manual', []),
    lastReadTimestamp: useStorage<number>('activity_log_last_read', 0),
  }),
  getters: {
    allEntries(): ActivityLogEntry[] {
      const tarkovStore = useTarkovStore();
      const currentData = tarkovStore.getCurrentProgressData();
      // Convert ApiUpdateMeta to ActivityLogEntry format
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
      // Combine and sort
      const combined = [...apiEntries, ...this.manualEntries];
      return combined.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
    },
    unreadCount(): number {
      const all = this.allEntries;
      return all.filter((entry) => entry.timestamp > this.lastReadTimestamp).length;
    },
    hasUnread(): boolean {
      return this.unreadCount > 0;
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
      this.lastReadTimestamp = this.allEntries[0]?.timestamp ?? Date.now();
    },
    clearLog() {
      this.manualEntries = [];
      this.lastReadTimestamp = Date.now();
    },
  },
});
