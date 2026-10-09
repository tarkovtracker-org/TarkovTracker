import type { UserState } from '@/stores/progressState';
import type { UserProgressData, ManualActivityAction, ManualActivityType } from '@/types/progress';
import type { GameMode } from '@/utils/constants';
import type { ApiTaskUpdateState } from '@tarkovtracker/progress-contracts/apiTaskUpdates';
// Inactive transaction substrate. No application caller uses this database yet.
const modes: readonly GameMode[] = ['pvp', 'pve', 'seasonal'];
const storeName = 'records';
const sessionKey = 'session';
type Owner = string | null;
type Epochs = Record<GameMode, number>;
export type ProgressOwnerToken = { owner: Owner; generation: number };
export type ProgressRepositorySnapshot = {
  version: 1;
  owner: Owner;
  revision: number;
  epochs: Epochs;
  deleted: boolean;
  state: UserState | null;
  /** Exact first-import bytes; kept independently of subsequent authoritative edits. */
  legacyRaw: string | null;
};
export type ProgressRepositoryCommit = {
  token: ProgressOwnerToken;
  expectedRevision: number;
  state: UserState;
} & (
  | { kind: 'edit' }
  | { kind: 'import'; legacyRaw: string }
  | { kind: 'reset'; resetModes: readonly GameMode[] }
);
export class ProgressRepositoryConflict extends Error {
  constructor(public readonly reason: 'session' | 'revision' | 'epoch' | 'deleted' | 'import') {
    super(`Progress transaction rejected: ${reason}`);
    this.name = 'ProgressRepositoryConflict';
  }
}
type RecordKind = 'session' | 'owner';
export class ProgressRepositoryDataError extends Error {
  constructor(
    public readonly recordKind: RecordKind,
    public readonly reason: 'shape' | 'version' | 'owner' | 'epoch'
  ) {
    super(`Progress ${recordKind} record rejected: ${reason}`);
    this.name = 'ProgressRepositoryDataError';
  }
}
type RecordEntry = { exists: false } | { exists: true; value: unknown };
const requireShape = (valid: boolean, kind: RecordKind): void => {
  if (!valid) throw new ProgressRepositoryDataError(kind, 'shape');
};
const isPlainRecord = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const requireRecord = (value: unknown, kind: RecordKind): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new ProgressRepositoryDataError(kind, 'shape');
  requireShape(isPlainRecord(value), kind);
  return value as Record<string, unknown>;
};
const requireVersion = (value: Record<string, unknown>, kind: RecordKind): void => {
  if (value.version !== 1) throw new ProgressRepositoryDataError(kind, 'version');
};
const requireOwner = (value: unknown, kind: RecordKind): void => {
  if (value === null) return;
  requireShape(typeof value === 'string' && value.length > 0, kind);
};
const isOwnerArgument = (value: unknown): value is Owner =>
  value === null || (typeof value === 'string' && value.length > 0);
const requireCounter = (value: unknown, kind: RecordKind): void => {
  requireShape(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0, kind);
};
const requireNullableText = (value: unknown, kind: RecordKind): void =>
  requireShape(value === null || typeof value === 'string', kind);
const decodeSession = (entry: RecordEntry): ProgressOwnerToken | undefined => {
  if (!entry.exists) return undefined;
  const value = requireRecord(entry.value, 'session');
  requireVersion(value, 'session');
  requireOwner(value.owner, 'session');
  requireCounter(value.generation, 'session');
  return { owner: value.owner as Owner, generation: value.generation as number };
};
const nextOwnerToken = (
  previous: ProgressOwnerToken | undefined,
  owner: Owner,
  renew: boolean
): ProgressOwnerToken => {
  if (!previous) return { owner, generation: 1 };
  return { owner, generation: previous.generation + Number(previous.owner !== owner || renew) };
};
const decodeEpochs = (value: unknown): Epochs => {
  const record = requireRecord(value, 'owner');
  modes.forEach((mode) => requireCounter(record[mode], 'owner'));
  return record as Epochs;
};
type ValidationWork = () => void;
type ValueCheck = (value: unknown, work?: ValidationWork) => void;
const finite: ValueCheck = (value) =>
  requireShape(typeof value === 'number' && Number.isFinite(value), 'owner');
