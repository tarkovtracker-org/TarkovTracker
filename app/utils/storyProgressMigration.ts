import type { StoryChapter } from '@/types/tarkov';
/**
 * Reconciles saved story objective marks with the objective IDs the overlay currently publishes.
 *
 * The overlay owns objective identity. When it replaces an ID, a saved mark stops resolving: the
 * player sees the objective as untracked while the record stays in their progress blob forever, is
 * re-uploaded on every sync, and is re-saved beside the mark they make against the new ID. This
 * module moves a mark when the change is proven and drops it when the ID can no longer exist.
 */
type StoredObjective = { complete?: boolean; count?: number; timestamp?: number };
type StoredObjectives = Record<string, StoredObjective>;
type StoredChapter = { objectives?: StoredObjectives } & Record<string, unknown>;
type StoredChapters = Record<string, StoredChapter>;
/** Client objective ID shape the story chapter schema enforces (`src/schemas/story-chapter.schema.json`). */
const CLIENT_OBJECTIVE_ID = /^[0-9a-f]{24}$/;
/**
 * Story objective IDs retired by tarkov-data-overlay v1.93, mapped to the ID that replaced them.
 *
 * That release replaced The Ticket's 44 hand-authored positional IDs with real client objective IDs
 * and states that no general mapping exists, because the old IDs encoded position rather than
 * identity. These entries are the subset the published data itself proves:
 *
 * - Six pairs whose objective text is byte-identical and occurs exactly once on each side of the
 *   change, so no other objective could be meant.
 * - `the-ticket-main-10`, which the overlay re-anchored itself: `src/overrides/modes/regular/
 *   prestige.json5` moved the prestige 4 and prestige 5 `storyObjectiveStatus` requirement from that
 *   ID to `68e2ecfeb88d405a420774f8`, annotated `Was: the-ticket-main-10`. Without this entry a
 *   player who recorded that milestone reads as ineligible to prestige.
 *
 * Deliberately absent: `the-ticket-main-2` and `-main-5` ("Talk to Mr. Kerman", five candidates in
 * the new data) and `the-ticket-opt-5` ("Talk to Lightkeeper", two candidates) are ambiguous, and
 * the other 34 retired IDs have no counterpart at all. Guessing at those would record progress the
 * player never made, so they are dropped instead.
 */
export const STORY_OBJECTIVE_ID_ALIASES: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  'the-ticket': {
    // "Wait for Mr. Kerman to reach out"
    'the-ticket-main-3': '68e1a87e4c6b5f9e825bf3a0',
    // "Talk to Prapor"
    'the-ticket-main-4': '68d9290c4d67043271847892',
    // "Obtain the experimental signal jammer"
    'the-ticket-main-7': '67bc885febc1b9a2446146c2',
    // "Unlock the armored case"
    'the-ticket-main-9': '68e2d8d52a2449612b06ac9d',
    // "Retrieve the Ticket document from the case" -> "Obtain the \"Ticket\"" (prestige 4/5 gate)
    'the-ticket-main-10': '68e2ecfeb88d405a420774f8',
    // "Obtain the Laboratory master pass"
    'the-ticket-main-14': '67bc9970a23671dbdd023d3a',
    // "Gain access to Lightkeeper"
    'the-ticket-opt-4': '692eb8a5997e309c890d4ac1',
  },
};
export interface StoryObjectiveMigrationResult {
  objectives: StoredObjectives;
  migrated: number;
  dropped: number;
  changed: boolean;
}
export interface StoryProgressMigrationResult {
  storyChapters: StoredChapters;
  migrated: number;
  dropped: number;
  changed: boolean;
}
interface MigrationContext {
  aliases: Readonly<Record<string, string>>;
  published: ReadonlySet<string>;
  stored: StoredObjectives;
}
type Disposition = { kind: 'keep' } | { kind: 'move'; to: string } | { kind: 'drop' };
const publishedObjectiveIds = (chapter: StoryChapter): string[] =>
  Object.keys(chapter.objectives ?? {});
/**
 * Whether the chapter's own objective IDs prove it follows the client-ID contract.
 *
 * Read from the data rather than from a version string: an overlay that still publishes curated IDs
 * must not have its saved marks dropped, and a chapter that failed to load must not either.
 */
export const publishesClientObjectiveIds = (chapter: StoryChapter): boolean => {
  const objectiveIds = publishedObjectiveIds(chapter);
  return objectiveIds.length > 0 && objectiveIds.every((id) => CLIENT_OBJECTIVE_ID.test(id));
};
/** A retired ID may only move onto a published ID that holds no mark of its own. */
const isMovable = (alias: string | undefined, context: MigrationContext): alias is string =>
  typeof alias === 'string' && context.published.has(alias) && !(alias in context.stored);
/**
 * What to do with one saved objective ID.
 *
 * An unknown ID that still matches the client shape is kept: `referenceCoverage.partial` means the
 * published objective list is a projection of the overlay's capture, so a real objective can be
 * absent from it today and present tomorrow. Only an ID the contract can never accept is dropped.
 */
