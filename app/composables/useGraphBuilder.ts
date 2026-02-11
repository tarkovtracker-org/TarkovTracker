import type {
  HideoutModule,
  HideoutStation,
  NeededItemHideoutModule,
  NeededItemTaskObjective,
  ObjectiveGPSInfo,
  ObjectiveMapInfo,
  Task,
  TaskObjective,
  TaskRequirement,
} from '@/types/tarkov';
import {
  createGraph,
  type TaskGraph,
  getChildren,
  getParents,
  getPredecessors,
  getSuccessors,
  safeAddEdge,
  safeAddNode,
} from '@/utils/graphHelpers';
import { logger } from '@/utils/logger';
import { normalizeTaskObjectives } from '@/utils/taskNormalization';
import { buildRequiredKeysFromObjectives } from '@/utils/taskRequiredKeys';
/**
 * Composable for building task and hideout dependency graphs
 * Extracts complex graph algorithms from the metadata store
 */
export function useGraphBuilder() {
  const normalizeStatus = (status: string[] | undefined) =>
    (status ?? []).map((entry) => entry.toLowerCase());
  const hasStatus = (status: string[] | undefined, statuses: string[]) => {
    const normalized = normalizeStatus(status);
    return statuses.some((value) => normalized.includes(value));
  };
  const isActiveOnly = (status: string[] | undefined) => {
    const normalized = normalizeStatus(status);
    const hasActive =
      normalized.includes('active') ||
      normalized.includes('accept') ||
      normalized.includes('accepted');
    const hasOther =
      normalized.includes('complete') ||
      normalized.includes('completed') ||
      normalized.includes('failed');
    return hasActive && !hasOther;
  };
  /**
   * Builds the task graph from task requirements
   */
  function buildTaskGraph(taskList: Task[]): TaskGraph {
    const newGraph = createGraph();
    const activeRequirements: { task: Task; requirement: TaskRequirement }[] = [];
    // Add all tasks as nodes and process non-active requirements
    taskList.forEach((task) => {
      safeAddNode(newGraph, task.id);
      task.taskRequirements?.forEach((requirement) => {
        if (requirement?.task?.id) {
          if (isActiveOnly(requirement.status)) {
            activeRequirements.push({ task, requirement });
          } else {
            // Ensure the required task exists before adding edge
            if (taskList.some((t) => t.id === requirement.task.id)) {
              safeAddNode(newGraph, requirement.task.id);
              safeAddEdge(newGraph, requirement.task.id, task.id);
            }
          }
        }
      });
    });
    // Handle active requirements by linking predecessors
    activeRequirements.forEach(({ task, requirement }) => {
      const requiredTaskNodeId = requirement.task.id;
      if (newGraph.hasNode(requiredTaskNodeId)) {
        const predecessors = getParents(newGraph, requiredTaskNodeId);
        predecessors.forEach((predecessorId) => {
          safeAddEdge(newGraph, predecessorId, task.id);
        });
      }
    });
    return newGraph;
  }
  /**
   * Processes tasks to extract map, GPS, and item information
   */
  function processTaskRelationships(taskList: Task[]) {
    const tempMapTasks: { [mapId: string]: string[] } = {};
    const tempObjectiveMaps: { [taskId: string]: ObjectiveMapInfo[] } = {};
    const tempObjectiveGPS: { [taskId: string]: ObjectiveGPSInfo[] } = {};
    const tempAlternativeTasks: { [taskId: string]: string[] } = {};
    const tempNeededObjectives: NeededItemTaskObjective[] = [];
    const taskById = new Map(taskList.map((task) => [task.id, task]));
    const addAlternative = (sourceId: string | undefined, alternativeId: string) => {
      if (!sourceId || sourceId === alternativeId) return;
      if (!tempAlternativeTasks[sourceId]) {
        tempAlternativeTasks[sourceId] = [];
      }
      if (!tempAlternativeTasks[sourceId]!.includes(alternativeId)) {
        tempAlternativeTasks[sourceId]!.push(alternativeId);
      }
    };
    const hasFailConditionForTask = (task: Task | undefined, targetTaskId: string) => {
      const failConditions = task?.failConditions;
      const normalizedFailConditions = Array.isArray(failConditions)
        ? failConditions
        : normalizeTaskObjectives<TaskObjective>(failConditions);
      if (!normalizedFailConditions.length) return false;
      return normalizedFailConditions.some(
        (objective) =>
          objective?.task?.id === targetTaskId &&
          hasStatus(objective.status, ['complete', 'completed'])
      );
    };
    taskList.forEach((task) => {
      // Process taskRequirements to find alternative tasks.
      // Active-only requirements can represent branching when the required task
      // explicitly fails if this task is completed.
      task.taskRequirements?.forEach((requirement) => {
        if (requirement?.task?.id && isActiveOnly(requirement.status)) {
          const requiredTask = taskById.get(requirement.task.id);
          // If the required task fails when this task completes, treat them as mutual alternatives.
          if (hasFailConditionForTask(requiredTask, task.id)) {
            addAlternative(requirement.task.id, task.id);
          }
        }
      });
      // Process objectives
      const objectives = Array.isArray(task.objectives)
        ? task.objectives
        : normalizeTaskObjectives<TaskObjective>(task.objectives);
      objectives.forEach((objective) => {
        // Map and location data
        if (objective?.location?.id) {
          const mapId = objective.location.id;
          if (!tempMapTasks[mapId]) {
            tempMapTasks[mapId] = [];
          }
          if (!tempMapTasks[mapId].includes(task.id)) {
            tempMapTasks[mapId].push(task.id);
          }
          if (!tempObjectiveMaps[task.id]) {
            tempObjectiveMaps[task.id] = [];
          }
          tempObjectiveMaps[task.id]!.push({
            objectiveID: String(objective.id),
            mapID: String(mapId),
          });
          // GPS coordinates
          if (objective.x !== undefined && objective.y !== undefined) {
            if (!tempObjectiveGPS[task.id]) {
              tempObjectiveGPS[task.id] = [];
            }
            tempObjectiveGPS[task.id]!.push({
              objectiveID: objective.id,
              x: objective.x,
              y: objective.y,
            });
          }
        }
        // Item requirements
        // Exclude "findItem" and "findQuestItem" objectives as they are passive checks that auto-complete
        // when the player acquires the items for the corresponding "giveItem"/"giveQuestItem" objective
        if (
          (objective?.item?.id || objective?.items?.[0]?.id || objective?.markerItem?.id) &&
          objective.type !== 'findItem' &&
          objective.type !== 'findQuestItem'
        ) {
          const primaryItem = objective.item ?? objective.items?.[0];
          tempNeededObjectives.push({
            id: objective.id,
            needType: 'taskObjective',
            taskId: task.id,
            type: objective.type,
            item: primaryItem ?? objective.markerItem!,
            markerItem: objective.markerItem,
            count: objective.count ?? 1,
            foundInRaid: objective.foundInRaid ?? false,
          });
        }
      });
      // Process fail conditions for alternative tasks (complete-status triggers)
      const failConditions = Array.isArray(task.failConditions)
        ? task.failConditions
        : normalizeTaskObjectives<TaskObjective>(task.failConditions);
      failConditions.forEach((objective) => {
        if (objective?.task?.id && hasStatus(objective.status, ['complete', 'completed'])) {
          addAlternative(objective.task.id, task.id);
        }
      });
    });
    return {
      tempMapTasks,
      tempObjectiveMaps,
      tempObjectiveGPS,
      tempAlternativeTasks,
      tempNeededObjectives,
    };
  }
  /**
   * Enhances tasks with graph relationship data
   */
  function enhanceTasksWithRelationships(
    taskList: Task[],
    graph: TaskGraph,
    alternativeTasks: Record<string, string[]>
  ): Task[] {
    return taskList.map((task) => ({
      ...task,
      traderIcon: task.trader?.imageLink,
      alternatives: alternativeTasks[task.id] ?? task.alternatives,
      requiredKeys: buildRequiredKeysFromObjectives(
        normalizeTaskObjectives<TaskObjective>(task.objectives)
      ),
      predecessors: getPredecessors(graph, task.id),
      successors: getSuccessors(graph, task.id),
      parents: getParents(graph, task.id),
      children: getChildren(graph, task.id),
    }));
  }
  /**
   * Builds the hideout dependency graph from station level requirements
   */
  function buildHideoutGraph(stations: HideoutStation[]): TaskGraph {
    const newGraph = createGraph();
    stations.forEach((station) => {
      station.levels.forEach((level) => {
        safeAddNode(newGraph, level.id);
        level.stationLevelRequirements?.forEach((requirement) => {
          if (requirement?.station?.id) {
            // Find the required level's ID
            const requiredStation = stations.find((s) => s.id === requirement.station.id);
            const requiredLevel = requiredStation?.levels.find(
              (l) => l.level === requirement.level
            );
            if (requiredLevel?.id) {
              safeAddNode(newGraph, requiredLevel.id);
              safeAddEdge(newGraph, requiredLevel.id, level.id);
            } else {
              logger.warn(
                `[GraphBuilder] Could not find required level ID for station ${requirement.station.id} ` +
                  `level ${requirement.level} needed by ${level.id}`
              );
            }
          }
        });
      });
    });
    return newGraph;
  }
  /**
   * Converts hideout levels to modules with relationship data
   */
  function createHideoutModules(stations: HideoutStation[], graph: TaskGraph): HideoutModule[] {
    const modules: HideoutModule[] = [];
    stations.forEach((station) => {
      station.levels.forEach((level) => {
        const moduleData: HideoutModule = {
          ...level,
          stationId: station.id,
          predecessors: getPredecessors(graph, level.id),
          successors: getSuccessors(graph, level.id),
          parents: getParents(graph, level.id),
          children: getChildren(graph, level.id),
        };
        modules.push(moduleData);
      });
    });
    return modules;
  }
  /**
   * Extracts item requirements from hideout modules
   */
  function extractItemRequirements(modules: HideoutModule[]): NeededItemHideoutModule[] {
    const neededItems: NeededItemHideoutModule[] = [];
    modules.forEach((module) => {
      module.itemRequirements?.forEach((req) => {
        if (req?.item?.id) {
          // Parse FIR status from attributes field
          let foundInRaid = false;
          if (req.attributes && Array.isArray(req.attributes)) {
            const firAttribute = req.attributes.find(
              (attr) => attr.type === 'foundInRaid' || attr.name === 'foundInRaid'
            );
            if (firAttribute) {
              foundInRaid = firAttribute.value === 'true';
            }
          }
          neededItems.push({
            id: req.id,
            needType: 'hideoutModule',
            hideoutModule: { ...module },
            item: req.item,
            count: req.count,
            foundInRaid,
          });
        }
      });
    });
    return neededItems;
  }
  /**
   * Processes task data and returns enhanced tasks with graph relationships
   * and all derived data structures
   */
  function processTaskData(taskList: Task[]) {
    if (taskList.length === 0) {
      return {
        tasks: [],
        taskGraph: createGraph(),
        mapTasks: {},
        objectiveMaps: {},
        objectiveGPS: {},
        alternativeTasks: {},
        neededItemTaskObjectives: [],
      };
    }
    const newGraph = buildTaskGraph(taskList);
    const processedData = processTaskRelationships(taskList);
    const enhancedTasks = enhanceTasksWithRelationships(
      taskList,
      newGraph,
      processedData.tempAlternativeTasks
    );
    return {
      tasks: enhancedTasks,
      taskGraph: newGraph,
      mapTasks: processedData.tempMapTasks,
      objectiveMaps: processedData.tempObjectiveMaps,
      objectiveGPS: processedData.tempObjectiveGPS,
      alternativeTasks: processedData.tempAlternativeTasks,
      neededItemTaskObjectives: processedData.tempNeededObjectives,
    };
  }
  /**
   * Processes hideout data and returns modules with graph relationships
   * and item requirements
   */
  function processHideoutData(stationList: HideoutStation[]) {
    if (stationList.length === 0) {
      return {
        hideoutModules: [],
        hideoutGraph: createGraph(),
        neededItemHideoutModules: [],
      };
    }
    const newGraph = buildHideoutGraph(stationList);
    const newModules = createHideoutModules(stationList, newGraph);
    const newNeededItems = extractItemRequirements(newModules);
    return {
      hideoutModules: newModules,
      hideoutGraph: newGraph,
      neededItemHideoutModules: newNeededItems,
    };
  }
  return {
    // Individual graph building functions
    buildTaskGraph,
    processTaskRelationships,
    enhanceTasksWithRelationships,
    buildHideoutGraph,
    createHideoutModules,
    extractItemRequirements,
    // High-level processing functions
    processTaskData,
    processHideoutData,
  };
}
export type UseGraphBuilderReturn = ReturnType<typeof useGraphBuilder>;
