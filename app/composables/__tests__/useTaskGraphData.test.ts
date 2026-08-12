import { describe, expect, it } from 'vitest';
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
});
