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
export interface TarkovDevProfileData {
  pmcStats: Record<string, unknown> | null;
  scavStats: Record<string, unknown> | null;
  achievements: Record<string, number>;
  mastering: Array<{ Id: string; Progress: number; Kills?: number }>;
  importedAt: number;
  profileUpdatedAt: number;
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
  skillOffsets: { [skillName: string]: number };
  storyChapters: {
    [chapterId: string]: {
      complete?: boolean;
      timestamp?: number;
      objectives?: { [objectiveId: string]: { complete?: boolean; timestamp?: number } };
    };
  };
  lastApiUpdate?: ApiUpdateMeta;
  tarkovDevProfile?: TarkovDevProfileData;
}
