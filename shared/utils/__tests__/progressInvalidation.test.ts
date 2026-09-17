import {
  computeInvalidProgress,
  type InvalidationTask,
  type InvalidationTaskCompletion,
} from '@shared/utils/progressInvalidation';
import { describe, expect, it } from 'vitest';
type Requirement = { on: string; status: string[] };
/** Builds a task with one objective (`<id>Obj`) and, optionally, a single task requirement. */
const task = (
  id: string,
  requirement?: Requirement,
  extra: Partial<InvalidationTask> = {}
): InvalidationTask => ({
  id,
  objectives: [{ id: `${id}Obj` }],
  ...(requirement
    ? { taskRequirements: [{ task: { id: requirement.on }, status: requirement.status }] }
    : {}),
  ...extra,
});
const run = (
  tasks: InvalidationTask[],
  taskCompletions: Record<string, InvalidationTaskCompletion>,
  pmcFaction = 'USEC'
) => computeInvalidProgress({ tasks, taskCompletions, pmcFaction });
describe('computeInvalidProgress', () => {
  it('treats empty requirement status as completion-required', () => {
    const result = run([task('A'), task('B', { on: 'A', status: [] })], {
      A: { complete: true, failed: true },
    });
    expect(result.invalidTasks.B).toBe(true);
    expect(result.invalidObjectives.BObj).toBe(true);
  });
  it('does not invalidate task when requirement accepts both complete and failed status', () => {
    // Simulates: One Less Loose End -> A Healthy Alternative (alternative)
    //            One Less Loose End -> Dragnet (requires complete OR failed)
    // When A Healthy Alternative is completed, One Less Loose End fails.
    // Dragnet should NOT be invalidated because it accepts failed status.
    const tasks = [
      task('oneLessLooseEnd', undefined, { alternatives: ['aHealthyAlternative'] }),
      // Active when started, before aHealthyAlternative completion
      task('aHealthyAlternative', { on: 'oneLessLooseEnd', status: ['active'] }),
      task('dragnet', { on: 'oneLessLooseEnd', status: ['complete', 'failed'] }),
    ];
    const result = run(tasks, {
      aHealthyAlternative: { complete: true, failed: false },
      oneLessLooseEnd: { complete: false, failed: true },
    });
    // One Less Loose End is failed but not marked invalid by computeInvalidProgress
    // (invalidation is for tasks that CAN'T be completed, not ones that ARE failed)
    // A Healthy Alternative should NOT be invalid (it's completed)
    expect(result.invalidTasks.aHealthyAlternative).toBeFalsy();
    // Dragnet should NOT be invalid - it accepts failed status for its prerequisite
    expect(result.invalidTasks.dragnet).toBeFalsy();
  });
  it('stops the invalidation cascade at dependents that accept a failed prerequisite', () => {
    // root fails -> gate is invalid (requires complete) -> tolerant accepts gate failed and must
    // stay valid, while strict (requires gate complete) is invalid transitively.
    const tasks = [
      task('root'),
      task('gate', { on: 'root', status: ['complete'] }),
      task('tolerant', { on: 'gate', status: ['complete', 'failed'] }),
      task('strict', { on: 'gate', status: ['complete'] }),
    ];
    const result = run(tasks, { root: { complete: false, failed: true } });
    expect(result.invalidTasks.gate).toBe(true);
    expect(result.invalidObjectives.gateObj).toBe(true);
    expect(result.invalidTasks.tolerant).toBeFalsy();
    expect(result.invalidObjectives.tolerantObj).toBeFalsy();
    expect(result.invalidTasks.strict).toBe(true);
    expect(result.invalidObjectives.strictObj).toBe(true);
  });
  it('respects one-way alternative direction for fail-condition branches', () => {
    const tasks = [
      task('protectSky', undefined, { alternatives: ['simpleSideJob'] }),
      task('simpleSideJob'),
      task('batteryFollowUp', { on: 'protectSky', status: ['complete'] }),
    ];
    const simpleCompleteResult = run(tasks, {
      simpleSideJob: { complete: true, failed: false },
    });
    expect(simpleCompleteResult.invalidTasks.protectSky).toBeFalsy();
    expect(simpleCompleteResult.invalidTasks.batteryFollowUp).toBeFalsy();
    const protectCompleteResult = run(tasks, {
      protectSky: { complete: true, failed: false },
    });
    expect(protectCompleteResult.invalidTasks.simpleSideJob).toBe(true);
    expect(protectCompleteResult.invalidObjectives.simpleSideJobObj).toBe(true);
  });
  it('invalidates task when requirement only accepts complete but prereq is failed', () => {
    const result = run([task('taskA'), task('taskB', { on: 'taskA', status: ['complete'] })], {
      taskA: { complete: false, failed: true },
    });
    // taskB should be invalid because taskA is failed and taskB only accepts complete
    expect(result.invalidTasks.taskB).toBe(true);
  });
  it('invalidates other-faction tasks without cascading to their dependents', () => {
    const tasks = [
      task('bearOnly', undefined, { factionName: 'BEAR' }),
      task('anyFaction', undefined, { factionName: 'Any' }),
      task('collector', { on: 'bearOnly', status: ['complete'] }),
    ];
    const result = run(tasks, {});
    expect(result.invalidTasks.bearOnly).toBe(true);
    expect(result.invalidObjectives.bearOnlyObj).toBe(true);
    expect(result.invalidTasks.anyFaction).toBeFalsy();
    expect(result.invalidTasks.collector).toBeFalsy();
  });
  it('handles complex chain with failed-only and gate tasks correctly', () => {
    // Simulates Chemical-4 chain:
    // - Loyalty Buyout requires Chemical-4 to be FAILED only
    // - Safe Corridor requires Chemical-4 to be complete OR failed (gate task)
    // When Chemical-4 is completed, Loyalty Buyout becomes invalid,
    // but Safe Corridor should remain valid.
    const tasks = [
      task('chemical4'),
      task('loyaltyBuyout', { on: 'chemical4', status: ['failed'] }),
      task('safeCorridor', { on: 'chemical4', status: ['complete', 'failed'] }),
    ];
    // Scenario: Chemical-4 is completed
    const result = run(tasks, { chemical4: { complete: true, failed: false } });
    // Loyalty Buyout should be invalid (requires failed, but Chemical-4 is complete)
    expect(result.invalidTasks.loyaltyBuyout).toBe(true);
    // Loyalty Buyout's objective should also be invalid
    expect(result.invalidObjectives.loyaltyBuyoutObj).toBe(true);
    // Safe Corridor should NOT be invalid (accepts both complete and failed)
    expect(result.invalidTasks.safeCorridor).toBeFalsy();
    // Safe Corridor's objective should also NOT be invalid
    expect(result.invalidObjectives.safeCorridorObj).toBeFalsy();
    // Scenario 2: Chemical-4 is failed (inverse case)
    const result2 = run(tasks, { chemical4: { complete: false, failed: true } });
    // Both tasks should be valid when Chemical-4 is failed
    expect(result2.invalidTasks.loyaltyBuyout).toBeFalsy();
    expect(result2.invalidTasks.safeCorridor).toBeFalsy();
    // Both objectives should also be valid
    expect(result2.invalidObjectives.loyaltyBuyoutObj).toBeFalsy();
    expect(result2.invalidObjectives.safeCorridorObj).toBeFalsy();
  });
});
