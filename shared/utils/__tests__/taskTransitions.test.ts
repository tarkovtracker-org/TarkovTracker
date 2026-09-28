import {
  applyTaskTransition,
  type TransitionCompletion,
  type TransitionTask,
  type TransitionTaskState,
} from '@shared/utils/taskTransitions';
import { describe, expect, it } from 'vitest';
const tasks: TransitionTask[] = [
  { id: 'root' },
  { id: 'other' },
  {
    id: 'dependent',
    taskRequirements: [
      { task: { id: 'root' }, status: ['complete'] },
      { task: { id: 'other' }, status: ['complete'] },
    ],
  },
  { id: 'branch', taskRequirements: [{ task: { id: 'root' }, status: ['failed'] }] },
];
const run = (
  completions: Record<string, TransitionCompletion>,
  taskId: string,
  state: TransitionTaskState,
  protectedTaskIds?: Set<string>
) => {
  const updates = new Map<string, TransitionTaskState>();
  applyTaskTransition(
    completions,
    tasks,
    { taskId, state },
    { timestamp: 5, updates, protectedTaskIds }
  );
  return updates;
};
describe('applyTaskTransition', () => {
  it('locks complete-dependents when a prerequisite leaves completed', () => {
    const completions = {
      root: { complete: true, failed: false },
      dependent: { complete: true, failed: false },
    };
    const updates = run(completions, 'root', 'failed');
    expect(completions.root).toEqual({ complete: true, failed: true, timestamp: 5 });
    expect(completions.dependent).toEqual({ complete: false, failed: false, timestamp: 5 });
    expect([...updates]).toEqual([
      ['root', 'failed'],
      ['dependent', 'uncompleted'],
    ]);
  });
  it('leaves dependents alone until every requirement is met', () => {
    const completions: Record<string, TransitionCompletion> = {
      dependent: { complete: true, failed: false },
    };
    run(completions, 'root', 'completed');
    expect(completions.dependent).toEqual({ complete: true, failed: false });
    completions.other = { complete: true, failed: false };
    run(completions, 'root', 'completed');
    expect(completions.dependent).toEqual({ complete: false, failed: false, timestamp: 5 });
  });
  it('ignores failed-status requirements and protected tasks', () => {
    const completions = { branch: { complete: true, failed: false } };
    const updates = run(completions, 'root', 'uncompleted', new Set(['dependent']));
    expect(completions).not.toHaveProperty('dependent');
    expect(completions.branch).toEqual({ complete: true, failed: false });
    expect(updates.size).toBe(0);
  });
});
