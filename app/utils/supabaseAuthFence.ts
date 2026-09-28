/**
 * Owner fence for the persisted Supabase auth session.
 *
 * Supabase re-reads the stored session inside `auth.signOut()`, so checking the owner before
 * the call leaves a window where another tab can store a different account's session. The
 * fence runs the check inside the SDK's own storage reads and removals: while an owner is
 * fenced, reading or removing a session stored for any other account throws, so the SDK can
 * neither revoke nor clear that session.
 */
export class SupabaseSessionChangedError extends Error {
  constructor() {
    super('Supabase session changed before sign-out');
    this.name = 'SupabaseSessionChangedError';
  }
}
/** Name-based so the check survives duplicated module instances (tests, HMR). */
export const isSupabaseSessionChangedError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'SupabaseSessionChangedError';
type AuthStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};
/** Matches the key `@supabase/supabase-js` derives by default, so existing sessions survive. */
export const supabaseAuthStorageKey = (supabaseUrl: string): string =>
  `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
const createMemoryStorage = (): AuthStorage => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
};
/**
 * Keeps a readable persisted session authoritative even when writes fail (for example a full
 * quota). A session that cannot be persisted lives in memory, and the stale persisted copy is
 * removed so a later load cannot resurrect it; removal errors propagate so sign-out fails closed.
 */
const createWriteTolerantStorage = (persistent: Storage): AuthStorage => {
  const unsaved = createMemoryStorage();
  return {
    getItem: (key) => unsaved.getItem(key) ?? persistent.getItem(key),
    setItem: (key, value) => {
      try {
        persistent.setItem(key, value);
        unsaved.removeItem(key);
      } catch {
        unsaved.setItem(key, value);
        persistent.removeItem(key);
      }
    },
    removeItem: (key) => {
      unsaved.removeItem(key);
      persistent.removeItem(key);
    },
  };
};
/** Browser storage whenever it can be accessed; memory only when access itself is blocked. */
const resolveBrowserStorage = (): AuthStorage => {
  try {
    return createWriteTolerantStorage(window.localStorage);
  } catch {
    return createMemoryStorage();
  }
};
const storedSessionOwner = (raw: string | null): string | null => {
  if (!raw) return null;
  try {
    const id = (JSON.parse(raw) as { user?: { id?: unknown } } | null)?.user?.id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
};
export const createOwnerFencedAuthStorage = (
  storageKey: string,
  base: AuthStorage = resolveBrowserStorage()
) => {
  let fencedOwner: string | null = null;
  let fenceDepth = 0;
  const assertFencedOwner = (): void => {
    if (!fencedOwner) return;
    const owner = storedSessionOwner(base.getItem(storageKey));
    if (owner && owner !== fencedOwner) throw new SupabaseSessionChangedError();
  };
  const storage: AuthStorage = {
    getItem: (key) => {
      if (key === storageKey) assertFencedOwner();
      return base.getItem(key);
    },
    setItem: (key, value) => base.setItem(key, value),
    removeItem: (key) => {
      if (key === storageKey) assertFencedOwner();
      base.removeItem(key);
    },
  };
  /** Runs `operation` while only `ownerId`'s stored session may be read or removed. */
  const withOwnerFence = async <T>(ownerId: string, operation: () => Promise<T>): Promise<T> => {
    if (fencedOwner && fencedOwner !== ownerId) throw new SupabaseSessionChangedError();
    fencedOwner = ownerId;
    fenceDepth += 1;
    try {
      return await operation();
    } finally {
      fenceDepth -= 1;
      if (fenceDepth === 0) fencedOwner = null;
    }
  };
  /** Synchronously clears the fenced owner's stored session without contacting the server. */
  const removeFencedSession = (): void => {
    if (!fencedOwner) throw new Error('Auth session removal requires an owner fence');
    storage.removeItem(storageKey);
  };
  return { storage, withOwnerFence, removeFencedSession };
};
