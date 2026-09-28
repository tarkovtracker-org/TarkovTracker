import { normalizeTaskCompletionsMap } from '@/stores/tarkov/progressMerge';
import { GAME_MODE_VALUES, type GameMode } from '@/utils/constants';
import { logger } from '@/utils/logger';
import {
  type StoryProgressMigrationResult,
  migrateStoryProgress,
} from '@/utils/storyProgressMigration';
import type { UserProgressData, UserState } from '@/stores/progressState';
import type { StoryChapter } from '@/types/tarkov';
type ModeStates = Partial<Record<GameMode, UserProgressData | undefined>>;
export type StoryIdChanges = { migrated: number; dropped: number };
const NO_STORY_ID_CHANGES: StoryIdChanges = { migrated: 0, dropped: 0 };
/** Legacy single-mode state (no per-mode buckets, or a top-level level) needs restructuring. */
export const needsGameModeMigration = (state: UserState): boolean => {
  const legacyLevel = (state as unknown as Record<string, unknown>).level;
  if (GAME_MODE_VALUES.some((mode) => !state[mode])) return true;
  return !state.currentGameMode || (legacyLevel !== undefined && !state.pvp?.level);
};
/** Normalize every mode's task-completion records. Returns the number of records changed. */
export const migrateTaskCompletionSchemas = (state: ModeStates): number => {
  const counts = Object.fromEntries(
    GAME_MODE_VALUES.map((mode) => [
      mode,
      normalizeTaskCompletionsMap(state[mode]?.taskCompletions),
    ])
  );
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (total > 0) logger.debug('[TarkovStore] Migrated task completion schema', counts);
  return total;
};
const applyStoryReconciliation = (
  modeData: UserProgressData | undefined,
  result: StoryProgressMigrationResult
): StoryIdChanges => {
  if (!modeData || !result.changed) return NO_STORY_ID_CHANGES;
  modeData.storyChapters = result.storyChapters;
  return { migrated: result.migrated, dropped: result.dropped };
};
/**
 * The mode a loaded catalog may reconcile.
 *
 * Chapters are fetched per mode and language and the overlay may scope a chapter to one mode, so a
 * catalog is evidence about its own mode only. A caller naming another mode — a realtime merge for
 * inactive progress — is deferred rather than reconciled against the wrong catalog; that mode is
 * reconciled when its own catalog loads, which a mode switch or the next start does.
 */
const reconcilableStoryMode = (
  catalogMode: GameMode | null,
  requested: GameMode | undefined
): GameMode | null => {
  if (!catalogMode) return null;
  if (requested && requested !== catalogMode) return null;
  return catalogMode;
};
/**
 * Reconcile saved story objective marks with the IDs the overlay publishes now.
 *
 * Idempotent: a proven re-key moves the mark, an ID the story contract can no longer accept is
 * dropped so it stops being re-saved and re-synced, and an unrecognized client ID is left alone
 * because the published objective list can be partial.
 */
export const reconcileStoryObjectiveIds = (
  state: ModeStates,
  catalog: { chapters: readonly StoryChapter[]; mode: GameMode | null },
  requested?: GameMode
): StoryIdChanges => {
  const target = reconcilableStoryMode(catalog.mode, requested);
  if (!target || catalog.chapters.length === 0) return NO_STORY_ID_CHANGES;
  const modeData = state[target];
  const totals = applyStoryReconciliation(
    modeData,
    migrateStoryProgress(modeData?.storyChapters, catalog.chapters)
  );
  if (totals.migrated > 0 || totals.dropped > 0) {
    logger.info(
      `[TarkovStore] Reconciled story objective ids - migrated: ${totals.migrated}, dropped: ${totals.dropped}`
    );
  }
  return totals;
};
export const countStoryIdChanges = (changes: StoryIdChanges): number =>
  changes.migrated + changes.dropped;
