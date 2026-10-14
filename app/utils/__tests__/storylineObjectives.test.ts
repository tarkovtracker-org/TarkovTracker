import { describe, expect, it, vi } from 'vitest';
import {
  getAutoCompletableObjectiveIds,
  normalizeStoryObjectives,
  storyExclusiveQuestPairs,
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
  it('preserves valid optional parents through array projection and cached record normalization', () => {
    const parent = { ...objectives[2]!, sourceQuestId: 'quest-a' };
    const child = {
      ...objectives[3]!,
      sourceQuestId: 'quest-a',
      parentObjectiveId: parent.id,
    };
    const normalized = normalizeStoryObjectives([child, parent]);
    expect(normalized[child.id]?.parentObjectiveId).toBe(parent.id);
    expect(normalizeStoryObjectives(normalized)[child.id]?.parentObjectiveId).toBe(parent.id);
    expect(getAutoCompletableObjectiveIds([child, parent])).toEqual([parent.id, child.id]);
    expect(child.parentObjectiveId).toBe(parent.id);
  });
  it.each([
    { label: 'missing parent', parent: {}, child: { parentObjectiveId: 'missing' } },
    { label: 'optional parent', parent: { type: 'optional' }, child: {} },
    { label: 'another source quest', parent: { sourceQuestId: 'quest-b' }, child: {} },
    {
      label: 'unknown source quest',
      parent: { sourceQuestId: undefined },
      child: { sourceQuestId: undefined },
    },
    { label: 'blank source quest', parent: { sourceQuestId: ' ' }, child: { sourceQuestId: ' ' } },
    { label: 'self reference', parent: {}, child: { parentObjectiveId: 'obj-4' } },
    { label: 'main child', parent: {}, child: { type: 'main' } },
    { label: 'non-string parent', parent: {}, child: { parentObjectiveId: 42 } },
  ])('drops a link with $label without losing either objective', ({ parent, child }) => {
    const normalized = normalizeStoryObjectives([
      { ...objectives[2]!, sourceQuestId: 'quest-a', ...parent },
      { ...objectives[3]!, sourceQuestId: 'quest-a', parentObjectiveId: 'obj-3', ...child },
    ] as Parameters<typeof normalizeStoryObjectives>[0]);
    expect(Object.keys(normalized)).toEqual(['obj-3', 'obj-4']);
    expect(normalized['obj-4']).not.toHaveProperty('parentObjectiveId');
  });
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
  it('preserves explicit unlock records when hydrating a cached chapter', () => {
    const unlocks = [
      { type: 'trader' as const, id: 'peacekeeper', name: 'Peacekeeper', note: 'Complete Woods' },
    ];
    const normalized = normalizeStoryObjectives([{ ...objectives[0]!, unlocks }]);
    expect(normalized['obj-1']?.unlocks).toEqual(unlocks);
    expect(normalized['obj-1']?.unlocks).not.toBe(unlocks);
  });
  it('ignores malformed cached unlocks instead of fabricating their placement', () => {
    const unlocks = [null, { type: 'invented', name: 'Shoreline' }, { type: 'trader', name: '' }];
    const normalized = normalizeStoryObjectives([
      { ...objectives[0]!, unlocks },
    ] as unknown as Parameters<typeof normalizeStoryObjectives>[0]);
    expect(normalized['obj-1']?.unlocks).toEqual([]);
  });
  it.each([
    { type: 'trader', name: ' ' },
    { type: 'trader', name: 'Peacekeeper', id: '' },
    { type: 'trader', name: 'Peacekeeper', id: ' ' },
    { type: 'trader', name: 'Peacekeeper', id: 7 },
    { type: 'trader', name: 'Peacekeeper', note: '' },
    { type: 'trader', name: 'Peacekeeper', note: ' ' },
    { type: 'trader', name: 'Peacekeeper', note: 7 },
    { type: ['trader'], name: 'Peacekeeper' },
  ])('rejects invalid cached unlock text and types: %j', (unlock) => {
    const normalized = normalizeStoryObjectives([
      { ...objectives[0]!, unlocks: [unlock] },
    ] as unknown as Parameters<typeof normalizeStoryObjectives>[0]);
    expect(normalized['obj-1']?.unlocks).toEqual([]);
  });
  it.each([
    Object.assign([], { type: 'trader', name: 'Peacekeeper' }),
    Object.assign(Object.create({ inherited: true }), { type: 'trader', name: 'Peacekeeper' }),
  ])('rejects non-plain cached unlock objects: %j', (unlock) => {
    const normalized = normalizeStoryObjectives([
      { ...objectives[0]!, unlocks: [unlock] },
    ] as unknown as Parameters<typeof normalizeStoryObjectives>[0]);
    expect(normalized['obj-1']?.unlocks).toEqual([]);
  });
  it.each(['achievement', 'barter', 'map', 'quest', 'trader', 'other'])(
    'preserves the supported %s unlock type',
    (type) => {
      const unlock = { type, name: 'Unlock' };
      const normalized = normalizeStoryObjectives([
        { ...objectives[0]!, unlocks: [unlock] },
      ] as unknown as Parameters<typeof normalizeStoryObjectives>[0]);
      expect(normalized['obj-1']?.unlocks).toEqual([unlock]);
    }
  );
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
  it('keeps chained quest pairs separate instead of merging them', () => {
    expect(
      storyExclusiveQuestPairs([
        ['quest-b', 'quest-c'],
        ['quest-a', 'quest-b'],
      ])
    ).toEqual([
      ['quest-a', 'quest-b'],
      ['quest-b', 'quest-c'],
    ]);
  });
  it('deduplicates a pair regardless of member order', () => {
    expect(
      storyExclusiveQuestPairs([
        ['quest-b', 'quest-a'],
        ['quest-a', 'quest-b'],
      ])
    ).toEqual([['quest-a', 'quest-b']]);
  });
  it('reports saved objective ids the chapter no longer defines', () => {
    expect(unknownStoryObjectiveIds(objectives, ['obj-1', 'the-ticket-main-10', 'stale'])).toEqual([
      'stale',
      'the-ticket-main-10',
    ]);
  });
  it('reports inherited object keys as unknown saved ids', () => {
    expect(unknownStoryObjectiveIds(objectives, ['constructor', 'toString', 'obj-1'])).toEqual([
      'constructor',
      'toString',
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
