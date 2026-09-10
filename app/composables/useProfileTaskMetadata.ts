import { useGraphBuilder } from '@/composables/useGraphBuilder';
import { API_GAME_MODES } from '@/utils/constants';
import { isGameEdition } from '@/utils/editionHelpers';
import { logger } from '@/utils/logger';
import { dedupeTaskObjectiveIds, normalizeTaskObjectives } from '@/utils/taskNormalization';
import type {
  Task,
  TarkovTasksCoreQueryResult,
  StoryChapter,
  PrestigeLevel,
  GameEdition,
} from '@/types/tarkov';
import type { GameMode } from '@/utils/constants';
const profileMetadataError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));
const requiredResult = <T>(result: PromiseSettledResult<T>): T => {
  if (result.status === 'rejected') throw result.reason;
  return result.value;
};
const optionalResult = <T>(result: PromiseSettledResult<T>): T | undefined =>
  result.status === 'fulfilled' ? result.value : undefined;
const partialFailure = (results: PromiseSettledResult<unknown>[]): Error | null => {
  const failure = results.find((result) => result.status === 'rejected');
  return failure?.status === 'rejected' ? profileMetadataError(failure.reason) : null;
};
const validChapterCatalog = (value: unknown): value is StoryChapter[] =>
  Array.isArray(value) && value.every((chapter) => chapter && typeof chapter.id === 'string');
const validEditionCatalog = (value: unknown): value is GameEdition[] =>
  Array.isArray(value) && value.every(isGameEdition);
const requireCatalog = <T>(
  value: unknown,
  valid: (candidate: unknown) => candidate is T[],
  label: string
): T[] => {
  if (!valid(value)) throw new Error(`Invalid optional ${label} catalog`);
  return value;
};
type ProgressionResponse = { data: { editions: GameEdition[]; storyChapters: StoryChapter[] } };
// The chapter and edition catalogs share one request but settle separately, so a
// malformed chapter list cannot discard an otherwise valid edition catalog.
const optionalChapters = (overlay: ProgressionResponse): StoryChapter[] =>
  requireCatalog(overlay?.data?.storyChapters, validChapterCatalog, 'story chapter');
const optionalEditions = (overlay: ProgressionResponse): GameEdition[] =>
  requireCatalog(overlay?.data?.editions, validEditionCatalog, 'edition');
const validProfilePrestigeLevel = (level: number): boolean =>
  Number.isInteger(level) && level >= 0 && level <= 6;
const isProfileConditionRecord = (condition: unknown): boolean =>
  condition !== null && typeof condition === 'object' && !Array.isArray(condition);
const validProfilePrestigeConditions = (conditions: PrestigeLevel['conditions']): boolean =>
  conditions === undefined ||
  (Array.isArray(conditions) && conditions.every(isProfileConditionRecord));
const validProfilePrestige = (entry: PrestigeLevel): boolean => {
  if (!entry) return false;
  return [
    typeof entry.id === 'string' && entry.id.trim().length > 0,
    validProfilePrestigeLevel(entry.level),
    validProfilePrestigeLevel(entry.prestigeLevel ?? entry.level),
    validProfilePrestigeConditions(entry.conditions),
  ].every(Boolean);
};
const optionalPrestige = (response: { data: { prestige: PrestigeLevel[] } }): PrestigeLevel[] => {
  const prestige = response?.data?.prestige;
  if (!Array.isArray(prestige) || !prestige.every(validProfilePrestige)) {
    throw new Error('Invalid optional prestige catalog');
  }
  return prestige;
};
/**
 * Merge the core and objectives catalogs, then dedupe shared objective IDs. The objectives response
 * contributes only objective data, matching `useMetadata.mergeTaskObjectives`: a blanket spread would
 * let stray fields an overlay patch merged into that response replace the core catalog's declared
 * gates and their `requirementDiagnostics`.
 */
