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
  it('does not acknowledge pending fields retained by a domain merge', () => {
    const state = { mode: { count: 5, name: 'old' } };
    const tracker = createPendingStateTracker(() => state);
    const read = tracker.capture();
    state.mode.count = 0;
    Object.assign(
      state,
      read({ mode: { count: 3, name: 'remote' } }, { mode: { count: 0, name: 'remote' } })
    );
    Object.assign(state, tracker.capture()({ mode: { count: 4, name: 'newer' } }));
    expect(state.mode).toEqual({ count: 0, name: 'newer' });
    tracker.captureAcknowledgement(snapshotSyncState(state))();
    expect(tracker.capture()({ mode: { count: 6, name: 'latest' } })).toEqual({
      mode: { count: 6, name: 'latest' },
    });
  });
  it('accepts domain fallbacks that are not pending local edits', () => {
    const state = { mode: { count: 5, name: 'old' } };
    const tracker = createPendingStateTracker(() => state);
    Object.assign(
      state,
      tracker.capture()(
        { mode: { count: 3, name: 'remote' } },
        { mode: { count: 5, name: 'remote' } }
      )
    );
    expect(tracker.capture()({ mode: { count: 6, name: 'newer' } })).toEqual({
      mode: { count: 6, name: 'newer' },
    });
  });
  it('does not let an old write acknowledge over an authoritative remote reset', () => {
    const state = { mode: { progressEpoch: 0, count: 5 }, other: 'old' };
    const tracker = createPendingStateTracker(() => state);
    state.mode.count = 6;
    state.other = 'saved';
    const acknowledge = tracker.captureAcknowledgement(snapshotSyncState(state));
    const reset = { mode: { progressEpoch: 1, count: 0 } };
    Object.assign(state, tracker.capture()(reset, reset, false));
    acknowledge();
    expect(tracker.capture()({ mode: { progressEpoch: 1, count: 2 }, other: 'newer' })).toEqual({
      mode: { progressEpoch: 1, count: 2 },
      other: 'newer',
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
