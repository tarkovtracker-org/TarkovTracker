import { ref } from 'vue';
import { STORAGE_KEYS } from '@/utils/storageKeys';
const recoveryOwner = (raw: string): string | null | undefined => {
  try {
    const owner = JSON.parse(raw)?._userId;
    return owner === null || typeof owner === 'string' ? owner : undefined;
  } catch {
    return undefined;
  }
};
/**
 * Storage double for existing merge/retention policy tests. These tests already mock
 * localStorage and locks; they do not establish IndexedDB commit or renderer visibility.
 * Native authority integration and browser acceptance exercise the real implementation.
 */
export const createProgressPolicyAuthority = () => {
  let actions: Array<() => void> = [];
  const record = () => ({
    version: 1 as const,
    revision: 0,
    raw: localStorage.getItem(STORAGE_KEYS.progress),
    legacyRaw: null,
  });
  return {
    initializeProgressAuthority: async () => {},
    removeOwnedProgressRecovery: async () => {
      const raw = localStorage.getItem(STORAGE_KEYS.progress);
      const released = raw === null || recoveryOwner(raw) !== undefined;
      return { complete: released, released };
    },
    discardExportedLegacyProgress: async () => {},
    configureProgressSession: () => {},
    currentProgressSessionOwner: () => undefined,
    isProgressAuthorityReady: () => true,
    observeProgressAuthority: () => () => {},
    refreshProgressAuthority: async () => {},
    legacyProgressRecoveryCount: ref(0),
    legacyProgressRecoveryOverflow: ref(false),
    exportableLegacyUpdates: () => [],
    ownedLegacyUpdates: () => [],
    isOwnedProgressRecovery: (raw: string | null, owner: string | null) =>
      raw !== null && recoveryOwner(raw) === owner,
    readAuthoritativeProgress: () => localStorage.getItem(STORAGE_KEYS.progress),
    writeAuthoritativeProgress: (raw: string | null) => {
      if (raw === null) localStorage.removeItem(STORAGE_KEYS.progress);
      else localStorage.setItem(STORAGE_KEYS.progress, raw);
    },
    afterProgressCommit: (action: () => void) => {
      actions.push(action);
    },
    readCommittedProgressAuthority: async () => record(),
    commitProgressMutation: async (mutate: () => { ok: boolean }, canContinue: () => boolean) => {
      if (!canContinue()) return { ok: false, error: null, canceled: true };
      actions = [];
      const result = mutate();
      if (result.ok) actions.forEach((action) => action());
      return result;
    },
  };
};
