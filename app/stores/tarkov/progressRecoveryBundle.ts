import {
  decodeRecoveryPayload,
  encodeRecoveryPayload,
  requireRecoveryTextLimit,
} from '@/stores/tarkov/progressRecoveryCodec';
import {
  captureProgressRecoverySources,
  ProgressRecoveryBundleError,
  progressRecoveryValidationLimits,
  validateProgressRecoverySources,
  type ProgressRecoverySource,
} from '@/stores/tarkov/progressRecoverySources';
import {
  validateProgressRepositorySnapshot,
  type ProgressOwnerToken,
  type ProgressRepositorySnapshot,
} from '@/stores/tarkov/progressRepository';
const format = 'tarkovtracker-progress-recovery';
const codec = 'devalue@5.9.4';
export type ProgressRecoveryBundle = {
  /** Provenance only; not transferable account authorization or a restore token. */
  session: ProgressOwnerToken;
  committed: ProgressRepositorySnapshot;
  /** Separately observed source values; no cross-storage atomicity or completeness claim. */
  sources: ProgressRecoverySource[];
};
const record = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new ProgressRecoveryBundleError('format');
  return value as Record<string, unknown>;
};
const validateSession = (value: unknown): ProgressOwnerToken => {
  const session = record(value);
  const generation = session.generation;
  if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 0)
    throw new ProgressRecoveryBundleError('session');
  return session as ProgressOwnerToken;
};
const validateBundle = (value: unknown): ProgressRecoveryBundle => {
  const bundle = record(value);
  const session = validateSession(bundle.session);
  validateProgressRepositorySnapshot(bundle.committed, session.owner, validationWork());
  validateProgressRecoverySources(bundle.sources);
  return bundle as ProgressRecoveryBundle;
};
/** Per-validation call; never memoizes away owner/epoch or other context-sensitive checks. */
const validationWork = (): (() => void) => {
  let checks = 0;
  return () => {
    checks += 1;
    if (checks > progressRecoveryValidationLimits.checks)
      throw new ProgressRecoveryBundleError('limit');
  };
};
const parseContainer = (raw: string): Record<string, unknown> => {
  requireRecoveryTextLimit(raw);
  try {
    return record(JSON.parse(raw));
  } catch {
    throw new ProgressRecoveryBundleError('format');
  }
};
/** Pure decoding only. No import, owner activation, season normalization or storage mutation. */
export const parseProgressRecoveryBundle = (raw: string): ProgressRecoveryBundle => {
  const container = parseContainer(raw);
  if (container._format !== format) throw new ProgressRecoveryBundleError('format');
  if (container._version !== 1) throw new ProgressRecoveryBundleError('version');
  return parseContainerPayload(container);
};
const parseContainerPayload = (container: Record<string, unknown>): ProgressRecoveryBundle => {
  if (container._codec !== codec || typeof container.payload !== 'string')
    throw new ProgressRecoveryBundleError('codec');
  return validateBundle(decodeRecoveryPayload(container.payload));
};
/** Versioned data codec, never executable serialization. Refuse an export the parser cannot read. */
export const serializeProgressRecoveryBundle = (request: ProgressRecoveryBundle): string => {
  const payload = encodeRecoveryPayload(request);
  validateBundle(request);
  const encoded = JSON.stringify({ _format: format, _version: 1, _codec: codec, payload });
  parseProgressRecoveryBundle(encoded);
  return encoded;
};
/** No application caller yet. Export waits for the repository's native transaction-complete receipt. */
export const exportCommittedProgressRecovery = async (
  repository: { read: (token: ProgressOwnerToken) => Promise<ProgressRepositorySnapshot> },
  request: ProgressOwnerToken,
  storage: Pick<Storage, 'getItem'>,
  keys: readonly string[]
): Promise<string> => {
  const session = structuredClone(request);
  const sources = captureProgressRecoverySources(storage, [...keys]);
  const committed = await repository.read(session);
  return serializeProgressRecoveryBundle({ session, committed, sources });
};
