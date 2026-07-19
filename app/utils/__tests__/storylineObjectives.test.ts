import { describe, expect, it, vi } from 'vitest';
import {
  getAutoCompletableObjectiveIds,
  toggleStoryChapterWithLinearObjectives,
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
describe('storylineObjectives', () => {
  it('returns only non-route-choice objective ids', () => {
    expect(getAutoCompletableObjectiveIds(objectives)).toEqual(['obj-3', 'obj-4']);
  });
  it('applies default route-choice links when source data omits them', () => {
    expect(
      getAutoCompletableObjectiveIds([
        {
          id: 'falling-skies-main-19',
          order: 1,
          type: 'main',
          description: 'Route A',
        },
        {
          id: 'falling-skies-main-20',
          order: 2,
          type: 'main',
          description: 'Route B',
        },
      ])
    ).toEqual([]);
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
