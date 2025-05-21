import { useQuery, provideApolloClient } from '@vue/apollo-composable';
import { computed, ref, watch, onMounted, Ref, ComputedRef } from 'vue';
import { ApolloError } from '@apollo/client/core';
import apolloClient from '@/plugins/apollo';
import tarkovDataQuery from '@/utils/tarkovdataquery';
import tarkovHideoutQuery from '@/utils/tarkovhideoutquery';
import languageQuery from '@/utils/languagequery';
import { useI18n } from 'vue-i18n';
import Graph from 'graphology'; // Assuming Graph type is available or using any
// --- Type Definitions (Basic - Expand as needed) ---
interface TarkovItem {
  id: string;
  shortName?: string;
  name?: string;
  link?: string;
  wikiLink?: string;
  image512pxLink?: string;
  gridImageLink?: string;
  baseImageLink?: string;
  iconLink?: string;
  image8xLink?: string;
  backgroundColor?: string;
}
interface ItemRequirement {
  id: string;
  item: TarkovItem;
  count: number;
  quantity: number;
  foundInRaid?: boolean;
}
interface StationLevelRequirement {
  id: string;
  station: { id: string; name: string };
  level: number;
}
interface SkillRequirement {
  id: string;
  name: string;
  level: number;
}
interface TraderRequirement {
  id: string;
  trader: { id: string; name: string };
  value: number; // Reputation value for hideout/module
}
interface TaskTraderLevelRequirement {
  id: string;
  trader: { id: string; name: string };
  level: number; // Loyalty level for tasks
}
interface Craft {
  id: string;
  duration: number;
  requiredItems: ItemRequirement[];
  rewardItems: ItemRequirement[];
}
interface HideoutLevel {
  id: string;
  level: number;
  description?: string;
  constructionTime: number;
  itemRequirements: ItemRequirement[];
  stationLevelRequirements: StationLevelRequirement[];
  skillRequirements: SkillRequirement[];
  traderRequirements: TraderRequirement[];
  crafts: Craft[];
}
interface HideoutStation {
  id: string;
  name: string;
  normalizedName?: string;
  levels: HideoutLevel[];
}
interface HideoutModule extends HideoutLevel {
  stationId: string;
  predecessors: string[];
  successors: string[];
  parents: string[];
  children: string[];
}
interface TaskObjective {
  id: string;
  description?: string;
  location?: { id: string; name?: string };
  item?: TarkovItem;
  markerItem?: TarkovItem;
  count?: number;
  type?: string;
  foundInRaid?: boolean;
  x?: number;
  y?: number;
  optional?: boolean;
  taskId?: string; // Added in computed property
}
interface TaskRequirement {
  task: { id: string; name?: string };
  status?: string[];
}
interface FinishReward {
  __typename?: string;
  status?: string;
  quest?: { id: string };
  // Add other reward types as needed
}
export interface Task {
  id: string;
  tarkovDataId?: number;
  name?: string;
  kappaRequired?: boolean;
  experience?: number;
  map?: { id: string; name?: string };
  trader?: { id: string; name?: string; imageLink?: string };
  objectives?: TaskObjective[];
  taskRequirements?: TaskRequirement[];
  minPlayerLevel?: number;
  failedRequirements?: TaskRequirement[];
  traderLevelRequirements?: TaskTraderLevelRequirement[];
  factionName?: string;
  finishRewards?: FinishReward[];
  traderIcon?: string;
  predecessors?: string[];
  successors?: string[];
  parents?: string[];
  children?: string[];
}
interface TarkovMap {
  id: string;
  name: string;
  normalizedName?: string;
  // Add other Map properties from query
  svg?: string; // Changed from any to string
}
interface Trader {
  id: string;
  name: string;
  normalizedName?: string;
  // Add other Trader properties from query
  imageLink?: string;
}
interface PlayerLevel {
  level: number;
  exp: number;
  levelBadgeImageLink: string;
}
// Apollo Query Result Types (Simplified)
interface LanguageQueryResult {
  __type?: { enumValues: { name: string }[] };
}
interface TarkovDataQueryResult {
  tasks: Task[];
  maps: TarkovMap[];
  traders: Trader[];
  playerLevels: PlayerLevel[];
  // Add other top-level fields from tarkovDataQuery
}
interface TarkovHideoutQueryResult {
  hideoutStations: HideoutStation[];
}
// Type for static map data fetch
interface StaticMapData {
  [key: string]: { svg?: string }; // Changed from any to string
}
// Types for needed items
interface NeededItemBase {
  id: string;
  item: TarkovItem;
  count: number;
  foundInRaid?: boolean;
}
interface NeededItemTaskObjective extends NeededItemBase {
  needType: 'taskObjective';
  taskId: string;
  type?: string;
  markerItem?: TarkovItem;
}
interface NeededItemHideoutModule extends NeededItemBase {
  needType: 'hideoutModule';
  hideoutModule: HideoutModule;
}
// Types for map/objective lookups
interface ObjectiveMapInfo {
  objectiveID: string;
  mapID: string;
}
interface ObjectiveGPSInfo {
  objectiveID: string;
  x?: number;
  y?: number;
}
// --- End Type Definitions ---
provideApolloClient(apolloClient);
// --- Singleton State ---
const isInitialized = ref<boolean>(false);
const availableLanguages = ref<string[] | null>(null);
const queryErrors = ref<ApolloError | null>(null);
const queryResults = ref<TarkovDataQueryResult | null>(null);
const lastQueryTime = ref<number | null>(null);
const queryHideoutErrors = ref<ApolloError | null>(null);
const queryHideoutResults = ref<TarkovHideoutQueryResult | null>(null);
const lastHideoutQueryTime = ref<number | null>(null);
export const hideoutStations = ref<HideoutStation[]>([]);
export const hideoutModules = ref<HideoutModule[]>([]);
export const hideoutGraph = ref<Graph>(new Graph()); // Explicitly type as Graph
export const tasks = ref<Task[]>([]);
export const taskGraph = ref<Graph>(new Graph()); // Explicitly type as Graph
export const objectiveMaps = ref<{ [taskId: string]: ObjectiveMapInfo[] }>({});
export const alternativeTasks = ref<{ [taskId: string]: string[] }>({});
export const objectiveGPS = ref<{ [taskId: string]: ObjectiveGPSInfo[] }>({});
export const mapTasks = ref<{ [mapId: string]: string[] }>({});
export const neededItemTaskObjectives = ref<NeededItemTaskObjective[]>([]);
export const neededItemHideoutModules = ref<NeededItemHideoutModule[]>([]);
export const loading = ref<boolean>(false);
export const hideoutLoading = ref<boolean>(false);
const staticMapData = ref<StaticMapData | null>(null);
// Singleton loader for static maps (Pattern A): only fetch once
const MAPS_URL = 'https://tarkovtracker.github.io/tarkovdata/maps.json';
let mapPromise: Promise<StaticMapData> | null = null;
function loadMaps(): Promise<StaticMapData> {
  if (!mapPromise) {
    mapPromise = fetch(MAPS_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.statusText}`);
        return response.json() as Promise<StaticMapData>;
      })
      .catch((error) => {
        console.error('Failed to load maps:', error);
        return {} as StaticMapData;
      });
  }
  return mapPromise;
}
// Mapping from GraphQL map names (potentially different) to static data keys
const mapNameMapping: { [key: string]: string } = {
  'night factory': 'factory',
  'the lab': 'lab',
  'ground zero 21+': 'groundzero',
  'the labyrinth': 'labyrinth',
};
// Helper function types
function getPredecessors(graph: Graph, nodeId: string, visited: string[] = []): string[] {
  let predecessors: string[] = [];
  try {
    predecessors = graph.inNeighbors(nodeId);
    visited.push(nodeId);
  } catch (e) {
    console.error(`Error getting predecessors for node ${nodeId}:`, e);
    return [];
  }
  if (predecessors.length > 0) {
    for (const predecessor of predecessors) {
      if (visited.includes(predecessor)) {
        continue;
      }
      predecessors = predecessors.concat(
        getPredecessors(graph, predecessor, [...visited]) // Pass copy of visited
      );
    }
  }
  return [...new Set(predecessors)]; // Ensure uniqueness
}
function getSuccessors(graph: Graph, nodeId: string, visited: string[] = []): string[] {
  let successors: string[] = [];
  try {
    successors = graph.outNeighbors(nodeId);
    visited.push(nodeId);
  } catch (e) {
    console.error(`Error getting successors for node ${nodeId}:`, e);
    return [];
  }
  if (successors.length > 0) {
    for (const successor of successors) {
      if (visited.includes(successor)) {
        continue;
      }
      successors = successors.concat(getSuccessors(graph, successor, [...visited]));
    }
  }
  return [...new Set(successors)];
}
function extractLanguageCode(localeRef: Ref<string>): string {
  const localeValue = localeRef.value;
  const browserLocale = localeValue.split(/[-_]/)[0];

  if (availableLanguages.value?.includes(browserLocale)) {
    return browserLocale;
  } else {
    return 'en';
  }
}
const disabledTasks: string[] = [
  '61e6e5e0f5b9633f6719ed95',
  '61e6e60223374d168a4576a6',
  '61e6e621bfeab00251576265',
  '61e6e615eea2935bc018a2c5',
  '61e6e60c5ca3b3783662be27',
];
// --- Watchers defined outside useTarkovData to modify singleton state ---
watch(queryHideoutResults, (newValue) => {
  if (newValue?.hideoutStations) {
    const newHideoutGraph = new Graph();
    newValue.hideoutStations.forEach((station) => {
      station.levels.forEach((level) => {
        newHideoutGraph.mergeNode(level.id);
        level.stationLevelRequirements?.forEach((requirement) => {
          if (requirement?.station?.id) {
            // Find the required level's ID
            const requiredStation = newValue.hideoutStations.find(
              (s) => s.id === requirement.station.id
            );
            const requiredLevel = requiredStation?.levels.find(
              (l) => l.level === requirement.level
            );
            if (requiredLevel?.id) {
              newHideoutGraph.mergeNode(requiredLevel.id);
              newHideoutGraph.mergeEdge(requiredLevel.id, level.id);
            } else {
              console.warn(
                `Could not find required level ID for station ${requirement.station.id} ` +
                  `level ${requirement.level} needed by ${level.id}`
              );
            }
          }
        });
      });
    });
    const newModules: HideoutModule[] = [];
    const tempNeededModules: NeededItemHideoutModule[] = [];
    newValue.hideoutStations.forEach((station) => {
      station.levels.forEach((level) => {
        const predecessors = getPredecessors(newHideoutGraph, level.id);
        const successors = getSuccessors(newHideoutGraph, level.id);
        const parents = newHideoutGraph.inNeighbors(level.id);
        const children = newHideoutGraph.outNeighbors(level.id);
        const moduleData: HideoutModule = {
          ...level,
          stationId: station.id,
          predecessors,
          successors,
          parents,
          children,
        };
        newModules.push(moduleData);
        level.itemRequirements?.forEach((req) => {
          if (req?.item?.id) {
            tempNeededModules.push({
              id: req.id,
              needType: 'hideoutModule',
              hideoutModule: { ...moduleData }, // Copy module data
              item: req.item,
              count: req.count,
              foundInRaid: req.foundInRaid,
            });
          }
        });
      });
    });
    hideoutModules.value = newModules;
    neededItemHideoutModules.value = tempNeededModules;
    hideoutGraph.value = newHideoutGraph;
    hideoutStations.value = newValue.hideoutStations;
  } else {
    hideoutModules.value = [];
    neededItemHideoutModules.value = [];
    hideoutGraph.value = new Graph();
    hideoutStations.value = [];
  }
});
watch(queryResults, (newValue) => {
  if (newValue?.tasks) {
    const newTaskGraph = new Graph();
    const activeRequirements: { task: Task; requirement: TaskRequirement }[] = [];
    // Build initial graph based on non-active requirements
    newValue.tasks.forEach((task) => {
      newTaskGraph.mergeNode(task.id);
      task.taskRequirements?.forEach((requirement) => {
        if (requirement?.task?.id) {
          if (requirement.status?.includes('active')) {
            activeRequirements.push({ task, requirement });
          } else {
            // Ensure the required task exists in the main list before adding edge
            if (newValue.tasks.some((t) => t.id === requirement.task.id)) {
              newTaskGraph.mergeNode(requirement.task.id);
              newTaskGraph.mergeEdge(requirement.task.id, task.id);
            }
          }
        }
      });
    });
    // Handle active requirements by linking predecessors of the requirement to the task
    activeRequirements.forEach(({ task, requirement }) => {
      const requiredTaskNodeId = requirement.task.id;
      if (newTaskGraph.hasNode(requiredTaskNodeId)) {
        const requiredTaskPredecessors = newTaskGraph.inNeighbors(requiredTaskNodeId);
        requiredTaskPredecessors.forEach((predecessorId) => {
          if (newTaskGraph.hasNode(task.id)) {
            // Ensure target task node exists
            newTaskGraph.mergeEdge(predecessorId, task.id);
          }
        });
      }
    });
    // Reset lookups
    const tempMapTasks: { [mapId: string]: string[] } = {};
    const tempObjectiveMaps: { [taskId: string]: ObjectiveMapInfo[] } = {};
    const tempObjectiveGPS: { [taskId: string]: ObjectiveGPSInfo[] } = {};
    const tempAlternativeTasks: { [taskId: string]: string[] } = {};
    const tempNeededObjectives: NeededItemTaskObjective[] = [];
    const newTasks: Task[] = [];
    newValue.tasks.forEach((task) => {
      if (!newTaskGraph.hasNode(task.id)) {
        console.warn(`Task ${task.id} not found in graph, skipping processing.`);
        return; // Skip if node somehow doesn't exist
      }
      const predecessors = getPredecessors(newTaskGraph, task.id);
      const successors = getSuccessors(newTaskGraph, task.id);
      const parents = newTaskGraph.inNeighbors(task.id);
      const children = newTaskGraph.outNeighbors(task.id);

      // Check if finishRewards exists and is an array before iterating
      if (Array.isArray(task.finishRewards)) {
        task.finishRewards.forEach((reward) => {
          if (
            reward?.__typename === 'QuestStatusReward' &&
            reward.status === 'Fail' &&
            reward.quest?.id
          ) {
            if (!tempAlternativeTasks[reward.quest.id]) {
              tempAlternativeTasks[reward.quest.id] = [];
            }
            tempAlternativeTasks[reward.quest.id].push(task.id);
          }
        });
      } // End of Array.isArray check
      task.objectives?.forEach((objective) => {
        if (objective?.location?.id) {
          const mapId = objective.location.id;
          if (!tempMapTasks[mapId]) {
            tempMapTasks[mapId] = [];
          }
          if (!tempMapTasks[mapId].includes(task.id)) {
            // Avoid duplicates
            tempMapTasks[mapId].push(task.id);
          }
          if (!tempObjectiveMaps[task.id]) {
            tempObjectiveMaps[task.id] = [];
          }
          // Ensure objectiveID is a string, and mapID is a string
          tempObjectiveMaps[task.id].push({
            objectiveID: String(objective.id),
            mapID: String(mapId),
          });
          if (!tempObjectiveGPS[task.id]) {
            tempObjectiveGPS[task.id] = [];
          }
          // Only add if x and y are present
          if (objective.x !== undefined && objective.y !== undefined) {
            tempObjectiveGPS[task.id].push({
              objectiveID: objective.id,
              x: objective.x,
              y: objective.y,
            });
          }
        }
        if (objective?.item?.id || objective?.markerItem?.id) {
          tempNeededObjectives.push({
            id: objective.id,
            needType: 'taskObjective',
            taskId: task.id,
            type: objective.type,
            item: objective.item!, // Assert non-null if logic guarantees one exists
            markerItem: objective.markerItem,
            count: objective.count ?? 1, // Default count to 1 if undefined
            foundInRaid: objective.foundInRaid ?? false, // Default FIR to false
          });
        }
      });
      newTasks.push({
        ...task,
        traderIcon: task.trader?.imageLink,
        predecessors,
        successors,
        parents,
        children,
      });
    });
    tasks.value = newTasks;
    neededItemTaskObjectives.value = tempNeededObjectives;
    taskGraph.value = newTaskGraph;
    mapTasks.value = tempMapTasks;
    objectiveMaps.value = tempObjectiveMaps;
    objectiveGPS.value = tempObjectiveGPS;
    alternativeTasks.value = tempAlternativeTasks;
  } else {
    tasks.value = [];
    neededItemTaskObjectives.value = [];
    taskGraph.value = new Graph();
    mapTasks.value = {};
    objectiveMaps.value = {};
    objectiveGPS.value = {};
    alternativeTasks.value = {};
  }
});
// Define objectives computed property
export const objectives = computed<TaskObjective[]>(() => {
  if (!queryResults.value?.tasks) {
    return [];
  }
  const allObjectives: TaskObjective[] = [];
  queryResults.value.tasks.forEach((task) => {
    task.objectives?.forEach((obj) => {
      if (obj) {
        allObjectives.push({ ...obj, taskId: task.id });
      }
    });
  });
  return allObjectives;
});
// Computed Property for Maps
export const maps = computed<TarkovMap[]>(() => {
  if (!queryResults.value?.maps || !staticMapData.value) {
    return [];
  }
  const mergedMaps = queryResults.value.maps.map((map) => {
    const lowerCaseName = map.name.toLowerCase();
    const mapKey = mapNameMapping[lowerCaseName] || lowerCaseName.replace(/\s+|\+/g, '');
    const staticData = staticMapData.value?.[mapKey];
    if (staticData?.svg) {
      return {
        ...map,
        svg: staticData.svg,
      };
    } else {
      console.warn(`Static SVG data not found for map: ${map.name} (lookup key: ${mapKey})`);
      return map; // Return original map data without SVG
    }
  });
  return [...mergedMaps].sort((a, b) => a.name.localeCompare(b.name));
});
// Computed Property for Traders
export const traders = computed<Trader[]>(() => {
  if (!queryResults.value?.traders) {
    return [];
  }
  return [...queryResults.value.traders].sort((a, b) => a.name.localeCompare(b.name));
});
// Computed Properties for Player Level Constraints
export const playerLevels = computed<PlayerLevel[]>(() => queryResults.value?.playerLevels || []);
const minPlayerLevel = computed<number>(() => {
  if (!playerLevels.value.length) return 1;
  return Math.min(...playerLevels.value.map((l) => l.level));
});
const maxPlayerLevel = computed<number>(() => {
  if (!playerLevels.value.length) return 79; // Assuming 79 is a sensible default max
  return Math.max(...playerLevels.value.map((l) => l.level));
});
// --- Main Exported Composable ---
export function useTarkovData() {
  const { locale } = useI18n({ useScope: 'global' });
  const languageCode = computed<string>(() => extractLanguageCode(locale));
  onMounted(() => {
    loadMaps().then((data) => {
      staticMapData.value = data;
    });
  });
  // Initialize queries only once
  if (!isInitialized.value) {
    isInitialized.value = true;
    // === Language Query ===
    const { onResult: languageOnResult, onError: languageOnError } = useQuery<LanguageQueryResult>(
      languageQuery,
      null,
      {
        fetchPolicy: 'cache-first',
        notifyOnNetworkStatusChange: true,
        errorPolicy: 'all',
      }
    );
    languageOnResult((result) => {
      availableLanguages.value = result.data?.__type?.enumValues.map(
        (enumValue) => enumValue.name
      ) ?? ['en'];
    });
    languageOnError((error) => {
      console.error('Language query failed:', error);
      availableLanguages.value = ['en'];
    });
    // === Task Query ===
    const {
      result: taskResultRef,
      error: taskErrorRef,
      loading: taskLoadingRef,
      refetch: taskRefetch,
    } = useQuery<TarkovDataQueryResult, { lang: string }>(
      tarkovDataQuery,
      () => ({ lang: languageCode.value }),
      {
        fetchPolicy: 'cache-first',
        notifyOnNetworkStatusChange: true,
        errorPolicy: 'all',
        enabled: computed(() => !!availableLanguages.value),
      }
    );
    watch(
      taskResultRef,
      (newResult) => {
        if (newResult) {
          lastQueryTime.value = Date.now();
          queryResults.value = newResult; // Assign directly, type matches
        }
      },
      { immediate: true }
    );
    watch(
      taskErrorRef,
      (newError) => {
        if (newError) {
          queryErrors.value = newError;
          console.error('Task query error:', newError);
        }
      },
      { immediate: true }
    );
    watch(
      taskLoadingRef,
      (newLoading) => {
        loading.value = newLoading;
      },
      { immediate: true }
    );
    // === Hideout Query ===
    const {
      result: hideoutResultRef,
      error: hideoutErrorRef,
      loading: hideoutLoadingRef,
      refetch: hideoutRefetch,
    } = useQuery<TarkovHideoutQueryResult, { lang: string }>(
      tarkovHideoutQuery,
      () => ({ lang: languageCode.value }),
      {
        fetchPolicy: 'cache-first',
        notifyOnNetworkStatusChange: true,
        errorPolicy: 'all',
        enabled: computed(() => !!availableLanguages.value),
      }
    );
    watch(
      hideoutResultRef,
      (newResult) => {
        if (newResult) {
          lastHideoutQueryTime.value = Date.now();
          queryHideoutResults.value = newResult;
          console.debug('Hideout query results updated');
        }
      },
      { immediate: true }
    );
    watch(
      hideoutErrorRef,
      (newError) => {
        if (newError) {
          queryHideoutErrors.value = newError;
          console.error('Hideout query error:', newError);
        }
      },
      { immediate: true }
    );
    watch(
      hideoutLoadingRef,
      (newLoading) => {
        hideoutLoading.value = newLoading;
      },
      { immediate: true }
    );
    // Refetch data when language changes (post-initial)
    watch(languageCode, (newLang, oldLang) => {
      if (oldLang !== newLang && availableLanguages.value && isInitialized.value) {
        taskRefetch({ lang: newLang });
        hideoutRefetch({ lang: newLang });
      }
    });
  } // End of initialization block
  // --- Return the singleton reactive refs (explicitly typed) ---
  return {
    availableLanguages: availableLanguages as Ref<string[] | null>,
    languageCode: languageCode as ComputedRef<string>,
    queryErrors: queryErrors as Ref<ApolloError | null>,
    queryResults: queryResults as Ref<TarkovDataQueryResult | null>,
    lastQueryTime: lastQueryTime as Ref<number | null>,
    loading: loading as Ref<boolean>,
    hideoutLoading: hideoutLoading as Ref<boolean>,
    queryHideoutErrors: queryHideoutErrors as Ref<ApolloError | null>,
    queryHideoutResults: queryHideoutResults as Ref<TarkovHideoutQueryResult | null>,
    lastHideoutQueryTime: lastHideoutQueryTime as Ref<number | null>,
    hideoutStations: hideoutStations as Ref<HideoutStation[]>,
    hideoutModules: hideoutModules as Ref<HideoutModule[]>,
    hideoutGraph: hideoutGraph as Ref<Graph>,
    tasks: tasks as Ref<Task[]>,
    taskGraph: taskGraph as Ref<Graph>,
    objectiveMaps: objectiveMaps as Ref<{
      [taskId: string]: ObjectiveMapInfo[];
    }>,
    alternativeTasks: alternativeTasks as Ref<{ [taskId: string]: string[] }>,
    objectiveGPS: objectiveGPS as Ref<{ [taskId: string]: ObjectiveGPSInfo[] }>,
    mapTasks: mapTasks as Ref<{ [mapId: string]: string[] }>,
    objectives: objectives as ComputedRef<TaskObjective[]>,
    maps: maps as ComputedRef<TarkovMap[]>,
    traders: traders as ComputedRef<Trader[]>,
    neededItemTaskObjectives: neededItemTaskObjectives as Ref<NeededItemTaskObjective[]>,
    neededItemHideoutModules: neededItemHideoutModules as Ref<NeededItemHideoutModule[]>,
    disabledTasks,
    playerLevels: playerLevels as ComputedRef<PlayerLevel[]>,
    minPlayerLevel: minPlayerLevel as ComputedRef<number>,
    maxPlayerLevel: maxPlayerLevel as ComputedRef<number>,
  };
}