const text: ValueCheck = (value) => requireShape(typeof value === 'string', 'owner');
const boolean: ValueCheck = (value) => requireShape(typeof value === 'boolean', 'owner');
const counter: ValueCheck = (value) => requireCounter(value, 'owner');
const optional =
  (check: ValueCheck): ValueCheck =>
  (value, work) => {
    if (value !== undefined) check(value, work);
  };
const fields = (
  value: unknown,
  checks: Record<string, ValueCheck>,
  work?: ValidationWork
): void => {
  const record = requireRecord(value, 'owner');
  Object.entries(checks).forEach(([key, check]) => {
    work?.();
    check(record[key], work);
  });
};
const map =
  (check: ValueCheck): ValueCheck =>
  (value, work) => {
    Object.values(requireRecord(value, 'owner')).forEach((entry) => {
      work?.();
      check(entry, work);
    });
  };
const list =
  (check: ValueCheck): ValueCheck =>
  (value, work) => {
    requireShape(Array.isArray(value), 'owner');
    for (const entry of value as unknown[]) {
      work?.();
      check(entry, work);
    }
  };
const choice =
  (choices: Record<string, true>): ValueCheck =>
  (value) => {
    text(value);
    requireShape(Object.hasOwn(choices, value as string), 'owner');
  };
const completion: ValueCheck = (value, work) =>
  fields(value, { complete: optional(boolean), timestamp: optional(finite) }, work);
const objective: ValueCheck = (value, work) =>
  fields(
    value,
    {
      complete: optional(boolean),
      timestamp: optional(finite),
      count: optional(finite),
    },
    work
  );
const task: ValueCheck = (value, work) =>
  fields(
    value,
    {
      complete: optional(boolean),
      failed: optional(boolean),
      timestamp: optional(finite),
      manual: optional(boolean),
    },
    work
  );
const chapter: ValueCheck = (value, work) => {
  completion(value, work);
  fields(value, { objectives: optional(map(completion)) }, work);
};
const apiStates = {
  active: true,
  completed: true,
  failed: true,
  uncompleted: true,
} satisfies Record<ApiTaskUpdateState, true>;
const activityTypes = { task: true, hideout: true, item: true, system: true } satisfies Record<
  ManualActivityType,
  true
>;
const activityActions = {
  complete: true,
  uncomplete: true,
  fail: true,
  reset_failed: true,
  upgrade: true,
  needed: true,
  sync: true,
  available: true,
} satisfies Record<ManualActivityAction, true>;
const apiTask: ValueCheck = (value, work) =>
  fields(value, { id: text, state: choice(apiStates) }, work);
const apiUpdate: ValueCheck = (value, work) =>
  fields(
    value,
    {
      id: text,
      at: finite,
      source: choice({ api: true }),
      tasks: optional(list(apiTask)),
      taskCount: optional(counter),
    },
    work
  );
const manualActivity: ValueCheck = (value, work) =>
  fields(
    value,
    {
      id: text,
      timestamp: finite,
      type: choice(activityTypes),
      action: choice(activityActions),
      title: text,
      details: optional(text),
    },
    work
  );
