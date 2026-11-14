import { describe, expect, it } from 'vitest';
import { buildDebugTaskSummary } from '@/utils/debugTaskSummary';
import type { UserProgressData } from '@/types/progress';
import type { Task } from '@/types/tarkov';
const tasks = [
  { id: 'intro', name: 'Intro' },
  { id: 'follow-up', name: 'Follow Up', taskRequirements: [{ task: { id: 'intro' } }] },
  { id: 'chain-end', name: 'Chain End', taskRequirements: [{ task: { id: 'follow-up' } }, {}] },
] as unknown as Task[];
const progress = (taskCompletions: UserProgressData['taskCompletions']) =>
  ({ taskCompletions }) as UserProgressData;
describe('buildDebugTaskSummary', () => {
  it('reports each recorded task with prerequisite states and settled sources', () => {
    const summary = buildDebugTaskSummary(
      'pve',
      progress({
        intro: { complete: true, manual: true },
        'follow-up': { complete: true, failed: true, manual: false },
        'chain-end': { complete: false },
      }),
      tasks
    );
    expect(summary).toMatchObject({
      gameMode: 'pve',
      taskCount: 3,
      completedTaskCount: 1,
      failedTaskCount: 1,
      manualTaskCount: 1,
      importedTaskCount: 1,
    });
    expect(summary.tasks).toEqual([
      expect.objectContaining({ id: 'intro', name: 'Intro', complete: true, prerequisiteIds: [] }),
      expect.objectContaining({
        id: 'follow-up',
        complete: false,
        failed: true,
        manual: false,
        prerequisiteStates: { intro: { complete: true, failed: false } },
      }),
      expect.objectContaining({
        id: 'chain-end',
        prerequisiteIds: ['follow-up'],
        prerequisiteStates: { 'follow-up': { complete: false, failed: true } },
      }),
    ]);
  });
  it('falls back to task ids and empty data when metadata or progress is missing', () => {
    expect(
      buildDebugTaskSummary('pvp', progress({ unknown: { complete: true } }), []).tasks
    ).toEqual([expect.objectContaining({ id: 'unknown', name: 'unknown', prerequisiteIds: [] })]);
    expect(buildDebugTaskSummary('seasonal', undefined, tasks)).toMatchObject({
      taskCount: 0,
      tasks: [],
    });
  });
});
