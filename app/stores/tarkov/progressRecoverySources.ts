import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '@/utils/storageKeys';
export class ProgressRecoveryBundleError extends Error {
  constructor(
    public readonly reason:
      'key' | 'source' | 'format' | 'version' | 'codec' | 'session' | 'limit' | 'unsupported'
  ) {
    super(`Progress recovery bundle rejected: ${reason}`);
    this.name = 'ProgressRecoveryBundleError';
  }
}
type SourceKind = 'active' | 'backup' | 'account-recovery' | 'superseded' | 'quarantine';
type StorageNamespace = 'v2' | 'legacy';
type SourceRule = {
  kind: SourceKind;
  namespace: StorageNamespace;
  key: string;
  match: 'exact' | 'prefix';
};
// Key namespaces, not inferred payload versions. Raw source formats remain untouched.
const progressRecoverySourceInventory: readonly SourceRule[] = [
  { kind: 'active', namespace: 'v2', key: STORAGE_KEYS.progress, match: 'exact' },
  { kind: 'active', namespace: 'legacy', key: LEGACY_STORAGE_KEYS.progress, match: 'exact' },
  { kind: 'backup', namespace: 'v2', key: STORAGE_KEYS.progressBackupPrefix, match: 'prefix' },
  {
    kind: 'backup',
    namespace: 'legacy',
    key: LEGACY_STORAGE_KEYS.progressBackupPrefix,
    match: 'prefix',
  },
  {
    kind: 'account-recovery',
    namespace: 'v2',
    key: STORAGE_KEYS.progressRecoveryPrefix,
    match: 'prefix',
  },
  {
    kind: 'superseded',
    namespace: 'v2',
    key: STORAGE_KEYS.progressSupersededPrefix,
    match: 'prefix',
  },
  {
    kind: 'quarantine',
    namespace: 'v2',
    key: STORAGE_KEYS.progressQuarantinePrefix,
    match: 'prefix',
  },
];
type SourceMetadata = {
  parse: 'missing' | 'opaque' | 'json';
  /** Undefined is unknown, distinct from an explicitly declared guest/null owner. */
  declaredOwner: string | null | undefined;
  /** No current-season default, coercion or eligibility decision is applied. */
  originalSeasonNumber: number | undefined;
};
export type ProgressRecoverySource = {
  key: string;
  kind: SourceKind;
  namespace: StorageNamespace;
  /** Exact UTF-16 source value; null records an explicitly requested absent key. */
  raw: string | null;
  observed: SourceMetadata;
};
const ruleMatches = (rule: SourceRule, key: string): boolean => {
  if (rule.match === 'exact') return rule.key === key;
  return key.startsWith(rule.key) && key.length > rule.key.length;
};
const sourceRule = (key: string): SourceRule => {
  // This overlapping prefix holds a key pointer/removal intent, not progress bytes.
  if (key.startsWith(STORAGE_KEYS.progressQuarantineRemovalMarkerPrefix))
    throw new ProgressRecoveryBundleError('key');
  const rule = progressRecoverySourceInventory.find((candidate) => ruleMatches(candidate, key));
  if (!rule) throw new ProgressRecoveryBundleError('key');
  return rule;
};
const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};
const observedOwner = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};
const isSeasonNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const observedSeason = (value: unknown): number | undefined =>
  isSeasonNumber(value) ? value : undefined;
const jsonMetadata = (raw: string, kind: SourceKind): SourceMetadata => {
  const parsed = asRecord(JSON.parse(raw));
  if (kind === 'superseded')
    return {
      parse: 'json',
      declaredOwner: observedOwner(parsed.ownerId),
      originalSeasonNumber: observedSeason(parsed.seasonNumber),
    };
  const data = Object.hasOwn(parsed, 'data') ? asRecord(parsed.data) : parsed;
  return {
    parse: 'json',
    declaredOwner: observedOwner(parsed._userId),
    originalSeasonNumber: observedSeason(data.seasonalSeasonNumber),
  };
};
const sourceMetadata = (raw: string | null, kind: SourceKind): SourceMetadata => {
  const unknown = { declaredOwner: undefined, originalSeasonNumber: undefined };
  if (raw === null) return { parse: 'missing', ...unknown };
  try {
    return jsonMetadata(raw, kind);
  } catch {
    return { parse: 'opaque', ...unknown };
  }
};
const makeSource = (key: string, raw: string | null): ProgressRecoverySource => {
  const rule = sourceRule(key);
  return {
    key,
    kind: rule.kind,
    namespace: rule.namespace,
    raw,
    observed: sourceMetadata(raw, rule.kind),
  };
};
/** No enumeration, writes, fallback or inaccessible-as-absent handling. Caller supplies progress keys. */
export const captureProgressRecoverySources = (
  storage: Pick<Storage, 'getItem'>,
  keys: readonly string[]
): ProgressRecoverySource[] => {
  const selected = [...new Set(keys)];
  selected.forEach(sourceRule); // Validate every key before reading any value.
  return selected.map((key) => makeSource(key, storage.getItem(key)));
};
const requireSource = (valid: boolean): void => {
  if (!valid) throw new ProgressRecoveryBundleError('source');
};
/** Validate metadata against retained bytes without rewriting either; malformed raw remains exportable. */
export const validateProgressRecoverySources = (value: unknown): ProgressRecoverySource[] => {
  requireSource(Array.isArray(value));
  const sources = value as ProgressRecoverySource[];
  sources.forEach(validateSource);
  requireSource(new Set(sources.map((source) => source.key)).size === sources.length);
  return sources;
};
const validateSource = (value: unknown): void => {
  const source = asRecord(value);
  requireSource(typeof source.key === 'string');
  requireSource(source.raw === null || typeof source.raw === 'string');
  const expected = makeSource(source.key as string, source.raw as string | null);
  requireSource(source.kind === expected.kind && source.namespace === expected.namespace);
  const observed = asRecord(source.observed);
  requireSource(observed.parse === expected.observed.parse);
  requireSource(observed.declaredOwner === expected.observed.declaredOwner);
  requireSource(observed.originalSeasonNumber === expected.observed.originalSeasonNumber);
};
