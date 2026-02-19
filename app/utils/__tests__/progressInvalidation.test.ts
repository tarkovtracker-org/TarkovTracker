import { describe, expect, it } from 'vitest';
import { computeInvalidProgress } from '@/utils/progressInvalidation';
import type { Task, TaskObjective } from '@/types/tarkov';
describe('computeInvalidProgress', () => {
  it('treats empty requirement status as completion-required', () => {
    const objectiveA: TaskObjective = { id: 'A1' };
    const objectiveB: TaskObjective = { id: 'B1' };
    const tasks: Task[] = [
      {
        id: 'A',
        objectives: [objectiveA],
      } as Task,
      {
        id: 'B',
        objectives: [objectiveB],
        taskRequirements: [{ task: { id: 'A' }, status: [] }] as Task['taskRequirements'],
      } as Task,
    ];
    const result = computeInvalidProgress({
      tasks,
      taskCompletions: {
        A: { complete: true, failed: true },
      },
      pmcFaction: 'USEC',
    });
    expect(result.invalidTasks.B).toBe(true);
    expect(result.invalidObjectives.B1).toBe(true);
  });
  it('does not invalidate task when requirement accepts both complete and failed status', () => {
    // Simulates: One Less Loose End -> A Healthy Alternative (alternative)
    //            One Less Loose End -> Dragnet (requires complete OR failed)
    // When A Healthy Alternative is completed, One Less Loose End fails.
    // Dragnet should NOT be invalidated because it accepts failed status.
    const tasks: Task[] = [
      {
        id: 'oneLessLooseEnd',
        name: 'One Less Loose End',
        objectives: [{ id: 'obj1' }],
        alternatives: ['aHealthyAlternative'],
      } as Task,
      {
        id: 'aHealthyAlternative',
        name: 'A Healthy Alternative',
        objectives: [{ id: 'obj2' }],
        taskRequirements: [
          { task: { id: 'oneLessLooseEnd' }, status: ['active'] }, // Active when started, before aHealthyAlternative completion
        ] as Task['taskRequirements'],
      } as Task,
      {
        id: 'dragnet',
        name: 'Dragnet',
        objectives: [{ id: 'obj3' }],
        taskRequirements: [
          { task: { id: 'oneLessLooseEnd' }, status: ['complete', 'failed'] },
        ] as Task['taskRequirements'],
      } as Task,
    ];
    const result = computeInvalidProgress({
      tasks,
      taskCompletions: {
        aHealthyAlternative: { complete: true, failed: false },
        oneLessLooseEnd: { complete: false, failed: true },
      },
      pmcFaction: 'USEC',
    });
    // One Less Loose End is failed but not marked invalid by computeInvalidProgress
    // (invalidation is for tasks that CAN'T be completed, not ones that ARE failed)
    // A Healthy Alternative should NOT be invalid (it's completed)
    expect(result.invalidTasks.aHealthyAlternative).toBeFalsy();
    // Dragnet should NOT be invalid - it accepts failed status for its prerequisite
    expect(result.invalidTasks.dragnet).toBeFalsy();
  });
  it('respects one-way alternative direction for fail-condition branches', () => {
    const tasks: Task[] = [
      {
        id: 'protectSky',
        name: 'Protect the Sky',
        objectives: [{ id: 'protectObj' }],
        alternatives: ['simpleSideJob'],
      } as Task,
      {
        id: 'simpleSideJob',
        name: 'Simple Side Job',
        objectives: [{ id: 'simpleObj' }],
      } as Task,
      {
        id: 'batteryFollowUp',
        name: 'Battery Follow Up',
        objectives: [{ id: 'batteryObj' }],
        taskRequirements: [
          { task: { id: 'protectSky' }, status: ['complete'] },
        ] as Task['taskRequirements'],
      } as Task,
    ];
    const simpleCompleteResult = computeInvalidProgress({
      tasks,
      taskCompletions: {
        simpleSideJob: { complete: true, failed: false },
      },
      pmcFaction: 'USEC',
    });
    expect(simpleCompleteResult.invalidTasks.protectSky).toBeFalsy();
    expect(simpleCompleteResult.invalidTasks.batteryFollowUp).toBeFalsy();
    const protectCompleteResult = computeInvalidProgress({
      tasks,
      taskCompletions: {
        protectSky: { complete: true, failed: false },
      },
      pmcFaction: 'USEC',
    });
    expect(protectCompleteResult.invalidTasks.simpleSideJob).toBe(true);
    expect(protectCompleteResult.invalidObjectives.simpleObj).toBe(true);
  });
  it('invalidates task when requirement only accepts complete but prereq is failed', () => {
    const tasks: Task[] = [
      {
        id: 'taskA',
        objectives: [{ id: 'objA' }],
      } as Task,
      {
        id: 'taskB',
        objectives: [{ id: 'objB' }],
        taskRequirements: [
          { task: { id: 'taskA' }, status: ['complete'] },
        ] as Task['taskRequirements'],
      } as Task,
    ];
    const result = computeInvalidProgress({
      tasks,
      taskCompletions: {
        taskA: { complete: false, failed: true },
      },
      pmcFaction: 'USEC',
    });
    // taskB should be invalid because taskA is failed and taskB only accepts complete
    expect(result.invalidTasks.taskB).toBe(true);
  });
  it('handles complex chain with failed-only and gate tasks correctly', () => {
    // Simulates Chemical-4 chain:
    // - Loyalty Buyout requires Chemical-4 to be FAILED only
    // - Safe Corridor requires Chemical-4 to be complete OR failed (gate task)
    // When Chemical-4 is completed, Loyalty Buyout becomes invalid,
    // but Safe Corridor should remain valid.
    const tasks: Task[] = [
      {
        id: 'chemical4',
        name: 'Chemical - Part 4',
        objectives: [{ id: 'chem4obj' }],
      } as Task,
      {
        id: 'loyaltyBuyout',
        name: 'Loyalty Buyout',
        objectives: [{ id: 'loyaltyObj' }],
        taskRequirements: [
          { task: { id: 'chemical4' }, status: ['failed'] },
        ] as Task['taskRequirements'],
      } as Task,
      {
        id: 'safeCorridor',
        name: 'Safe Corridor',
        objectives: [{ id: 'safeObj' }],
        taskRequirements: [
          { task: { id: 'chemical4' }, status: ['complete', 'failed'] },
        ] as Task['taskRequirements'],
      } as Task,
    ];
    // Scenario: Chemical-4 is completed
    const result = computeInvalidProgress({
      tasks,
      taskCompletions: {
        chemical4: { complete: true, failed: false },
      },
      pmcFaction: 'USEC',
    });
    // Loyalty Buyout should be invalid (requires failed, but Chemical-4 is complete)
    expect(result.invalidTasks.loyaltyBuyout).toBe(true);
    // Loyalty Buyout's objective should also be invalid
    expect(result.invalidObjectives.loyaltyObj).toBe(true);
    // Safe Corridor should NOT be invalid (accepts both complete and failed)
    expect(result.invalidTasks.safeCorridor).toBeFalsy();
    // Safe Corridor's objective should also NOT be invalid
    expect(result.invalidObjectives.safeObj).toBeFalsy();
    // Scenario 2: Chemical-4 is failed (inverse case)
    const result2 = computeInvalidProgress({
      tasks,
      taskCompletions: {
        chemical4: { complete: false, failed: true },
      },
      pmcFaction: 'USEC',
    });
    // Both tasks should be valid when Chemical-4 is failed
    expect(result2.invalidTasks.loyaltyBuyout).toBeFalsy();
    expect(result2.invalidTasks.safeCorridor).toBeFalsy();
    // Both objectives should also be valid
    expect(result2.invalidObjectives.loyaltyObj).toBeFalsy();
    expect(result2.invalidObjectives.safeObj).toBeFalsy();
  });
});
