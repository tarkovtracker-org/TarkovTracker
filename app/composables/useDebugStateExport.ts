import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import { GAME_MODES } from '@/utils/constants';
import { logger } from '@/utils/logger';
import type { TaskCompletion, UserProgressData } from '@/types/progress';
import type { Task } from '@/types/tarkov';
export interface DebugTaskEntry {
  id: string;
  name: string;
  complete: boolean;
  failed: boolean;
  manual: boolean | undefined;
  hasPrerequisites: boolean;
  prerequisiteIds: string[];
  prerequisiteStates: Record<string, { complete: boolean; failed: boolean }>;
}
export interface DebugStateSnapshot {
  exportedAt: string;
  appVersion: string;
  gameMode: string;
  playerLevel: number;
  gameEdition: number;
  pmcFaction: string;
  taskCount: number;
  completedTaskCount: number;
  failedTaskCount: number;
  manualTaskCount: number;
  importedTaskCount: number;
  tasks: DebugTaskEntry[];
}
type SourceBreakdown = {
  manual: number;
  imported: number;
  normal: number;
};
const classifyTaskSource = (
  completion: TaskCompletion | undefined
): 'manual' | 'imported' | 'normal' => {
  if (!completion) return 'normal';
  if (completion.manual === true) return 'manual';
  if (completion.manual === false) return 'imported';
  return 'normal';
};
const buildTaskEntries = (
  modeData: UserProgressData,
  tasksById: Map<string, Task>
): { entries: DebugTaskEntry[]; sources: SourceBreakdown } => {
  const entries: DebugTaskEntry[] = [];
  const sources: SourceBreakdown = { manual: 0, imported: 0, normal: 0 };
  const completions: Record<string, TaskCompletion> = modeData.taskCompletions ?? {};
  for (const [taskId, completion] of Object.entries(completions)) {
    const task = tasksById.get(taskId);
    const prereqIds = (task?.taskRequirements ?? [])
      .map((req) => req?.task?.id)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    const prereqStates: Record<string, { complete: boolean; failed: boolean }> = {};
    for (const prereqId of prereqIds) {
      const prereqCompletion = completions[prereqId];
      prereqStates[prereqId] = {
        complete: Boolean(prereqCompletion?.complete && !prereqCompletion?.failed),
        failed: Boolean(prereqCompletion?.failed),
      };
    }
    const isComplete = Boolean(completion?.complete && !completion?.failed);
    const isFailed = Boolean(completion?.failed);
    const source = classifyTaskSource(completion);
    if (isComplete || isFailed) {
      sources[source] += 1;
    }
    entries.push({
      id: taskId,
      name: task?.name ?? taskId,
      complete: isComplete,
      failed: isFailed,
      manual: completion?.manual,
      hasPrerequisites: prereqIds.length > 0,
      prerequisiteIds: prereqIds,
      prerequisiteStates: prereqStates,
    });
  }
  return { entries, sources };
};
export function useDebugStateExport() {
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const buildSnapshot = (): DebugStateSnapshot => {
    const currentMode = tarkovStore.getCurrentGameMode();
    const modeData: UserProgressData =
      currentMode === GAME_MODES.PVE ? tarkovStore.$state.pve : tarkovStore.$state.pvp;
    const tasks = metadataStore.tasks as Task[];
    const tasksById = new Map(tasks.map((t) => [t.id, t]));
    const { entries, sources } = buildTaskEntries(modeData, tasksById);
    const runtimeConfig = useRuntimeConfig();
    return {
      exportedAt: new Date().toISOString(),
      appVersion: runtimeConfig.public.appVersion || 'dev',
      gameMode: currentMode,
      playerLevel: modeData.level ?? 1,
      gameEdition: tarkovStore.$state.gameEdition ?? 1,
      pmcFaction: modeData.pmcFaction ?? 'USEC',
      taskCount: entries.length,
      completedTaskCount: entries.filter((e) => e.complete).length,
      failedTaskCount: entries.filter((e) => e.failed).length,
      manualTaskCount: sources.manual,
      importedTaskCount: sources.imported,
      tasks: entries,
    };
  };
  const exportDebugState = (): string => {
    try {
      const snapshot = buildSnapshot();
      return JSON.stringify(snapshot, null, 2);
    } catch (error) {
      logger.error('[DebugStateExport] Failed to build snapshot:', error);
      return JSON.stringify({
        exportedAt: new Date().toISOString(),
        error: 'Failed to build debug snapshot',
      });
    }
  };
  return { exportDebugState };
}
