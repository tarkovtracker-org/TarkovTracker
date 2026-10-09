import {
  openActiveProgressRepository,
  type ActiveProgressRecord,
  type ProgressOwnerToken,
} from '@/stores/tarkov/progressRepository';
import { STORAGE_KEYS } from '@/utils/storageKeys';
type Repository = Awaited<ReturnType<typeof openActiveProgressRepository>>;
type Result = { ok: true } | { ok: false; error: unknown; canceled?: true };
type Draft = { raw: string | null; actions: Array<() => void> };
let repository: Promise<Repository> | undefined;
let token: ProgressOwnerToken | undefined;
let accepted: ActiveProgressRecord | undefined;
let draft: Draft | undefined;
export const legacyProgressRecoveryCount = ref(0);
export const legacyProgressRecoveryOverflow = ref(false);
let announcements: BroadcastChannel | undefined;
let activationRevision = 0;
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
const readPendingLegacySource = (): string | null => {
  try {
    return legacySource();
  } catch {
    return null;
  }
};
const isExportablePendingLegacy = (
  record: ActiveProgressRecord,
  raw: string | null,
  owner: string | null
): raw is string => isOwnedProgressRecovery(raw, owner) && raw !== record.legacyRaw;
export const exportableLegacyUpdates = (
  record: ActiveProgressRecord,
  owner: string | null
): string[] => {
  const captured = ownedLegacyUpdates(record, owner);
  const pending = readPendingLegacySource();
  if (!isExportablePendingLegacy(record, pending, owner)) return captured;
  return [...new Set([...captured, pending])];
};
const acceptAuthority = (record: ActiveProgressRecord): void => {
  accepted = record;
  legacyProgressRecoveryOverflow.value = record.legacyRecoveryOverflow === true;
  legacyProgressRecoveryCount.value = ownedLegacyUpdates(record, token?.owner ?? null).length;
};
const matchesReceiptToken = (request: ProgressOwnerToken): boolean => {
  if (!token) return false;
  return token.owner === request.owner && token.generation === request.generation;
};
const ownsReceiptSession = (request: ProgressOwnerToken): boolean =>
  matchesReceiptToken(request) && (!readSessionOwner || readSessionOwner() === request.owner);
const announceCommittedRevision = (revision: number): void => {
  announcements?.postMessage({ revision });
};
/** Every durable commit announces; stale receipts cannot replace the current session cache. */
const adoptCommittedReceipt = (
  request: ProgressOwnerToken,
  record: ActiveProgressRecord
): boolean => {
  announceCommittedRevision(record.revision);
  if (!ownsReceiptSession(request)) return false;
  if (!accepted || record.revision > accepted.revision) acceptAuthority(record);
  return record.revision === accepted!.revision;
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
const hydrateActivatedProgressOwner = async (
  db: Repository,
  next: ProgressOwnerToken,
  canContinue: () => boolean
): Promise<void> => {
  if (!canContinue()) return;
  const current = await db.read(next, legacySource);
  if (!canContinue()) return;
  token = next;
  acceptAuthority(current);
};
/** Explicit session activation, never an implicit retry of a stale writer. */
export const initializeProgressAuthority = async (
  owner: string | null,
  renew = false,
  canContinue = () => true
): Promise<void> => {
  const ownsSession = () => canContinue() && (!readSessionOwner || readSessionOwner() === owner);
  if (!ownsSession()) return;
  const revision = ++activationRevision;
  const ownsActivation = () => revision === activationRevision && ownsSession();
  try {
    const db = await openRepository();
    if (!ownsActivation()) return;
    const next = await db.activateOwner(owner, renew, ownsActivation);
    await hydrateActivatedProgressOwner(db, next, ownsActivation);
  } catch (error) {
    if (ownsActivation()) throw error;
  }
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
    if (!adoptCommittedReceipt(request, receipt.committed) || !canContinue()) {
      return { ok: false, error: null, canceled: true };
    }
    actions.forEach((action) => action());
    return receipt.result;
  } catch (error) {
    if (error instanceof RejectedMutation) return error.result;
    throw error;
  }
};
export const readCommittedProgressAuthority = async (
  observeLegacy = true
): Promise<ActiveProgressRecord> => {
  if (!token) throw new DOMException('Progress authority is not hydrated', 'InvalidStateError');
  return (await openRepository()).read(structuredClone(token), observeLegacy ? legacySource : null);
};
/** Explicit device removal also covers the immutable import and older-tab recovery copies. */
export const removeOwnedProgressRecovery = async (
  owner: string,
  canContinue = () => true
): Promise<{ complete: boolean; released: boolean }> => {
  if (!token) return { complete: false, released: false };
  const request = structuredClone(token);
  let complete = true;
  const keep = (raw: string | null): string | null => {
    if (raw === null) return null;
    const rawOwner = recoveryRawOwner(raw);
    if (rawOwner === null) {
      complete = false;
      return raw;
    }
    return rawOwner === owner ? null : raw;
  };
  const receipt = await (
    await openRepository()
  ).mutate(request, (current) => {
    if (!canContinue()) throw new RejectedMutation({ ok: false, error: null, canceled: true });
    return {
      raw: keep(current.raw),
      result: current.raw === null || recoveryRawOwner(current.raw) !== null,
      recovery: {
        legacyRaw: keep(current.legacyRaw),
        lastLegacyRaw: keep(current.lastLegacyRaw ?? null),
        legacyUpdates: (current.legacyUpdates ?? []).map(keep).filter((raw) => raw !== null),
      },
    };
  });
  if (!adoptCommittedReceipt(request, receipt.committed) || !canContinue()) {
    return { complete: false, released: false };
  }
  return { complete, released: receipt.result };
};
const isExportedPendingLegacy = (
  raw: string | null,
  owner: string | null,
  exported: Set<string>
): boolean => isOwnedProgressRecovery(raw, owner) && exported.has(raw);
/** Explicit cleanup removes only snapshots included in the completed export. */
export const discardExportedLegacyProgress = async (
  owner: string | null,
  copies: readonly string[]
): Promise<void> => {
  if (!token || token.owner !== owner)
    throw new DOMException('Progress owner changed', 'InvalidStateError');
  const request = structuredClone(token);
  const isCurrent = () =>
    token?.generation === request.generation && (!readSessionOwner || readSessionOwner() === owner);
  const exported = new Set(copies);
  const pending = readPendingLegacySource();
  const keep = (raw: string | null) => !isOwnedProgressRecovery(raw, owner) || !exported.has(raw);
  const receipt = await (
    await openRepository()
  ).mutate(request, (current) => {
    if (!isCurrent()) throw new DOMException('Progress owner changed', 'InvalidStateError');
    return {
      raw: current.raw,
      result: true,
      recovery: {
        legacyRaw: current.legacyRaw,
        legacyRecoveryOverflow: false,
        lastLegacyRaw: isExportedPendingLegacy(pending, owner, exported)
          ? pending
          : current.lastLegacyRaw,
        legacyUpdates: (current.legacyUpdates ?? []).filter(keep),
      },
    };
  });
  if (!adoptCommittedReceipt(request, receipt.committed) || !isCurrent()) {
    throw new DOMException('Progress owner changed', 'InvalidStateError');
  }
};
