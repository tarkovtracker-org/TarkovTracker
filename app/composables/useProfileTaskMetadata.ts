import { API_GAME_MODES } from '@/utils/constants';
import { logger } from '@/utils/logger';
import type { Task, TarkovTasksCoreQueryResult, StoryChapter, PrestigeLevel } from '@/types/tarkov';
import type { GameMode } from '@/utils/constants';
const profileMetadataError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));
/** Read another profile mode without changing the application's active metadata. */
export function useProfileTaskMetadata(mode: Ref<GameMode>, language: Ref<string>) {
  const snapshot = shallowRef<{
    scope: string;
    tasks: Task[];
    chapters: StoryChapter[];
    prestige: PrestigeLevel[];
  } | null>(null);
  const error = shallowRef<Error | null>(null);
  const scope = computed(() => `${mode.value}-${language.value}`);
  watch(
    [mode, language],
    async ([gameMode, lang], _, onCleanup) => {
      let current = true;
      onCleanup(() => {
        current = false;
      });
      error.value = null;
      const requestScope = scope.value;
      try {
        const query = { gameMode: API_GAME_MODES[gameMode], lang };
        const [core, objectives, overlay, prestige] = await Promise.all([
          $fetch<{ data: TarkovTasksCoreQueryResult }>('/api/tarkov/tasks-core', { query }),
          $fetch<{ data: { tasks: Task[] } }>('/api/tarkov/tasks-objectives', { query }),
          $fetch<{ data: { storyChapters: StoryChapter[] } }>('/api/tarkov/editions', { query }),
          $fetch<{ data: { prestige: PrestigeLevel[] } }>('/api/tarkov/prestige', { query }),
        ]);
        const byId = new Map(objectives.data.tasks.map((task) => [task.id, task]));
        if (current)
          snapshot.value = {
            scope: requestScope,
            tasks: core.data.tasks.map((task) => ({ ...task, ...byId.get(task.id) })),
            chapters: overlay.data.storyChapters,
            prestige: prestige.data.prestige,
          };
      } catch (cause) {
        if (!current) return;
        error.value = profileMetadataError(cause);
        logger.warn('[Profile] Mode metadata unavailable:', cause);
      }
    },
    { immediate: true }
  );
  const activeSnapshot = computed(() =>
    snapshot.value?.scope === scope.value ? snapshot.value : null
  );
  return {
    chapters: computed(() => activeSnapshot.value?.chapters ?? []),
    prestige: computed(() => activeSnapshot.value?.prestige ?? []),
    tasks: computed(() => activeSnapshot.value?.tasks ?? []),
    loading: computed(() => !activeSnapshot.value && !error.value),
    error,
  };
}
