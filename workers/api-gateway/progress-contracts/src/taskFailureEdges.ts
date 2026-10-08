import {
  acceptsActiveStatus,
  acceptsCompletionStatus,
  acceptsFailedStatus,
  normalizeRequirementStatuses,
} from './requirementStatus.js';
type FailureRule = { task?: unknown; status?: string[] };
type FailureSource = {
  id: string;
  failConditions?: unknown;
  taskRequirements?: FailureRule[];
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
/** Raw JSON uses string references; hydrated browser metadata uses { id }. */
export function getTaskReferenceId(value: unknown): string | undefined {
  const id = isRecord(value) ? value.id : value;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}
function failureRules(value: unknown): FailureRule[] {
  const entries = isRecord(value) ? Object.values(value) : value;
  return Array.isArray(entries) ? entries.filter(isRecord) : [];
}
const isActiveOnly = (status?: string[]): boolean => {
  const normalized = normalizeRequirementStatuses(status);
  return (
    acceptsActiveStatus(normalized) &&
    !acceptsCompletionStatus(normalized) &&
    !acceptsFailedStatus(normalized)
  );
};
const hasCompletionFailure = (task: FailureSource | undefined, triggerId: string): boolean =>
  failureRules(task?.failConditions).some(
    (rule) =>
      getTaskReferenceId(rule.task) === triggerId &&
      acceptsCompletionStatus(normalizeRequirementStatuses(rule.status))
  );
function activeAlternativeSources(
  task: FailureSource,
  byId: ReadonlyMap<string, FailureSource>
): string[] {
  return (task.taskRequirements ?? []).flatMap((requirement) => {
    const id = getTaskReferenceId(requirement?.task);
    if (!id) return [];
    if (!isActiveOnly(requirement?.status) || !hasCompletionFailure(byId.get(id), task.id))
      return [];
    return [id];
  });
}
function completionTriggers(task: FailureSource): (string | undefined)[] {
  return failureRules(task.failConditions)
    .filter((rule) => acceptsCompletionStatus(normalizeRequirementStatuses(rule.status)))
    .map((rule) => getTaskReferenceId(rule.task));
}
function isEdgeTrigger(
  trigger: string | undefined,
  target: string,
  byId: ReadonlyMap<string, FailureSource>
): trigger is string {
  return typeof trigger === 'string' && trigger !== target && byId.has(trigger);
}
/**
 * Compatibility projection for existing invalidation, repair and action consumers.
 * An edge trigger -> target means completing trigger makes target fail. Reverse edges
 * are added only for the browser's existing active-only requirement pattern.
 * Runtime-free; do not infer branch relationships from failed-only requirements.
 */
export function buildTaskFailureAlternatives(
  tasks: readonly FailureSource[]
): Record<string, string[]> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const edges = new Map<string, Set<string>>();
  const addEdge = (trigger: string | undefined, target: string) => {
    if (!isEdgeTrigger(trigger, target, byId)) return;
    const targets = edges.get(trigger) ?? new Set<string>();
    targets.add(target);
    edges.set(trigger, targets);
  };
  for (const task of tasks) {
    [...activeAlternativeSources(task, byId), ...completionTriggers(task)].forEach((trigger) =>
      addEdge(trigger, task.id)
    );
  }
  return Object.fromEntries([...edges].map(([id, targets]) => [id, [...targets]]));
}
