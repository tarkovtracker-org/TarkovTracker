/**
 * Task Filter Types
 *
 * Defines view modes and filter options for the task filtering system.
 * Replaces scattered string literals with type-safe constants.
 */
export const TASK_PRIMARY_VIEWS = ['all', 'maps', 'traders', 'graph'] as const;
export type TaskPrimaryView = (typeof TASK_PRIMARY_VIEWS)[number];
export const TASK_SECONDARY_VIEWS = ['all', 'available', 'locked', 'completed', 'failed'] as const;
export type TaskSecondaryView = (typeof TASK_SECONDARY_VIEWS)[number];
export const TASK_USER_VIEWS = {
  ALL: 'all',
} as const;
export interface MergedMap {
  id: string;
  mergedIds?: string[];
}
/**
 * Parameter object for task filtering operations.
 * Consolidates the 9 separate parameters into a single cohesive object.
 */
export interface TaskFilterOptions {
  primaryView: TaskPrimaryView;
  secondaryView: TaskSecondaryView;
  userView: string;
  mapView: string;
  traderView: string;
  mergedMaps: MergedMap[];
}
/**
 * Extended options including sort configuration.
 */
export interface TaskFilterAndSortOptions extends TaskFilterOptions {
  sortMode: import('@/types/taskSort').TaskSortMode;
  sortDirection: import('@/types/taskSort').TaskSortDirection;
}
/**
 * Type guard to check if viewing all team members
 */
export const isAllUsersView = (userView: string): boolean => userView === TASK_USER_VIEWS.ALL;
/**
 * Type guard to validate primary view
 */
export const isValidPrimaryView = (view: string | undefined): view is TaskPrimaryView =>
  typeof view === 'string' && TASK_PRIMARY_VIEWS.includes(view as TaskPrimaryView);
/**
 * Type guard to validate secondary view
 */
export const isValidSecondaryView = (view: string | undefined): view is TaskSecondaryView =>
  typeof view === 'string' && TASK_SECONDARY_VIEWS.includes(view as TaskSecondaryView);
