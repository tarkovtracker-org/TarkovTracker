import { isPlainObject } from './deepMerge';
import { VALID_GAME_MODES } from './tarkov-cache-config';
const hasExactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const isEmptyRecord = (value: unknown): boolean =>
  isPlainObject(value) && Object.keys(value).length === 0;
const isInactiveMode = (value: unknown): boolean =>
  hasExactKeys(value, ['tasks', 'objectives']) &&
  isEmptyRecord(value.tasks) &&
  isEmptyRecord(value.objectives);
/**
 * The initial identity ledger has no mappings to apply. Recognize only that exact
 * v1 contract until #1302 wires aliases through every progress/catalog consumer.
 * Populated or malformed ledgers must remain unconsumed to preserve last-good KV.
 */
export const isInactiveTaskIdAliases = (value: unknown): boolean => {
  if (!hasExactKeys(value, ['schemaVersion', 'modes'])) return false;
  if (value.schemaVersion !== 1 || !hasExactKeys(value.modes, VALID_GAME_MODES)) return false;
  return Object.values(value.modes).every(isInactiveMode);
};
