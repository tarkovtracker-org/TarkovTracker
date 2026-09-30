import { describe, expect, it } from 'vitest';
import { repairCompletedProgress } from '@/stores/tarkov/progressRepair';
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
  it('records the story objective a completed task was gated on', () => {
    const pvp = progress({ taskCompletions: { fil: { complete: true, failed: false } } });
    expect(repairCompletedProgress({ pvp }, [gated('fil')])).toBe(1);
    expect(pvp.storyChapters.tour?.objectives?.talk?.complete).toBe(true);
    expect(repairCompletedProgress({ pvp }, [gated('fil')])).toBe(0);
  });
  it('ignores failed and uncompleted tasks', () => {
    const pvp = progress({
      taskCompletions: {
        failed: { complete: true, failed: true },
        open: { complete: false, failed: false },
      },
    });
    expect(repairCompletedProgress({ pvp }, [gated('failed'), gated('open')])).toBe(0);
    expect(pvp.storyChapters.tour).toBeUndefined();
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
