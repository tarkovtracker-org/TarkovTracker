import { computeInvalidProgress, type InvalidationTask } from '@shared/utils/progressInvalidation';
import { describe, expect, it } from 'vitest';
describe('computeInvalidProgress', () => {
  it('treats empty requirement status as completion-required', () => {
    const tasks: InvalidationTask[] = [
      { id: 'A', objectives: [{ id: 'A1' }] },
      {
        id: 'B',
        objectives: [{ id: 'B1' }],
        taskRequirements: [{ task: { id: 'A' }, status: [] }],
      },
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
    const tasks: InvalidationTask[] = [
      {
        id: 'oneLessLooseEnd',
        objectives: [{ id: 'obj1' }],
        alternatives: ['aHealthyAlternative'],
      },
      {
        id: 'aHealthyAlternative',
        objectives: [{ id: 'obj2' }],
        // Active when started, before aHealthyAlternative completion
        taskRequirements: [{ task: { id: 'oneLessLooseEnd' }, status: ['active'] }],
      },
      {
        id: 'dragnet',
        objectives: [{ id: 'obj3' }],
        taskRequirements: [{ task: { id: 'oneLessLooseEnd' }, status: ['complete', 'failed'] }],
      },
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
  it('stops the invalidation cascade at dependents that accept a failed prerequisite', () => {
    // root fails -> gate is invalid (requires complete) -> tolerant accepts gate failed and must
    // stay valid, while strict (requires gate complete) is invalid transitively.
    const tasks: InvalidationTask[] = [
      { id: 'root', objectives: [{ id: 'rootObj' }] },
      {
        id: 'gate',
        objectives: [{ id: 'gateObj' }],
        taskRequirements: [{ task: { id: 'root' }, status: ['complete'] }],
      },
      {
        id: 'tolerant',
        objectives: [{ id: 'tolerantObj' }],
        taskRequirements: [{ task: { id: 'gate' }, status: ['complete', 'failed'] }],
      },
      {
        id: 'strict',
        objectives: [{ id: 'strictObj' }],
        taskRequirements: [{ task: { id: 'gate' }, status: ['complete'] }],
      },
    ];
    const result = computeInvalidProgress({
      tasks,
      taskCompletions: { root: { complete: false, failed: true } },
      pmcFaction: 'USEC',
    });
    expect(result.invalidTasks.gate).toBe(true);
    expect(result.invalidObjectives.gateObj).toBe(true);
    expect(result.invalidTasks.tolerant).toBeFalsy();
    expect(result.invalidObjectives.tolerantObj).toBeFalsy();
    expect(result.invalidTasks.strict).toBe(true);
    expect(result.invalidObjectives.strictObj).toBe(true);
  });
  it('respects one-way alternative direction for fail-condition branches', () => {
    const tasks: InvalidationTask[] = [
      { id: 'protectSky', objectives: [{ id: 'protectObj' }], alternatives: ['simpleSideJob'] },
      { id: 'simpleSideJob', objectives: [{ id: 'simpleObj' }] },
      {
        id: 'batteryFollowUp',
        objectives: [{ id: 'batteryObj' }],
        taskRequirements: [{ task: { id: 'protectSky' }, status: ['complete'] }],
      },
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
    const tasks: InvalidationTask[] = [
      { id: 'taskA', objectives: [{ id: 'objA' }] },
      {
        id: 'taskB',
        objectives: [{ id: 'objB' }],
        taskRequirements: [{ task: { id: 'taskA' }, status: ['complete'] }],
      },
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
  it('invalidates other-faction tasks without cascading to their dependents', () => {
    const tasks: InvalidationTask[] = [
      { id: 'bearOnly', factionName: 'BEAR', objectives: [{ id: 'bearObj' }] },
      { id: 'anyFaction', factionName: 'Any', objectives: [{ id: 'anyObj' }] },
      {
        id: 'collector',
        objectives: [{ id: 'collectorObj' }],
        taskRequirements: [{ task: { id: 'bearOnly' }, status: ['complete'] }],
      },
    ];
    const result = computeInvalidProgress({ tasks, taskCompletions: {}, pmcFaction: 'USEC' });
    expect(result.invalidTasks.bearOnly).toBe(true);
    expect(result.invalidObjectives.bearObj).toBe(true);
    expect(result.invalidTasks.anyFaction).toBeFalsy();
    expect(result.invalidTasks.collector).toBeFalsy();
  });
  it('handles complex chain with failed-only and gate tasks correctly', () => {
    // Simulates Chemical-4 chain:
    // - Loyalty Buyout requires Chemical-4 to be FAILED only
    // - Safe Corridor requires Chemical-4 to be complete OR failed (gate task)
    // When Chemical-4 is completed, Loyalty Buyout becomes invalid,
    // but Safe Corridor should remain valid.
    const tasks: InvalidationTask[] = [
      { id: 'chemical4', objectives: [{ id: 'chem4obj' }] },
      {
        id: 'loyaltyBuyout',
        objectives: [{ id: 'loyaltyObj' }],
        taskRequirements: [{ task: { id: 'chemical4' }, status: ['failed'] }],
      },
      {
        id: 'safeCorridor',
        objectives: [{ id: 'safeObj' }],
        taskRequirements: [{ task: { id: 'chemical4' }, status: ['complete', 'failed'] }],
      },
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
