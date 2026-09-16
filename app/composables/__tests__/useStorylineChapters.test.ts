import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryChapter, StoryChapterEnding } from '@/types/tarkov';
const objectiveCompletionState = new Set<string>();
const chapterCompletionState = new Set<string>();
const STORY_CHAPTERS: StoryChapter[] = [
  {
    id: 'chapter-1',
    name: 'Chapter 1',
    normalizedName: 'chapter-1',
    wikiLink: 'https://example.com/chapter-1',
    order: 1,
    autoStart: false,
    chapterRequirements: [{ id: 'req-1', name: 'Finish Intro' }],
    mapUnlocks: [
      { id: 'map-1', name: 'Route B Objective' },
      { id: 'map-2', name: 'Side Objective' },
    ],
    traderUnlocks: [{ id: 'trader-1', name: 'Peacekeeper' }],
    rewards: {
      description: 'Chapter completion package',
    },
    objectives: {
      'obj-a': {
        id: 'obj-a',
        order: 1,
        type: 'main',
        description: 'Route A Objective',
        notes: 'Savior ending - cooperate fully with Kerman',
        mutuallyExclusiveWith: ['obj-b'],
      },
      'obj-b': {
        id: 'obj-b',
        order: 2,
        type: 'main',
        description: 'Route B Objective',
        notes: 'Fallen ending - keep the evidence',
        mutuallyExclusiveWith: ['obj-a'],
      },
      'obj-c': {
        id: 'obj-c',
        order: 3,
        type: 'optional',
        description: 'Side Objective',
      },
      'obj-d': {
        id: 'obj-d',
        order: 4,
        type: 'optional',
        description: 'Unknown Link Objective',
        mutuallyExclusiveWith: ['missing-objective'],
      },
    },
  },
];
const DECLARED_ENDING_CHAPTER: StoryChapter = {
  id: 'the-ticket',
  name: 'The Ticket',
  normalizedName: 'the-ticket',
  wikiLink: 'https://example.com/the-ticket',
  order: 2,
  chapterQuestId: '67bc646c6e34475fea09d2a5',
  referenceCoverage: {
    referencedSubquests: 88,
    resolvedSubquests: 35,
    missingObjectiveTexts: 2,
    partial: true,
  },
  endings: [
    {
      id: 'ending-resolved',
      systemName: 'EscapedFromTarkovForHumanity',
      gateQuestId: 'quest-gate',
      objectiveCount: 2,
      resolvedInReference: true,
    },
    {
      id: 'ending-pending',
      systemName: 'YouDidntEscapeFromYourself',
      gateQuestId: 'quest-pending',
      objectiveCount: 0,
      resolvedInReference: false,
    },
  ],
  mutuallyExclusiveQuestPairs: [['quest-keep', 'quest-hand-over']],
  objectives: {
    'obj-gate-1': {
      id: 'obj-gate-1',
      order: 1,
      type: 'main',
      description: 'Arrive at the terminal',
      sourceQuestId: 'quest-gate',
      endingId: 'ending-resolved',
    },
    'obj-gate-2': {
      id: 'obj-gate-2',
      order: 2,
      type: 'optional',
      description: 'Bring the secure case',
      sourceQuestId: 'quest-gate',
      endingId: 'ending-resolved',
    },
    'obj-keep': {
      id: 'obj-keep',
      order: 3,
      type: 'main',
      description: 'Keep the case',
      sourceQuestId: 'quest-keep',
    },
    'obj-hand': {
      id: 'obj-hand',
      order: 4,
      type: 'main',
      description: 'Hand the case over',
      sourceQuestId: 'quest-hand-over',
    },
  },
};
const loadComposable = async (
  storyChapters: StoryChapter[] = STORY_CHAPTERS,
  options: Parameters<
    typeof import('@/composables/useStorylineChapters').useStorylineChapters
  >[0] = {}
) => {
  vi.resetModules();
  vi.doMock('@/stores/useMetadata', () => ({
    useMetadataStore: () => ({
      storyChapters,
    }),
  }));
  vi.doMock('@/stores/useTarkov', () => ({
    useTarkovStore: () => ({
      isStoryChapterComplete: (chapterId: string) => chapterCompletionState.has(chapterId),
      isStoryObjectiveComplete: (chapterId: string, objectiveId: string) =>
        objectiveCompletionState.has(`${chapterId}:${objectiveId}`),
    }),
  }));
  const { useStorylineChapters } = await import('@/composables/useStorylineChapters');
  return useStorylineChapters(options);
};
const requireDefined = <T>(value: T | null | undefined, message: string): T => {
  expect(value, message).toBeDefined();
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
};
describe('useStorylineChapters', () => {
  beforeEach(() => {
    objectiveCompletionState.clear();
    chapterCompletionState.clear();
  });
  it('derives chosen, blocked, and open storyline route states', async () => {
    objectiveCompletionState.add('chapter-1:obj-b');
    const { normalizedChapters } = await loadComposable();
    const chapter = requireDefined(
      normalizedChapters.value[0],
      'Expected first normalized chapter'
    );
    expect(chapter.requirements).toEqual([{ id: 'req-1', label: 'Finish Intro' }]);
    const objectiveA = requireDefined(
      chapter.objectives.find((objective) => objective.id === 'obj-a'),
      'Expected obj-a objective'
    );
    const objectiveB = requireDefined(
      chapter.objectives.find((objective) => objective.id === 'obj-b'),
      'Expected obj-b objective'
    );
    const objectiveC = requireDefined(
      chapter.objectives.find((objective) => objective.id === 'obj-c'),
      'Expected obj-c objective'
    );
    expect(objectiveA.routeState).toBe('blocked');
    expect(objectiveA.routeAlternatives).toEqual([
      { id: 'obj-b', label: 'Route B Objective', complete: true },
    ]);
    expect(objectiveA.routeBlockingAlternatives).toEqual([
      { id: 'obj-b', label: 'Route B Objective', complete: true },
    ]);
    expect(objectiveB.routeState).toBe('chosen');
    expect(objectiveC.routeState).toBe('open');
    expect(chapter.mainObjectiveCompleted).toBe(1);
    expect(chapter.mainObjectiveTotal).toBe(2);
    expect(chapter.mainRouteChoices).toHaveLength(1);
    expect(chapter.mainRouteChoices[0]?.objectives.map((objective) => objective.id)).toEqual([
      'obj-a',
      'obj-b',
    ]);
    expect(chapter.endings).toEqual([
      {
        id: 'obj-a-ending',
        label: 'Savior Ending',
        objectiveId: 'obj-a',
        objectiveLabel: 'Route A Objective',
        routeBlockingAlternatives: [{ id: 'obj-b', label: 'Route B Objective', complete: true }],
        routeChoiceIndex: 1,
        routeState: 'blocked',
      },
      {
        id: 'obj-b-ending',
        label: 'Fallen Ending',
        objectiveId: 'obj-b',
        objectiveLabel: 'Route B Objective',
        routeBlockingAlternatives: [],
        routeChoiceIndex: 1,
        routeState: 'chosen',
      },
    ]);
    const objectiveAUnlocks = objectiveA.unlocks.map((unlock) => unlock.label);
    const objectiveBUnlocks = objectiveB.unlocks.map((unlock) => unlock.label);
    const objectiveCUnlocks = objectiveC.unlocks.map((unlock) => unlock.label);
    expect(objectiveAUnlocks).toContain('Peacekeeper');
    expect(objectiveBUnlocks).toContain('Route B Objective');
    expect(objectiveBUnlocks).toContain('Chapter completion package');
    expect(objectiveCUnlocks).toContain('Side Objective');
    expect(objectiveA.hasEstimatedUnlocks).toBe(true);
    expect(objectiveB.hasEstimatedUnlocks).toBe(true);
    expect(objectiveC.hasEstimatedUnlocks).toBe(false);
    expect(chapter.chapterUnlocks).toEqual([]);
    expect(chapter.mainLinearObjectives).toEqual([]);
    expect(chapter.optionalRouteChoices).toEqual([]);
    expect(chapter.optionalLinearObjectives.map((objective) => objective.id)).toEqual([
      'obj-c',
      'obj-d',
    ]);
  });
  it('ignores missing mutually exclusive links when deriving route alternatives', async () => {
    const { normalizedChapters } = await loadComposable();
    const chapter = requireDefined(
      normalizedChapters.value[0],
      'Expected first normalized chapter'
    );
    const objectiveD = requireDefined(
      chapter.objectives.find((objective) => objective.id === 'obj-d'),
      'Expected obj-d objective'
    );
    expect(objectiveD.routeAlternatives).toEqual([]);
    expect(objectiveD.routeBlockingAlternatives).toEqual([]);
    expect(objectiveD.routeState).toBe('open');
    expect(chapter.endings.map((ending) => ending.objectiveId)).toEqual(['obj-a', 'obj-b']);
  });
  it('does not classify lead-to route notes as endings', async () => {
    const chapters = JSON.parse(JSON.stringify(STORY_CHAPTERS)) as StoryChapter[];
    const chapter = chapters[0];
    if (!chapter) {
      throw new Error('Missing storyline chapter fixture');
    }
    chapter.objectives = chapter.objectives ?? {};
    chapter.objectives['obj-e'] = {
      description: 'Kerman Route',
      id: 'obj-e',
      mutuallyExclusiveWith: ['obj-f'],
      notes: 'Kerman Route — leads to Savior or Fallen ending',
      order: 5,
      type: 'optional',
    };
    chapter.objectives['obj-f'] = {
      description: 'Kerman Route Alternative',
      id: 'obj-f',
      order: 6,
      type: 'optional',
    };
    const { normalizedChapters } = await loadComposable(chapters);
    const normalizedChapter = requireDefined(
      normalizedChapters.value[0],
      'Expected first normalized chapter'
    );
    expect(normalizedChapter.optionalRouteChoices).toHaveLength(1);
    expect(normalizedChapter.endings.map((ending) => ending.objectiveId)).toEqual([
      'obj-a',
      'obj-b',
    ]);
  });
  it('reads endings, quest routes, and coverage from overlay-declared chapter data', async () => {
    objectiveCompletionState.add('the-ticket:obj-gate-1');
    objectiveCompletionState.add('the-ticket:obj-keep');
    const { normalizedChapters } = await loadComposable([DECLARED_ENDING_CHAPTER]);
    const chapter = requireDefined(normalizedChapters.value[0], 'Expected the-ticket chapter');
    expect(chapter.coveragePartial).toBe(true);
    expect(chapter.endings).toEqual([
      {
        evidencePending: false,
        id: 'ending-resolved',
        label: 'Escaped From Tarkov For Humanity',
        objectiveCompleted: 1,
        objectiveId: '',
        objectiveLabel: '',
        objectiveTotal: 2,
        routeBlockingAlternatives: [],
        routeChoiceIndex: null,
        routeState: 'open',
        systemName: 'EscapedFromTarkovForHumanity',
      },
      {
        evidencePending: true,
        id: 'ending-pending',
        label: 'You Didnt Escape From Yourself',
        objectiveCompleted: 0,
        objectiveId: '',
        objectiveLabel: '',
        objectiveTotal: 0,
        routeBlockingAlternatives: [],
        routeChoiceIndex: null,
        routeState: 'open',
        systemName: 'YouDidntEscapeFromYourself',
      },
    ]);
    expect(chapter.questRouteChoices).toEqual([
      {
        branches: [
          {
            completedCount: 0,
            evidencePending: false,
            id: 'quest-hand-over',
            knownStepsComplete: false,
            label: 'Hand the case over',
            totalCount: 1,
          },
          {
            completedCount: 1,
            evidencePending: false,
            id: 'quest-keep',
            knownStepsComplete: true,
            label: 'Keep the case',
            totalCount: 1,
          },
        ],
        // The fixture chapter reports partial coverage, so no route is proven finished.
        chosenBranchId: null,
        conflicting: false,
        coveragePartial: true,
        id: 'the-ticket-quest-route-quest-hand-over-quest-keep',
      },
    ]);
    const handOver = requireDefined(
      chapter.objectives.find((objective) => objective.id === 'obj-hand'),
      'Expected obj-hand objective'
    );
    expect(handOver.routeState).toBe('open');
    expect(chapter.mainRouteChoices).toEqual([]);
  });
  it('keeps a declared route whose objectives the capture does not include', async () => {
    const chapter = structuredClone(DECLARED_ENDING_CHAPTER);
    chapter.mutuallyExclusiveQuestPairs = [['quest-keep', 'quest-missing']];
    const { normalizedChapters } = await loadComposable([chapter]);
    const normalized = requireDefined(normalizedChapters.value[0], 'Expected the-ticket chapter');
    expect(normalized.questRouteChoices).toHaveLength(1);
    expect(normalized.questRouteChoices[0]?.branches.map((branch) => branch.id)).toEqual([
      'quest-keep',
      'quest-missing',
    ]);
    expect(normalized.questRouteChoices[0]?.branches[1]).toMatchObject({
      evidencePending: true,
      knownStepsComplete: false,
      totalCount: 0,
    });
  });
  it('proves a chosen route only when chapter coverage is complete', async () => {
    const chapter = structuredClone(DECLARED_ENDING_CHAPTER);
    chapter.referenceCoverage = {
      referencedSubquests: 4,
      resolvedSubquests: 4,
      partial: false,
    };
    objectiveCompletionState.add('the-ticket:obj-keep');
    const { normalizedChapters } = await loadComposable([chapter]);
    const normalized = requireDefined(normalizedChapters.value[0], 'Expected the-ticket chapter');
    expect(normalized.questRouteChoices[0]).toMatchObject({
      chosenBranchId: 'quest-keep',
      conflicting: false,
      coveragePartial: false,
    });
  });
  it('flags a conflict when both declared routes read as finished', async () => {
    objectiveCompletionState.add('the-ticket:obj-keep');
    objectiveCompletionState.add('the-ticket:obj-hand');
    const { normalizedChapters } = await loadComposable([DECLARED_ENDING_CHAPTER]);
    const normalized = requireDefined(normalizedChapters.value[0], 'Expected the-ticket chapter');
    expect(normalized.questRouteChoices[0]).toMatchObject({
      chosenBranchId: null,
      conflicting: true,
    });
  });
  it('never implies exclusivity between quests the overlay did not pair', async () => {
    const chapter = structuredClone(DECLARED_ENDING_CHAPTER);
    chapter.mutuallyExclusiveQuestPairs = [
      ['quest-keep', 'quest-hand-over'],
      ['quest-keep', 'quest-gate'],
    ];
    const { normalizedChapters } = await loadComposable([chapter]);
    const normalized = requireDefined(normalizedChapters.value[0], 'Expected the-ticket chapter');
    expect(
      normalized.questRouteChoices.map((routeChoice) =>
        routeChoice.branches.map((branch) => branch.id)
      )
    ).toEqual([
      ['quest-gate', 'quest-keep'],
      ['quest-hand-over', 'quest-keep'],
    ]);
  });
  it('marks an ending chosen once every objective it declares is complete', async () => {
    objectiveCompletionState.add('the-ticket:obj-gate-1');
    objectiveCompletionState.add('the-ticket:obj-gate-2');
    const { normalizedChapters } = await loadComposable([DECLARED_ENDING_CHAPTER]);
    const chapter = requireDefined(normalizedChapters.value[0], 'Expected the-ticket chapter');
    expect(chapter.endings[0]).toMatchObject({ objectiveCompleted: 2, routeState: 'chosen' });
  });
  it('treats an explicitly empty ending list as authoritative', async () => {
    const chapter = structuredClone(STORY_CHAPTERS[0]!);
    chapter.endings = [];
    const { normalizedChapters } = await loadComposable([chapter]);
    const normalized = requireDefined(normalizedChapters.value[0], 'Expected first chapter');
    expect(normalized.endings).toEqual([]);
  });
  it('keeps an unresolved ending open and drops malformed entries', async () => {
    const chapter = structuredClone(DECLARED_ENDING_CHAPTER);
    const unresolvedEnding = requireDefined(
      chapter.endings?.[1],
      'Expected the unresolved ending fixture'
    );
    chapter.endings = [
      { ...unresolvedEnding, objectiveCount: 1 },
      null as unknown as StoryChapterEnding,
    ];
    chapter.objectives!['obj-pending'] = {
      description: 'Reach the unresolved branch',
      endingId: 'ending-pending',
      id: 'obj-pending',
      order: 5,
      sourceQuestId: 'quest-pending',
      type: 'main',
    };
    objectiveCompletionState.add('the-ticket:obj-pending');
    const { normalizedChapters } = await loadComposable([chapter]);
    const normalized = requireDefined(normalizedChapters.value[0], 'Expected the-ticket chapter');
    expect(normalized.endings).toHaveLength(1);
    expect(normalized.endings[0]).toMatchObject({
      evidencePending: true,
      objectiveCompleted: 1,
      objectiveTotal: 1,
      routeState: 'open',
    });
  });
  it('reports completed objective marks that upstream re-keyed', async () => {
    const { normalizedChapters } = await loadComposable([DECLARED_ENDING_CHAPTER], {
      completedObjectiveIds: () => ['obj-gate-1', 'the-ticket-main-10'],
    });
    const chapter = requireDefined(normalizedChapters.value[0], 'Expected the-ticket chapter');
    expect(chapter.staleObjectiveIds).toEqual(['the-ticket-main-10']);
  });
  it('reports no stale marks without a completed objective source', async () => {
    const { normalizedChapters } = await loadComposable([DECLARED_ENDING_CHAPTER]);
    const chapter = requireDefined(normalizedChapters.value[0], 'Expected the-ticket chapter');
    expect(chapter.staleObjectiveIds).toEqual([]);
  });
});