const classifyStoredObjective = (objectiveId: string, context: MigrationContext): Disposition => {
  if (context.published.has(objectiveId)) return { kind: 'keep' };
  const alias = context.aliases[objectiveId];
  if (isMovable(alias, context)) return { kind: 'move', to: alias };
  if (CLIENT_OBJECTIVE_ID.test(objectiveId)) return { kind: 'keep' };
  return { kind: 'drop' };
};
const collectObjective = (
  result: { objectives: StoredObjectives; migrated: number; dropped: number },
  [objectiveId, record]: [string, StoredObjective],
  context: MigrationContext
): void => {
  const disposition = classifyStoredObjective(objectiveId, context);
  if (disposition.kind === 'move') {
    result.objectives[disposition.to] = record;
    result.migrated += 1;
    return;
  }
  if (disposition.kind === 'drop') {
    result.dropped += 1;
    return;
  }
  result.objectives[objectiveId] = record;
};
const unchangedObjectives = (objectives: StoredObjectives): StoryObjectiveMigrationResult => ({
  objectives,
  migrated: 0,
  dropped: 0,
  changed: false,
});
const withObjectiveTotals = (result: {
  objectives: StoredObjectives;
  migrated: number;
  dropped: number;
}): StoryObjectiveMigrationResult => ({
  ...result,
  changed: result.migrated > 0 || result.dropped > 0,
});
const migrationContext = (chapter: StoryChapter, stored: StoredObjectives): MigrationContext => ({
  aliases: STORY_OBJECTIVE_ID_ALIASES[chapter.id] ?? {},
  published: new Set(publishedObjectiveIds(chapter)),
  stored,
});
const reconcileObjectives = (
  stored: StoredObjectives,
  context: MigrationContext
): StoryObjectiveMigrationResult => {
  const result = { objectives: {} as StoredObjectives, migrated: 0, dropped: 0 };
  for (const entry of Object.entries(stored)) {
    collectObjective(result, entry, context);
  }
  return withObjectiveTotals(result);
};
/** Reconcile one chapter's saved objective marks against the chapter the overlay publishes. */
export const migrateStoryChapterObjectives = (
  stored: StoredObjectives | undefined,
  chapter: StoryChapter
): StoryObjectiveMigrationResult => {
  if (!stored) return unchangedObjectives({});
  if (!publishesClientObjectiveIds(chapter)) return unchangedObjectives(stored);
  return reconcileObjectives(stored, migrationContext(chapter, stored));
};
/** A chapter's reconciliation, or nothing when it is unknown or already consistent. */
const changedChapterObjectives = (
  chapterProgress: StoredChapter | undefined,
  chapter: StoryChapter | undefined
): StoryObjectiveMigrationResult | undefined => {
  if (!chapter) return undefined;
  const result = migrateStoryChapterObjectives(chapterProgress?.objectives, chapter);
  return result.changed ? result : undefined;
};
/** The same reconciliation without a catalog: alias what is proven, drop what the schema forbids. */
const reconcileChapters = (
  stored: StoredChapters | undefined,
  reconcile: (
    chapterProgress: StoredChapter | undefined,
    chapterId: string
  ) => StoryObjectiveMigrationResult | undefined
): StoryProgressMigrationResult => {
  const storyChapters: StoredChapters = { ...(stored ?? {}) };
  const totals = { migrated: 0, dropped: 0 };
  for (const [chapterId, chapterProgress] of Object.entries(storyChapters)) {
    const result = reconcile(chapterProgress, chapterId);
    if (!result) continue;
    storyChapters[chapterId] = { ...chapterProgress, objectives: result.objectives };
    totals.migrated += result.migrated;
    totals.dropped += result.dropped;
  }
  return withProgressTotals(storyChapters, totals);
};
const withProgressTotals = (
  storyChapters: StoredChapters,
  totals: { migrated: number; dropped: number }
): StoryProgressMigrationResult => ({
  storyChapters,
  ...totals,
  changed: totals.migrated > 0 || totals.dropped > 0,
});
/**
 * Reconcile one game mode's story progress. Chapters the overlay does not publish are left alone:
 * absence there means the catalog is incomplete, not that the player's progress is stale.
 *
 * `chapters` may be the catalog loaded for a different mode, which a realtime merge for an inactive
 * mode produces. That stays sound because every decision is either mode-independent or validated
 * against a published ID: the drop rule rests on the schema's objective-ID shape, which no chapter in
 * any mode scope may publish otherwise, and an alias only moves onto an ID this catalog publishes.
 * A chapter the other mode scopes differently therefore loses a mark at worst, never gains one.
 */
export const migrateStoryProgress = (
  stored: StoredChapters | undefined,
  chapters: readonly StoryChapter[]
): StoryProgressMigrationResult => {
  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  return reconcileChapters(stored, (chapterProgress, chapterId) =>
    changedChapterObjectives(chapterProgress, chapterById.get(chapterId))
  );
};
