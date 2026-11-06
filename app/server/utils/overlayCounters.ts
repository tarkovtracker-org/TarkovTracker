/**
 * Consumer for the overlay's `progressionCounters` registry.
 *
 * The registry maps a global-variable gate (`variableId`) to the tasks whose completions derive its
 * value. Only `verified`/`complete` entries for a game-rules revision this tracker deliberately
 * supports are applied; `unresolved`/`partial` entries are valid but informational. A malformed
 * registry is applied nowhere and stays reported as an unconsumed section, which blocks precompute.
 *
 * Contract: https://github.com/tarkovtracker-org/tarkov-data-overlay/blob/main/docs/GLOBAL_VARIABLES.md
 */
import {
  copyCounterGroup,
  counterTaskIds,
  isCounterGroups,
  isCounterTaskIds,
} from '@/utils/taskCounters';
import { isPlainObject } from './deepMerge';
import type { OverlayData } from './overlayTypes';
import type { TaskCounterDerivation, TaskProgressionPool } from '@/types/tarkov';
/** Game-rules revisions whose counter mappings this consumer applies. */
export const SUPPORTED_COUNTER_REVISIONS: ReadonlySet<string> = new Set(['1.1.0']);
const COUNTER_MODES: ReadonlySet<string> = new Set(['regular', 'pve', 'pvp-season']);
const ENTRY_KEYS = ['revision', 'verification', 'coverage', 'derivation', 'proof'];
/** Exact keys per derivation type; an unknown type invalidates the whole registry. */
const DERIVATION_KEYS: Record<string, string[]> = {
  distinctTaskCompletions: ['type', 'taskIds'],
  taskGroupCompletions: ['type', 'groups'],
};
const PROOF_LINK = /^https?:\/\/\S+$/;
type CounterEntry = {
  revision: string;
  verification: 'verified' | 'unresolved';
  coverage: 'complete' | 'partial';
  derivation: TaskCounterDerivation;
  proof: string[];
  pool?: Pick<TaskProgressionPool, 'traderId' | 'loyaltyLevel'>;
};
type CounterRegistry = Record<string, Record<string, CounterEntry>>;
const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const isProofLink = (value: unknown): boolean => nonEmpty(value) && PROOF_LINK.test(value);
const hasExactKeys = (value: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const uniqueList = (value: unknown, valid: (entry: unknown) => boolean): boolean =>
  Array.isArray(value) &&
  [value.length > 0, value.every(valid), new Set(value).size === value.length].every(Boolean);
const validContributors = (value: Record<string, unknown>): boolean =>
  value.type === 'taskGroupCompletions'
    ? isCounterGroups(value.groups)
    : isCounterTaskIds(value.taskIds);
const validDerivation = (value: unknown): boolean =>
  isPlainObject(value) &&
  Object.hasOwn(DERIVATION_KEYS, String(value.type)) &&
  hasExactKeys(value, DERIVATION_KEYS[String(value.type)]!) &&
  validContributors(value);
const validPool = (pool: unknown): boolean =>
  isPlainObject(pool) &&
  [
    hasExactKeys(pool, ['traderId', 'loyaltyLevel']),
    nonEmpty(pool.traderId),
    [1, 2, 3, 4].includes(pool.loyaltyLevel as number),
  ].every(Boolean);
const validEntryKeys = (entry: Record<string, unknown>): boolean =>
  Object.hasOwn(entry, 'pool')
    ? hasExactKeys(entry, [...ENTRY_KEYS, 'pool']) && validPool(entry.pool)
    : hasExactKeys(entry, ENTRY_KEYS);
const validEntry = (entry: unknown): boolean =>
  isPlainObject(entry) &&
  [
    validEntryKeys(entry),
    nonEmpty(entry.revision),
    ['verified', 'unresolved'].includes(entry.verification as string),
    ['complete', 'partial'].includes(entry.coverage as string),
    validDerivation(entry.derivation),
    uniqueList(entry.proof, isProofLink),
  ].every(Boolean);
const validModeEntries = (entries: unknown): boolean =>
  isPlainObject(entries) &&
  Object.entries(entries).every(([variableId, entry]) => nonEmpty(variableId) && validEntry(entry));
/** Mirrors the overlay's `progression-counter.schema.json`; `{}` is a valid empty registry. */
export const validProgressionCounters = (value: unknown): value is CounterRegistry =>
  isPlainObject(value) &&
  Object.entries(value).every(
    ([mode, entries]) => COUNTER_MODES.has(mode) && validModeEntries(entries)
  );
const isUsable = (entry: CounterEntry): boolean =>
  [
    entry.verification === 'verified',
    entry.coverage === 'complete',
    SUPPORTED_COUNTER_REVISIONS.has(entry.revision),
  ].every(Boolean);
/** Derivations by `variableId` for one mode; empty unless the registry is valid. */
export const usableCounterDerivations = (
  overlay: Pick<OverlayData, 'progressionCounters'>,
  mode: string
): Map<string, TaskCounterDerivation> => {
  const registry = overlay.progressionCounters;
  if (!validProgressionCounters(registry) || !Object.hasOwn(registry, mode)) return new Map();
  return new Map(
    Object.entries(registry[mode]!)
      .filter(([, entry]) => isUsable(entry))
      .map(([variableId, entry]) => [variableId, entry.derivation])
  );
};
/** Informational pools use only supported revisions, including unresolved entries. */
export const progressionPools = (
  overlay: Pick<OverlayData, 'progressionCounters'>,
  mode: string
): Map<string, TaskProgressionPool> => {
  const registry = overlay.progressionCounters;
  if (!validProgressionCounters(registry) || !Object.hasOwn(registry, mode)) return new Map();
  return new Map(
    Object.entries(registry[mode]!).flatMap(([id, entry]) =>
      entry.pool && SUPPORTED_COUNTER_REVISIONS.has(entry.revision)
        ? [
            [
              id,
              {
                ...entry.pool,
                verification: entry.verification,
                coverage: entry.coverage,
                derivation: entry.derivation,
              },
            ] as [string, TaskProgressionPool],
          ]
        : []
    )
  );
};
type TaskWithGates = { id: string; otherRequirements?: unknown };
/** A fresh copy, so attached gates never share arrays with the registry or each other. */
const copyDerivation = (derivation: TaskCounterDerivation): TaskCounterDerivation =>
  derivation.type === 'taskGroupCompletions'
    ? { type: derivation.type, groups: derivation.groups.map(copyCounterGroup) }
    : { type: derivation.type, taskIds: [...derivation.taskIds] };
const existingDerivation = (
  derivation: TaskCounterDerivation | undefined,
  taskIds: ReadonlySet<string>
): TaskCounterDerivation | undefined =>
  derivation && counterTaskIds(derivation).every((id) => taskIds.has(id))
    ? copyDerivation(derivation)
    : undefined;
const existingPool = (
  pool: TaskProgressionPool | undefined,
  taskIds: ReadonlySet<string>
): TaskProgressionPool | undefined => {
  const derivation = existingDerivation(pool?.derivation, taskIds);
  return pool && derivation ? { ...pool, derivation } : undefined;
};
/**
 * The registry is the only source of a derivation: any `counter` already on a gate (for example
 * from a task correction) is replaced, and one is attached only when every contributor exists in
 * the same task list, since a missing contributor could never be completed.
 */
const isVariableGate = (requirement: unknown): requirement is Record<string, unknown> =>
  isPlainObject(requirement) && requirement.type === 'globalVariable';
const withCounter = (
  requirement: unknown,
  derivations: Map<string, TaskCounterDerivation>,
  taskIds: ReadonlySet<string>,
  pools: Map<string, TaskProgressionPool>
): unknown => {
  if (!isVariableGate(requirement)) return requirement;
  const gate: Record<string, unknown> = { ...requirement };
  delete gate.counter;
  delete gate.taskPool;
  const taskPool = existingPool(pools.get(String(gate.variableId)), taskIds);
  const counter = existingDerivation(derivations.get(String(gate.variableId)), taskIds);
  return { ...gate, ...(taskPool ? { taskPool } : {}), ...(counter ? { counter } : {}) };
};
export const attachCounterDerivations = <T extends TaskWithGates>(
  tasks: T[],
  derivations: Map<string, TaskCounterDerivation>,
  pools: Map<string, TaskProgressionPool> = new Map()
): T[] => {
  const taskIds = new Set(tasks.map((task) => task.id));
  return tasks.map((task) =>
    Array.isArray(task.otherRequirements)
      ? {
          ...task,
          otherRequirements: task.otherRequirements.map((requirement) =>
            withCounter(requirement, derivations, taskIds, pools)
          ),
        }
      : task
  );
};
