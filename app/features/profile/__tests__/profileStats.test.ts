import { describe, expect, it } from 'vitest';
import {
  buildHideoutModuleCompletionState,
  getCountedTasks,
} from '@/features/profile/profileStats';
import type { UserProgressData } from '@/stores/progressState';
import type { GameEdition, HideoutStation, Task } from '@/types/tarkov';
describe('profileStats', () => {
  it('counts tasks with canonical invalid/failed logic', () => {
    const tasks = [
      { id: 'task-complete' },
      { id: 'task-failed' },
      { id: 'task-invalid-incomplete' },
      { id: 'task-valid-incomplete' },
      { id: 'task-no-status' },
    ] as Task[];
    const taskStatuses = {
      'task-complete': { complete: true, failed: false },
      'task-failed': { complete: true, failed: true },
      'task-invalid-incomplete': { complete: false, failed: false },
      'task-valid-incomplete': { complete: false, failed: false },
    } as const;
    const invalidTasks = {
      'task-complete': true,
      'task-invalid-incomplete': true,
    };
    const countedTasks = getCountedTasks(tasks, taskStatuses, invalidTasks);
    expect(countedTasks.map((task) => task.id)).toEqual([
      'task-complete',
      'task-valid-incomplete',
      'task-no-status',
    ]);
  });
  it('applies edition defaults for stash and cultist circle when calculating hideout completion', () => {
    const stations = [
      {
        id: 'stash-station',
        normalizedName: 'stash',
        levels: [
          { id: 'stash-1', level: 1 },
          { id: 'stash-2', level: 2 },
          { id: 'stash-3', level: 3 },
        ],
      },
      {
        id: 'cultist-circle-station',
        normalizedName: 'cultist-circle',
        levels: [
          { id: 'cultist-1', level: 1 },
          { id: 'cultist-2', level: 2 },
        ],
      },
      {
        id: 'workbench-station',
        normalizedName: 'workbench',
        levels: [
          { id: 'workbench-1', level: 1 },
          { id: 'workbench-2', level: 2 },
        ],
      },
    ] as HideoutStation[];
    const hideoutModules = {
      'stash-3': { complete: true },
      'workbench-2': { complete: true },
    } as UserProgressData['hideoutModules'];
    const edition = {
      defaultStashLevel: 2,
      defaultCultistCircleLevel: 1,
    } as Pick<GameEdition, 'defaultCultistCircleLevel' | 'defaultStashLevel'>;
    const completionState = buildHideoutModuleCompletionState(stations, hideoutModules, edition);
    expect(completionState).toMatchObject({
      'stash-1': true,
      'stash-2': true,
      'stash-3': true,
      'cultist-1': true,
      'cultist-2': false,
      'workbench-1': false,
      'workbench-2': true,
    });
  });
});
