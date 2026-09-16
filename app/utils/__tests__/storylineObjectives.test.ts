import { describe, expect, it, vi } from 'vitest';
import {
  getAutoCompletableObjectiveIds,
  normalizeStoryObjectives,
  storyQuestExclusionGroups,
  toggleStoryChapterWithLinearObjectives,
  unknownStoryObjectiveIds,
} from '@/utils/storylineObjectives';
const objectives = [
  {
    id: 'obj-1',
    order: 1,
    type: 'main' as const,
    description: 'Route A',
    mutuallyExclusiveWith: ['obj-2'],
  },
  {
    id: 'obj-2',
    order: 2,
    type: 'main' as const,
    description: 'Route B',
    mutuallyExclusiveWith: ['obj-1'],
  },
  { id: 'obj-3', order: 3, type: 'main' as const, description: 'Linear' },
  { id: 'obj-4', order: 4, type: 'optional' as const, description: 'Optional linear' },
];
const questRouteObjectives = [
  {
    id: 'obj-a1',
    order: 1,
    type: 'main' as const,
    description: 'Keep it',
    sourceQuestId: 'quest-a',
  },
  {
    id: 'obj-b1',
    order: 2,
    type: 'main' as const,
    description: 'Hand it over',
    sourceQuestId: 'quest-b',
  },
  {
    id: 'obj-c1',
    order: 3,
    type: 'main' as const,
    description: 'Linear',
    sourceQuestId: 'quest-c',
  },
];
describe('storylineObjectives', () => {
  it('returns only non-route-choice objective ids', () => {
    expect(getAutoCompletableObjectiveIds(objectives)).toEqual(['obj-3', 'obj-4']);
  });
  it('keeps source quest and ending references from the overlay', () => {
    const normalized = normalizeStoryObjectives([
      {
        id: 'obj-ending',
        order: 1,
        type: 'main',
        description: 'Reach the terminal',
        sourceQuestId: 'quest-a',
        endingId: 'ending-1',
      },
    ]);
    expect(normalized['obj-ending']).toMatchObject({
      endingId: 'ending-1',
      sourceQuestId: 'quest-a',
    });
  });
  it('excludes objectives on mutually exclusive quests from bulk completion', () => {
    expect(getAutoCompletableObjectiveIds(questRouteObjectives, [['quest-a', 'quest-b']])).toEqual([
      'obj-c1',
    ]);
  });
  it('ignores malformed quest pairs', () => {
    expect(
      getAutoCompletableObjectiveIds(questRouteObjectives, [
        ['quest-a', 'quest-a'],
        ['quest-b', ''],
      ] as Array<[string, string]>)
    ).toEqual(['obj-a1', 'obj-b1', 'obj-c1']);
  });
  it('merges chained quest pairs into one exclusion group', () => {
    expect(
      storyQuestExclusionGroups([
        ['quest-b', 'quest-c'],
        ['quest-a', 'quest-b'],
      ])
    ).toEqual([['quest-a', 'quest-b', 'quest-c']]);
  });
  it('reports saved objective ids the chapter no longer defines', () => {
    expect(unknownStoryObjectiveIds(objectives, ['obj-1', 'the-ticket-main-10', 'stale'])).toEqual([
      'stale',
      'the-ticket-main-10',
    ]);
  });
  it('does not bulk complete either side of a mutually exclusive quest pair', () => {
    const setObjectiveComplete = vi.fn();
    toggleStoryChapterWithLinearObjectives({
      chapterId: 'the-ticket',
      isChapterComplete: false,
      objectives: questRouteObjectives,
      mutuallyExclusiveQuestPairs: [['quest-a', 'quest-b']],
      isObjectiveComplete: () => false,
      setChapterComplete: vi.fn(),
      setChapterUncomplete: vi.fn(),
      setObjectiveComplete,
      setObjectiveUncomplete: vi.fn(),
    });
    expect(setObjectiveComplete).toHaveBeenCalledWith('the-ticket', 'obj-c1');
    expect(setObjectiveComplete).not.toHaveBeenCalledWith('the-ticket', 'obj-a1');
    expect(setObjectiveComplete).not.toHaveBeenCalledWith('the-ticket', 'obj-b1');
  });
  it('completes chapter and only incomplete linear objectives', () => {
    const setChapterComplete = vi.fn();
    const setChapterUncomplete = vi.fn();
    const setObjectiveComplete = vi.fn();
    const setObjectiveUncomplete = vi.fn();
    const complete = new Set(['obj-3']);
    toggleStoryChapterWithLinearObjectives({
      chapterId: 'chapter-1',
      isChapterComplete: false,
      objectives,
      isObjectiveComplete: (objectiveId) => complete.has(objectiveId),
      setChapterComplete,
      setChapterUncomplete,
      setObjectiveComplete,
      setObjectiveUncomplete,
    });
    expect(setChapterComplete).toHaveBeenCalledWith('chapter-1');
    expect(setChapterUncomplete).not.toHaveBeenCalled();
    expect(setObjectiveComplete).toHaveBeenCalledWith('chapter-1', 'obj-4');
    expect(setObjectiveComplete).not.toHaveBeenCalledWith('chapter-1', 'obj-3');
    expect(setObjectiveComplete).not.toHaveBeenCalledWith('chapter-1', 'obj-1');
    expect(setObjectiveUncomplete).not.toHaveBeenCalled();
  });
  it('uncompletes chapter and only completed linear objectives', () => {
    const setChapterComplete = vi.fn();
    const setChapterUncomplete = vi.fn();
    const setObjectiveComplete = vi.fn();
    const setObjectiveUncomplete = vi.fn();
    const complete = new Set(['obj-3']);
    toggleStoryChapterWithLinearObjectives({
      chapterId: 'chapter-1',
      isChapterComplete: true,
      objectives,
      isObjectiveComplete: (objectiveId) => complete.has(objectiveId),
      setChapterComplete,
      setChapterUncomplete,
      setObjectiveComplete,
      setObjectiveUncomplete,
    });
    expect(setChapterUncomplete).toHaveBeenCalledWith('chapter-1');
    expect(setChapterComplete).not.toHaveBeenCalled();
    expect(setObjectiveUncomplete).toHaveBeenCalledWith('chapter-1', 'obj-3');
    expect(setObjectiveUncomplete).not.toHaveBeenCalledWith('chapter-1', 'obj-4');
    expect(setObjectiveComplete).not.toHaveBeenCalled();
  });
  it('completes chapter with no objective mutations when chapter is unknown', () => {
    const setChapterComplete = vi.fn();
    const setObjectiveComplete = vi.fn();
    toggleStoryChapterWithLinearObjectives({
      chapterId: 'missing-chapter',
      isChapterComplete: false,
      objectives: undefined,
      isObjectiveComplete: () => false,
      setChapterComplete,
      setChapterUncomplete: vi.fn(),
      setObjectiveComplete,
      setObjectiveUncomplete: vi.fn(),
    });
    expect(setChapterComplete).toHaveBeenCalledWith('missing-chapter');
    expect(setObjectiveComplete).not.toHaveBeenCalled();
  });
});
