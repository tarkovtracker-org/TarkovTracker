import { useGraphBuilder } from '@/composables/useGraphBuilder';
import { isFetchError, type FetchSuccess } from '@/stores/tarkov/fetchResponse';
import { getPromiseStore } from '@/stores/tarkov/promiseStore';
import { useMetadataStore } from '@/stores/useMetadata';
import { API_GAME_MODES } from '@/utils/constants';
import { isGameEdition } from '@/utils/editionHelpers';
import { logger } from '@/utils/logger';
import {
  claimMetadataCacheWrite,
  fetchLocalizedMetadata,
  localizeMetadata,
} from '@/utils/metadataLocalization';
import { ensureTarkovAccess, getTarkovAccessState } from '@/utils/tarkovApiFetch';
import { CACHE_CONFIG, getCachedData, setCachedData, type CacheType } from '@/utils/tarkovCache';
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
      objectives: update.objectives !== undefined ? update.objectives : task.objectives,
      failConditions:
        update.failConditions !== undefined ? update.failConditions : task.failConditions,
    };
  });
  return dedupeTaskObjectiveIds(
    merged.map((task) => ({
      ...task,
      objectives: normalizeTaskObjectives<import('@/types/tarkov').TaskObjective>(task.objectives),
    }))
  );
};
const validCachedProfileChapter = (chapter: StoryChapter): boolean =>
  [
    typeof chapter.name === 'string',
    typeof chapter.normalizedName === 'string',
    Number.isFinite(chapter.order),
    typeof chapter.wikiLink === 'string',
    chapter.objectives === undefined || isProfileConditionRecord(chapter.objectives),
  ].every(Boolean);
const validCachedProfileChapters = (value: unknown): boolean =>
  validChapterCatalog(value) && value.every(validCachedProfileChapter);
const validCachedProfileTask = (value: unknown): boolean => {
  if (!isProfileConditionRecord(value)) return false;
  const id = (value as Record<string, unknown>).id;
  return typeof id === 'string' && id.length > 0;
};
const validCachedProfileTasks = (value: unknown): boolean =>
  Array.isArray(value) && value.every(validCachedProfileTask);
const profileCatalogValidators: Partial<
  Record<CacheType, (value: Record<string, unknown>) => boolean>
> = {
  'tasks-core': (value) =>
    validCachedProfileTasks(value.tasks) && [value.maps, value.traders].every(Array.isArray),
  'tasks-objectives': (value) => validCachedProfileTasks(value.tasks),
  prestige: (value) => Array.isArray(value.prestige) && value.prestige.every(validProfilePrestige),
  editions: (value) =>
    validEditionCatalog(value.editions) && validCachedProfileChapters(value.storyChapters),
};
const cacheableProfileCatalog = (type: CacheType, value: unknown): boolean => {
  if (!isProfileConditionRecord(value)) return false;
  const validate = profileCatalogValidators[type] ?? (() => false);
  return validate(value as Record<string, unknown>);
};
type MetadataOwner = ReturnType<typeof useMetadataStore>;
const profileCacheKey = (owner: MetadataOwner, type: CacheType, mode: string) =>
  type === 'tasks-objectives' ? owner.getObjectiveCatalogCacheKey(mode) : `neutral-v1-${mode}`;
