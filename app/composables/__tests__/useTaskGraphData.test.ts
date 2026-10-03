import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { collectAncestorTaskIds, resolveTaskNodeStatus } from '@/composables/useTaskGraphData';
import { TASK_STATE } from '@/utils/constants';
import type { Task } from '@/types/tarkov';
const createTask = ({ id, ...task }: Partial<Task> & { id: string }): Task => ({
  ...task,
  id,
});
describe('collectAncestorTaskIds', () => {
  it('includes full parent ancestry across multiple hops', () => {
    const part1 = createTask({ id: 'part-1', parents: [] });
    const qualityStandard = createTask({ id: 'quality-standard', parents: ['part-1'] });
    const airmail = createTask({ id: 'airmail', parents: ['quality-standard'] });
    const part2 = createTask({ id: 'part-2', parents: ['airmail'] });
    const tasksById = new Map<string, Task>(
      [part1, qualityStandard, airmail, part2].map((task) => [task.id, task])
    );
    const result = collectAncestorTaskIds(['part-2'], tasksById);
    expect(Array.from(result).sort((a, b) => a.localeCompare(b))).toEqual([
      'airmail',
      'part-1',
      'part-2',
      'quality-standard',
    ]);
  });
  it('uses taskRequirements when parents are unavailable and avoids cycle loops', () => {
    const taskA = createTask({
      id: 'task-a',
      taskRequirements: [{ task: { id: 'task-b' }, status: ['complete'] }],
    });
    const taskB = createTask({ id: 'task-b', parents: ['task-a'] });
    const taskC = createTask({ id: 'task-c', parents: ['missing-parent'] });
    const tasksById = new Map<string, Task>([taskA, taskB, taskC].map((task) => [task.id, task]));
    const withCycle = collectAncestorTaskIds(['task-a'], tasksById);
    expect(Array.from(withCycle).sort((a, b) => a.localeCompare(b))).toEqual(['task-a', 'task-b']);
    const missingParent = collectAncestorTaskIds(['task-c'], tasksById);
    expect(Array.from(missingParent)).toEqual(['task-c']);
  });
});
describe('resolveTaskNodeStatus', () => {
  it('keeps active distinct from available', () => {
    expect(
      resolveTaskNodeStatus('active-task', {
        'active-task': TASK_STATE.ACTIVE,
        'available-task': TASK_STATE.AVAILABLE,
      })
    ).toBe('active');
    expect(
      resolveTaskNodeStatus('available-task', {
        'active-task': TASK_STATE.ACTIVE,
        'available-task': TASK_STATE.AVAILABLE,
      })
    ).toBe('available');
  });
  it('treats missing and unrecognized progress states as locked', () => {
    expect(resolveTaskNodeStatus('missing-task', {})).toBe('locked');
    expect(resolveTaskNodeStatus('unknown-task', { 'unknown-task': 'queued' })).toBe('locked');
  });
});
describe('useTaskGraphData', () => {
  it('limits graph nodes and edges to the allowed task IDs', async () => {
    const tasks = ref<Task[]>([
      createTask({
        id: 'allowed-parent',
        trader: { id: 'other-trader' },
        children: ['trader-task'],
      }),
      createTask({
        id: 'trader-task',
        trader: { id: 'trader-1' },
        parents: ['allowed-parent', 'excluded-parent'],
      }),
      createTask({ id: 'excluded-parent', trader: { id: 'other-trader' } }),
      createTask({ id: 'other-trader-task', trader: { id: 'trader-1' } }),
    ]);
    const tasksState = { 'trader-task': TASK_STATE.ACTIVE };
    vi.resetModules();
    vi.doMock('@/stores/useMetadata', () => ({
      useMetadataStore: () => ({
        get tasks() {
          return tasks.value;
        },
      }),
    }));
    vi.doMock('@/stores/useProgress', () => ({
      useProgressStore: () => ({ tasksState }),
    }));
    const { useTaskGraphData } = await import('@/composables/useTaskGraphData');
    const graph = useTaskGraphData(ref('trader-1'), ref(null), ref(new Set(['trader-task'])));
    expect(graph.nodes.value.map(({ id }) => id)).toEqual(['trader-task']);
    expect(graph.nodes.value[0]?.data).toMatchObject({ status: 'active', isRoot: true });
    expect(graph.edges.value).toEqual([]);
  });
});
