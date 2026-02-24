import { isMapObjectiveType } from '@/features/tasks/taskObjectiveTypes';
import type { Task, TaskObjective } from '@/types/tarkov';
type MapWithMergedIds = {
  id: string;
  mergedIds?: string[];
};
export const resolveSelectedMapIds = (
  selectedMapId: string | null | undefined,
  mapsWithSvg: MapWithMergedIds[]
): string[] => {
  if (!selectedMapId || selectedMapId === 'all') return [];
  const mergedMap = mapsWithSvg.find((map) => {
    const mergedIds = map.mergedIds || [];
    return map.id === selectedMapId || mergedIds.includes(selectedMapId);
  });
  if (!mergedMap) return [selectedMapId];
  const mergedIds = mergedMap.mergedIds || [];
  return mergedIds.includes(mergedMap.id) ? mergedIds : [mergedMap.id, ...mergedIds];
};
export const resolveTaskObjectives = (
  task: Task,
  fallbackTask: Task | null | undefined
): TaskObjective[] => {
  if ((task.objectives?.length ?? 0) > 0) {
    return task.objectives ?? [];
  }
  return fallbackTask?.objectives ?? [];
};
export const categorizeObjectivesForMapView = ({
  isMapView,
  isObjectiveComplete,
  mapIds,
  objectives,
}: {
  isMapView: boolean;
  isObjectiveComplete: (objectiveId: string) => boolean;
  mapIds: string[];
  objectives: TaskObjective[];
}) => {
  if (!isMapView) {
    return {
      irrelevant: [] as TaskObjective[],
      relevant: objectives,
      uncompletedIrrelevant: [] as TaskObjective[],
    };
  }
  const relevant: TaskObjective[] = [];
  const irrelevant: TaskObjective[] = [];
  const uncompletedIrrelevant: TaskObjective[] = [];
  for (const objective of objectives) {
    const hasMaps = Array.isArray(objective.maps) && objective.maps.length > 0;
    const onSelectedMap = hasMaps && objective.maps?.some((map) => mapIds.includes(map.id));
    const isMapType = isMapObjectiveType(objective.type);
    const isRelevant = !hasMaps || (onSelectedMap && isMapType);
    if (isRelevant) {
      relevant.push(objective);
    } else {
      irrelevant.push(objective);
      if (!isObjectiveComplete(objective.id)) {
        uncompletedIrrelevant.push(objective);
      }
    }
  }
  return { irrelevant, relevant, uncompletedIrrelevant };
};
