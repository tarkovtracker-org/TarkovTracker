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
const namedRef = (value: unknown): { id: string; name?: string } | undefined => {
  if (!isRecord(value) || !isId(value.id)) return undefined;
  return typeof value.name === 'string' ? { id: value.id, name: value.name } : { id: value.id };
};
const normalizeStoryObjective = (raw: Record<string, unknown>): TaskOtherRequirement => {
  const storyChapter = namedRef(raw.storyChapter);
  const objective = namedRef(raw.objective);
  if (!isId(raw.id) || !storyChapter || !objective) return { type: 'unknown' };
  return { type: 'storyObjective', id: raw.id, storyChapter, objective };
};
const NORMALIZERS: Record<string, (raw: Record<string, unknown>) => TaskOtherRequirement> = {
  globalVariable: normalizeVariable,
  dialogue: normalizeDialogue,
  storyObjective: normalizeStoryObjective,
};
const normalizeSupported = (raw: Record<string, unknown>): TaskOtherRequirement =>
  Object.hasOwn(NORMALIZERS, String(raw.type))
    ? NORMALIZERS[String(raw.type)]!(raw)
    : { type: 'unknown' };
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
/** Server-side gates a player confirms from in-game observation (story gates are tracked progress). */
const isConfirmable = (requirement: TaskOtherRequirement): boolean =>
  requirement.type === 'globalVariable' || requirement.type === 'dialogue';
export const hasUnsupportedOtherRequirement = (task: Task): boolean =>
  normalizeOtherRequirements(task.otherRequirements).some(
    (requirement) => requirement.type === 'unknown'
  );
export const otherRequirementsSignature = (task: Task): string | undefined => {
  const requirements = normalizeOtherRequirements(task.otherRequirements);
  if (requirements.some((requirement) => requirement.type === 'unknown')) return undefined;
  const confirmable = requirements.filter(isConfirmable);
  return confirmable.length ? JSON.stringify(confirmable) : undefined;
};
/** Story objectives a task's overlay gates name, for Mark available to record. */
export const storyObjectiveRequirements = (task: Task) =>
  normalizeOtherRequirements(task.otherRequirements).flatMap((requirement) =>
    requirement.type === 'storyObjective' ? [requirement] : []
  );
export const globalVariableRequirementMet = (
  requirement: Extract<TaskOtherRequirement, { type: 'globalVariable' }>,
  values: Record<string, number> = {}
): boolean | undefined => {
  if (!Object.prototype.hasOwnProperty.call(values, requirement.variableId)) return undefined;
  const current = values[requirement.variableId];
  if (typeof current !== 'number' || !Number.isFinite(current)) return undefined;
  return compareRequirement(current, requirement.compareMethod, requirement.value);
};
