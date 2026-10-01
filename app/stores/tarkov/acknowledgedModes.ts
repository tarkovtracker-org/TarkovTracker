import { deepEqual } from '@/stores/tarkov/deepEqual';
import { GAME_MODE_VALUES, type GameMode } from '@/utils/constants';
import type { UserProgressData, UserState } from '@/stores/progressState';
export type ModeProgressMap = Partial<Record<GameMode, UserProgressData>>;
export type ProgressSyncSnapshot = Partial<
  Pick<UserState, GameMode | 'currentGameMode' | 'gameEdition' | 'tarkovUid'>
>;
type RemoteProgressUpdate = { remote: ProgressSyncSnapshot; applied: ProgressSyncSnapshot };
/**
 * Per-mode progress the server is known to hold for one account: loaded at startup or
 * acknowledged by a sync. A sync sends only modes that differ, so unchanged modes are never
 * re-uploaded and the payload stays within the server's size cap.
 */
let ownerId: string | null = null;
let acknowledged: ModeProgressMap = {};
let generation = 0;
let ownerEpoch = 0;
let acknowledgedUid: number | null | undefined;
type PendingWrite = {
  expected: ProgressSyncSnapshot | null;
  previousUid: number | null | undefined;
  uidSettled: boolean;
  disturbed: boolean;
};
/** Each queued or dispatched write keeps its own expected-echo scope until it settles. */
const pendingWrites = new Set<PendingWrite>();
const toWire = (progress: UserProgressData): UserProgressData =>
  JSON.parse(JSON.stringify(progress)) as UserProgressData;
export const clearAcknowledgedModes = (): void => {
  generation += 1;
  ownerEpoch += 1;
  ownerId = null;
  acknowledged = {};
  acknowledgedUid = undefined;
  pendingWrites.clear();
};
/** Replacing another owner's baseline invalidates that owner's in-flight acknowledgements. */
const claimOwner = (userId: string): void => {
  if (ownerId === userId) return;
  generation += 1;
  ownerEpoch += 1;
  ownerId = userId;
  acknowledged = {};
  acknowledgedUid = undefined;
};
/** Records modes the server holds for `userId`; another owner's baseline is replaced. */
export const recordAcknowledgedModes = (
  userId: string,
  modes: ModeProgressMap,
  metadata?: Pick<UserState, 'tarkovUid'>
): void => {
  claimOwner(userId);
  if (metadata) acknowledgedUid = metadata.tarkovUid;
  for (const mode of GAME_MODE_VALUES) {
    const progress = modes[mode];
    if (progress) acknowledged[mode] = toWire(progress);
  }
};
/** A dispatched write can still commit after supersession or a same-account session reset. */
export const invalidateAcknowledgedModes = (userId: string, modes: ModeProgressMap): void => {
  if (ownerId !== userId) return;
  acknowledged = Object.fromEntries(
    Object.entries(acknowledged).filter(([mode]) => !Object.hasOwn(modes, mode))
  );
};
const matchesWithinScope = (
  expected: ProgressSyncSnapshot,
  snapshot: ProgressSyncSnapshot
): boolean =>
  Object.entries(snapshot).every(
    ([key, value]) =>
      !Object.hasOwn(expected, key) || deepEqual(expected[key as keyof ProgressSyncSnapshot], value)
  );
const coversScope = (expected: ProgressSyncSnapshot, snapshot: ProgressSyncSnapshot): boolean =>
  Object.keys(snapshot).every((key) => Object.hasOwn(expected, key));
/** The RPC writes metadata with the stored UID before attempting the requested link. */
const withoutInterimUid = (
  write: PendingWrite,
  snapshot: ProgressSyncSnapshot
): ProgressSyncSnapshot => {
  if (write.uidSettled) return snapshot;
  if (write.previousUid === undefined || snapshot.tarkovUid !== write.previousUid) return snapshot;
  return { ...snapshot, tarkovUid: write.expected?.tarkovUid };
};
/** Updates that match a write's values, or touch only keys it does not write, leave it current. */
const isCompatible = (write: PendingWrite, update: RemoteProgressUpdate): boolean =>
  write.expected !== null &&
  matchesWithinScope(write.expected, withoutInterimUid(write, update.remote)) &&
  matchesWithinScope(write.expected, withoutInterimUid(write, update.applied));
