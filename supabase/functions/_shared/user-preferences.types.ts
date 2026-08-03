import type { Tables } from './database.types.ts';
export interface TaskFilterPreset {
  id: string;
  name: string;
  filters: {
    traders?: string[];
    maps?: string[];
    hideCompleted?: boolean;
  };
}
export type TypedUserPreferences = Omit<
  Tables<'user_preferences'>,
  'pinned_task_ids' | 'task_filter_presets'
> & {
  pinned_task_ids: string[] | null;
  task_filter_presets: TaskFilterPreset[] | null;
};
