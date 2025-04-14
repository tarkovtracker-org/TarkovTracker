import { useQuery, provideApolloClient } from "@vue/apollo-composable";
import { computed, ref, watch, watchEffect, onMounted } from "vue";
import apolloClient from "@/plugins/apollo";
import tarkovDataQuery from "@/utils/tarkovdataquery.js";
import tarkovHideoutQuery from "@/utils/tarkovhideoutquery.js";
import languageQuery from "@/utils/languagequery.js";
import { useI18n } from 'vue-i18n';
// Import graphlib so that we can use it in the watch function
import Graph from "graphology";

provideApolloClient(apolloClient);

// --- Singleton State ---
const isInitialized = ref(false);
const availableLanguages = ref(null);
const queryErrors = ref(null);
const queryResults = ref(null);
const lastQueryTime = ref(null);
const queryHideoutErrors = ref(null);
const queryHideoutResults = ref(null);
const lastHideoutQueryTime = ref(null);
const hideoutStations = ref([]);
const hideoutModules = ref([]);
const hideoutGraph = ref({});
const tasks = ref([]);
const taskGraph = ref({});
const objectiveMaps = ref({});
const alternativeTasks = ref({});
const objectiveGPS = ref({});
const mapTasks = ref({});
const neededItemTaskObjectives = ref([]);
const neededItemHideoutModules = ref([]);
const loading = ref(false); // Combine loading states if needed, or keep separate
const hideoutLoading = ref(false);
const staticMapData = ref(null); // Add ref for static map data
// --- End Singleton State ---

// Mapping from GraphQL map names (potentially different) to static data keys
const mapNameMapping = {
  "night factory": "factory",
  "the lab": "lab",
  "ground zero 21+": "groundzero",
  "the labyrinth": "streetsoftarkov", // Assuming 'The Labyrinth' maps to 'streetsoftarkov'
};

// Function to recursively get all of the predecessors for a task
function getPredecessors(graph, nodeId, visited = []) {
  let predecessors = [];
  try {
    predecessors = graph.inNeighbors(nodeId);
    visited.push(nodeId);
  } catch {
    console.error("Error getting predecessors for node " + nodeId);
    return [];
  }
  if (predecessors.length > 0) {
    for (let predecessor of predecessors) {
      if (visited.includes(predecessor)) {
        continue;
      }
      predecessors = predecessors.concat(
        getPredecessors(graph, predecessor, visited)
      );
    }
  }
  return predecessors;
}

// Function to recursively get all of the successors for a task
function getSuccessors(graph, nodeId, visited = []) {
  let successors = [];
  try {
    successors = graph.outNeighbors(nodeId);
    visited.push(nodeId);
  } catch {
    console.error("Error getting successors for node " + nodeId);
    return [];
  }
  if (successors.length > 0) {
    for (let successor of successors) {
      if (visited.includes(successor)) {
        continue;
      }
      successors = successors.concat(getSuccessors(graph, successor, visited));
    }
  }
  return successors;
}

function extractLanguageCode(localeRef) {
  const localeValue = localeRef.value;
  // Return only the language code remove any dash or underscore and what comes after
  let browserLocale = localeValue.split(/[-_]/)[0];
  // If the available languages include the browser locale, return the browser locale
  // otherwise, default to English
  if (availableLanguages.value?.includes(browserLocale)) {
    return browserLocale;
  } else {
    // Default to 'en' if languages haven't loaded yet or browser locale isn't supported
    return "en";
  }
}

const disabledTasks = [
  "61e6e5e0f5b9633f6719ed95",
  "61e6e60223374d168a4576a6",
  "61e6e621bfeab00251576265",
  "61e6e615eea2935bc018a2c5",
  "61e6e60c5ca3b3783662be27",
];

// --- Watchers defined outside useTarkovData to modify singleton state ---

