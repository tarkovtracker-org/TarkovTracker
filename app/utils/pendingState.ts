import { deepEqual } from '@/stores/tarkov/deepEqual';
type Snapshot = Record<string, unknown>;
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
export const createPendingStateTracker = (getState: () => unknown) => {
  let baseline = snapshotSyncState(getState());
  return {
    acknowledge: (state: Snapshot) => {
      baseline = state;
    },
    capture: (): RemoteStateMerge => {
      const beforeRead = baseline;
      return (remote, merged = remote, preserveChanges = true) => {
        const current = snapshotSyncState(getState());
        const result = { ...merged };
        const acknowledged = { ...baseline };
        for (const key of Object.keys(remote)) {
          result[key] = preserveChanges
            ? preservePendingPaths(beforeRead[key], current[key], merged[key])
            : merged[key];
          // A domain merge may intentionally keep a fallback instead of the
          // raw remote value. Only advance clean paths to what was accepted;
          // locally changed paths retain their prior baseline until saved.
          acknowledged[key] = preserveChanges
            ? preservePendingPaths(current[key], beforeRead[key], merged[key])
            : merged[key];
        }
        baseline = snapshotSyncState(acknowledged);
        return result;
      };
    },
  };
};
