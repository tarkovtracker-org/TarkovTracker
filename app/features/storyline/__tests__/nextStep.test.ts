import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { useStorylineChapters } from '@/composables/useStorylineChapters';
import { nextStorylineStep, storylineBlockerTarget } from '@/features/storyline/nextStep';
import type { TaskAvailabilityResult, TaskBlocker } from '@/stores/taskAvailability';
import type { StoryChapter, StoryObjective } from '@/types/tarkov';
vi.mock('@/stores/useMetadata', () => ({ useMetadataStore: () => metadata }));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getCurrentGameMode: () => progress.mode,
    isStoryChapterComplete: (id: string) => progress.chapters.has(id),
    isStoryObjectiveComplete: (chapter: string, id: string) =>
      progress.objectives.has(`${chapter}:${id}`),
  }),
}));
const objective = (
  id: string,
  order: number,
  extra: Partial<StoryObjective> = {}
): StoryObjective => ({ id, order, type: 'main', description: id, ...extra });
const chapter = (extra: Partial<StoryChapter> = {}): StoryChapter => ({
  id: 'tour',
  name: 'Tour',
  normalizedName: 'tour',
  wikiLink: '',
  order: 1,
  autoStart: true,
  objectives: {
    tutorial: objective('tutorial', 1, { completionPolicy: 'tutorial' }),
    optional: objective('optional', 2, { type: 'optional' }),
    talk: objective('talk', 3, {
      unlocks: [{ type: 'trader', name: 'Therapist', note: 'After dialogue' }],
    }),
    visit: objective('visit', 4),
  },
  ...extra,
});
const metadata = reactive({ storyChapters: [] as StoryChapter[], storyChaptersGameMode: 'pvp' });
const progress = reactive({
  mode: 'pvp',
  chapters: new Set<string>(),
  objectives: new Set<string>(),
});
const storyBlocker = (extra: Partial<TaskBlocker> = {}): TaskBlocker => ({
  type: 'story_objective',
  chapterIds: ['tour'],
  objective: { id: 'talk', name: 'talk' },
  ...extra,
});
const evaluate = (blockers: TaskBlocker[]): TaskAvailabilityResult => ({
  available: false,
  blockers,
});
const setup = () => {
  const { normalizedChapters } = useStorylineChapters();
  return {
    normalizedChapters,
    next: () => nextStorylineStep(normalizedChapters.value, [], () => undefined),
  };
};
describe('Storyline next step', () => {
  beforeEach(() => {
    metadata.storyChapters = [chapter()];
    metadata.storyChaptersGameMode = 'pvp';
    progress.mode = 'pvp';
    progress.chapters.clear();
    progress.objectives.clear();
  });
  it('skips the automatic tutorial and optional objectives, preserves benefit qualifications, and advances reactively', () => {
    const { next } = setup();
    expect(next()).toMatchObject({
      chapterId: 'tour',
      objectiveId: 'talk',
      kind: 'objective',
      unlocks: ['Therapist (After dialogue)'],
    });
    expect(progress.objectives.size).toBe(0);
    progress.objectives.add('tour:talk');
    expect(next()?.objectiveId).toBe('visit');
    progress.chapters.add('tour');
    expect(next()).toBeUndefined();
  });
  it.each(['pvp', 'pve', 'seasonal'])('uses only the current %s catalog', (mode) => {
    const { next } = setup();
    progress.mode = mode;
    metadata.storyChaptersGameMode = mode;
    expect(next()?.objectiveId).toBe('talk');
    metadata.storyChaptersGameMode = 'stale-mode';
    expect(next()).toBeUndefined();
  });
  it('does not infer chapter availability from order or missing prerequisites', () => {
    metadata.storyChapters = [
      chapter({
        autoStart: false,
        objectives: { talk: objective('talk', 1), visit: objective('visit', 2) },
      }),
    ];
    const { next } = setup();
    expect(next()).toBeUndefined();
    progress.objectives.add('tour:talk');
    expect(next()?.objectiveId).toBe('visit');
  });
  it('counts only eligible pending tasks whose sole remaining gate is the exact objective', () => {
    const { normalizedChapters } = setup();
    const evaluations: Record<string, TaskAvailabilityResult> = {
      opens: evaluate([storyBlocker()]),
      level: evaluate([storyBlocker(), { type: 'player_level', required: 15 }]),
      otherChapter: evaluate([storyBlocker({ chapterIds: ['other'] })]),
      otherObjective: evaluate([storyBlocker({ objective: { id: 'visit', name: 'visit' } })]),
      ambiguous: evaluate([storyBlocker({ chapterIds: ['tour', 'other'] })]),
      ineligible: evaluate([storyBlocker()]),
    };
    const result = nextStorylineStep(
      normalizedChapters.value,
      ['opens', 'level', 'otherChapter', 'otherObjective', 'ambiguous', 'unknown'],
      (id) => evaluations[id]
    );
    expect(result?.opens).toBe(1);
  });
  it('links only objective blockers resolved in the matching chapter', () => {
    const { normalizedChapters } = setup();
    expect(storylineBlockerTarget(storyBlocker(), normalizedChapters.value)).toEqual({
      chapter: 'tour',
      objective: 'talk',
    });
    expect(
      storylineBlockerTarget(storyBlocker({ type: 'trader_unlock' }), normalizedChapters.value)
    ).toEqual({ chapter: 'tour', objective: 'talk' });
    expect(
      storylineBlockerTarget(
        { type: 'trader_unlock', taskId: 'introduction' },
        normalizedChapters.value
      )
    ).toBeUndefined();
    for (const blocker of [
      undefined,
      { type: 'player_level' } as TaskBlocker,
      storyBlocker({ chapterIds: ['missing'] }),
      storyBlocker({ objective: { id: 'missing', name: 'missing' } }),
    ]) {
      expect(storylineBlockerTarget(blocker, normalizedChapters.value)).toBeUndefined();
    }
  });
  it('offers a chapter review when no main step remains without claiming completion', () => {
    const { next } = setup();
    progress.objectives.add('tour:talk');
    progress.objectives.add('tour:visit');
    expect(next()).toMatchObject({ kind: 'review', opens: 0, unlocks: [] });
    metadata.storyChapters = [chapter({ objectives: undefined })];
    expect(next()?.kind).toBe('review');
  });
  it('never selects an unresolved objective route or a missing alternative', () => {
    metadata.storyChapters = [
      chapter({
        objectives: {
          a: objective('a', 1, { mutuallyExclusiveWith: ['b'] }),
          b: objective('b', 2, { mutuallyExclusiveWith: ['a'] }),
          after: objective('after', 3),
        },
      }),
    ];
    const { next } = setup();
    expect(next()).toMatchObject({ kind: 'choice', opens: 0 });
    expect(next()?.objectiveId).toBeUndefined();
    progress.objectives.add('tour:b');
    expect(next()?.objectiveId).toBe('after');
    metadata.storyChapters = [
      chapter({ objectives: { a: objective('a', 1, { mutuallyExclusiveWith: ['unknown'] }) } }),
    ];
    expect(next()?.kind).toBe('choice');
  });
  it('does not select partial quest routes or revive a branch excluded by proven completion', () => {
    metadata.storyChapters = [
      chapter({
        mutuallyExclusiveQuestPairs: [['qa', 'qb']],
        objectives: {
          a: objective('a', 1, { sourceQuestId: 'qa' }),
          b: objective('b', 2, { sourceQuestId: 'qb' }),
          after: objective('after', 3),
        },
      }),
    ];
    const { next } = setup();
    expect(next()?.kind).toBe('choice');
    progress.objectives.add('tour:a');
    expect(next()?.objectiveId).toBe('after');
    metadata.storyChapters[0]!.referenceCoverage = {
      partial: true,
      referencedSubquests: 3,
      resolvedSubquests: 2,
      missingObjectiveTexts: 0,
    };
    expect(next()?.kind).toBe('choice');
    expect(next()?.objectiveId).toBeUndefined();
  });
});
