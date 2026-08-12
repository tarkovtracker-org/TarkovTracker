import { useMetadataStore } from '@/stores/useMetadata';
import { useProgressStore } from '@/stores/useProgress';
import { TASK_STATE } from '@/utils/constants';
import type { Ref } from '#imports';
import type { Task } from '@/types/tarkov';
import type { Edge, Node } from '@vue-flow/core';
export type TaskNodeStatus = 'active' | 'completed' | 'available' | 'locked' | 'failed';
export interface TaskNodeData {
  taskId: string;
  taskName: string;
  traderName: string;
  traderId: string;
  traderImageLink: string | undefined;
  status: TaskNodeStatus;
  isCrossTrader: boolean;
  isFocused: boolean;
  isInFocusChain: boolean;
  isDimmed: boolean;
  isRoot: boolean;
  isLeaf: boolean;
  minPlayerLevel: number;
  kappaRequired: boolean;
  lightkeeperRequired: boolean;
}
export const resolveTaskNodeStatus = (
  taskId: string,
  tasksState: Record<string, string>
): TaskNodeStatus => {
  const state = tasksState[taskId];
  if (state === TASK_STATE.COMPLETE) return 'completed';
  if (state === TASK_STATE.FAILED) return 'failed';
  if (state === TASK_STATE.ACTIVE) return 'active';
  if (state === TASK_STATE.AVAILABLE) return 'available';
  return 'locked';
};
const collectFocusChain = (focusedTaskId: string, tasksById: Map<string, Task>): Set<string> => {
  const chain = new Set<string>();
  const visited = new Set<string>();
  const walkUp = (taskId: string) => {
    if (visited.has(taskId)) return;
    visited.add(taskId);
    chain.add(taskId);
    const task = tasksById.get(taskId);
    if (!task?.parents) return;
    for (const parentId of task.parents) {
      walkUp(parentId);
    }
  };
  const walkDown = (taskId: string) => {
    if (visited.has(taskId)) return;
    visited.add(taskId);
    chain.add(taskId);
    const task = tasksById.get(taskId);
    if (!task?.children) return;
    for (const childId of task.children) {
      walkDown(childId);
    }
  };
  walkUp(focusedTaskId);
  visited.delete(focusedTaskId);
  walkDown(focusedTaskId);
  return chain;
};
const getTaskParentIds = (task: Task): string[] => {
  if (task.parents?.length) return task.parents;
  return (task.taskRequirements ?? [])
    .map((requirement) => requirement?.task?.id)
    .filter((id): id is string => Boolean(id));
};
export const collectAncestorTaskIds = (
  seedTaskIds: Iterable<string>,
  tasksById: Map<string, Task>
): Set<string> => {
  const allIds = new Set<string>();
  const queue = [...seedTaskIds];
  while (queue.length) {
    const taskId = queue.pop()!;
    if (allIds.has(taskId)) continue;
    allIds.add(taskId);
    const task = tasksById.get(taskId);
    if (!task) continue;
    for (const parentId of getTaskParentIds(task)) {
      if (!allIds.has(parentId) && tasksById.has(parentId)) {
        queue.push(parentId);
      }
    }
  }
  return allIds;
};
export function useTaskGraphData(
  traderId: Ref<string>,
  focusedTaskId: Ref<string | null>,
  allowedTaskIds?: Ref<Set<string> | null>
) {
  const metadataStore = useMetadataStore();
  const progressStore = useProgressStore();
  const nodes = computed<Node<TaskNodeData>[]>(() => {
    const allTasks = metadataStore.tasks as Task[];
    const stateMap = progressStore.tasksState;
    if (!allTasks.length || !traderId.value) return [];
    const allowedIds = allowedTaskIds?.value;
    const scopedTasks =
      allowedIds == null ? allTasks : allTasks.filter((task) => allowedIds.has(task.id));
    if (!scopedTasks.length) return [];
    const tasksById = new Map<string, Task>();
    for (const task of scopedTasks) {
      tasksById.set(task.id, task);
    }
    const traderTasks = scopedTasks.filter((t) => t.trader?.id === traderId.value);
    if (!traderTasks.length) return [];
    const traderTaskIds = new Set(traderTasks.map((t) => t.id));
    const allNodeIds = collectAncestorTaskIds(traderTaskIds, tasksById);
    const crossTraderIds = [...allNodeIds]
      .filter((taskId) => !traderTaskIds.has(taskId))
      .sort((a, b) => a.localeCompare(b));
    const focusChain = focusedTaskId.value
      ? collectFocusChain(focusedTaskId.value, tasksById)
      : null;
    const parentInGraph = (id: string) => {
      const task = tasksById.get(id);
      if (!task) return false;
      return getTaskParentIds(task).some((p) => allNodeIds.has(p));
    };
    const childInGraph = (id: string) =>
      (tasksById.get(id)?.children ?? []).some((c) => allNodeIds.has(c));
    const buildNode = (task: Task, isCrossTrader: boolean): Node<TaskNodeData> => {
      const status = resolveTaskNodeStatus(task.id, stateMap);
      const isFocused = focusedTaskId.value === task.id;
      const isInFocusChain = focusChain ? focusChain.has(task.id) : true;
      const isDimmed = focusChain ? !isInFocusChain : false;
      return {
        id: task.id,
        type: 'taskNode',
        position: { x: 0, y: 0 },
        data: {
          taskId: task.id,
          taskName: task.name ?? 'Unknown',
          traderName: task.trader?.name ?? 'Unknown',
          traderId: task.trader?.id ?? '',
          traderImageLink: task.trader?.imageLink,
          status,
          isCrossTrader,
          isFocused,
          isInFocusChain,
          isDimmed,
          isRoot: !parentInGraph(task.id),
          isLeaf: !childInGraph(task.id),
          minPlayerLevel: task.minPlayerLevel ?? 0,
          kappaRequired: task.kappaRequired ?? false,
          lightkeeperRequired: task.lightkeeperRequired ?? false,
        },
      };
    };
    const result: Node<TaskNodeData>[] = [];
    for (const task of traderTasks) {
      result.push(buildNode(task, false));
    }
    for (const crossId of crossTraderIds) {
      const task = tasksById.get(crossId);
      if (task) {
        result.push(buildNode(task, true));
      }
    }
    return result;
  });
  const edges = computed<Edge[]>(() => {
    const allTasks = metadataStore.tasks as Task[];
    if (!allTasks.length || !traderId.value) return [];
    const allowedIds = allowedTaskIds?.value;
    const scopedTasks =
      allowedIds == null ? allTasks : allTasks.filter((task) => allowedIds.has(task.id));
    if (!scopedTasks.length) return [];
    const nodeIds = new Set(nodes.value.map((n) => n.id));
    const result: Edge[] = [];
    for (const task of scopedTasks) {
      if (!nodeIds.has(task.id)) continue;
      for (const parentId of getTaskParentIds(task)) {
        if (!nodeIds.has(parentId)) continue;
        result.push({
          id: `${parentId}->${task.id}`,
          source: parentId,
          target: task.id,
          type: 'smoothstep',
          animated: false,
          pathOptions: { borderRadius: 12, offset: 28 },
        });
      }
    }
    return result;
  });
  return { nodes, edges };
}
