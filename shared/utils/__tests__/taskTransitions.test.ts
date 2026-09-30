import { setTaskState, type TransitionTaskState } from '@shared/utils/taskTransitions';
import { describe, expect, it } from 'vitest';
const run = (
  completions: Record<string, { complete?: boolean; failed?: boolean; active?: boolean }>,
  taskId: string,
  state: TransitionTaskState
) => {
  const updates = new Map<string, TransitionTaskState>();
  setTaskState(completions, taskId, state, { timestamp: 5, updates });
  return updates;
};
describe('setTaskState', () => {
  it.each([
    ['active', { complete: false, failed: false, active: true, timestamp: 5 }],
    ['completed', { complete: true, failed: false, active: false, timestamp: 5 }],
    ['failed', { complete: true, failed: true, active: false, timestamp: 5 }],
    ['uncompleted', { complete: false, failed: false, active: false, timestamp: 5 }],
  ] as const)('writes the canonical %s triple', (state, expected) => {
    const completions = {};
    const updates = run(completions, 'task', state);
    expect(completions).toEqual({ task: expected });
    expect([...updates]).toEqual(state === 'uncompleted' ? [] : [['task', state]]);
  });
  it('clears active when an accepted task completes', () => {
    const completions = { task: { complete: false, failed: false, active: true } };
    expect([...run(completions, 'task', 'completed')]).toEqual([['task', 'completed']]);
    expect(completions.task.active).toBe(false);
  });
  it('records no update when the state is unchanged', () => {
    const completions = { task: { complete: false, failed: false, active: true } };
    expect(run(completions, 'task', 'active').size).toBe(0);
  });
  it('writes only the requested task', () => {
    const completions = { dependent: { complete: true, failed: false } };
    run(completions, 'root', 'uncompleted');
    expect(completions.dependent).toEqual({ complete: true, failed: false });
  });
});
