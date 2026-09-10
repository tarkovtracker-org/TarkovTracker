import type {
  NormalizedTraderRequirement,
  RequirementComparison,
  Task,
  TaskRequirementDiagnostic,
} from '@/types/tarkov';
const comparisons = new Set(['>=', '>', '<=', '<', '=', '==', '!=']);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const comparators: Record<RequirementComparison, (current: number, required: number) => boolean> = {
  '>=': (current, required) => current >= required,
  '>': (current, required) => current > required,
  '<=': (current, required) => current <= required,
  '<': (current, required) => current < required,
  '=': (current, required) => current === required,
  '==': (current, required) => current === required,
  '!=': (current, required) => current !== required,
};
export const compareRequirement = (
  current: number,
  method: RequirementComparison,
  required: number
): boolean => {
  if (![current, required].every(Number.isFinite)) return false;
  return comparators[method]?.(current, required) ?? false;
};
export const normalizeTraderReference = (trader: unknown): unknown =>
  typeof trader === 'string' ? { id: trader, name: trader } : trader;
const isValidTrader = (trader: unknown): trader is { id: string; name?: string } => {
  if (!isRecord(trader)) return false;
  return typeof trader.id === 'string' && trader.id.trim().length > 0;
};
export const MAX_TRADER_LEVEL = 4;
export const isValidTraderLevel = (value: number): boolean =>
  Number.isInteger(value) && value >= 1 && value <= MAX_TRADER_LEVEL;
const isValidValue = (value: unknown, type: string): value is number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  return type !== 'level' || isValidTraderLevel(value);
};
type UnknownReason = Extract<NormalizedTraderRequirement, { requirementType: 'unknown' }>['reason'];
const comparisonMethod = (raw: Record<string, unknown>) => raw.compareMethod ?? '>=';
const normalizeTraderName = (trader: { id: string; name?: unknown }) => ({
  id: trader.id,
  name: typeof trader.name === 'string' ? trader.name : trader.id,
});
const validComparisonMethod = (raw: Record<string, unknown>) => {
  const method = comparisonMethod(raw);
  return typeof method === 'string' && comparisons.has(method);
};
const invalidRequirementReason = (raw: Record<string, unknown>): UnknownReason | undefined => {
  if (!['level', 'reputation'].includes(String(raw.requirementType))) return 'type';
  if (!validComparisonMethod(raw)) return 'comparison';
  if (!isValidTrader(raw.trader)) return 'trader';
  return undefined;
};
const requirementValue = (raw: Record<string, unknown>): unknown =>
  raw.requirementType === 'level' ? (raw.level ?? raw.value) : raw.value;
const requirementId = (raw: unknown, index: number): string =>
  isRecord(raw) && typeof raw.id === 'string' ? raw.id : `trader-requirement-${index}`;
// The server calls this after reference adaptation, and again when an overlay replaces requirements.
// Missing types are never guessed from a trader, sign or value. Missing comparison is the legacy >=.
export const normalizeTraderRequirement = (
  raw: unknown,
  index: number
): NormalizedTraderRequirement => {
  const id = requirementId(raw, index);
  if (!isRecord(raw)) return { id, requirementType: 'unknown', reason: 'shape' };
  const adapted: Record<string, unknown> = { ...raw, trader: normalizeTraderReference(raw.trader) };
  const reason = invalidRequirementReason(adapted);
  if (reason) return { id, requirementType: 'unknown', reason };
  const value = requirementValue(adapted);
  if (!isValidValue(value, String(adapted.requirementType)))
    return { id, requirementType: 'unknown', reason: 'value' };
  const trader = adapted.trader as { id: string; name?: unknown };
  return {
    id,
    requirementType: raw.requirementType as 'level' | 'reputation',
    compareMethod: comparisonMethod(raw) as RequirementComparison,
    value,
    trader: normalizeTraderName(trader),
  };
};
export const normalizeTraderRequirements = (raw: unknown): NormalizedTraderRequirement[] => {
  if (raw === undefined) return [];
  return Array.isArray(raw)
    ? raw.map((value, index) => normalizeTraderRequirement(value, index))
    : [normalizeTraderRequirement(raw, 0)];
};
export const getTaskTraderRequirements = (task: Task): NormalizedTraderRequirement[] => {
  if (task.normalizedTraderRequirements) return task.normalizedTraderRequirements;
  return [
    ...(task.traderLevelRequirements ?? []).map((req) => ({
      ...req,
      requirementType: req.requirementType ?? 'level',
    })),
    ...(task.traderRequirements ?? []),
  ].map((value, index) => normalizeTraderRequirement(value, index));
};
// `null` and `undefined` are how the source spells "no gate here". Every other value is a gate the
// source declared, so it has to survive normalization or be reported rather than quietly disappear.
export const isDeclaredGate = (value: unknown): boolean => value !== null && value !== undefined;
// json.tarkov.dev may serialize requiredPrestige as a bare id string or as an object ref.
// Accept both shapes.
const nonemptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const declaredId = (value: unknown): string | undefined => {
  if (!isRecord(value) || value.id == null) return undefined;
  const id = String(value.id);
  return nonemptyString(id) ? id : undefined;
};
export const resolveRequiredPrestige = (value: unknown): { id: string } | undefined => {
  if (nonemptyString(value)) return { id: value };
  const id = declaredId(value);
  return id ? { id } : undefined;
};
/** A declared prerequisite collection has to be a list; a bare object is not an empty list. */
export const hasMalformedTaskRequirements = (value: unknown): boolean =>
  isDeclaredGate(value) && !Array.isArray(value);
// The published overlay declares the prestige gate of an injected task as `{ name, prestigeLevel }`
// with no id. `applyOverlay` keeps that reference verbatim, so nothing is lost and there is nothing
// to report; the gate itself is resolved from the task id by `buildPrestigeTaskMap`.
export const hasDeclaredPrestigeLevel = (value: unknown): boolean =>
  isRecord(value) && Number.isFinite(value.prestigeLevel);
const hasUnresolvablePrestigeReference = (value: unknown): boolean =>
  isDeclaredGate(value) && !resolveRequiredPrestige(value);
/**
 * Diagnostics for the declared gates a caller had to drop. `tarkov-json.ts` models
 * `requiredPrestige` as an id reference only, so every other declared reference is dropped and
 * reported here. `overlay.ts` keeps some references verbatim and derives its own diagnostics from
 * what it actually dropped.
 */
export const taskRequirementDiagnostics = (raw: {
  requiredPrestige?: unknown;
  taskRequirements?: unknown;
}): TaskRequirementDiagnostic[] => [
  ...(hasMalformedTaskRequirements(raw.taskRequirements) ? (['task_requirement'] as const) : []),
  ...(hasUnresolvablePrestigeReference(raw.requiredPrestige)
    ? (['prestige_reference'] as const)
    : []),
];
