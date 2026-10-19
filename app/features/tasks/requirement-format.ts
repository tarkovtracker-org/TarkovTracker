import type {
  RequirementCurrentStatus,
  RequirementExpectedStatus,
} from '@/features/tasks/task-requirement-helpers';
import type { RequirementComparison } from '@/types/tarkov';
export type RequirementTranslate = (key: string, params?: Record<string, unknown>) => string;
const COMPARISON_KEYS: Record<RequirementComparison, string> = {
  '>=': 'at_least',
  '>': 'above',
  '<=': 'at_most',
  '<': 'below',
  '=': 'exactly',
  '==': 'exactly',
  '!=': 'not_equal',
};
const EXPECTED_STATUS_KEYS: Record<RequirementExpectedStatus, string> = {
  completed: 'common.status_completed',
  active: 'page.tasks.questcard.requirement_status_active',
  failed: 'common.status_failed',
};
const CURRENT_STATUS_KEYS: Record<RequirementCurrentStatus, string> = {
  ...EXPECTED_STATUS_KEYS,
  available: 'page.tasks.questcard.requirement_status_available',
  not_started: 'page.tasks.questcard.requirement_status_not_started',
};
const ACTION_KEYS: Record<RequirementExpectedStatus, string> = {
  completed: 'common.complete',
  active: 'common.accept',
  failed: 'common.fail',
};
const joinWithOr = (t: RequirementTranslate, values: string[]) =>
  values.join(` ${t('page.tasks.questcard.keys_or')} `);
export const formatComparison = (
  t: RequirementTranslate,
  method: RequirementComparison | undefined,
  value: number | string
): string =>
  t(`page.tasks.requirements.comparison_${COMPARISON_KEYS[method ?? '>='] ?? 'at_least'}`, {
    value,
  });
export const formatReputation = (value: number | undefined): string => (value ?? 0).toFixed(2);
export const formatExpectedStatuses = (
  t: RequirementTranslate,
  statuses: RequirementExpectedStatus[]
): string =>
  joinWithOr(
    t,
    [...new Set(statuses)].map((status) => t(EXPECTED_STATUS_KEYS[status]))
  );
export const formatCurrentStatus = (
  t: RequirementTranslate,
  status: RequirementCurrentStatus
): string => t(CURRENT_STATUS_KEYS[status]);
export const formatActionVerbs = (
  t: RequirementTranslate,
  statuses: RequirementExpectedStatus[]
): string =>
  joinWithOr(
    t,
    [...new Set(statuses)].map((status) => t(ACTION_KEYS[status]))
  );
const TERMINAL_CONFLICTS: Partial<Record<RequirementCurrentStatus, RequirementExpectedStatus>> = {
  completed: 'failed',
  failed: 'completed',
};
export const isRequirementConflict = (
  expected: RequirementExpectedStatus[],
  current: RequirementCurrentStatus
): boolean => {
  const blockedBy = TERMINAL_CONFLICTS[current];
  return Boolean(blockedBy) && expected.length > 0 && expected.every((s) => s === blockedBy);
};
