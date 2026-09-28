/**
 * Task-requirement status predicates shared by the app, server routes, and api-gateway Worker.
 *
 * Runtime-independent: must not import Nuxt, Vue, or Worker modules. Predicates taking
 * `normalized` expect lowercase statuses from `normalizeRequirementStatuses`.
 */
const COMPLETION_OR_ACTIVE_STATUSES = ['complete', 'completed', 'active', 'accept', 'accepted'];
const COMPLETION_STATUSES = ['complete', 'completed'];
const ACTIVE_STATUSES = ['active', 'accept', 'accepted'];
export const normalizeRequirementStatuses = (statuses?: readonly string[]): string[] =>
  (statuses ?? []).map((status) => status.toLowerCase());
const hasAnyStatus = (normalized: readonly string[], values: readonly string[]): boolean =>
  values.some((value) => normalized.includes(value));
/** An empty status list means "must be complete or active" (upstream default). */
export const requiresCompletionOrActive = (normalized: readonly string[]): boolean =>
  normalized.length === 0 || hasAnyStatus(normalized, COMPLETION_OR_ACTIVE_STATUSES);
export const acceptsFailedStatus = (normalized: readonly string[]): boolean =>
  normalized.includes('failed');
export const acceptsCompletionStatus = (normalized: readonly string[]): boolean =>
  hasAnyStatus(normalized, COMPLETION_STATUSES);
export const acceptsActiveStatus = (normalized: readonly string[]): boolean =>
  hasAnyStatus(normalized, ACTIVE_STATUSES);
/** The requirement is satisfied only by a failed prerequisite (e.g. `status: ['failed']`). */
export const isFailedOnlyStatus = (normalized: readonly string[]): boolean =>
  acceptsFailedStatus(normalized) && !hasAnyStatus(normalized, COMPLETION_OR_ACTIVE_STATUSES);
export const isFailedOnlyRequirement = (statuses?: readonly string[]): boolean =>
  isFailedOnlyStatus(normalizeRequirementStatuses(statuses));
