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
  // The Locked and All filters list tasks the player has not unlocked; draw their objectives too.
  shouldShowLockedObjectives?: ComputedRef<boolean>;
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
  selfTaskUnlocked: boolean;
  shouldShowCompletedObjectives: boolean;
  shouldShowLockedObjectives: boolean;
  unlockedTasks: BooleanProgressMap;
  objectiveCompletions: BooleanProgressMap;
  tasksCompletions: BooleanProgressMap;
  tasksFailed: BooleanProgressMap;
}
type SelfObjectiveState = Pick<
  ObjectiveUsersOptions,
  'selfNeedsObjective' | 'selfComplete' | 'selfTaskComplete' | 'selfTaskFailed' | 'selfTaskUnlocked'
>;
const selfStillNeedsObjective = (state: Omit<SelfObjectiveState, 'selfNeedsObjective'>): boolean =>
  state.selfTaskUnlocked && !state.selfTaskComplete && !state.selfTaskFailed && !state.selfComplete;
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
const canShowLockedObjective = ({
  selfTaskUnlocked,
  selfComplete,
  selfTaskComplete,
  selfTaskFailed,
  shouldShowLockedObjectives,
}: ObjectiveUsersOptions): boolean => {
  if (!shouldShowLockedObjectives || selfTaskUnlocked) return false;
  return !selfComplete && !selfTaskComplete && !selfTaskFailed;
};
const canShowSelfFallback = (options: ObjectiveUsersOptions): boolean =>
  canShowCompletedObjective(
    options.selfComplete,
    options.selfTaskComplete,
    options.selfTaskFailed,
    options.shouldShowCompletedObjectives
  ) || canShowLockedObjective(options);
const getObjectiveUsers = (options: ObjectiveUsersOptions): string[] => {
  const users: string[] = [];
  if (options.selfNeedsObjective) users.push('self');
  users.push(...getTeammateUsers(options));
  if (users.length > 0) return users;
  return canShowSelfFallback(options) ? ['self'] : [];
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
interface MapObjectiveEntry {
  taskId: string;
  objectiveId: string;
  visibility: MapObjectiveVisibility;
  mark: MapObjectiveMark | null;
}
const collectMapTaskIds = (
  entries: MapObjectiveEntry[],
  categoryEnabled: Record<MapObjectiveCategory, boolean>
): string[] => [
  ...new Set(
    entries
      .filter((entry) => entry.mark && categoryEnabled[entry.visibility.category])
      .map((entry) => entry.taskId)
  ),
];
export function useMapObjectiveMarks({
  mapId,
  shouldShowCompletedObjectives,
  shouldShowLockedObjectives,
  tasks,
}: MapObjectiveMarksOptions): {
  mapObjectiveMarks: ComputedRef<MapObjectiveMark[]>;
  mapObjectiveVisibility: ComputedRef<ReadonlyMap<string, MapObjectiveVisibility>>;
  mapTaskIds: ComputedRef<string[]>;
  hiddenTaskIds: ComputedRef<ReadonlySet<string>>;
} {
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const progressStore = useProgressStore();
  const tarkovStore = useTarkovStore();
  const { objectiveCompletions, tasksCompletions, tasksFailed, unlockedTasks } =
    storeToRefs(progressStore);
  const showLockedObjectives = computed(() => shouldShowLockedObjectives?.value === true);
  const getSelfObjectiveState = (taskId: string, objectiveId: string): SelfObjectiveState => {
    const state = {
      selfComplete: tarkovStore.isTaskObjectiveComplete(objectiveId),
      selfTaskComplete: tarkovStore.isTaskComplete(taskId),
      selfTaskFailed: tarkovStore.isTaskFailed(taskId),
      selfTaskUnlocked: unlockedTasks.value[taskId]?.self === true,
    };
    return { ...state, selfNeedsObjective: selfStillNeedsObjective(state) };
  };
  const mapObjectiveEntries = computed<MapObjectiveEntry[]>(() => {
    if (!mapId.value) return [];
    const selectedMapId = mapId.value;
    const entries: MapObjectiveEntry[] = [];
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
        const selfState = getSelfObjectiveState(task.id, obj.id);
        const users = getObjectiveUsers({
          taskId: task.id,
          objectiveId: obj.id,
          teammateIds,
          ...selfState,
          shouldShowCompletedObjectives: shouldShowCompletedObjectives.value,
          shouldShowLockedObjectives: showLockedObjectives.value,
          unlockedTasks: unlockedTasks.value,
          objectiveCompletions: objectiveCompletions.value,
          tasksCompletions: tasksCompletions.value,
          tasksFailed: tasksFailed.value,
        });
        if (users.length === 0) return;
        const pinned = pinnedTaskIds.has(task.id);
        const { zones, possibleLocations } = getObjectiveLocations(
          obj,
          selectedMapId,
          objectiveMaps,
          objectiveGps
        );
        const hasLocation = zones.length > 0 || possibleLocations.length > 0;
        entries.push({
          taskId: task.id,
          objectiveId: obj.id,
          visibility: {
            category: mapObjectiveCategory(pinned, users),
            selfNeedsObjective: selfState.selfNeedsObjective,
          },
          mark: hasLocation ? { id: obj.id, zones, possibleLocations, users, pinned } : null,
        });
      });
    });
    return entries;
  });
  // Tasks that draw at least one marker in an enabled category on this map, before the user's
  // hidden list is applied. Mirrors LeafletMap's category gate, so quests without a drawable
  // marker here (e.g. global quests) never get hide controls or count toward "show only".
  const categoryEnabled = computed<Record<MapObjectiveCategory, boolean>>(() => ({
    self: preferencesStore.getMapShowSelfObjectives ?? true,
    pinned: preferencesStore.getMapShowPinnedObjectives ?? true,
    team: preferencesStore.getMapShowTeamObjectives ?? true,
  }));
  const mapTaskIds = computed(() =>
    collectMapTaskIds(mapObjectiveEntries.value, categoryEnabled.value)
  );
  const hiddenTaskIds = computed<ReadonlySet<string>>(
    () => new Set(preferencesStore.getMapHiddenTaskIds ?? [])
  );
  const shownEntries = computed(() =>
    mapObjectiveEntries.value.filter((entry) => !hiddenTaskIds.value.has(entry.taskId))
  );
  const mapObjectiveMarks = computed(() =>
    shownEntries.value.flatMap((entry) => (entry.mark ? [entry.mark] : []))
  );
  const mapObjectiveVisibility = computed(
    () => new Map(shownEntries.value.map((entry) => [entry.objectiveId, entry.visibility]))
  );
  return {
    mapObjectiveMarks,
    mapObjectiveVisibility,
    mapTaskIds,
    hiddenTaskIds,
  };
}