const fetchProfileCatalog = async <T>(
  owner: MetadataOwner,
  context: { type: CacheType; mode: string; signal: AbortSignal },
  fresh: boolean
): Promise<FetchSuccess<T>> => {
  const response = await owner.fetchCatalogResponse<T>({
    cacheType: context.type,
    endpoint: `/api/tarkov/${context.type}`,
    query: { gameMode: context.mode, ...(fresh ? { cacheBust: '1' } : {}) },
    signal: context.signal,
    isCurrent: () => !context.signal.aborted,
  });
  if (isFetchError(response)) throw new Error(`API error: ${String(response.error)}`);
  return response;
};
const profileCatalog = async <T>(
  owner: MetadataOwner,
  type: CacheType,
  mode: string,
  language: string,
  signal: AbortSignal
): Promise<{ data: T }> => {
  await getPromiseStore(owner).cachePurgePromise;
  const cacheGeneration = owner.getCachePurgeGeneration();
  const key = profileCacheKey(owner, type, mode);
  const cached = await getCachedData<T>(type, key, 'en');
  signal.throwIfAborted();
  if (cached !== null && cacheGeneration === owner.getCachePurgeGeneration()) {
    try {
      if (!cacheableProfileCatalog(type, cached))
        throw new TypeError('Invalid cached profile catalog');
      const localized = await localizeMetadata(owner, cached, language, signal);
      if (cacheGeneration === owner.getCachePurgeGeneration()) return { data: localized };
    } catch (error) {
      signal.throwIfAborted();
      logger.warn('[Profile] Refreshing an incompatible cached catalog:', error);
    }
  }
  const requestGeneration = owner.getCachePurgeGeneration();
  const networkKey = profileCacheKey(owner, type, mode);
  const claim = claimMetadataCacheWrite(owner, `${type}/${networkKey}/en`);
  const canWrite = () => claim() && requestGeneration === owner.getCachePurgeGeneration();
  const { neutral: response, localized } = await fetchLocalizedMetadata(owner, {
    load: (fresh) => fetchProfileCatalog<T>(owner, { type, mode, signal }, fresh),
    language,
    signal,
  });
  if (cacheableProfileCatalog(type, response.data) && canWrite()) {
    const ttl = type === 'editions' ? 60 * 60 * 1000 : CACHE_CONFIG.DEFAULT_TTL;
    void setCachedData(type, networkKey, 'en', response.data, ttl, canWrite).catch((error) =>
      logger.warn('[Profile] Failed to cache neutral metadata:', error)
    );
  }
  return localized;
};
const loadProfileCatalogs = async (
  owner: MetadataOwner,
  gameMode: GameMode,
  lang: string,
  signal: AbortSignal
) => {
  const mode = API_GAME_MODES[gameMode];
  const progressionRequest = profileCatalog<ProgressionResponse['data']>(
    owner,
    'editions',
    mode,
    lang,
    signal
  );
  const [coreResult, objectivesResult, chaptersResult, editionsResult, prestigeResult] =
    await Promise.allSettled([
      profileCatalog<TarkovTasksCoreQueryResult>(owner, 'tasks-core', mode, lang, signal),
      profileCatalog<{ tasks: Task[] }>(owner, 'tasks-objectives', mode, lang, signal),
      progressionRequest.then(optionalChapters),
      progressionRequest.then(optionalEditions),
      profileCatalog<{ prestige: PrestigeLevel[] }>(owner, 'prestige', mode, lang, signal).then(
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
const loadCurrentProfileCatalogs = async (
  owner: MetadataOwner,
  context: { mode: GameMode; language: string; signal: AbortSignal }
) => {
  const load = async () => {
    await getPromiseStore(owner).cachePurgePromise;
    const generation = owner.getCachePurgeGeneration();
    const catalogs = await loadProfileCatalogs(
      owner,
      context.mode,
      context.language,
      context.signal
    );
    return { generation, catalogs };
  };
  const first = await load();
  if (first.generation === owner.getCachePurgeGeneration()) return first.catalogs;
  const retry = await load();
  if (retry.generation !== owner.getCachePurgeGeneration())
    throw new Error('Profile metadata changed during cache purge');
  return retry.catalogs;
};
/**
 * Client budget for one profile-mode catalog load.
 *
 * A cold cache legitimately needs longer than a single attempt: the proxy allows
 * two 12s attempts per envelope plus backoff across the base and translation
 * legs, roughly 55s worst case per route (`docs/systems/game-data.md`, retry budget).
 * Aborting earlier leaves the profile with no snapshot and no retry until the
 * mode or language changes. The budget starts once Tarkov data access is
 * released, so an initial browser security check never consumes it.
 */
const PROFILE_METADATA_TIMEOUT_MS = 60000;
/** Read another profile mode without changing the application's active metadata. */
export function useProfileTaskMetadata(mode: Ref<GameMode>, language: Ref<string>) {
  const localizationOwner = useMetadataStore();
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
  // A failed access check fails this load; the next release of access reloads it.
  const { recoveryEpoch } = getTarkovAccessState();
  watch(
    [mode, language, recoveryEpoch],
    async ([gameMode, lang], _, onCleanup) => {
      let current = true;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const controller = new AbortController();
      onCleanup(() => {
        current = false;
        controller.abort();
        clearTimeout(timeoutId);
      });
      error.value = null;
      const requestScope = scope.value;
      try {
        await ensureTarkovAccess(controller.signal);
        timeoutId = setTimeout(
          () => controller.abort(new Error('Profile metadata request timed out')),
          PROFILE_METADATA_TIMEOUT_MS
        );
        const { failure, ...catalogs } = await loadCurrentProfileCatalogs(localizationOwner, {
          mode: gameMode,
          language: lang,
          signal: controller.signal,
        });
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
