export interface TaskObjective {
  count?: number;
  complete?: boolean;
  timestamp?: number;
}
export interface TaskCompletion {
  complete?: boolean;
  failed?: boolean;
  timestamp?: number;
  manual?: boolean;
}
export interface HideoutPart {
  count?: number;
  complete?: boolean;
  timestamp?: number;
}
export interface HideoutModule {
  complete?: boolean;
  timestamp?: number;
}
export interface ApiTaskUpdate {
  id: string;
  state: 'completed' | 'failed' | 'uncompleted';
}
export interface ApiUpdateMeta {
  id: string;
  at: number;
  source: 'api';
  tasks?: ApiTaskUpdate[];
}
export interface TraderProgress {
  level: number;
  reputation: number;
}
export const MANUAL_ACTIVITY_TYPES = ['task', 'hideout', 'item', 'system'] as const;
export type ManualActivityType = (typeof MANUAL_ACTIVITY_TYPES)[number];
export const MANUAL_ACTIVITY_ACTIONS = [
  'complete',
  'uncomplete',
  'fail',
  'reset_failed',
  'upgrade',
  'needed',
  'sync',
  'available',
] as const;
export type ManualActivityAction = (typeof MANUAL_ACTIVITY_ACTIONS)[number];
/**
 * A user-initiated activity-log entry persisted inside the synced per-mode
 * progress blob, alongside `apiUpdateHistory`. `title` and `details` hold
 * already-translated display text captured when the action happened.
 */
export interface ManualActivityEntry {
  id: string;
  timestamp: number;
  type: ManualActivityType;
  action: ManualActivityAction;
  title: string;
  details?: string;
}
export interface UserProgressData {
  level: number;
  pmcFaction: 'USEC' | 'BEAR';
  displayName: string | null;
  xpOffset: number;
  taskObjectives: { [objectiveId: string]: TaskObjective };
  taskCompletions: { [taskId: string]: TaskCompletion };
  hideoutParts: { [objectiveId: string]: HideoutPart };
  hideoutModules: { [hideoutId: string]: HideoutModule };
  traders: { [traderId: string]: TraderProgress };
  skills: { [skillName: string]: number };
  prestigeLevel: number;
  progressEpoch?: number;
  skillOffsets: { [skillName: string]: number };
  storyChapters: {
    [chapterId: string]: {
      complete?: boolean;
      timestamp?: number;
      objectives?: { [objectiveId: string]: { complete?: boolean; timestamp?: number } };
    };
  };
  lastApiUpdate?: ApiUpdateMeta;
  apiUpdateHistory?: ApiUpdateMeta[];
  manualActivityHistory?: ManualActivityEntry[];
}
