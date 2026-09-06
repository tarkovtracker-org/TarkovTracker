import { describe, expect, it } from 'vitest';
import { preservePendingPaths, snapshotSyncState } from '@/utils/pendingState';
describe('pending state reconciliation', () => {
  it('snapshots persisted fields without retaining references or transient cycles', () => {
    const transient: Record<string, unknown> = {};
    transient.self = transient;
    const state = { progress: { count: 2 }, empty: undefined, transient };
    const snapshot = snapshotSyncState(state);
    state.progress.count = 9;
    expect(snapshot).toEqual({ progress: { count: 2 }, empty: undefined });
    expect(snapshotSyncState(null)).toEqual({});
  });
  it('preserves local deletion and array replacement while accepting other remote keys', () => {
    const base = { removed: { count: 5 }, list: ['a'], unchanged: 'old' };
    const local = { list: [], unchanged: 'old' };
    const remote = { removed: { count: 5 }, list: ['a', 'b'], unchanged: 'new', added: 3 };
    expect(preservePendingPaths(base, local, remote)).toEqual({
      list: [],
      unchanged: 'new',
      added: 3,
    });
    expect(remote.removed).toEqual({ count: 5 });
  });
});
