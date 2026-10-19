import type { TaskSecondaryView } from '@/types/taskFilter';
/** Status views that list a hidden task normally: once a task is done, hiding it no longer matters. */
const RESOLVED_VIEWS: ReadonlySet<TaskSecondaryView> = new Set(['completed', 'failed']);
export interface HiddenTaskListContext {
  /** Search always lists hidden tasks so they can be found and unhidden. */
  searchActive: boolean;
  secondaryView: TaskSecondaryView;
  /** The task opened from a link keeps its own section. */
  focusTaskId: string | null;
}
/** Tasks the user hid that the current view moves out of the main list. */
export const getListHiddenTaskIds = (
  hiddenTaskIds: readonly string[],
  { searchActive, secondaryView, focusTaskId }: HiddenTaskListContext
): ReadonlySet<string> => {
  if (searchActive || RESOLVED_VIEWS.has(secondaryView)) return new Set();
  return new Set(hiddenTaskIds.filter((taskId) => taskId !== focusTaskId));
};
