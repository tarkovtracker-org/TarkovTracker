import {
  openActiveProgressRepository,
  exceedsLegacyRecoveryLimits,
  ProgressDatabaseClosed,
  type ActiveProgressRecord,
  type ProgressOwnerToken,
} from '@/stores/tarkov/progressRepository';
import { STORAGE_KEYS } from '@/utils/storageKeys';
type Repository = Awaited<ReturnType<typeof openActiveProgressRepository>>;
type Result = { ok: true } | { ok: false; error: unknown; canceled?: true };
type CommitAction = { action: () => void; requiresCurrentRevision: boolean };
type Draft = { raw: string | null; actions: CommitAction[] };
let repository: Promise<Repository> | undefined;
let token: ProgressOwnerToken | undefined;
let accepted: ActiveProgressRecord | undefined;
let captureFailure: { raws: string[]; overflow: boolean } | undefined;
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
const startRepository = (): Promise<Repository> => {
  const pending = openActiveProgressRepository(
    window.indexedDB,
    'tarkovtracker-active-progress-v1'
  );
  repository = pending;
  void pending.catch(() => {
    if (repository === pending) repository = undefined;
  });
  return pending;
};
/** A closed connection is replaced once; concurrent callers share that replacement. */
const replaceClosedRepository = (stale: Promise<Repository>, db: Repository) => {
  if (!db.isClosed()) return db;
  return repository === stale ? startRepository() : openRepository();
};
const openRepository = (): Promise<Repository> => {
  const cached = repository;
  if (!cached) return startRepository();
  return cached.then((db) => replaceClosedRepository(cached, db));
};
/** Retries only a transaction the closed connection refused to start; no callback has run. */
const withRepository = async <T>(operation: (db: Repository) => Promise<T>): Promise<T> => {
  try {
    return await operation(await openRepository());
  } catch (error) {
    if (!(error instanceof ProgressDatabaseClosed)) throw error;
    return await operation(await openRepository());
  }
};
const recoveryEnvelopeOwner = (value: unknown): string | null | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const owner = (value as Record<string, unknown>)._userId;
  return owner === null || typeof owner === 'string' ? owner : undefined;
};
const recoveryRawOwner = (raw: string): string | null | undefined => {
  try {
    return recoveryEnvelopeOwner(JSON.parse(raw));
  } catch {
    return undefined;
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
): raw is string =>
  isOwnedProgressRecovery(raw, owner) && raw !== record.legacyRaw && raw !== record.lastLegacyRaw;
const hasCurrentCaptureFailure = (): boolean =>
  captureFailure !== undefined &&
  (captureFailure.overflow ||
    captureFailure.raws.some(
      (raw) =>
        recoveryRawOwner(raw) === undefined || isOwnedProgressRecovery(raw, token?.owner ?? null)
    ));
const currentFailedRecovery = (): string[] =>
  (captureFailure?.raws ?? []).filter((raw) => isOwnedProgressRecovery(raw, token?.owner ?? null));
const hasUnresolvedCaptures = (failure: NonNullable<typeof captureFailure>): boolean =>
  failure.overflow || failure.raws.length > 0;
const clearResolvedCaptureFailure = (): void => {
  if (captureFailure && !hasUnresolvedCaptures(captureFailure)) captureFailure = undefined;
};
const resolveCapturedFailure = (record: ActiveProgressRecord): void => {
  if (!captureFailure) return;
  const captured = [
    record.legacyRaw,
    record.lastLegacyRaw ?? null,
    ...(record.legacyUpdates ?? []),
  ];
  captureFailure.raws = captureFailure.raws.filter((raw) => !captured.includes(raw));
  clearResolvedCaptureFailure();
};
const appendFailedCapture = (failure: NonNullable<typeof captureFailure>, raw: string): void => {
  if (failure.raws.includes(raw)) return;
  if (exceedsLegacyRecoveryLimits(failure.raws, raw)) {
    failure.overflow = true;
    return;
  }
  failure.raws.push(raw);
};
const recordFailedCapture = (raw: string | null): void => {
  if (raw === null) return;
  captureFailure ??= { raws: [], overflow: false };
  appendFailedCapture(captureFailure!, raw);
  legacyProgressRecoveryOverflow.value = true;
};
export const exportableLegacyUpdates = (
  record: ActiveProgressRecord,
  owner: string | null
): string[] => {
  const captured = ownedLegacyUpdates(record, owner);
  const pending = [readPendingLegacySource(), ...currentFailedRecovery()].filter((raw) =>
    isExportablePendingLegacy(record, raw, owner)
  );
  return [...new Set([...captured, ...pending])];
};
const acceptAuthority = (record: ActiveProgressRecord): void => {
  accepted = record;
  legacyProgressRecoveryOverflow.value =
    record.legacyRecoveryOverflow === true || hasCurrentCaptureFailure();
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
const readObservedAuthority = async (
  db: Repository,
  request: ProgressOwnerToken,
  source: () => string | null,
  isCurrent = () => ownsReceiptSession(request)
): Promise<ActiveProgressRecord> => {
  let observedRaw: string | null = null;
  try {
    const record = await db.read(request, () => {
      observedRaw = source();
      return observedRaw;
    });
    if (isCurrent()) resolveCapturedFailure(record);
    return record;
  } catch (error) {
    if (isCurrent()) {
      recordFailedCapture(observedRaw);
    }
    throw error;
  }
};
export const refreshProgressAuthority = async (source = legacySource): Promise<void> => {
  if (!token) return;
  const request = structuredClone(token);
  const record = await withRepository((db) => readObservedAuthority(db, request, source));
  if (ownsReceiptSession(request)) acceptAuthority(record);
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
  const current = await db.read(next, legacySource, false);
  if (!canContinue()) return;
  token = next;
  acceptAuthority(current);
  try {
    const observed = await readObservedAuthority(db, next, legacySource, canContinue);
    if (canContinue()) acceptAuthority(observed);
  } catch (error) {
    console.warn('Older progress recovery could not be captured', error);
  }
};
const attemptProgressActivation = async (
  owner: string | null,
  renew: boolean,
  canContinue: () => boolean
): Promise<void> => {
  const db = await openRepository();
  if (!canContinue()) return;
  const next = await db.activateOwner(owner, renew, canContinue);
  await hydrateActivatedProgressOwner(db, next, canContinue);
};
const shouldRetryActivation = (error: unknown, attempt: number): boolean =>
  attempt < 2 && !(error instanceof DOMException && error.name === 'TimeoutError');
const activateProgressOwner = async (
  owner: string | null,
  renew: boolean,
  canContinue: () => boolean,
  attempt = 0
): Promise<void> => {
  try {
    await attemptProgressActivation(owner, renew, canContinue);
  } catch (error) {
    if (!canContinue()) return;
    if (!shouldRetryActivation(error, attempt)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 250));
    await activateProgressOwner(owner, renew, canContinue, attempt + 1);
  }
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
    await activateProgressOwner(owner, renew, ownsActivation);
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
export const afterProgressCommit = (action: () => void, requiresCurrentRevision = true): void => {
  if (!draft)
    throw new DOMException('Progress adoption is outside its transaction', 'InvalidStateError');
  draft.actions.push({ action, requiresCurrentRevision });
};
const runDraft = (
  current: ActiveProgressRecord,
  mutate: () => Result
): { raw: string | null; result: Result; actions: CommitAction[] } => {
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
  let actions: CommitAction[] = [];
  try {
    const receipt = await withRepository((db) =>
      db.mutate(request, (current) => {
        if (!canContinue()) throw new RejectedMutation({ ok: false, error: null, canceled: true });
        const next = runDraft(current, mutate);
        actions = next.actions;
        return { raw: next.raw, result: next.result };
      })
    );
    const adopted = adoptCommittedReceipt(request, receipt.committed);
    if (!ownsReceiptSession(request) || !canContinue()) {
      return { ok: false, error: null, canceled: true };
    }
    actions
      .filter(({ requiresCurrentRevision }) => adopted || !requiresCurrentRevision)
      .forEach(({ action }) => action());
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
  const request = structuredClone(token);
  return withRepository((db) =>
    observeLegacy ? readObservedAuthority(db, request, legacySource) : db.read(request, null, false)
  );
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
    if (rawOwner === undefined) {
      complete = false;
      return raw;
    }
    return rawOwner === owner ? null : raw;
  };
  const receipt = await withRepository((db) =>
    db.mutate(request, (current) => {
      if (!canContinue()) throw new RejectedMutation({ ok: false, error: null, canceled: true });
      return {
        raw: keep(current.raw),
        result: current.raw === null || recoveryRawOwner(current.raw) !== undefined,
        recovery: {
          legacyRaw: keep(current.legacyRaw),
          lastLegacyRaw: keep(current.lastLegacyRaw ?? null),
          legacyUpdates: (current.legacyUpdates ?? []).map(keep).filter((raw) => raw !== null),
        },
      };
    })
  );
  if (!adoptCommittedReceipt(request, receipt.committed) || !canContinue()) {
    return { complete: false, released: false };
  }
  if (captureFailure)
    captureFailure.raws = captureFailure.raws.map(keep).filter((raw) => raw !== null);
  clearResolvedCaptureFailure();
  acceptAuthority(receipt.committed);
  return { complete, released: receipt.result };
};
const isExportedPendingLegacy = (
  raw: string | null,
  owner: string | null,
  exported: Set<string>
): boolean => isOwnedProgressRecovery(raw, owner) && exported.has(raw);
const hasCurrentCaptureOverflow = (): boolean =>
  hasCurrentCaptureFailure() && captureFailure!.overflow;
const clearExportedCaptureFailure = (exported: Set<string>): void => {
  if (!captureFailure) return;
  captureFailure.raws = captureFailure.raws.filter((raw) => !exported.has(raw));
  clearResolvedCaptureFailure();
  legacyProgressRecoveryOverflow.value =
    accepted?.legacyRecoveryOverflow === true || hasCurrentCaptureFailure();
};
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
  const exported = new Set(copies.filter((raw) => isOwnedProgressRecovery(raw, owner)));
  const pending = readPendingLegacySource();
  const keep = (raw: string | null) => !isOwnedProgressRecovery(raw, owner) || !exported.has(raw);
  const receipt = await withRepository((db) =>
    db.mutate(request, (current) => {
      if (!isCurrent()) throw new DOMException('Progress owner changed', 'InvalidStateError');
      return {
        raw: current.raw,
        result: true,
        recovery: {
          legacyRaw: current.legacyRaw,
          legacyRecoveryOverflow:
            current.legacyRecoveryOverflow === true || hasCurrentCaptureOverflow(),
          lastLegacyRaw: isExportedPendingLegacy(pending, owner, exported)
            ? pending
            : current.lastLegacyRaw,
          legacyUpdates: (current.legacyUpdates ?? []).filter(keep),
        },
      };
    })
  );
  if (!adoptCommittedReceipt(request, receipt.committed) || !isCurrent()) {
    throw new DOMException('Progress owner changed', 'InvalidStateError');
  }
  clearExportedCaptureFailure(exported);
};
