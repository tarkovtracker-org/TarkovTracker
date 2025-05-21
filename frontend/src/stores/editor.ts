import { defineStore } from 'pinia';
import { useStorage } from '@vueuse/core';
import { computed } from 'vue';
import type { RemovableRef } from '@vueuse/core';

// Define interfaces for the stored data structures
interface ObjectiveMapData {
  [objectiveId: string]: string[];
}

interface AlternativeTaskData {
  [taskId: string]: Record<string, unknown>; // Consider a more specific type if possible
}

interface GpsData {
  lat: number;
  lng: number;
}

interface ObjectiveGpsData {
  [objectiveId: string]: GpsData | null;
}

export const useEditorStore = defineStore('editor', () => {
  // State Use refs directly
  const objectiveMaps: RemovableRef<ObjectiveMapData> = useStorage('editor_objectiveMaps', {});
  const alternativeTasks: RemovableRef<AlternativeTaskData> = useStorage(
    'editor_alternativeTasks',
    {}
  );
  const objectiveGPS: RemovableRef<ObjectiveGpsData> = useStorage('editor_objectiveGPS', {});

  // Getters Use computed properties
  const getObjectiveMaps = computed(() => {
    return (objectiveId: string): string[] => objectiveMaps.value[objectiveId] ?? [];
  });

  const getObjectiveMapsFull = computed((): ObjectiveMapData => {
    return objectiveMaps.value ?? {};
  });

  const getAlternativeTasks = computed(() => {
    return (taskId: string): Record<string, unknown> => alternativeTasks.value[taskId] ?? {};
  });

  const getAlternativeTasksFull = computed((): AlternativeTaskData => {
    return alternativeTasks.value ?? {};
  });

  const getObjectiveGPS = computed(() => {
    return (objectiveId: string): GpsData | null => objectiveGPS.value[objectiveId] ?? null;
  });

  const getObjectiveGPSFull = computed((): ObjectiveGpsData => {
    return objectiveGPS.value ?? {};
  });

  // Actions Regular functions
  function setObjectiveMaps(objectiveId: string, maps: string[]) {
    objectiveMaps.value[objectiveId] = maps;
  }

  function setAlternativeTasks(taskId: string, tasks: Record<string, unknown>) {
    alternativeTasks.value[taskId] = tasks;
  }

  function setObjectiveGPS(objectiveId: string, gps: GpsData | null) {
    objectiveGPS.value[objectiveId] = gps;
  }

  function resetObjectiveMaps() {
    objectiveMaps.value = {};
  }

  function resetAlternativeTasks() {
    alternativeTasks.value = {};
  }

  function resetObjectiveGPS() {
    objectiveGPS.value = {};
  }

  function reset() {
    resetObjectiveMaps();
    resetAlternativeTasks();
    resetObjectiveGPS();
  }

  // Return state, getters, and actions
  return {
    // State (Refs are automatically reactive)
    objectiveMaps,
    alternativeTasks,
    objectiveGPS,
    // Getters (Computed refs)
    getObjectiveMaps,
    getObjectiveMapsFull,
    getAlternativeTasks,
    getAlternativeTasksFull,
    getObjectiveGPS,
    getObjectiveGPSFull,
    // Actions
    setObjectiveMaps,
    setAlternativeTasks,
    setObjectiveGPS,
    reset,
    resetObjectiveMaps,
    resetAlternativeTasks,
    resetObjectiveGPS,
  };
});
