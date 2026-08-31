import { storeToRefs } from 'pinia';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import type { ComputedRef } from '#imports';
import type { ObjectiveGPSInfo, ObjectiveMapInfo, Task, TaskObjective } from '@/types/tarkov';
type MapObjectiveZone = { map: { id: string }; outline: { x: number; z: number }[] };
type MapObjectiveLocation = {
  map: { id: string };
  positions?: Array<{ x: number; y?: number; z: number }>;
};
export type MapObjectiveMark = {
  id?: string;
  zones: MapObjectiveZone[];
  possibleLocations?: MapObjectiveLocation[];
  users?: string[];
  pinned?: boolean;
};
export type MapObjectiveCategory = 'self' | 'pinned' | 'team';
export type MapObjectiveVisibility = {
  category: MapObjectiveCategory;
  hasActiveObjective: boolean;
};
interface MapObjectiveMarksOptions {
  mapId: ComputedRef<string | null | undefined>;
  shouldShowCompletedObjectives: ComputedRef<boolean>;
  tasks: ComputedRef<Task[]>;
}
interface ObjectiveLocations {
  zones: MapObjectiveZone[];
  possibleLocations: MapObjectiveLocation[];
}
type BooleanProgressMap = Record<string, Record<string, boolean>>;
interface ObjectiveUsersOptions {
  taskId: string;
  objectiveId: string;
  teammateIds: string[];
  selfNeedsObjective: boolean;
  selfComplete: boolean;
  selfTaskComplete: boolean;
  selfTaskFailed: boolean;
  shouldShowCompletedObjectives: boolean;
  unlockedTasks: BooleanProgressMap;
  objectiveCompletions: BooleanProgressMap;
  tasksCompletions: BooleanProgressMap;
  tasksFailed: BooleanProgressMap;
}
const mapObjectiveCategory = (pinned: boolean, users: string[]): MapObjectiveCategory => {
  if (pinned) return 'pinned';
  if (users.includes('self')) return 'self';
  return 'team';
};
const getTeammateUsers = ({
  taskId,
  objectiveId,
  teammateIds,
  unlockedTasks,
  objectiveCompletions,
  tasksCompletions,
  tasksFailed,
}: Pick<
  ObjectiveUsersOptions,
  | 'taskId'
  | 'objectiveId'
  | 'teammateIds'
  | 'unlockedTasks'
  | 'objectiveCompletions'
  | 'tasksCompletions'
  | 'tasksFailed'
>): string[] =>
  teammateIds.filter((teammateId) => {
    const taskUnlocked = unlockedTasks[taskId]?.[teammateId] === true;
    const objectiveDone = objectiveCompletions[objectiveId]?.[teammateId] === true;
    const taskDone = tasksCompletions[taskId]?.[teammateId] === true;
    const taskFailed = tasksFailed[taskId]?.[teammateId] === true;
    return taskUnlocked && !objectiveDone && !taskDone && !taskFailed;
  });