// Compile-time completeness: additions to the known persisted contract require an explicit check.
// Missing optional fields and opaque extensions are retained; no sanitizer/defaulting runs here.
const modeChecks = {
  level: finite,
  pmcFaction: choice({ USEC: true, BEAR: true }),
  displayName: (value: unknown) => requireNullableText(value, 'owner'),
  xpOffset: finite,
  taskObjectives: map(objective),
  taskCompletions: map(task),
  taskAvailability: optional(
    map((value, work) => fields(value, { requirements: text, timestamp: finite }, work))
  ),
  hideoutParts: map(objective),
  hideoutModules: map(completion),
  traders: map((value, work) => fields(value, { level: finite, reputation: finite }, work)),
  skills: map(finite),
  prestigeLevel: finite,
  progressEpoch: optional(counter),
  skillOffsets: map(finite),
  storyChapters: map(chapter),
  lastApiUpdate: optional(apiUpdate),
  apiUpdateHistory: optional(list(apiUpdate)),
  manualActivityHistory: optional(list(manualActivity)),
  manualActivityEpoch: optional(counter),
} satisfies Record<keyof Required<UserProgressData>, ValueCheck>;
const validateModeState = (value: unknown, expectedEpoch: number, work?: ValidationWork): void => {
  const mode = requireRecord(value, 'owner');
  fields(mode, modeChecks, work);
  const epoch = mode.progressEpoch === undefined ? 0 : mode.progressEpoch;
  requireCounter(epoch, 'owner');
  if (epoch !== expectedEpoch) throw new ProgressRepositoryDataError('owner', 'epoch');
};
const validateStateMetadata = (state: Record<string, unknown>): void => {
  requireShape(modes.includes(state.currentGameMode as GameMode), 'owner');
  requireCounter(state.gameEdition, 'owner');
  if (state.tarkovUid !== null) requireCounter(state.tarkovUid, 'owner');
  if (state.seasonalSeasonNumber === undefined) return;
  requireCounter(state.seasonalSeasonNumber, 'owner');
  requireShape((state.seasonalSeasonNumber as number) > 0, 'owner');
};
const validateEmptySnapshot = (snapshot: ProgressRepositorySnapshot): void => {
  requireShape(snapshot.state === null && snapshot.legacyRaw === null, 'owner');
  if (snapshot.deleted) {
    requireShape(snapshot.revision > 0, 'owner');
    return;
  }
  requireShape(
    snapshot.revision === 0 && modes.every((mode) => snapshot.epochs[mode] === 0),
    'owner'
  );
};
const validateSnapshotState = (
  snapshot: ProgressRepositorySnapshot,
  work?: ValidationWork
): void => {
  if (snapshot.deleted || snapshot.state === null) {
    validateEmptySnapshot(snapshot);
    return;
  }
  const state = requireRecord(snapshot.state, 'owner');
  requireShape(snapshot.revision > 0, 'owner');
  validateStateMetadata(state);
  modes.forEach((mode) => validateModeState(state[mode], snapshot.epochs[mode], work));
};
/** Decode without sanitation or migration. A rejected original remains untouched in its own key. */
const decodeSnapshot = (
  entry: RecordEntry,
  owner: Owner,
  work?: ValidationWork
): ProgressRepositorySnapshot => {
  if (!entry.exists) return emptySnapshot(owner);
  const value = requireRecord(entry.value, 'owner');
  requireVersion(value, 'owner');
  requireOwner(value.owner, 'owner');
  if (value.owner !== owner) throw new ProgressRepositoryDataError('owner', 'owner');
  requireCounter(value.revision, 'owner');
  decodeEpochs(value.epochs);
  requireShape(typeof value.deleted === 'boolean', 'owner');
  requireNullableText(value.legacyRaw, 'owner');
  const snapshot = value as ProgressRepositorySnapshot;
  validateSnapshotState(snapshot, work);
  return snapshot;
};
/** Validation for portable recovery records; never treats supplied data as an absent IDB key. */
export const validateProgressRepositorySnapshot = (
  value: unknown,
  owner: string | null,
  work?: ValidationWork
): ProgressRepositorySnapshot => decodeSnapshot({ exists: true, value }, owner, work);
const ownerKey = (owner: Owner): string => `owner:${JSON.stringify(owner)}`;
const emptySnapshot = (owner: Owner): ProgressRepositorySnapshot => ({
  version: 1,
  owner,
  revision: 0,
  epochs: { pvp: 0, pve: 0, seasonal: 0 },
  deleted: false,
  state: null,
  legacyRaw: null,
});
const assertSession = (
  current: ProgressOwnerToken | undefined,
  token: ProgressOwnerToken
): void => {
  if (current?.owner !== token.owner || current.generation !== token.generation)
    throw new ProgressRepositoryConflict('session');
};
const assertRevision = (current: ProgressRepositorySnapshot, revision: number): void => {
  if (current.revision !== revision) throw new ProgressRepositoryConflict('revision');
};
const epochOf = (state: UserState, mode: GameMode): number => state[mode].progressEpoch ?? 0;
const epochsOf = (state: UserState): Epochs =>
  Object.fromEntries(modes.map((mode) => [mode, epochOf(state, mode)])) as Epochs;
