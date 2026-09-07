import { deepEqual } from '@/stores/tarkov/deepEqual';
type Snapshot = Record<string, unknown>;
type RemoteAdvance = { before: Snapshot; after: Snapshot; next?: RemoteAdvance };
export type RemoteStateMerge = (
  remote: Snapshot,
  merged?: Snapshot,
  preserveChanges?: boolean
) => Snapshot;
const isRecord = (value: unknown): value is Snapshot =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
// Snapshot JSON-backed fields independently so transient UI references cannot
// prevent reconciliation of the persisted fields next to them.
// fallow-ignore-next-line complexity -- JSON/undefined/cyclic fields are covered directly in pendingState.test.ts; estimated coverage reports none
export const snapshotSyncState = (state: unknown): Snapshot => {
  const result: Snapshot = {};
  if (!isRecord(state)) return result;
  for (const [key, value] of Object.entries(state)) {
    try {
      const json = JSON.stringify(value);
      result[key] = json === undefined ? undefined : JSON.parse(json);
    } catch {
      // Non-serializable UI state is not part of the persistence contract.
    }
  }
  return result;
};
// Three-way merge: retain only paths changed locally since the acknowledged
// baseline. Remote changes to other paths still apply, including other modes.
// fallow-ignore-next-line complexity -- deletion/array/remote-field merges are covered in pendingState.test.ts and live/snapshot integration tests
export const preservePendingPaths = (base: unknown, local: unknown, remote: unknown): unknown => {
  if (deepEqual(base, local)) return remote;
  if (!isRecord(base) || !isRecord(local)) return local;
  const result: Snapshot = isRecord(remote) ? { ...remote } : {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(local)])) {
    if (!Object.hasOwn(local, key)) Reflect.deleteProperty(result, key);
    else result[key] = preservePendingPaths(base[key], local[key], result[key]);
  }
  return result;
};
const advanceReadBaseline = (cursor: { next?: RemoteAdvance }, baseline: Snapshot) => {
  while (cursor.next) {
    const advance = cursor.next;
    baseline = preservePendingPaths(advance.before, advance.after, baseline) as Snapshot;
    cursor = advance;
  }
  return { cursor, baseline };
};
export const createPendingStateTracker = (getState: () => unknown) => {
  let baseline = snapshotSyncState(getState());
  // Only in-flight captures retain earlier links. The tracker holds the tail,
  // so completed reads do not leave an ever-growing event history.
  let remoteCursor: { next?: RemoteAdvance } = {};
  return {
    captureAcknowledgement: (state: Snapshot): (() => void) => {
      const beforeWrite = baseline;
      return () => {
        // A save acknowledges its changed paths, not unrelated remote values
        // accepted while that save was queued or in flight.
        baseline = snapshotSyncState(preservePendingPaths(beforeWrite, state, baseline));
      };
    },
    capture: (): RemoteStateMerge => {
      let beforeRead = baseline;
      let cursor = remoteCursor;
      return (remote, merged = remote, preserveChanges = true) => {
        const advanced = advanceReadBaseline(cursor, beforeRead);
        beforeRead = advanced.baseline;
        cursor = advanced.cursor;
        const current = snapshotSyncState(getState());
        const result = { ...merged };
        const acknowledged = { ...baseline };
        for (const key of Object.keys(remote)) {
          result[key] = preserveChanges
            ? preservePendingPaths(beforeRead[key], current[key], merged[key])
            : merged[key];
          // A domain merge may intentionally keep a fallback instead of the
          // raw remote value. Preserve acknowledgements that advanced since
          // this read started, rather than restoring its pre-save baseline.
          acknowledged[key] = preserveChanges
            ? preservePendingPaths(beforeRead[key], baseline[key], merged[key])
            : merged[key];
        }
        const advance: RemoteAdvance = { before: baseline, after: snapshotSyncState(acknowledged) };
        remoteCursor.next = advance;
        remoteCursor = advance;
        baseline = advance.after;
        return result;
      };
    },
  };
};
