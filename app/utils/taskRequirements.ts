import type { NormalizedTraderRequirement, RequirementComparison, Task } from '@/types/tarkov';
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
const isValidTrader = (trader: unknown): trader is { id: string; name?: string } => {
  if (!isRecord(trader)) return false;
  return typeof trader.id === 'string' && trader.id.trim().length > 0;
};
const isValidValue = (value: unknown, type: string): value is number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  return type !== 'level' || [1, 2, 3, 4].includes(value);
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
  const reason = invalidRequirementReason(raw);
  if (reason) return { id, requirementType: 'unknown', reason };
  const value = requirementValue(raw);
  if (!isValidValue(value, String(raw.requirementType)))
    return { id, requirementType: 'unknown', reason: 'value' };
  const trader = raw.trader as { id: string; name?: unknown };
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
