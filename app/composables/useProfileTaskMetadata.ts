import { useGraphBuilder } from '@/composables/useGraphBuilder';
import { API_GAME_MODES } from '@/utils/constants';
import { logger } from '@/utils/logger';
import { dedupeTaskObjectiveIds, normalizeTaskObjectives } from '@/utils/taskNormalization';
import type { Task, TarkovTasksCoreQueryResult, StoryChapter, PrestigeLevel } from '@/types/tarkov';
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
const optionalChapters = (overlay: { data: { storyChapters: StoryChapter[] } }): StoryChapter[] => {
  const chapters = overlay?.data?.storyChapters;
  if (
    !Array.isArray(chapters) ||
    chapters.some((chapter) => !chapter || typeof chapter.id !== 'string')
  ) {
    throw new Error('Invalid optional story chapter catalog');
  }
  return chapters;
};
const optionalPrestige = (prestige: { data: { prestige: PrestigeLevel[] } } | undefined) =>
  prestige?.data.prestige ?? [];
const loadProfileCatalogs = async (gameMode: GameMode, lang: string, signal: AbortSignal) => {
  const query = { gameMode: API_GAME_MODES[gameMode], lang };
  const options = { query, signal: signal };
  const [coreResult, objectivesResult, overlayResult, prestigeResult] = await Promise.allSettled([
    $fetch<{ data: TarkovTasksCoreQueryResult }>('/api/tarkov/tasks-core', options),
    $fetch<{ data: { tasks: Task[] } }>('/api/tarkov/tasks-objectives', options),
    $fetch<{ data: { storyChapters: StoryChapter[] } }>('/api/tarkov/editions', options).then(
      optionalChapters
    ),
    $fetch<{ data: { prestige: PrestigeLevel[] } }>('/api/tarkov/prestige', options),
  ]);
  const core = requiredResult(coreResult);
  const objectives = requiredResult(objectivesResult);
  const chapters = optionalResult(overlayResult);
  const prestige = optionalResult(prestigeResult);
  const byId = new Map(objectives.data.tasks.map((task) => [task.id, task]));
  const merged = core.data.tasks.map((task) => ({ ...task, ...byId.get(task.id) }));
  const normalized = dedupeTaskObjectiveIds(
    merged.map((task) => ({
      ...task,
      objectives: normalizeTaskObjectives<import('@/types/tarkov').TaskObjective>(task.objectives),
    }))
  );
  return {
    tasks: useGraphBuilder().processTaskData(normalized.tasks).tasks,
    duplicateObjectiveIds: normalized.duplicateObjectiveIds,
    chapters: chapters ?? [],
    prestige: optionalPrestige(prestige),
    failure: partialFailure([overlayResult, prestigeResult]),
  };
};
/** Read another profile mode without changing the application's active metadata. */
export function useProfileTaskMetadata(mode: Ref<GameMode>, language: Ref<string>) {
  const snapshot = shallowRef<{
    scope: string;
    tasks: Task[];
    duplicateObjectiveIds: Map<string, string[]>;
    chapters: StoryChapter[];
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
        15000
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
    duplicateObjectiveIds: computed(
      () => activeSnapshot.value?.duplicateObjectiveIds ?? new Map<string, string[]>()
    ),
    prestige: computed(() => activeSnapshot.value?.prestige ?? []),
    tasks: computed(() => activeSnapshot.value?.tasks ?? []),
    loading: computed(() => !activeSnapshot.value && !error.value),
    error,
  };
}
