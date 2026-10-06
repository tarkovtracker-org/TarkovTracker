import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useActivityLogStore } from '@/stores/useActivityLogStore';
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '@/utils/storageKeys';
import { serializeUserScopedStorage } from '@/utils/userScopedStorage';
import type { ManualActivityEntry, UserProgressData } from '@/types/progress';
const { currentUserId, tarkovState } = vi.hoisted(() => ({
  currentUserId: {
    value: null as string | null,
  },
  tarkovState: {
    currentGameMode: 'pvp' as 'pvp' | 'pve',
    apiUpdateHistory: [] as Array<{ id: string; at: number }>,
    manualActivityHistory: [] as ManualActivityEntry[],
  },
}));
vi.mock('@/stores/useTarkov', async () => {
  const { sanitizeManualActivityHistory } = await vi.importActual<
    typeof import('@/utils/progressSanitizers')
  >('@/utils/progressSanitizers');
  return {
    useTarkovStore: () => ({
      getCurrentGameMode: () => tarkovState.currentGameMode,
      getCurrentProgressData: () =>
        ({
          apiUpdateHistory: tarkovState.apiUpdateHistory,
          manualActivityHistory: tarkovState.manualActivityHistory,
        }) as unknown as UserProgressData,
      getManualActivityHistory: () => tarkovState.manualActivityHistory,
      addManualActivityEntries: (entries: ManualActivityEntry[]) => {
        tarkovState.manualActivityHistory = sanitizeManualActivityHistory([
          ...entries,
          ...tarkovState.manualActivityHistory,
        ]);
      },
      clearManualActivityHistory: () => {
        tarkovState.manualActivityHistory = [];
      },
    }),
  };
});
vi.mock('@/utils/userScopedStorage', async () => {
  const actual = await vi.importActual<typeof import('@/utils/userScopedStorage')>(
    '@/utils/userScopedStorage'
  );
  return {
    ...actual,
    getCurrentSupabaseUserId: () => currentUserId.value,
  };
});
const legacyEntry = (overrides: Partial<ManualActivityEntry> = {}): ManualActivityEntry => ({
  id: 'legacy-1',
  timestamp: 1000,
  type: 'task',
  action: 'complete',
  title: 'Legacy entry',
  ...overrides,
});
describe('useActivityLogStore', () => {
  beforeEach(() => {
    localStorage.clear();
    tarkovState.currentGameMode = 'pvp';
    tarkovState.apiUpdateHistory = [];
    tarkovState.manualActivityHistory = [];
    currentUserId.value = null;
    setActivePinia(createPinia());
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });
  it('shows only API history even when newer manual entries were synced', () => {
    tarkovState.apiUpdateHistory.push({ id: 'api-old', at: 1000 }, { id: 'api-new', at: 5000 });
    tarkovState.manualActivityHistory = [legacyEntry({ timestamp: 9000 })];
    const store = useActivityLogStore();
    expect(store.allEntries.map((entry) => entry.id)).toEqual(['api-new', 'api-old']);
    expect(store.allEntries.every((entry) => entry.source === 'api')).toBe(true);
  });
  it('does not count manual history as unread activity', () => {
    tarkovState.manualActivityHistory = [legacyEntry({ timestamp: 9000 })];
    const store = useActivityLogStore();
    expect(store.allEntries).toEqual([]);
    expect(store.hasUnread).toBe(false);
    expect(store.unreadCount).toBe(0);
  });
  it('ignores manual timestamps when marking API history read', () => {
    vi.spyOn(Date, 'now').mockReturnValue(2000);
    tarkovState.apiUpdateHistory.push({ id: 'api-1', at: 3000 });
    tarkovState.manualActivityHistory = [legacyEntry({ timestamp: 9000 })];
    const store = useActivityLogStore();
    store.markAllAsRead();
    expect(store.lastReadTimestamp).toBe(3000);
  });
  it('tracks unread API history without requiring the sorted entry list', () => {
    tarkovState.apiUpdateHistory.push({ id: 'api-old', at: 1000 }, { id: 'api-new', at: 5000 });
    tarkovState.manualActivityHistory = [legacyEntry({ timestamp: 9000 })];
    const store = useActivityLogStore();
    store.lastReadByMode.pvp = 2000;
    expect(store.hasUnread).toBe(true);
    expect(store.unreadCount).toBe(1);
    store.markAllAsRead();
    expect(store.hasUnread).toBe(false);
    expect(store.unreadCount).toBe(0);
  });
  it('clears the manual log and marks everything read', () => {
    const store = useActivityLogStore();
    tarkovState.manualActivityHistory = [legacyEntry()];
    store.clearLog();
    expect(tarkovState.manualActivityHistory).toHaveLength(0);
    expect(store.hasUnread).toBe(false);
  });
  it('keeps synced manual entries on session reset and only clears the read marker', () => {
    const store = useActivityLogStore();
    tarkovState.manualActivityHistory = [legacyEntry()];
    store.markAllAsRead();
    store.resetForSession();
    // The progress store owns the entries now; a session transition resets that
    // store, not a second storage adapter. This is the clobbering fix.
    expect(tarkovState.manualActivityHistory).toHaveLength(1);
    expect(store.lastReadTimestamp).toBe(0);
  });
  it('loads the user-scoped read timestamp', () => {
    currentUserId.value = 'user-1';
    localStorage.setItem(
      STORAGE_KEYS.activityLogLastRead,
      serializeUserScopedStorage({ pvp: 1500 }, 'user-1', 2000)
    );
    const store = useActivityLogStore();
    expect(store.lastReadTimestamp).toBe(1500);
  });
  it('marks only the selected mode read', () => {
    const store = useActivityLogStore();
    store.markAllAsRead();
    expect(store.lastReadByMode.pvp).toBeGreaterThan(0);
    expect(store.lastReadByMode.pve).toBeUndefined();
    tarkovState.currentGameMode = 'pve';
    store.markAllAsRead();
    expect(store.lastReadByMode.pve).toBeGreaterThan(0);
  });
  it('ignores a read timestamp owned by another user', () => {
    currentUserId.value = 'user-2';
    localStorage.setItem(
      STORAGE_KEYS.activityLogLastRead,
      serializeUserScopedStorage({ pvp: 1500 }, 'user-1', 2000)
    );
    const store = useActivityLogStore();
    expect(store.lastReadTimestamp).toBe(0);
  });
  describe('legacy manual entry migration', () => {
    it('adopts unscoped legacy entries and removes the legacy keys', () => {
      localStorage.setItem(
        STORAGE_KEYS.activityLogManual,
        JSON.stringify([legacyEntry({ id: 'legacy-new', timestamp: 4000 })])
      );
      localStorage.setItem(
        LEGACY_STORAGE_KEYS.activityLogManual,
        JSON.stringify([legacyEntry({ id: 'legacy-old', timestamp: 2000 })])
      );
      const store = useActivityLogStore();
      expect(store.migrateLegacyManualEntries()).toBe(true);
      expect(tarkovState.manualActivityHistory.map((entry) => entry.id)).toEqual([
        'legacy-new',
        'legacy-old',
      ]);
      expect(localStorage.getItem(STORAGE_KEYS.activityLogManual)).toBeNull();
      expect(localStorage.getItem(LEGACY_STORAGE_KEYS.activityLogManual)).toBeNull();
    });
    it('adopts guest-owned envelopes after authentication', () => {
      currentUserId.value = 'user-1';
      localStorage.setItem(
        STORAGE_KEYS.activityLogManual,
        serializeUserScopedStorage([legacyEntry()], null, 2000)
      );
      expect(useActivityLogStore().migrateLegacyManualEntries()).toBe(true);
      expect(tarkovState.manualActivityHistory).toEqual([legacyEntry()]);
    });
    it('adopts entries scoped to the current user', () => {
      currentUserId.value = 'user-1';
      localStorage.setItem(
        STORAGE_KEYS.activityLogManual,
        serializeUserScopedStorage([legacyEntry({ id: 'scoped' })], 'user-1', 2000)
      );
      const store = useActivityLogStore();
      expect(store.migrateLegacyManualEntries()).toBe(true);
      expect(tarkovState.manualActivityHistory.map((entry) => entry.id)).toEqual(['scoped']);
      expect(localStorage.getItem(STORAGE_KEYS.activityLogManual)).toBeNull();
    });
    it('leaves another user\u2019s entries in place instead of discarding them', () => {
      currentUserId.value = null;
      const stored = serializeUserScopedStorage([legacyEntry({ id: 'other' })], 'user-1', 2000);
      localStorage.setItem(STORAGE_KEYS.activityLogManual, stored);
      const store = useActivityLogStore();
      expect(store.migrateLegacyManualEntries()).toBe(false);
      expect(tarkovState.manualActivityHistory).toEqual([]);
      expect(localStorage.getItem(STORAGE_KEYS.activityLogManual)).toBe(stored);
      // The owning session claims them on its next initialization.
      currentUserId.value = 'user-1';
      expect(store.migrateLegacyManualEntries()).toBe(true);
      expect(tarkovState.manualActivityHistory.map((entry) => entry.id)).toEqual(['other']);
      expect(localStorage.getItem(STORAGE_KEYS.activityLogManual)).toBeNull();
    });
    it('drops malformed legacy entries and still clears the key', () => {
      localStorage.setItem(
        STORAGE_KEYS.activityLogManual,
        JSON.stringify([{ id: 'broken' }, 'nonsense', null])
      );
      const store = useActivityLogStore();
      expect(store.migrateLegacyManualEntries()).toBe(false);
      expect(tarkovState.manualActivityHistory).toEqual([]);
      expect(localStorage.getItem(STORAGE_KEYS.activityLogManual)).toBeNull();
    });
    it('is a no-op when no legacy payload exists', () => {
      const store = useActivityLogStore();
      expect(store.migrateLegacyManualEntries()).toBe(false);
      expect(tarkovState.manualActivityHistory).toEqual([]);
    });
  });
});
