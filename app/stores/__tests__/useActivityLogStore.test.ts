import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useActivityLogStore } from '@/stores/useActivityLogStore';
const apiUpdateHistory: Array<{ id: string; at: number }> = [];
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getCurrentProgressData: () => ({ apiUpdateHistory }),
  }),
}));
describe('useActivityLogStore', () => {
  beforeEach(() => {
    localStorage.clear();
    apiUpdateHistory.length = 0;
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
});
