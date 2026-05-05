import { storeToRefs } from 'pinia';
import { useMetadataStore } from '@/stores/useMetadata';
import { usePreferencesStore } from '@/stores/usePreferences';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import type { ComputedRef } from '#imports';
import type { Task } from '@/types/tarkov';
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
};
interface MapObjectiveMarksOptions {
  mapId: ComputedRef<string | null | undefined>;
  shouldShowCompletedObjectives: ComputedRef<boolean>;
  tasks: ComputedRef<Task[]>;
}
export function useMapObjectiveMarks({
  mapId,
  shouldShowCompletedObjectives,
  tasks,
}: MapObjectiveMarksOptions): {
  mapObjectiveMarks: ComputedRef<MapObjectiveMark[]>;
} {
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const progressStore = useProgressStore();
  const tarkovStore = useTarkovStore();
  const { objectiveCompletions, tasksCompletions, tasksFailed, unlockedTasks } =
    storeToRefs(progressStore);
  const mapObjectiveMarks = computed(() => {
    if (!mapId.value) return [];
    const selectedMapId = mapId.value;
    const marks: MapObjectiveMark[] = [];
    const includeTeammates = !preferencesStore.mapTeamAllHidden;
    const teammateIds = includeTeammates
      ? Object.keys(progressStore.visibleTeamStores).filter((id) => id !== 'self')
      : [];
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
        const users: string[] = [];
        const teammateUsers: string[] = [];
        if (selfNeedsObjective) {
          users.push('self');
        }
        for (const tmId of teammateIds) {
          const taskUnlocked = unlockedTasks.value[task.id]?.[tmId] === true;
          const objDone = objectiveCompletions.value[obj.id]?.[tmId] === true;
          const taskDone = tasksCompletions.value[task.id]?.[tmId] === true;
          const taskFailed = tasksFailed.value[task.id]?.[tmId] === true;
          if (taskUnlocked && !objDone && !taskDone && !taskFailed) {
            teammateUsers.push(tmId);
          }
        }
        if (teammateUsers.length > 0) {
          users.push(...teammateUsers);
        } else if (
          selfComplete &&
          selfTaskComplete &&
          !selfTaskFailed &&
          shouldShowCompletedObjectives.value
        ) {
          users.push('self');
        }
        if (users.length === 0) return;
        const zones: MapObjectiveZone[] = [];
        const possibleLocations: MapObjectiveLocation[] = [];
        if (Array.isArray(obj.zones)) {
          obj.zones.forEach((zone) => {
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
        if (Array.isArray(obj.possibleLocations)) {
          obj.possibleLocations.forEach((location) => {
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
        const gpsInfo = objectiveGps.find((gps) => gps.objectiveID === obj.id);
        const isOnThisMap = objectiveMaps.some(
          (mapInfo) => mapInfo.objectiveID === obj.id && mapInfo.mapID === selectedMapId
        );
        if (isOnThisMap && gpsInfo && gpsInfo.x != null && gpsInfo.y != null) {
          possibleLocations.push({
            map: { id: selectedMapId },
            positions: [{ x: gpsInfo.x, y: 0, z: gpsInfo.y }],
          });
        }
        if (zones.length > 0 || possibleLocations.length > 0) {
          marks.push({
            id: obj.id,
            zones,
            possibleLocations,
            users,
          });
        }
      });
    });
    return marks;
  });
  return {
    mapObjectiveMarks,
  };
}