const getObjectiveUsers = ({
  taskId,
  objectiveId,
  teammateIds,
  selfNeedsObjective,
  selfComplete,
  selfTaskComplete,
  selfTaskFailed,
  shouldShowCompletedObjectives,
  unlockedTasks,
  objectiveCompletions,
  tasksCompletions,
  tasksFailed,
}: ObjectiveUsersOptions): { users: string[]; hasActiveObjective: boolean } => {
  const teammateUsers = getTeammateUsers({
    taskId,
    objectiveId,
    teammateIds,
    unlockedTasks,
    objectiveCompletions,
    tasksCompletions,
    tasksFailed,
  });
  const users = selfNeedsObjective ? ['self'] : [];
  let hasActiveObjective = selfNeedsObjective;
  if (teammateUsers.length > 0) {
    hasActiveObjective = true;
    users.push(...teammateUsers);
  } else if (selfComplete && selfTaskComplete && !selfTaskFailed && shouldShowCompletedObjectives) {
    users.push('self');
  }
  return { users, hasActiveObjective };
};
const getObjectiveLocations = (
  objective: TaskObjective,
  selectedMapId: string,
  objectiveMaps: ObjectiveMapInfo[],
  objectiveGps: ObjectiveGPSInfo[]
): ObjectiveLocations => {
  const zones: MapObjectiveZone[] = [];
  const possibleLocations: MapObjectiveLocation[] = [];
  if (Array.isArray(objective.zones)) {
    objective.zones.forEach((zone) => {
      if (zone?.map?.id !== selectedMapId) return;
      const outline = Array.isArray(zone.outline)
        ? zone.outline.map((point) => ({ x: point.x, z: point.z }))
        : [];
      if (outline.length >= 3) {
        zones.push({ map: { id: selectedMapId }, outline });
      } else if (zone.position) {
        possibleLocations.push({
          map: { id: selectedMapId },
          positions: [{ x: zone.position.x, y: zone.position.y, z: zone.position.z }],
        });
      }
    });
  }
  if (Array.isArray(objective.possibleLocations)) {
    objective.possibleLocations.forEach((location) => {
      if (location?.map?.id !== selectedMapId) return;
      const positions = Array.isArray(location.positions)
        ? location.positions.map((pos) => ({ x: pos.x, y: pos.y, z: pos.z }))
        : [];
      if (positions.length > 0) {
        possibleLocations.push({
          map: { id: selectedMapId },
          positions,
        });
      }
    });
  }
  const gpsInfo = objectiveGps.find((gps) => gps.objectiveID === objective.id);
  const isOnThisMap = objectiveMaps.some(
    (mapInfo) => mapInfo.objectiveID === objective.id && mapInfo.mapID === selectedMapId
  );
  if (isOnThisMap && gpsInfo && gpsInfo.x != null && gpsInfo.y != null) {
    possibleLocations.push({
      map: { id: selectedMapId },
      positions: [{ x: gpsInfo.x, y: 0, z: gpsInfo.y }],
    });
  }
  return { zones, possibleLocations };
};
export function useMapObjectiveMarks({
  mapId,
  shouldShowCompletedObjectives,
  tasks,
}: MapObjectiveMarksOptions): {
  mapObjectiveMarks: ComputedRef<MapObjectiveMark[]>;
  mapObjectiveVisibility: ComputedRef<ReadonlyMap<string, MapObjectiveVisibility>>;
} {
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const progressStore = useProgressStore();
  const tarkovStore = useTarkovStore();
  const { objectiveCompletions, tasksCompletions, tasksFailed, unlockedTasks } =
    storeToRefs(progressStore);
  const mapObjectiveData = computed(() => {
    const objectiveVisibility = new Map<string, MapObjectiveVisibility>();
    if (!mapId.value) return { marks: [], objectiveVisibility };
    const selectedMapId = mapId.value;
    const marks: MapObjectiveMark[] = [];
    const includeTeammates = !preferencesStore.mapTeamAllHidden;
    const teammateIds = includeTeammates
      ? Object.keys(progressStore.visibleTeamStores).filter((id) => id !== 'self')
      : [];
    const pinnedTaskIds = new Set(preferencesStore.getPinnedTaskIds);
    tasks.value.forEach((task) => {
      if (!task.objectives) return;
      const objectiveMaps = metadataStore.objectiveMaps?.[task.id] ?? [];
      const objectiveGps = metadataStore.objectiveGPS?.[task.id] ?? [];
      task.objectives.forEach((obj) => {
        const selfComplete = tarkovStore.isTaskObjectiveComplete(obj.id);
        const selfTaskComplete = tarkovStore.isTaskComplete(task.id);
        const selfTaskFailed = tarkovStore.isTaskFailed(task.id);
        const selfTaskUnlocked = unlockedTasks.value[task.id]?.self === true;
        const selfNeedsObjective =
          selfTaskUnlocked && !selfTaskComplete && !selfTaskFailed && !selfComplete;
        const { users, hasActiveObjective } = getObjectiveUsers({
          taskId: task.id,
          objectiveId: obj.id,
          teammateIds,
          selfNeedsObjective,
          selfComplete,
          selfTaskComplete,
          selfTaskFailed,
          shouldShowCompletedObjectives: shouldShowCompletedObjectives.value,
          unlockedTasks: unlockedTasks.value,
          objectiveCompletions: objectiveCompletions.value,
          tasksCompletions: tasksCompletions.value,
          tasksFailed: tasksFailed.value,
        });
        if (users.length === 0) return;
        const pinned = pinnedTaskIds.has(task.id);
        objectiveVisibility.set(obj.id, {
          category: mapObjectiveCategory(pinned, users),
          hasActiveObjective,
        });
        const { zones, possibleLocations } = getObjectiveLocations(
          obj,
          selectedMapId,
          objectiveMaps,
          objectiveGps
        );
        if (zones.length > 0 || possibleLocations.length > 0) {
          marks.push({
            id: obj.id,
            zones,
            possibleLocations,
            users,
            pinned,
          });
        }
      });
    });
    return { marks, objectiveVisibility };
  });
  const mapObjectiveMarks = computed(() => mapObjectiveData.value.marks);
  const mapObjectiveVisibility = computed(() => mapObjectiveData.value.objectiveVisibility);
  return {
    mapObjectiveMarks,
    mapObjectiveVisibility,
  };
}
