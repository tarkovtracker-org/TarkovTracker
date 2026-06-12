import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useActivityLogStore } from '@/stores/useActivityLogStore';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { serializeUserScopedStorage } from '@/utils/userScopedStorage';
import type { ActivityLogEntry } from '@/stores/useActivityLogStore';
const apiUpdateHistory: Array<{ id: string; at: number }> = [];
const { currentUserId } = vi.hoisted(() => ({
  currentUserId: {
    value: null as string | null,
  },
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getCurrentProgressData: () => ({ apiUpdateHistory }),
  }),
}));
vi.mock('@/utils/userScopedStorage', async () => {
  const actual = await vi.importActual<typeof import('@/utils/userScopedStorage')>(
    '@/utils/userScopedStorage'
  );
  return {
    ...actual,
    getCurrentSupabaseUserId: () => currentUserId.value,
  };
});
describe('useActivityLogStore', () => {
  beforeEach(() => {
    localStorage.clear();
    apiUpdateHistory.length = 0;
    currentUserId.value = null;
    setActivePinia(createPinia());
  });
  afterEach(() => {
    localStorage.clear();
  });
  it('adds manual entries with source and timestamp, newest first', () => {
    const store = useActivityLogStore();
    store.addManualEntry({ id: 'm1', type: 'task', action: 'complete', title: 'First' });
    store.addManualEntry({ id: 'm2', type: 'task', action: 'fail', title: 'Second' });
    expect(store.manualEntries).toHaveLength(2);
    expect(store.manualEntries[0]?.id).toBe('m2');
    expect(store.manualEntries[0]?.source).toBe('manual');
    expect(store.manualEntries[0]?.timestamp).toBeTypeOf('number');
  });
  it('caps manual entries at 50', () => {
    const store = useActivityLogStore();
    for (let i = 0; i < 60; i += 1) {
      store.addManualEntry({ id: `m${i}`, type: 'task', action: 'complete', title: `Task ${i}` });
    }
    expect(store.manualEntries).toHaveLength(50);
  });
  it('merges API history with manual entries and sorts by timestamp desc', () => {
    apiUpdateHistory.push({ id: 'api-1', at: 5000 });
    const store = useActivityLogStore();
    store.manualEntries = [
      {
        id: 'm-old',
        type: 'task',
        action: 'complete',
        title: 'Old',
        source: 'manual',
        timestamp: 1000,
      },
      {
        id: 'm-new',
        type: 'task',
        action: 'fail',
        title: 'New',
        source: 'manual',
        timestamp: 9000,
      },
    ];
    const entries = store.allEntries;
    expect(entries.map((entry) => entry.id)).toEqual(['m-new', 'api-1', 'm-old']);
    expect(entries.find((entry) => entry.id === 'api-1')?.source).toBe('api');
  });
  it('tracks unread state relative to lastReadTimestamp', () => {
    const store = useActivityLogStore();
    store.addManualEntry({ id: 'm1', type: 'task', action: 'complete', title: 'Unread' });
    expect(store.hasUnread).toBe(true);
    expect(store.unreadCount).toBe(1);
    store.markAllAsRead();
    expect(store.hasUnread).toBe(false);
    expect(store.unreadCount).toBe(0);
  });
  it('tracks unread API history without requiring the sorted entry list', () => {
    apiUpdateHistory.push({ id: 'api-old', at: 1000 }, { id: 'api-new', at: 5000 });
    const store = useActivityLogStore();
    store.lastReadTimestamp = 2000;
    expect(store.hasUnread).toBe(true);
    expect(store.unreadCount).toBe(1);
    store.markAllAsRead();
    expect(store.hasUnread).toBe(false);
    expect(store.unreadCount).toBe(0);
  });
  it('clears the manual log and marks everything read', () => {
    const store = useActivityLogStore();
    store.addManualEntry({ id: 'm1', type: 'task', action: 'complete', title: 'Entry' });
    store.clearLog();
    expect(store.manualEntries).toHaveLength(0);
    expect(store.hasUnread).toBe(false);
  });
  it('wipes manual entries and read state on session reset', () => {
    const store = useActivityLogStore();
    store.addManualEntry({ id: 'm1', type: 'task', action: 'complete', title: 'Entry' });
    store.markAllAsRead();
    store.resetForSession();
    expect(store.manualEntries).toHaveLength(0);
    expect(store.lastReadTimestamp).toBe(0);
  });
  it('loads matching user-scoped manual entries and read timestamp', () => {
    currentUserId.value = 'user-1';
    localStorage.setItem(
      STORAGE_KEYS.activityLogManual,
      serializeUserScopedStorage(
        [
          {
            id: 'm1',
            type: 'task',
            action: 'complete',
            title: 'Scoped',
            source: 'manual',
            timestamp: 1000,
          },
        ],
        'user-1',
        2000
      )
    );
    localStorage.setItem(
      STORAGE_KEYS.activityLogLastRead,
      serializeUserScopedStorage(1500, 'user-1', 2000)
    );
    const store = useActivityLogStore();
    expect(store.manualEntries.map((entry) => entry.id)).toEqual(['m1']);
    expect(store.lastReadTimestamp).toBe(1500);
  });
  it('ignores activity log storage owned by another user', () => {
    currentUserId.value = 'user-2';
    localStorage.setItem(
      STORAGE_KEYS.activityLogManual,
      serializeUserScopedStorage(
        [
          {
            id: 'm1',
            type: 'task',
            action: 'complete',
            title: 'Other user',
            source: 'manual',
            timestamp: 1000,
          },
        ],
        'user-1',
        2000
      )
    );
    localStorage.setItem(
      STORAGE_KEYS.activityLogLastRead,
      serializeUserScopedStorage(1500, 'user-1', 2000)
    );
    const store = useActivityLogStore();
    expect(store.manualEntries).toEqual([]);
    expect(store.lastReadTimestamp).toBe(0);
  });
  it('migrates legacy raw activity log storage on write', async () => {
    currentUserId.value = 'user-1';
    localStorage.setItem(
      STORAGE_KEYS.activityLogManual,
      JSON.stringify([
        {
          id: 'legacy',
          type: 'task',
          action: 'complete',
          title: 'Legacy',
          source: 'manual',
          timestamp: 1000,
        },
      ])
    );
    localStorage.setItem(STORAGE_KEYS.activityLogLastRead, JSON.stringify(1000));
    const store = useActivityLogStore();
    expect(store.manualEntries.map((entry) => entry.id)).toEqual(['legacy']);
    expect(store.lastReadTimestamp).toBe(1000);
    store.addManualEntry({ id: 'new', type: 'task', action: 'fail', title: 'New' });
    store.markAllAsRead();
    await nextTick();
    const persistedEntries = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.activityLogManual) || '{}'
    ) as {
      _userId?: string;
      data?: ActivityLogEntry[];
    };
    const persistedTimestamp = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.activityLogLastRead) || '{}'
    ) as {
      _userId?: string;
      data?: number;
    };
    expect(persistedEntries._userId).toBe('user-1');
    expect(persistedEntries.data?.map((entry) => entry.id)).toEqual(['new', 'legacy']);
    expect(persistedTimestamp._userId).toBe('user-1');
    expect(persistedTimestamp.data).toBeTypeOf('number');
  });
});
