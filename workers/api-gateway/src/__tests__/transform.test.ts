import { describe, expect, it } from 'vitest';
import { transformProgress } from '../utils/transform';
import type { TarkovTask, UserProgressData } from '../types';
const baseProgress = (taskCompletions: UserProgressData['taskCompletions']): UserProgressData => ({
  level: 12,
  pmcFaction: 'USEC',
  displayName: 'Tester',
  xpOffset: 0,
  taskObjectives: {},
  taskCompletions,
  hideoutParts: {},
  hideoutModules: {},
  traders: {},
  skills: {},
  prestigeLevel: 0,
  skillOffsets: {},
});
const entryFor = (tasks: Array<{ id: string; invalid?: boolean }>, id: string) =>
  tasks.find((task) => task.id === id);
describe('transformProgress invalidation', () => {
  it.each([
    { complete: true, failed: false },
    { complete: false, failed: true },
    { complete: true, failed: true },
  ])('preserves terminal flags without invalid ($complete/$failed)', (completion) => {
    const tasks: TarkovTask[] = [
      { id: 'root', name: 'Failed root' },
      { id: 'faction', name: 'BEAR only', factionName: 'BEAR', objectives: [{ id: 'factionObj' }] },
      {
        id: 'dependent',
        name: 'Dependent',
        objectives: [{ id: 'dependentObj' }],
        taskRequirements: [{ task: { id: 'root' }, status: ['complete'] }],
      },
    ];
    const progress = baseProgress({ root: { failed: true }, faction: completion, dependent: completion });
    progress.taskObjectives = { factionObj: { complete: true }, dependentObj: { complete: false } };
    const result = transformProgress(progress, 'user-1', 1, tasks, []);
    for (const id of ['faction', 'dependent']) {
      expect(entryFor(result.tasksProgress, id)).toEqual({
        id,
        complete: completion.complete && !completion.failed,
        ...(completion.failed ? { failed: true } : {}),
      });
    }
    expect(result.taskObjectivesProgress).toEqual([
      { id: 'factionObj', complete: true },
      { id: 'dependentObj', complete: false },
    ]);
  });
  it('honors requirements that accept a failed prerequisite (shared algorithm)', () => {
    // Regression: the worker previously carried its own copy of the invalidation algorithm that
    // ignored `status: ['complete', 'failed']`, so the public API disagreed with the app.
    const tasks: TarkovTask[] = [
      { id: 'chemical4', name: 'Chemical - Part 4' },
      {
        id: 'loyaltyBuyout',
        name: 'Loyalty Buyout',
        taskRequirements: [{ task: { id: 'chemical4' }, status: ['failed'] }],
      },
      {
        id: 'safeCorridor',
        name: 'Safe Corridor',
        taskRequirements: [{ task: { id: 'chemical4' }, status: ['complete', 'failed'] }],
      },
      {
        id: 'strictFollowUp',
        name: 'Strict follow-up',
        taskRequirements: [{ task: { id: 'chemical4' }, status: ['complete'] }],
      },
    ];
    const result = transformProgress(
      baseProgress({
        chemical4: { complete: false, failed: true },
        loyaltyBuyout: { complete: false },
        safeCorridor: { complete: false },
        strictFollowUp: { complete: false },
      }),
      'user-1',
      1,
      tasks,
      []
    );
    expect(entryFor(result.tasksProgress, 'chemical4')).toMatchObject({
      complete: false,
      failed: true,
    });
    expect(entryFor(result.tasksProgress, 'chemical4')?.invalid).toBeUndefined();
    expect(entryFor(result.tasksProgress, 'loyaltyBuyout')?.invalid).toBeUndefined();
    expect(entryFor(result.tasksProgress, 'safeCorridor')?.invalid).toBeUndefined();
    expect(entryFor(result.tasksProgress, 'strictFollowUp')?.invalid).toBe(true);
  });
  it('marks other-faction tasks and their objectives invalid', () => {
    const tasks: TarkovTask[] = [
      { id: 'bearOnly', name: 'BEAR only', factionName: 'BEAR', objectives: [{ id: 'bearObj' }] },
    ];
    const progress = baseProgress({ bearOnly: { complete: false } });
    progress.taskObjectives = { bearObj: { complete: false } };
    const result = transformProgress(progress, 'user-1', 1, tasks, []);
    expect(entryFor(result.tasksProgress, 'bearOnly')?.invalid).toBe(true);
    expect(entryFor(result.taskObjectivesProgress, 'bearObj')?.invalid).toBe(true);
  });
});