watch(queryHideoutResults, async (newValue, oldValue) => {
  if (newValue?.hideoutStations) {
    let newHideoutGraph = new Graph();
    newValue.hideoutStations?.forEach((station) => {
      station.levels?.forEach((level) => {
        newHideoutGraph.mergeNode(level.id);
        level.stationLevelRequirements?.forEach((requirement) => {
          if (requirement != null) {
            let requiredStation = newValue.hideoutStations?.find(
              (s) => s.id === requirement.station?.id
            );
            let requiredLevel = requiredStation?.levels?.find(
              (l) => l.level === requirement.level
            );
            if (requiredLevel) {
              newHideoutGraph.mergeNode(requiredLevel.id);
              newHideoutGraph.mergeEdge(requiredLevel.id, level.id);
            } else {
              console.warn(
                `Could not find required level for station ${requirement.station?.id} level ${requirement.level} needed by ${level.id}`
              );
            }
          }
        });
      });
    });

    let newModules = [];
    let tempNeededModules = [];
    newValue.hideoutStations?.forEach((station) => {
      station.levels?.forEach((level) => {
        const moduleData = {
          ...level,
          stationId: station.id,
          predecessors: [
            ...new Set(getPredecessors(newHideoutGraph, level.id)),
          ],
          successors: [...new Set(getSuccessors(newHideoutGraph, level.id))],
          parents: newHideoutGraph.inNeighbors(level.id),
          children: newHideoutGraph.outNeighbors(level.id),
        };
        newModules.push(moduleData);

        level.itemRequirements?.forEach((req) => {
          if (req?.item?.id) {
            tempNeededModules.push({
              id: req.id,
              needType: "hideoutModule",
              hideoutModule: moduleData,
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

// Watch for changes to queryResults.value?.tasks and update the task graph
watch(queryResults, async (newValue, oldValue) => {
  if (newValue?.tasks) {
    let newTaskGraph = new Graph();
    let activeRequirements = [];

    for (let task of newValue.tasks || []) {
      newTaskGraph.mergeNode(task.id);
      if (task.taskRequirements?.length > 0) {
        for (let requirement of task.taskRequirements) {
          if (!requirement?.task) continue;

          if (requirement?.status?.includes("active")) {
            activeRequirements.push({ task, requirement });
          } else {
            if (newValue.tasks?.find((t) => t.id === requirement.task.id)) {
              newTaskGraph.mergeNode(requirement.task.id);
              newTaskGraph.mergeEdge(requirement.task.id, task.id);
            }
          }
        }
      }
    }

    for (let activeRequirement of activeRequirements) {
      const requiredTaskNodeId = activeRequirement.requirement.task.id;
      if (!newTaskGraph.hasNode(requiredTaskNodeId)) continue;

      const requiredTaskPredecessors =
        newTaskGraph.inNeighbors(requiredTaskNodeId);
      for (let predecessor of requiredTaskPredecessors) {
        if (!newTaskGraph.hasNode(activeRequirement.task.id)) continue;
        newTaskGraph.mergeEdge(predecessor, activeRequirement.task.id);
      }
    }

    mapTasks.value = {};
    objectiveMaps.value = {};
    objectiveGPS.value = {};
    alternativeTasks.value = {};

    let newTasks = [];
    let tempMapTasks = {};
    let tempNeededObjectives = [];

    for (let task of newValue.tasks || []) {
      newTaskGraph.mergeNode(task.id);

      let taskPredecessors = [
        ...new Set(getPredecessors(newTaskGraph, task.id)),
      ];
      let taskSuccessors = [...new Set(getSuccessors(newTaskGraph, task.id))];

      let taskParents = newTaskGraph.inNeighbors(task.id);
      let taskChildren = newTaskGraph.outNeighbors(task.id);

      if (Array.isArray(task.finishRewards)) {
        task.finishRewards.forEach((reward) => {
          if (reward?.__typename === "QuestStatusReward") {
            if (reward.status === "Fail" && reward.quest?.id) {
              if (!alternativeTasks.value[reward.quest.id]) {
                alternativeTasks.value[reward.quest.id] = [];
              }
              alternativeTasks.value[reward.quest.id].push(task.id);
            }
          }
        });
      }

      if (task.objectives?.length > 0) {
        for (let objective of task.objectives) {
          if (objective?.location?.id) {
            let mapId = objective.location.id;
            if (!tempMapTasks[mapId]) {
              tempMapTasks[mapId] = [];
            }
            tempMapTasks[mapId].push(task.id);

            if (!objectiveMaps.value[task.id]) {
              objectiveMaps.value[task.id] = [];
            }
            objectiveMaps.value[task.id].push({
              objectiveID: objective.id,
              mapID: mapId,
            });
            if (!objectiveGPS.value[task.id]) {
              objectiveGPS.value[task.id] = [];
            }
            objectiveGPS.value[task.id].push({
              objectiveID: objective.id,
              x: objective.x,
              y: objective.y,
            });
          }

          if (objective?.item?.id || objective?.markerItem?.id) {
            tempNeededObjectives.push({
              id: objective.id,
              needType: "taskObjective",
              taskId: task.id,
              type: objective.type,
              item: objective.item,
              markerItem: objective.markerItem,
              count: objective.count,
              foundInRaid: objective.foundInRaid,
            });
          }
        }
      }

      newTasks.push({
        ...task,
        traderIcon: task.trader?.imageLink,
        predecessors: taskPredecessors,
        successors: taskSuccessors,
        parents: taskParents,
        children: taskChildren,
      });
    }

    tasks.value = newTasks;
    neededItemTaskObjectives.value = tempNeededObjectives;
    taskGraph.value = newTaskGraph;
    mapTasks.value = tempMapTasks;
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
const objectives = computed(() => {
  if (!queryResults.value?.tasks) {
    return []; // Return empty if tasks data isn't available
  }
  const allObjectives = [];
  queryResults.value.tasks.forEach((task) => {
    if (task && task.objectives) {
      // Add task context if needed, e.g., taskId
      task.objectives.forEach((obj) => {
        if (obj) {
          // Ensure objective object exists
          allObjectives.push({ ...obj, taskId: task.id }); // Spread obj and add taskId
        }
      });
    }
  });
  return allObjectives;
});

// --- Add New Computed Property for Maps ---
const maps = computed(() => {
  if (!queryResults.value?.maps || !staticMapData.value) {
    // Return empty array if either query results or static data isn't ready
    // Or if static data failed to load
    return [];
  }

  // Merge GraphQL map data with static SVG data
  const mergedMaps = queryResults.value.maps.map((map) => {
    const lowerCaseName = map.name.toLowerCase(); // Get lowercase name with spaces
    let mapKey;

    // 1. Check if an explicit mapping exists for the name with spaces
    if (mapNameMapping[lowerCaseName]) {
      mapKey = mapNameMapping[lowerCaseName];
    } else {
      // 2. If no explicit mapping, normalize the name (remove spaces/symbols) as a fallback key
      mapKey = lowerCaseName.replace(/\s+|\+/g, ''); // Remove spaces and '+' for keys like groundzero21+
    }

    // Use the determined mapKey to find static data
    const staticData = staticMapData.value[mapKey];

    if (staticData && staticData.svg) {
      // Merge the svg object from static data
      return {
        ...map,
        svg: staticData.svg,
      };
    } else {
      console.warn(`Static SVG data not found for map: ${map.name} (lookup key: ${mapKey})`);
      // Return the map without SVG data if no match found
      return map;
    }
  });

  // Sort maps alphabetically by name
  return [...mergedMaps].sort((a, b) => a.name.localeCompare(b.name));
});
// --- End New Computed Property ---

// --- Main Exported Composable ---
export function useTarkovData() {
  // Obtain i18n context using the composable
  const { locale } = useI18n();

  // Define languageCode computed property here, using the locale from useI18n
  const languageCode = computed(() => extractLanguageCode(locale));

  // Fetch static map data when the composable is mounted
  onMounted(async () => {
    try {
      const response = await fetch('https://tarkovtracker.github.io/tarkovdata/maps.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      staticMapData.value = await response.json();
      console.log("Static map data loaded successfully:", staticMapData.value);
    } catch (error) {
      console.error("Failed to fetch static map data:", error);
      // Handle error appropriately, maybe set a default or show a message
      staticMapData.value = {}; // Set to empty object on error
    }
  });

  // Initialize queries only once
  if (!isInitialized.value) {
    isInitialized.value = true; // Set flag immediately

    // === Language Query ===
    const { onResult: languageOnResult, onError: languageOnError } = useQuery(
      languageQuery,
      null, // No variables needed
      {
        fetchPolicy: "cache-first", // Cache first for languages
        notifyOnNetworkStatusChange: true,
        errorPolicy: "all",
      }
    );

    languageOnResult((result) => {
      // Use optional chaining for safety
      availableLanguages.value = result.data?.__type?.enumValues.map(
        (enumValue) => enumValue.name
      ) ?? ["en"]; // Default to English array if chain fails
    });

    languageOnError((error) => {
      console.error("Language query failed:", error);
      availableLanguages.value = ["en"]; // Default to English on error
    });

    // === Task Query ===
    const {
      result: taskResultRef, // Direct ref to result
      error: taskErrorRef, // Direct ref to error
      loading: taskLoadingRef, // Direct ref to loading
      refetch: taskRefetch,
    } = useQuery(
      tarkovDataQuery,
      () => ({ lang: languageCode.value }), // Make variables reactive
      {
        fetchPolicy: "cache-and-network",
        notifyOnNetworkStatusChange: true,
        errorPolicy: "all",
        enabled: computed(() => !!availableLanguages.value), // Only enable after languages are loaded
      }
    );

    // Watch the direct refs and update singleton state
    watch(
      taskResultRef,
      (newResult) => {
        if (newResult) {
          lastQueryTime.value = Date.now();
          queryResults.value = newResult; // Update singleton state
        }
      },
      { immediate: true }
    );

    watch(
      taskErrorRef,
      (newError) => {
        if (newError) {
          queryErrors.value = newError; // Update singleton state
          console.error("Task query error:", newError);
        }
      },
      { immediate: true }
    );

    watch(
      taskLoadingRef,
      (newLoading) => {
        loading.value = newLoading; // Update singleton state
      },
      { immediate: true }
    );

    // === Hideout Query ===
    const {
      result: hideoutResultRef,
      error: hideoutErrorRef,
      loading: hideoutLoadingRef,
      refetch: hideoutRefetch,
    } = useQuery(
      tarkovHideoutQuery,
      () => ({ lang: languageCode.value }), // Make variables reactive
      {
        fetchPolicy: "cache-and-network",
        notifyOnNetworkStatusChange: true,
        errorPolicy: "all",
        enabled: computed(() => !!availableLanguages.value), // Only enable after languages are loaded
      }
    );

    // Watch the direct refs and update singleton state
    watch(
      hideoutResultRef,
      (newResult) => {
        if (newResult) {
          lastHideoutQueryTime.value = Date.now();
          queryHideoutResults.value = newResult; // Update singleton state
          console.debug("Hideout query results updated");
        }
      },
      { immediate: true }
    );

    watch(
      hideoutErrorRef,
      (newError) => {
        if (newError) {
          queryHideoutErrors.value = newError; // Update singleton state
          console.error("Hideout query error:", newError);
        }
      },
      { immediate: true }
    );

    watch(
      hideoutLoadingRef,
      (newLoading) => {
        hideoutLoading.value = newLoading; // Update singleton state
      },
      { immediate: true }
    );

    // Refetch data when language changes
    watchEffect(() => {
      const currentLang = languageCode.value; // Dependency
      if (availableLanguages.value && isInitialized.value) {
        // Ensure initialized and languages are loaded
        console.log(`Language changed to ${currentLang}, refetching data...`);
        taskRefetch({ lang: currentLang });
        hideoutRefetch({ lang: currentLang });
      }
    });
  } // End of initialization block

  // --- Return the singleton reactive refs ---
  return {
    availableLanguages,
    languageCode,
    queryErrors,
    queryResults,
    lastQueryTime,
    loading, // Return combined or specific loading states
    hideoutLoading,
    queryHideoutErrors,
    queryHideoutResults,
    lastHideoutQueryTime,
    hideoutStations,
    hideoutModules,
    hideoutGraph,
    tasks,
    taskGraph,
    objectiveMaps,
    alternativeTasks,
    objectiveGPS,
    mapTasks,
    objectives,
    maps,
    neededItemTaskObjectives,
    neededItemHideoutModules,
    disabledTasks,
  };
}
