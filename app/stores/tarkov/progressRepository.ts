import type { UserState } from '@/stores/progressState';
import type { GameMode } from '@/utils/constants';
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
const withOwner = <T>(
  store: IDBObjectStore,
  token: ProgressOwnerToken,
  finish: (result: T) => void,
  fail: (error: unknown) => void,
  operation: (current: ProgressRepositorySnapshot) => T
): void => {
  const session = store.get(sessionKey);
  session.onsuccess = () => {
    try {
      assertSession(session.result, token);
    } catch (error) {
      fail(error);
      return;
    }
    const request = store.get(ownerKey(token.owner));
    request.onsuccess = () => {
      try {
        finish(operation(request.result ?? emptySnapshot(token.owner)));
      } catch (error) {
        fail(error);
      }
    };
  };
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
  const commit = (request: ProgressRepositoryCommit) => {
    const input = structuredClone(request);
    return transaction<ProgressRepositorySnapshot>(db, 'readwrite', (store, finish, fail) =>
      withOwner(store, input.token, finish, fail, (current) => {
        const next = nextSnapshot(current, input);
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
        store.put(next, ownerKey(token.owner));
        return next;
      })
    );
  };
  const activateOwner = (owner: Owner, renew = false) =>
    transaction<ProgressOwnerToken>(db, 'readwrite', (store, finish, fail) => {
      const request = store.get(sessionKey);
      request.onsuccess = () => {
        try {
          const previous: ProgressOwnerToken | undefined = request.result;
          const changed = previous?.owner !== owner || renew;
          const generation = (previous?.generation ?? 0) + Number(changed);
          if (!Number.isSafeInteger(generation)) throw new ProgressRepositoryConflict('session');
          const token = { owner, generation };
          store.put(token, sessionKey);
          finish(token);
        } catch (error) {
          fail(error);
        }
      };
    });
  return { activateOwner, read, commit, remove, close: () => db.close() };
};
