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
import { isPlainObject } from './deepMerge';
import type { OverlayData } from './overlayTypes';
import type { TaskCounterDerivation } from '@/types/tarkov';
/** Game-rules revisions whose counter mappings this consumer applies. */
export const SUPPORTED_COUNTER_REVISIONS: ReadonlySet<string> = new Set(['1.1.0']);
const COUNTER_MODES: ReadonlySet<string> = new Set(['regular', 'pve', 'pvp-season']);
const ENTRY_KEYS = ['revision', 'verification', 'coverage', 'derivation', 'proof'];
const DERIVATION_KEYS = ['type', 'taskIds'];
const PROOF_LINK = /^https?:\/\/\S+$/;
type CounterEntry = {
  revision: string;
  verification: 'verified' | 'unresolved';
  coverage: 'complete' | 'partial';
  derivation: TaskCounterDerivation;
  proof: string[];
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
const validDerivation = (value: unknown): boolean =>
  isPlainObject(value) &&
  [
    hasExactKeys(value, DERIVATION_KEYS),
    value.type === 'distinctTaskCompletions',
    uniqueList(value.taskIds, nonEmpty),
  ].every(Boolean);
const validEntry = (entry: unknown): boolean =>
  isPlainObject(entry) &&
  [
    hasExactKeys(entry, ENTRY_KEYS),
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
/** Contributor lists by `variableId` for one mode; empty unless the registry is valid. */
export const usableCounterDerivations = (
  overlay: Pick<OverlayData, 'progressionCounters'>,
  mode: string
): Map<string, string[]> => {
  const registry = overlay.progressionCounters;
  if (!validProgressionCounters(registry) || !Object.hasOwn(registry, mode)) return new Map();
  return new Map(
    Object.entries(registry[mode]!)
      .filter(([, entry]) => isUsable(entry))
      .map(([variableId, entry]) => [variableId, entry.derivation.taskIds])
  );
};
type TaskWithGates = { id: string; otherRequirements?: unknown };
/**
 * The registry is the only source of a derivation: any `counter` already on a gate (for example
 * from a task correction) is replaced, and one is attached only when every contributor exists in
 * the same task list, since a missing contributor could never be completed.
 */
const withCounter = (
  requirement: unknown,
  derivations: Map<string, string[]>,
  taskIds: ReadonlySet<string>
): unknown => {
  if (!isPlainObject(requirement) || requirement.type !== 'globalVariable') return requirement;
  const gate: Record<string, unknown> = { ...requirement };
  delete gate.counter;
  const contributors = derivations.get(String(gate.variableId));
  if (!contributors?.every((id) => taskIds.has(id))) return gate;
  return { ...gate, counter: { type: 'distinctTaskCompletions', taskIds: [...contributors] } };
};
export const attachCounterDerivations = <T extends TaskWithGates>(
  tasks: T[],
  derivations: Map<string, string[]>
): T[] => {
  const taskIds = new Set(tasks.map((task) => task.id));
  return tasks.map((task) =>
    Array.isArray(task.otherRequirements)
      ? {
          ...task,
          otherRequirements: task.otherRequirements.map((requirement) =>
            withCounter(requirement, derivations, taskIds)
          ),
        }
      : task
  );
};