/** An exact echo of any pending write carries no foreign state, so it disturbs no queued write. */
const isEcho = (write: PendingWrite, update: RemoteProgressUpdate): boolean =>
  write.expected !== null &&
  coversScope(write.expected, update.remote) &&
  coversScope(write.expected, update.applied) &&
  isCompatible(write, update);
const SYNC_METADATA_KEYS: ReadonlySet<string> = new Set([
  'currentGameMode',
  'gameEdition',
  'tarkovUid',
]);
/** Narrows the interruption scope to account metadata plus the modes a sync actually writes. */
const narrowScope = (
  expected: ProgressSyncSnapshot,
  modes: ModeProgressMap
): ProgressSyncSnapshot =>
  Object.fromEntries(
    Object.entries(expected).filter(
      ([key]) => SYNC_METADATA_KEYS.has(key) || Object.hasOwn(modes, key)
    )
  );
/** Echoes of pending writes and updates outside a write's scope do not supersede it. */
export const noteRemoteProgressApplied = (update?: RemoteProgressUpdate): void => {
  if (update?.remote.tarkovUid !== undefined) acknowledgedUid = update.remote.tarkovUid;
  const writes = [...pendingWrites];
  for (const write of writes) {
    if (update?.remote.tarkovUid === write.expected?.tarkovUid) write.uidSettled = true;
  }
  if (update && writes.some((write) => isEcho(write, update))) return;
  for (const write of writes) {
    if (!update || !isCompatible(write, update)) write.disturbed = true;
  }
};
/**
 * Starts a multi-request sync and supersedes any older one still in flight. `isCurrent` turns false
 * once a newer sync starts, the baseline is cleared or claimed by another account, or Realtime
 * applies newer progress or metadata within this write's scope; the sync then stops so later
 * requests never replay a stale snapshot. `acknowledge` records a batch only while current.
 */
export const beginAcknowledgement = (userId: string, expected?: ProgressSyncSnapshot) => {
  claimOwner(userId);
  generation += 1;
  const write: PendingWrite = {
    expected: expected ? (JSON.parse(JSON.stringify(expected)) as ProgressSyncSnapshot) : null,
    previousUid: acknowledgedUid,
    uidSettled: false,
    disturbed: false,
  };
  pendingWrites.add(write);
  const started = { generation, ownerEpoch };
  const isUndisturbed = (): boolean => ownerEpoch === started.ownerEpoch && !write.disturbed;
  const isCurrent = (): boolean => generation === started.generation && isUndisturbed();
  return {
    isCurrent,
    isOwned: (): boolean => ownerEpoch === started.ownerEpoch,
    acceptUid: (uid: number | null): void => {
      write.uidSettled = true;
      if (write.expected) write.expected.tarkovUid = uid;
      if (ownerEpoch === started.ownerEpoch) acknowledgedUid = uid;
    },
    acknowledge: (modes: ModeProgressMap): void => {
      if (isCurrent()) recordAcknowledgedModes(userId, modes);
    },
    scope: (modes: ModeProgressMap): void => {
      if (write.expected) write.expected = narrowScope(write.expected, modes);
    },
    /**
     * Records a committed atomic write even if a newer local sync started meanwhile; that sync
     * captured pre-write state, so it is superseded instead. Remote or owner changes still refuse.
     */
    commit: (modes: ModeProgressMap): boolean => {
      if (!isUndisturbed()) return false;
      generation += 1;
      recordAcknowledgedModes(userId, modes);
      return true;
    },
    finish: (): void => {
      pendingWrites.delete(write);
    },
  };
};
/** Modes whose progress differs from what the server is known to hold; unknown modes differ. */
export const selectChangedModes = (userId: string, modes: ModeProgressMap): ModeProgressMap => {
  const known = ownerId === userId ? acknowledged : {};
  const differs = (mode: GameMode): boolean => {
    const progress = modes[mode];
    return progress !== undefined && !deepEqual(known[mode], toWire(progress));
  };
  return Object.fromEntries(GAME_MODE_VALUES.filter(differs).map((mode) => [mode, modes[mode]]));
};
