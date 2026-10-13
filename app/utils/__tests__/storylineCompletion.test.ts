import { describe, expect, it, vi } from 'vitest';
import { defaultState } from '@/stores/progressState';
import { buildPrestigeResetData } from '@/stores/tarkov/prestige';
import { effectiveStoryProgress, storyCatalogForMode } from '@/utils/storylineCompletion';
import {
  normalizeStoryObjectives,
  toggleStoryChapterWithLinearObjectives,
} from '@/utils/storylineObjectives';
import type { StoryChapter, StoryObjective } from '@/types/tarkov';
const chapter: StoryChapter = {
  id: 'tour',
  name: 'Tour',
  normalizedName: 'tour',
  order: 1,
  wikiLink: '',
  objectives: {
    escape: {
      id: 'escape',
      order: 1,
      type: 'main',
      description: 'Localized escape',
      completionPolicy: 'tutorial',
    },
    therapist: { id: 'therapist', order: 2, type: 'main', description: 'Talk to Therapist' },
  },
};
describe('effective storyline baseline', () => {
  it.each(['pvp', 'pve', 'seasonal'] as const)(
    'uses policy only from the matching %s catalog',
    (mode) => {
      expect(storyCatalogForMode([chapter], mode, mode)).toEqual([chapter]);
      expect(storyCatalogForMode([chapter], null, mode)).toEqual([]);
      for (const other of ['pvp', 'pve', 'seasonal'] as const) {
        if (other === mode) continue;
        expect(effectiveStoryProgress({}, storyCatalogForMode([chapter], other, mode))).toEqual({});
      }
    }
  );
  it.each(['pvp', 'pve', 'seasonal'] as const)(
    'keeps %s default, reset, prestige and imported marks distinct from the baseline',
    (mode) => {
      const fresh = structuredClone(defaultState[mode]);
      const existing = {
        ...fresh,
        storyChapters: {
          tour: {
            objectives: {
              escape: { complete: false, timestamp: 17 },
              therapist: { complete: false },
            },
          },
        },
      };
      const imported = JSON.parse(JSON.stringify(existing));
      for (const progress of [fresh, existing, imported, buildPrestigeResetData(existing, 2)]) {
        const before = JSON.stringify(progress);
        const projected = effectiveStoryProgress(progress.storyChapters, [chapter]);
        expect(projected.tour?.objectives?.escape).toEqual({ complete: true });
        expect(projected.tour?.objectives?.therapist?.complete).not.toBe(true);
        expect(projected.tour?.complete).not.toBe(true);
        expect(JSON.stringify(progress)).toBe(before);
        expect(effectiveStoryProgress(projected, [chapter])).toEqual(projected);
      }
      expect(imported.storyChapters.tour.objectives.escape).toEqual({
        complete: false,
        timestamp: 17,
      });
      expect(
        effectiveStoryProgress(existing.storyChapters, []).tour?.objectives?.escape?.complete
      ).toBe(false);
    }
  );
  it('preserves old metadata and drops unknown policies without guessing from text or ID', () => {
    const unknown = { ...chapter.objectives!.escape!, completionPolicy: 'future' };
    const normalized = normalizeStoryObjectives([unknown as unknown as StoryObjective]);
    expect(normalized.escape?.completionPolicy).toBeUndefined();
    expect(effectiveStoryProgress({}, [{ ...chapter, objectives: normalized }])).toEqual({});
    expect(normalizeStoryObjectives(chapter.objectives).escape?.completionPolicy).toBe('tutorial');
  });
  it.each([false, true])(
    'bulk chapter toggle (%s) never writes or clears the baseline',
    (complete) => {
      const set = vi.fn();
      const clear = vi.fn();
      toggleStoryChapterWithLinearObjectives({
        chapterId: 'tour',
        isChapterComplete: complete,
        objectives: chapter.objectives,
        isObjectiveComplete: () => complete,
        setChapterComplete: vi.fn(),
        setChapterUncomplete: vi.fn(),
        setObjectiveComplete: set,
        setObjectiveUncomplete: clear,
      });
      expect(complete ? clear.mock.calls : set.mock.calls).toEqual([['tour', 'therapist']]);
      expect(complete ? set : clear).not.toHaveBeenCalled();
    }
  );
});
