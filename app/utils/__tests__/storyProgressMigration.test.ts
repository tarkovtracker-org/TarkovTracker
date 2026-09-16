import { describe, expect, it } from 'vitest';
import {
  STORY_OBJECTIVE_ID_ALIASES,
  migrateStoryChapterObjectives,
  migrateStoryProgress,
  publishesClientObjectiveIds,
} from '@/utils/storyProgressMigration';
import type { StoryChapter, StoryObjective } from '@/types/tarkov';
const objective = (id: string, order: number): StoryObjective => ({
  description: `Objective ${order}`,
  id,
  order,
  type: 'main',
});
const CURRENT_ID = '68e2ecfeb88d405a420774f8';
const OTHER_ID = '68e1a87e4c6b5f9e825bf3a0';
const chapter = (ids: string[], id = 'the-ticket'): StoryChapter => ({
  id,
  name: 'The Ticket',
  normalizedName: id,
  order: 9,
  wikiLink: 'https://example.com/the-ticket',
  objectives: Object.fromEntries(
    ids.map((objectiveId, index) => [objectiveId, objective(objectiveId, index + 1)])
  ),
});
describe('storyProgressMigration', () => {
  it('recognizes a chapter that publishes client objective ids', () => {
    expect(publishesClientObjectiveIds(chapter([CURRENT_ID, OTHER_ID]))).toBe(true);
    expect(publishesClientObjectiveIds(chapter(['the-ticket-main-1']))).toBe(false);
    expect(publishesClientObjectiveIds(chapter([]))).toBe(false);
  });
  it('moves a proven re-key onto the published id', () => {
    const result = migrateStoryChapterObjectives(
      { 'the-ticket-main-10': { complete: true, timestamp: 1000 } },
      chapter([CURRENT_ID])
    );
    expect(result).toMatchObject({ migrated: 1, dropped: 0, changed: true });
    expect(result.objectives).toEqual({ [CURRENT_ID]: { complete: true, timestamp: 1000 } });
  });
  it('drops a retired id that has no proven successor', () => {
    const result = migrateStoryChapterObjectives(
      { 'the-ticket-main-2': { complete: true }, 'the-ticket-opt-9': { complete: false } },
      chapter([CURRENT_ID])
    );
    expect(result).toMatchObject({ migrated: 0, dropped: 2, changed: true });
    expect(result.objectives).toEqual({});
  });
  it('keeps a mark the player already made against the current id', () => {
    const result = migrateStoryChapterObjectives(
      {
        'the-ticket-main-10': { complete: true, timestamp: 1000 },
        [CURRENT_ID]: { complete: false, timestamp: 2000 },
      },
      chapter([CURRENT_ID])
    );
    expect(result.objectives).toEqual({ [CURRENT_ID]: { complete: false, timestamp: 2000 } });
    expect(result).toMatchObject({ migrated: 0, dropped: 1 });
  });
  it('keeps a retired mark whose proven successor the partial catalog omits', () => {
    const result = migrateStoryChapterObjectives(
      { 'the-ticket-main-10': { complete: true, timestamp: 1000 } },
      chapter([OTHER_ID])
    );
    expect(result).toMatchObject({ migrated: 0, dropped: 0, changed: false });
    expect(result.objectives).toEqual({
      'the-ticket-main-10': { complete: true, timestamp: 1000 },
    });
  });
  it('migrates that mark once the successor appears in the catalog', () => {
    const stored = { 'the-ticket-main-10': { complete: true, timestamp: 1000 } };
    expect(migrateStoryChapterObjectives(stored, chapter([OTHER_ID])).objectives).toEqual(stored);
    expect(migrateStoryChapterObjectives(stored, chapter([CURRENT_ID])).objectives).toEqual({
      [CURRENT_ID]: { complete: true, timestamp: 1000 },
    });
  });
  it('does not treat inherited object keys as published objectives', () => {
    const result = migrateStoryChapterObjectives(
      { constructor: { complete: true }, toString: { complete: true } },
      chapter([CURRENT_ID])
    );
    expect(result).toMatchObject({ migrated: 0, dropped: 2, changed: true });
    expect(result.objectives).toEqual({});
  });
  it('keeps an unrecognized client id, because the published list can be partial', () => {
    const unknownClientId = '6912345678901234567890ab';
    const result = migrateStoryChapterObjectives(
      { [unknownClientId]: { complete: true } },
      chapter([CURRENT_ID])
    );
    expect(result).toMatchObject({ migrated: 0, dropped: 0, changed: false });
    expect(result.objectives).toEqual({ [unknownClientId]: { complete: true } });
  });
  it('changes nothing while the overlay still publishes curated ids', () => {
    const stored = { 'the-ticket-main-10': { complete: true } };
    const result = migrateStoryChapterObjectives(stored, chapter(['the-ticket-main-10']));
    expect(result).toMatchObject({ migrated: 0, dropped: 0, changed: false });
    expect(result.objectives).toBe(stored);
  });
  it('is idempotent', () => {
    const first = migrateStoryChapterObjectives(
      { 'the-ticket-main-10': { complete: true } },
      chapter([CURRENT_ID])
    );
    const second = migrateStoryChapterObjectives(first.objectives, chapter([CURRENT_ID]));
    expect(second).toMatchObject({ migrated: 0, dropped: 0, changed: false });
    expect(second.objectives).toEqual(first.objectives);
  });
  it('leaves progress for a chapter the catalog does not publish', () => {
    const stored = {
      'the-ticket': { objectives: { 'the-ticket-main-10': { complete: true } } },
      boreas: { objectives: { 'boreas-main-1': { complete: true } } },
    };
    const result = migrateStoryProgress(stored, [chapter([CURRENT_ID])]);
    expect(result.storyChapters.boreas).toEqual(stored.boreas);
    expect(result.storyChapters['the-ticket']).toEqual({
      objectives: { [CURRENT_ID]: { complete: true } },
    });
    expect(result).toMatchObject({ migrated: 1, dropped: 0, changed: true });
  });
  it('preserves chapter-level fields while rewriting objectives', () => {
    const result = migrateStoryProgress(
      {
        'the-ticket': {
          complete: true,
          timestamp: 5,
          objectives: { 'the-ticket-main-2': { complete: true } },
        },
      },
      [chapter([CURRENT_ID])]
    );
    expect(result.storyChapters['the-ticket']).toEqual({
      complete: true,
      timestamp: 5,
      objectives: {},
    });
  });
  it('reports no change for progress that already matches the catalog', () => {
    const stored = { 'the-ticket': { objectives: { [CURRENT_ID]: { complete: true } } } };
    expect(migrateStoryProgress(stored, [chapter([CURRENT_ID])])).toMatchObject({
      changed: false,
      migrated: 0,
      dropped: 0,
    });
  });
  it('only aliases ids the overlay proved, leaving ambiguous ones unmapped', () => {
    const ticketAliases = STORY_OBJECTIVE_ID_ALIASES['the-ticket'] ?? {};
    expect(Object.keys(ticketAliases)).toHaveLength(7);
    for (const ambiguousId of ['the-ticket-main-2', 'the-ticket-main-5', 'the-ticket-opt-5']) {
      expect(ticketAliases[ambiguousId]).toBeUndefined();
    }
    for (const currentId of Object.values(ticketAliases)) {
      expect(currentId).toMatch(/^[0-9a-f]{24}$/);
    }
    expect(new Set(Object.values(ticketAliases)).size).toBe(Object.keys(ticketAliases).length);
  });
});
