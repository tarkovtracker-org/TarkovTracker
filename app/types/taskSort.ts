export const TASK_SORT_MODES = [
  'none',
  'impact',
  'alphabetical',
  'level',
  'trader',
  'teammates',
  'xp',
] as const;
export type TaskSortMode = (typeof TASK_SORT_MODES)[number];
export const TASK_SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type TaskSortDirection = (typeof TASK_SORT_DIRECTIONS)[number];
export const isValidSortMode = (value: string | undefined): value is TaskSortMode =>
  typeof value === 'string' && TASK_SORT_MODES.includes(value as TaskSortMode);
export const isValidSortDirection = (value: string | undefined): value is TaskSortDirection =>
  typeof value === 'string' && TASK_SORT_DIRECTIONS.includes(value as TaskSortDirection);