const assertFiniteEpochs = (epochs: Epochs): void => {
  if (modes.some((mode) => !Number.isSafeInteger(epochs[mode]) || epochs[mode] < 0))
    throw new ProgressRepositoryConflict('epoch');
};
const assertImport = (
  current: ProgressRepositorySnapshot,
  input: ProgressRepositoryCommit
): void => {
  if (input.kind === 'import' && current.revision !== 0)
    throw new ProgressRepositoryConflict('import');
};
const incrementRevision = (revision: number): number => {
  const next = revision + 1;
  if (!Number.isSafeInteger(next)) throw new ProgressRepositoryConflict('revision');
  return next;
};
const resetMetadata = (
  input: Extract<ProgressRepositoryCommit, { kind: 'reset' }>,
  previous: UserState
): UserState => (modes.every((mode) => input.resetModes.includes(mode)) ? input.state : previous);
const stateForCommit = (
  current: ProgressRepositorySnapshot,
  input: ProgressRepositoryCommit
): UserState => {
  if (input.kind !== 'reset') return input.state;
  const previous = current.state ?? input.state;
  const metadata = resetMetadata(input, previous);
  return {
    ...metadata,
    ...Object.fromEntries(
      modes.map((mode) => [
        mode,
        input.resetModes.includes(mode) ? input.state[mode] : previous[mode],
      ])
    ),
    seasonalSeasonNumber: input.resetModes.includes('seasonal')
      ? input.state.seasonalSeasonNumber
      : previous.seasonalSeasonNumber,
  } as UserState;
};
const expectedEpoch = (
  current: ProgressRepositorySnapshot,
  input: ProgressRepositoryCommit,
  mode: GameMode
): number => {
  if (input.kind === 'import') return epochOf(input.state, mode);
  const reset = input.kind === 'reset' && input.resetModes.includes(mode);
  return current.epochs[mode] + Number(reset);
};
const nextSnapshot = (
  current: ProgressRepositorySnapshot,
  input: ProgressRepositoryCommit
): ProgressRepositorySnapshot => {
  assertRevision(current, input.expectedRevision);
  if (current.deleted) throw new ProgressRepositoryConflict('deleted');
  assertImport(current, input);
  const state = stateForCommit(current, input);
  const epochs = epochsOf(state);
  assertFiniteEpochs(epochs);
  if (modes.some((mode) => epochs[mode] !== expectedEpoch(current, input, mode)))
    throw new ProgressRepositoryConflict('epoch');
  return {
    ...current,
    revision: incrementRevision(current.revision),
    epochs,
    state,
    legacyRaw: input.kind === 'import' ? input.legacyRaw : current.legacyRaw,
  };
};
const openDatabase = (factory: IDBFactory, name: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new DOMException('Progress database upgrade blocked', 'InvalidStateError'));
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
/** No async callback is accepted: every read/check/write stays in native IDB request callbacks. */
const transaction = <T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (
    store: IDBObjectStore,
    finish: (result: T) => void,
    fail: (error: unknown) => void
  ) => void
): Promise<T> =>
  new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode, { durability: 'strict' });
    let result: T;
    let failure: unknown;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () =>
      reject(failure ?? tx.error ?? new DOMException('Progress transaction aborted', 'AbortError'));
    const fail = (error: unknown) => {
      failure = error;
      tx.abort();
    };
    try {
      operation(
        tx.objectStore(storeName),
        (value) => {
          result = value;
        },
        fail
      );
    } catch (error) {
      fail(error);
    }
  });
