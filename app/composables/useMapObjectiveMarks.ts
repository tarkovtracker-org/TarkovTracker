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
  // True only when the local player still needs this objective themselves: the task is unlocked,
  // neither complete nor failed, and the objective is not ticked off. Consumers that build a
  // player-facing requirement list must gate on this rather than on `category`, because a pinned
  // task reports `category: 'pinned'` even when only a teammate still needs the objective.
  selfNeedsObjective: boolean;
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
type ObjectiveZone = NonNullable<TaskObjective['zones']>[number];
type ObjectivePossibleLocation = NonNullable<TaskObjective['possibleLocations']>[number];
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
export const mapObjectiveCategory = (pinned: boolean, users: string[]): MapObjectiveCategory => {
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
const canShowCompletedObjective = (
  selfComplete: boolean,
  selfTaskComplete: boolean,
  selfTaskFailed: boolean,
  shouldShowCompletedObjectives: boolean
): boolean => {
  if (!shouldShowCompletedObjectives) return false;
  if (!selfComplete) return false;
  if (!selfTaskComplete) return false;
  return !selfTaskFailed;
};
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
}: ObjectiveUsersOptions): string[] => {
  const teammateUsers = getTeammateUsers({
    taskId,
    objectiveId,
    teammateIds,
    unlockedTasks,
    objectiveCompletions,
    tasksCompletions,
    tasksFailed,
  });
  const users: string[] = [];
  if (selfNeedsObjective) users.push('self');
  users.push(...teammateUsers);
  if (users.length > 0) return users;
  return canShowCompletedObjective(
    selfComplete,
    selfTaskComplete,
    selfTaskFailed,
    shouldShowCompletedObjectives
  )
    ? ['self']
    : [];
};
const getZoneLocation = (
  zone: ObjectiveZone,
  selectedMapId: string
): { zone?: MapObjectiveZone; possibleLocation?: MapObjectiveLocation } | null => {
  const outline = getObjectiveOutline(zone);
  if (outline.length >= 3) {
    return { zone: { map: { id: selectedMapId }, outline } };
  }
  if (!zone.position) return null;
  return {
    possibleLocation: {
      map: { id: selectedMapId },
      positions: [{ x: zone.position.x, y: zone.position.y, z: zone.position.z }],
    },
  };
};
const getObjectiveOutline = (zone: ObjectiveZone): { x: number; z: number }[] =>
  Array.isArray(zone.outline) ? zone.outline.map((point) => ({ x: point.x, z: point.z })) : [];
const appendZoneLocation = (
  locations: ObjectiveLocations,
  location: { zone?: MapObjectiveZone; possibleLocation?: MapObjectiveLocation }
) => {
  if (location.zone) locations.zones.push(location.zone);
  if (location.possibleLocation) locations.possibleLocations.push(location.possibleLocation);
};
const getZoneLocations = (zones: NonNullable<TaskObjective['zones']>, selectedMapId: string) => {
  const locations: ObjectiveLocations = { zones: [], possibleLocations: [] };
  for (const zone of zones.filter((zone) => zone?.map?.id === selectedMapId)) {
    const location = getZoneLocation(zone, selectedMapId);
    if (!location) continue;
    appendZoneLocation(locations, location);
  }
  return locations;
};
const getPossibleLocation = (
  location: ObjectivePossibleLocation,
  selectedMapId: string
): MapObjectiveLocation | null => {
  const positions = getObjectivePositions(location);
  if (positions.length === 0) return null;
  return { map: { id: selectedMapId }, positions };
};
const getObjectivePositions = (
  location: ObjectivePossibleLocation
): Array<{ x: number; y?: number; z: number }> =>
  Array.isArray(location.positions)
    ? location.positions.map((pos) => ({ x: pos.x, y: pos.y, z: pos.z }))
    : [];
const getPossibleLocations = (
  locations: NonNullable<TaskObjective['possibleLocations']>,
  selectedMapId: string
): MapObjectiveLocation[] => {
  const possibleLocations: MapObjectiveLocation[] = [];
  for (const location of locations.filter((location) => location?.map?.id === selectedMapId)) {
    const possibleLocation = getPossibleLocation(location, selectedMapId);
    if (possibleLocation) possibleLocations.push(possibleLocation);
  }
  return possibleLocations;
};
const isObjectiveOnMap = (
  objectiveId: string,
  selectedMapId: string,
  objectiveMaps: ObjectiveMapInfo[]
): boolean =>
  objectiveMaps.some(
    (mapInfo) => mapInfo.objectiveID === objectiveId && mapInfo.mapID === selectedMapId
  );
const getGpsLocation = (
  objectiveId: string,
  selectedMapId: string,
  objectiveGps: ObjectiveGPSInfo[]
): MapObjectiveLocation[] => {
  const gpsInfo = objectiveGps.find((gps) => gps.objectiveID === objectiveId);
  if (!gpsInfo) return [];
  if (gpsInfo.x == null) return [];
  if (gpsInfo.y == null) return [];
  return [
    {
      map: { id: selectedMapId },
      positions: [{ x: gpsInfo.x, y: 0, z: gpsInfo.y }],
    },
  ];
};
const getObjectiveLocations = (
  objective: TaskObjective,
  selectedMapId: string,
  objectiveMaps: ObjectiveMapInfo[],
  objectiveGps: ObjectiveGPSInfo[]
): ObjectiveLocations => {
  const zoneLocations = Array.isArray(objective.zones)
    ? getZoneLocations(objective.zones, selectedMapId)
    : { zones: [], possibleLocations: [] };
  const directPossibleLocations = Array.isArray(objective.possibleLocations)
    ? getPossibleLocations(objective.possibleLocations, selectedMapId)
    : [];
  const gpsLocations = isObjectiveOnMap(objective.id, selectedMapId, objectiveMaps)
    ? getGpsLocation(objective.id, selectedMapId, objectiveGps)
    : [];
  const possibleLocations = [
    ...zoneLocations.possibleLocations,
    ...directPossibleLocations,
    ...gpsLocations,
  ];
  return { zones: zoneLocations.zones, possibleLocations };
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
        const users = getObjectiveUsers({
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
          selfNeedsObjective,
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
