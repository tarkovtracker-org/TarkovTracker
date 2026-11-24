import {
  TASK_SECONDARY_VIEWS,
  type TaskPrimaryView,
  type TaskSecondaryView,
} from '@/types/taskFilter';
import { TASK_SORT_MODES, type TaskSortMode } from '@/types/taskSort';
import { readSelectValue } from '@/utils/selectValue';
const VALID_SORT_MODES = new Set<TaskSortMode>(TASK_SORT_MODES);
const VALID_SECONDARY_VIEWS = new Set<TaskSecondaryView>(TASK_SECONDARY_VIEWS);
export const normalizeSortMode = (value: unknown): TaskSortMode => {
  const candidate = readSelectValue(value);
  if (typeof candidate === 'string' && VALID_SORT_MODES.has(candidate as TaskSortMode)) {
    return candidate as TaskSortMode;
  }
  return 'none';
};
export const normalizeSecondaryView = (value: unknown): TaskSecondaryView => {
  const candidate = readSelectValue(value);
  if (typeof candidate === 'string' && VALID_SECONDARY_VIEWS.has(candidate as TaskSecondaryView)) {
    return candidate as TaskSecondaryView;
  }
  return 'all';
};
export const getTaskSecondaryViewForPrimaryView = (
  primaryView: TaskPrimaryView | string | null | undefined,
  value: unknown
): TaskSecondaryView => {
  if (primaryView === 'graph') {
    return 'all';
  }
  return normalizeSecondaryView(value);
};