/** A cursor distinguishes a missing key from a corrupt key storing null or undefined. */
const readEntry = (
  store: IDBObjectStore,
  key: string,
  receive: (entry: RecordEntry) => void,
  fail: (error: unknown) => void
): void => {
  const request = store.openCursor(key);
  request.onsuccess = () => {
    try {
      const cursor = request.result;
      receive(cursor === null ? { exists: false } : { exists: true, value: cursor.value });
    } catch (error) {
      fail(error);
    }
  };
};
const withOwner = <T>(
  store: IDBObjectStore,
  token: ProgressOwnerToken,
  finish: (result: T) => void,
  fail: (error: unknown) => void,
  operation: (current: ProgressRepositorySnapshot) => T
): void => {
  readEntry(
    store,
    sessionKey,
    (entry) => {
      assertSession(decodeSession(entry), token);
      readEntry(
        store,
        ownerKey(token.owner),
        (ownerEntry) => {
          finish(operation(decodeSnapshot(ownerEntry, token.owner)));
        },
        fail
      );
    },
    fail
  );
};
/** Explicit construction keeps the experimental schema outside runtime hydration and save paths. */
export const openProgressRepository = async (factory: IDBFactory, name: string) => {
  const db = await openDatabase(factory, name);
  const read = (request: ProgressOwnerToken) => {
    const token = structuredClone(request);
    return transaction<ProgressRepositorySnapshot>(db, 'readonly', (store, finish, fail) =>
      withOwner(store, token, finish, fail, (current) => current)
    );
  };
  // CAS retry must reread and reapply the original intent, never relabel the stale envelope's revision.
  const commit = (request: ProgressRepositoryCommit) => {
    const input = structuredClone(request);
    return transaction<ProgressRepositorySnapshot>(db, 'readwrite', (store, finish, fail) =>
      withOwner(store, input.token, finish, fail, (current) => {
        const next = decodeSnapshot(
          { exists: true, value: nextSnapshot(current, input) },
          input.token.owner
        );
        store.put(next, ownerKey(input.token.owner));
        return next;
      })
    );
  };
  const remove = (request: ProgressOwnerToken, expectedRevision: number) => {
    const token = structuredClone(request);
    return transaction<ProgressRepositorySnapshot>(db, 'readwrite', (store, finish, fail) =>
      withOwner(store, token, finish, fail, (current) => {
        assertRevision(current, expectedRevision);
        const epochs = Object.fromEntries(
          modes.map((mode) => [mode, current.epochs[mode] + 1])
        ) as Epochs;
        assertFiniteEpochs(epochs);
        const next = {
          ...current,
          epochs,
          deleted: true,
          state: null,
          legacyRaw: null,
          revision: incrementRevision(current.revision),
        };
        decodeSnapshot({ exists: true, value: next }, token.owner);
        store.put(next, ownerKey(token.owner));
        return next;
      })
    );
  };
  const activateOwner = (owner: Owner, renew = false) => {
    if (!isOwnerArgument(owner)) return Promise.reject(new TypeError('Invalid progress owner'));
    return transaction<ProgressOwnerToken>(db, 'readwrite', (store, finish, fail) => {
      readEntry(
        store,
        sessionKey,
        (entry) => {
          const token = nextOwnerToken(decodeSession(entry), owner, renew);
          if (!Number.isSafeInteger(token.generation))
            throw new ProgressRepositoryConflict('session');
          readEntry(
            store,
            ownerKey(owner),
            (ownerEntry) => {
              decodeSnapshot(ownerEntry, owner);
              store.put({ version: 1, ...token }, sessionKey);
              finish(token);
            },
            fail
          );
        },
        fail
      );
    });
  };
  return { activateOwner, read, commit, remove, close: () => db.close() };
};
