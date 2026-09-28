import { compareRequirement } from '@/utils/taskRequirements';
import type { Task, TaskOtherRequirement, RequirementComparison } from '@/types/tarkov';
const comparisons = new Set(['>=', '>', '<=', '<', '=', '==', '!=']);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const traderId = (value: unknown): unknown => (isRecord(value) ? value.id : value);
const normalizeVariable = (raw: Record<string, unknown>): TaskOtherRequirement => {
  const valid = [
    isId(raw.id),
    isId(raw.variableId),
    comparisons.has(String(raw.compareMethod)),
    typeof raw.value === 'number' && Number.isFinite(raw.value),
  ].every(Boolean);
  if (!valid) return { type: 'unknown' };
  return {
    type: 'globalVariable',
    id: raw.id as string,
    variableId: raw.variableId as string,
    compareMethod: raw.compareMethod as RequirementComparison,
    value: raw.value as number,
  };
};
const normalizeDialogue = (raw: Record<string, unknown>): TaskOtherRequirement => {
  if (!isId(raw.id) || !Array.isArray(raw.traders)) return { type: 'unknown' };
  const traders = raw.traders.map(traderId);
  if (!traders.length || !traders.every(isId)) return { type: 'unknown' };
  return { type: 'dialogue', id: raw.id, traders };
};
/** Fails closed while keeping the upstream discriminator for diagnostics and future support. */
const unsupported = (raw: Record<string, unknown>): TaskOtherRequirement =>
  isId(raw.type) && raw.type !== 'unknown'
    ? { type: 'unknown', upstreamType: raw.type }
    : isId(raw.upstreamType)
      ? { type: 'unknown', upstreamType: raw.upstreamType }
      : { type: 'unknown' };
const normalizeSupported = (raw: Record<string, unknown>): TaskOtherRequirement => {
  if (raw.type === 'globalVariable') return normalizeVariable(raw);
  if (raw.type === 'dialogue') return normalizeDialogue(raw);
  return { type: 'unknown' };
};
const normalizeOtherRequirement = (raw: unknown): TaskOtherRequirement => {
  if (!isRecord(raw)) return { type: 'unknown' };
  const normalized = normalizeSupported(raw);
  return normalized.type === 'unknown' ? unsupported(raw) : normalized;
};
/** Missing optional gates are absent; malformed or unsupported gates stay explicitly unknown. */
export const normalizeOtherRequirements = (raw: unknown): TaskOtherRequirement[] => {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return [{ type: 'unknown' }];
  return Array.from(raw, normalizeOtherRequirement);
};
/** Confirmation is task-local and bound to the exact supported start requirements, not a counter. */
export const otherRequirementsSignature = (task: Task): string | undefined => {
  const requirements = normalizeOtherRequirements(task.otherRequirements);
  if (!requirements.length || requirements.some((requirement) => requirement.type === 'unknown'))
    return undefined;
  return JSON.stringify(requirements);
};
export const globalVariableRequirementMet = (
  requirement: Extract<TaskOtherRequirement, { type: 'globalVariable' }>,
  values: Record<string, number> = {}
): boolean | undefined => {
  if (!Object.prototype.hasOwnProperty.call(values, requirement.variableId)) return undefined;
  const current = values[requirement.variableId];
  if (typeof current !== 'number' || !Number.isFinite(current)) return undefined;
  return compareRequirement(current, requirement.compareMethod, requirement.value);
};