const mergeProfileTasks = (
  core: { data: TarkovTasksCoreQueryResult },
  objectives: { data: { tasks: Task[] } }
) => {
  const byId = new Map(objectives.data.tasks.map((task) => [task.id, task]));
  const merged = core.data.tasks.map((task) => {
    const update = byId.get(task.id);
    if (!update) return task;
    return {
      ...task,
      objectives: update.objectives ?? task.objectives,
      failConditions: update.failConditions ?? task.failConditions,
    };
  });
  return dedupeTaskObjectiveIds(
    merged.map((task) => ({
      ...task,
      objectives: normalizeTaskObjectives<import('@/types/tarkov').TaskObjective>(task.objectives),
    }))
  );
};
const loadProfileCatalogs = async (gameMode: GameMode, lang: string, signal: AbortSignal) => {
  const query = { gameMode: API_GAME_MODES[gameMode], lang };
  const options = { query, signal: signal };
  const progressionRequest = $fetch<ProgressionResponse>('/api/tarkov/editions', options);
  const [coreResult, objectivesResult, chaptersResult, editionsResult, prestigeResult] =
    await Promise.allSettled([
      $fetch<{ data: TarkovTasksCoreQueryResult }>('/api/tarkov/tasks-core', options),
      $fetch<{ data: { tasks: Task[] } }>('/api/tarkov/tasks-objectives', options),
      progressionRequest.then(optionalChapters),
      progressionRequest.then(optionalEditions),
      $fetch<{ data: { prestige: PrestigeLevel[] } }>('/api/tarkov/prestige', options).then(
        optionalPrestige
      ),
    ]);
  const normalized = mergeProfileTasks(
    requiredResult(coreResult),
    requiredResult(objectivesResult)
  );
  return {
    tasks: useGraphBuilder().processTaskData(normalized.tasks).tasks,
    duplicateObjectiveIds: normalized.duplicateObjectiveIds,
    chapters: optionalResult(chaptersResult) ?? [],
    editions: optionalResult(editionsResult) ?? [],
    prestige: optionalResult(prestigeResult) ?? [],
    failure: partialFailure([chaptersResult, editionsResult, prestigeResult]),
  };
};
/**
 * Client budget for one profile-mode catalog load.
 *
 * A cold cache legitimately needs longer than a single attempt: the proxy allows
 * two 12s attempts per envelope plus backoff across the base and translation
 * legs, roughly 55s worst case per route (`docs/SYSTEMS.md`, retry budget).
 * Aborting earlier leaves the profile with no snapshot and no retry until the
 * mode or language changes.
 */
const PROFILE_METADATA_TIMEOUT_MS = 60000;
/** Read another profile mode without changing the application's active metadata. */
export function useProfileTaskMetadata(mode: Ref<GameMode>, language: Ref<string>) {
  const snapshot = shallowRef<{
    scope: string;
    tasks: Task[];
    duplicateObjectiveIds: Map<string, string[]>;
    chapters: StoryChapter[];
    editions: GameEdition[];
    prestige: PrestigeLevel[];
  } | null>(null);
  const error = shallowRef<Error | null>(null);
  const scope = computed(() => `${mode.value}-${language.value}`);
  watch(
    [mode, language],
    async ([gameMode, lang], _, onCleanup) => {
      let current = true;
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(new Error('Profile metadata request timed out')),
        PROFILE_METADATA_TIMEOUT_MS
      );
      onCleanup(() => {
        current = false;
        controller.abort();
        clearTimeout(timeoutId);
      });
      error.value = null;
      const requestScope = scope.value;
      try {
        const { failure, ...catalogs } = await loadProfileCatalogs(
          gameMode,
          lang,
          controller.signal
        );
        if (!current) return;
        error.value = failure;
        snapshot.value = { scope: requestScope, ...catalogs };
      } catch (cause) {
        if (!current) return;
        error.value = profileMetadataError(cause);
        logger.warn('[Profile] Mode metadata unavailable:', cause);
      } finally {
        clearTimeout(timeoutId);
      }
    },
    { immediate: true }
  );
  const activeSnapshot = computed(() =>
    snapshot.value?.scope === scope.value ? snapshot.value : null
  );
  return {
    chapters: computed(() => activeSnapshot.value?.chapters ?? []),
    editions: computed(() => activeSnapshot.value?.editions ?? []),
    duplicateObjectiveIds: computed(
      () => activeSnapshot.value?.duplicateObjectiveIds ?? new Map<string, string[]>()
    ),
    prestige: computed(() => activeSnapshot.value?.prestige ?? []),
    tasks: computed(() => activeSnapshot.value?.tasks ?? []),
    loading: computed(() => !activeSnapshot.value && !error.value),
    error,
  };
}
