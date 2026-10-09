import {
  openActiveProgressRepository,
  type ActiveProgressRecord,
  type ProgressOwnerToken,
} from '@/stores/tarkov/progressRepository';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { parseUserScopedStorage } from '@/utils/userScopedStorage';
type Repository = Awaited<ReturnType<typeof openActiveProgressRepository>>;
type Result = { ok: true } | { ok: false; error: unknown; canceled?: true };
type Draft = { raw: string | null; actions: Array<() => void> };
let repository: Promise<Repository> | undefined;
let token: ProgressOwnerToken | undefined;
let accepted: ActiveProgressRecord | undefined;
let draft: Draft | undefined;
export const legacyProgressRecoveryCount = ref(0);
let announcements: BroadcastChannel | undefined;
let readSessionOwner: (() => string | null) | undefined;
export const configureProgressSession = (readOwner: () => string | null): void => {
  readSessionOwner = readOwner;
};
export const currentProgressSessionOwner = (): string | null | undefined => readSessionOwner?.();
export const isProgressAuthorityReady = (): boolean => {
  if (!token || !accepted) return false;
  return !readSessionOwner || token.owner === readSessionOwner();
};
class RejectedMutation extends Error {
  constructor(public readonly result: Extract<Result, { ok: false }>) {
    super('Progress mutation rejected');
  }
}
const openRepository = (): Promise<Repository> => {
  repository ??= openActiveProgressRepository(window.indexedDB, 'tarkovtracker-active-progress-v1');
  return repository;
};
const recoveryEnvelopeOwner = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null;
  const owner = (value as Record<string, unknown>)._userId;
  return typeof owner === 'string' ? owner : null;
};
const recoveryRawOwner = (raw: string): string | null => {
  try {
    return recoveryEnvelopeOwner(JSON.parse(raw));
  } catch {
    return null;
  }
};
export const isOwnedProgressRecovery = (raw: string | null, owner: string | null): raw is string =>
  raw !== null && recoveryRawOwner(raw) === owner;
export const ownedLegacyUpdates = (record: ActiveProgressRecord, owner: string | null): string[] =>
  (record.legacyUpdates ?? []).filter((raw): raw is string => isOwnedProgressRecovery(raw, owner));
const legacySource = (): string | null =>
  localStorage.getItem(STORAGE_KEYS.progress) ?? localStorage.getItem('progress');
const acceptAuthority = (record: ActiveProgressRecord): void => {
  accepted = record;
  legacyProgressRecoveryCount.value = ownedLegacyUpdates(record, token?.owner ?? null).length;
};
export const refreshProgressAuthority = async (source = legacySource): Promise<void> => {
  if (!token) return;
  const request = structuredClone(token);
  const record = await (await openRepository()).read(request, source);
  if (token.generation === request.generation) acceptAuthority(record);
};
export const observeProgressAuthority = (onError: (error: unknown) => void): (() => void) => {
  const refresh = () => {
    void refreshProgressAuthority().catch(onError);
  };
  const storage = (event: StorageEvent) => {
    if (![STORAGE_KEYS.progress, 'progress'].includes(event.key ?? '')) return;
    void refreshProgressAuthority(() => event.newValue).catch(onError);
  };
  if (typeof BroadcastChannel !== 'undefined') {
    announcements = new BroadcastChannel('tarkovtracker-progress');
    announcements.addEventListener('message', refresh);
  }
  window.addEventListener('focus', refresh);
  window.addEventListener('storage', storage);
  return () => {
    announcements?.close();
    announcements = undefined;
    window.removeEventListener('focus', refresh);
    window.removeEventListener('storage', storage);
  };
};
/** Explicit session activation, never an implicit retry of a stale writer. */
export const initializeProgressAuthority = async (
  owner: string | null,
  renew = false
): Promise<void> => {
  const db = await openRepository();
  const next = await db.activateOwner(owner, renew);
  const current = await db.read(next, legacySource);
  token = next;
  acceptAuthority(current);
};
export const readAuthoritativeProgress = (): string | null => {
  if (draft) return draft.raw;
  if (!accepted) throw new DOMException('Progress authority is unavailable', 'InvalidStateError');
  return accepted.raw;
};
/** Only a native transaction callback can replace active bytes. */
export const writeAuthoritativeProgress = (raw: string | null): void => {
  if (!draft)
    throw new DOMException('Progress write is outside its transaction', 'InvalidStateError');
  draft.raw = raw;
};
export const afterProgressCommit = (action: () => void): void => {
  if (!draft)
    throw new DOMException('Progress adoption is outside its transaction', 'InvalidStateError');
  draft.actions.push(action);
};
const runDraft = (
  current: ActiveProgressRecord,
  mutate: () => Result
): { raw: string | null; result: Result; actions: Array<() => void> } => {
  const currentDraft: Draft = { raw: current.raw, actions: [] };
  draft = currentDraft;
  try {
    const result = mutate();
    if (!result.ok) throw new RejectedMutation(result);
    return { raw: currentDraft.raw, result, actions: currentDraft.actions };
  } finally {
    draft = undefined;
  }
};
export const commitProgressMutation = async (
  mutate: () => Result,
  canContinue: () => boolean,
  expectedOwner: string | null
): Promise<Result> => {
  if (!token) throw new DOMException('Progress authority is not hydrated', 'InvalidStateError');
  if (token.owner !== expectedOwner) return { ok: false, error: null, canceled: true };
  const request = structuredClone(token);
  let actions: Array<() => void> = [];
  try {
    const receipt = await (
      await openRepository()
    ).mutate(request, (current) => {
      if (!canContinue()) throw new RejectedMutation({ ok: false, error: null, canceled: true });
      const next = runDraft(current, mutate);
      actions = next.actions;
      return { raw: next.raw, result: next.result };
    });
    if (!canContinue()) return { ok: false, error: null, canceled: true };
    acceptAuthority(receipt.committed);
    announcements?.postMessage({ revision: receipt.committed.revision });
    actions.forEach((action) => action());
    return receipt.result;
  } catch (error) {
    if (error instanceof RejectedMutation) return error.result;
    throw error;
  }
};
export const readCommittedProgressAuthority = async (): Promise<ActiveProgressRecord> => {
  if (!token) throw new DOMException('Progress authority is not hydrated', 'InvalidStateError');
  return (await openRepository()).read(structuredClone(token), legacySource);
};
/** Explicit device removal also covers the immutable import and older-tab recovery copies. */
export const removeOwnedProgressRecovery = async (
  owner: string,
  canContinue = () => true
): Promise<boolean> => {
  if (!token) return false;
  const request = structuredClone(token);
  let complete = true;
  const keep = (raw: string | null): string | null => {
    if (raw === null) return null;
    const envelope = parseUserScopedStorage(raw);
    if (!envelope) {
      complete = false;
      return raw;
    }
    return envelope._userId === owner ? null : raw;
  };
  const receipt = await (
    await openRepository()
  ).mutate(request, (current) => {
    if (!canContinue()) throw new RejectedMutation({ ok: false, error: null, canceled: true });
    return {
      raw: current.raw,
      result: true,
      recovery: {
        legacyRaw: keep(current.legacyRaw),
        lastLegacyRaw: keep(current.lastLegacyRaw ?? null),
        legacyUpdates: (current.legacyUpdates ?? []).map(keep).filter((raw) => raw !== null),
      },
    };
  });
  if (!canContinue()) return false;
  acceptAuthority(receipt.committed);
  return complete;
};
