import { describe, expect, it } from 'vitest';
import {
  createPendingStateTracker,
  preservePendingPaths,
  snapshotSyncState,
} from '@/utils/pendingState';
describe('pending state reconciliation', () => {
  it('does not classify accepted remote events as local edits during another read', () => {
    const state = { mode: { count: 1, pending: 'old' } };
    const tracker = createPendingStateTracker(() => state);
    state.mode.pending = 'local';
    const snapshot = tracker.capture();
    Object.assign(state, tracker.capture()({ mode: { count: 2, pending: 'old' } }));
    expect(snapshot({ mode: { count: 3, pending: 'old' } })).toEqual({
      mode: { count: 3, pending: 'local' },
    });
  });
  it('handles remote values returning to an earlier value after a save', () => {
    const state = { count: 0 };
    const tracker = createPendingStateTracker(() => state);
    state.count = 1;
    tracker.captureAcknowledgement({ ...state })();
    const snapshot = tracker.capture();
    Object.assign(state, tracker.capture()({ count: 0 }));
    expect(snapshot({ count: 2 })).toEqual({ count: 2 });
  });
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
