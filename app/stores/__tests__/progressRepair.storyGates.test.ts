import { describe, expect, it } from 'vitest';
import { repairCompletedProgress } from '@/stores/tarkov/progressRepair';
import { otherRequirementsSignature } from '@/utils/taskOtherRequirements';
import type { UserProgressData } from '@/stores/progressState';
import type { Task } from '@/types/tarkov';
const progress = (overrides: Partial<UserProgressData>): UserProgressData =>
  ({
    taskCompletions: {},
    taskObjectives: {},
    storyChapters: {},
    ...overrides,
  }) as UserProgressData;
const gated = (id: string): Task => ({
  id,
  objectives: [],
  otherRequirements: [
    {
      type: 'storyObjective',
      id: `overlay.${id}.tour.talk-to-therapist`,
      storyChapter: { id: 'tour' },
      objective: { id: 'talk' },
    },
  ],
});
describe('story gate repair', () => {
  it('does not backfill an automatic baseline when a completed task proves the gate', () => {
    const pvp = progress({
      taskCompletions: { fil: { complete: true } },
      storyChapters: { tour: { objectives: { talk: { complete: false, timestamp: 5 } } } },
    });
    const before = JSON.stringify(pvp);
    expect(
      repairCompletedProgress(
        { pvp },
        [gated('fil')],
        [
          {
            id: 'tour',
            name: 'Tour',
            normalizedName: 'tour',
            order: 1,
            wikiLink: '',
            objectives: {
              talk: {
                id: 'talk',
                type: 'main',
                order: 1,
                description: 'Tutorial',
                completionPolicy: 'tutorial',
              },
            },
          },
        ]
      )
    ).toBe(0);
    expect(JSON.stringify(pvp)).toBe(before);
  });
  it('records the story objective a completed task was gated on', () => {
    const pvp = progress({ taskCompletions: { fil: { complete: true, failed: false } } });
    expect(repairCompletedProgress({ pvp }, [gated('fil')])).toBe(1);
    expect(pvp.storyChapters.tour?.objectives?.talk?.complete).toBe(true);
    expect(repairCompletedProgress({ pvp }, [gated('fil')])).toBe(0);
  });
  it('ignores automatically failed and unconfirmed open tasks', () => {
    const pvp = progress({
      taskCompletions: {
        failed: { complete: true, failed: true },
        open: { complete: false, failed: false },
      },
    });
    expect(repairCompletedProgress({ pvp }, [gated('failed'), gated('open')])).toBe(0);
    expect(pvp.storyChapters.tour).toBeUndefined();
  });
  it('records the story objective of a manually failed task', () => {
    const pvp = progress({
      taskCompletions: { fil: { complete: true, failed: true, manual: true } },
    });
    expect(repairCompletedProgress({ pvp }, [gated('fil')])).toBe(1);
    expect(pvp.storyChapters.tour?.objectives?.talk?.complete).toBe(true);
  });
  it('records the story objective of a task confirmed available', () => {
    const base = gated('fil');
    const task: Task = {
      ...base,
      otherRequirements: [
        ...(base.otherRequirements ?? []),
        { type: 'dialogue', id: 'd', traders: ['t'] },
      ],
    };
    const requirements = otherRequirementsSignature(task) ?? '';
    const pvp = progress({ taskAvailability: { fil: { requirements, timestamp: 1 } } });
    expect(repairCompletedProgress({ pvp }, [task])).toBe(1);
    expect(pvp.storyChapters.tour?.objectives?.talk?.complete).toBe(true);
  });
  it('outranks an unmark stamped ahead so the repair survives a merge', () => {
    const ahead = Date.now() + 60_000;
    const pvp = progress({
      taskCompletions: { fil: { complete: true, failed: false } },
      storyChapters: { tour: { objectives: { talk: { complete: false, timestamp: ahead } } } },
    });
    repairCompletedProgress({ pvp }, [gated('fil')]);
    const mark = pvp.storyChapters.tour?.objectives?.talk;
    expect(mark?.complete).toBe(true);
    expect(mark?.timestamp).toBeGreaterThan(ahead);
  });
});
