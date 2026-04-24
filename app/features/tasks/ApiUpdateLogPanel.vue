<template>
  <div class="bg-surface-800/50 mb-4 rounded-lg p-4">
    <div class="mb-3 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span
            class="border-info-500/30 bg-info-500/15 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
          >
            <UIcon name="i-mdi-sync" class="text-info-300 h-4 w-4" />
          </span>
          <h3 class="text-surface-100 truncate text-lg leading-tight font-semibold">
            {{ translateApiUpdateLog('title', 'Recent Sync History') }}
          </h3>
        </div>
        <p class="text-surface-400 mt-1 text-xs sm:text-sm">
          {{
            translateApiUpdateLog(
              'subtitle',
              'Track when your progress was automatically synced from external sources.'
            )
          }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <UBadge color="info" variant="soft" size="sm">
          {{ historyEntries.length }}
        </UBadge>
        <UButton
          icon="i-mdi-chevron-down"
          variant="ghost"
          color="neutral"
          size="xs"
          :aria-expanded="isExpanded"
          :aria-controls="panelContentId"
          :aria-label="
            isExpanded
              ? translateApiUpdateLog('collapse', 'Collapse sync history')
              : translateApiUpdateLog('expand', 'Expand sync history')
          "
          :class="{ 'rotate-180': isExpanded }"
          class="transition-transform duration-200"
          @click="isExpanded = !isExpanded"
        />
      </div>
    </div>
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div v-show="isExpanded" :id="panelContentId">
        <div v-if="historyEntries.length === 0" class="text-surface-400 text-xs sm:text-sm">
          {{
            translateApiUpdateLog(
              'empty',
              'No syncs recorded yet. Your progress will appear here when synced.'
            )
          }}
        </div>
        <div v-else class="max-h-72 space-y-2 overflow-y-auto pr-1">
          <div
            v-for="entry in historyEntries"
            :key="entry.id"
            class="border-surface-700/70 bg-surface-800/55 rounded-md border p-3"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-surface-200 text-xs font-medium">
                {{ formatTimestamp(entry.at) }}
              </span>
              <UBadge color="info" variant="soft" size="xs">
                {{ getEntryCountLabel(entry) }}
              </UBadge>
            </div>
            <p v-if="getTaskCount(entry) === 0" class="text-surface-400 mt-2 text-xs sm:text-sm">
              {{ translateApiUpdateLog('no_task_details', 'Progress synced successfully.') }}
            </p>
            <div
              v-else
              class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-relaxed sm:text-sm"
            >
              <button
                v-for="task in getEntryTasks(entry).slice(0, 3)"
                :key="task.id"
                class="text-surface-300 hover:text-primary-400 underline decoration-dotted underline-offset-2 transition-colors"
                @click="navigateToTask(task.id)"
              >
                {{ metadataStore.getTaskById(task.id)?.name ?? task.id }}
                <span class="text-surface-400">{{ getStateLabel(task.state) }}</span>
              </button>
              <span v-if="getRemainingTaskCount(entry) > 0" class="text-surface-400 text-xs">
                {{
                  translateApiUpdateLog('more_tasks', `+${getRemainingTaskCount(entry)} more`, {
                    count: getRemainingTaskCount(entry),
                  })
                }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
<script setup lang="ts">
  import { useMetadataStore } from '@/stores/useMetadata';
  import type { ApiTaskUpdate, ApiUpdateMeta, UserProgressData } from '@/stores/progressState';
  const API_UPDATE_HISTORY_LIMIT = 50;
  const panelContentId = 'tasks-api-update-log-content';
  const props = defineProps<{
    progressData: UserProgressData | undefined;
  }>();
  const i18n = useI18n({ useScope: 'global' });
  const { t } = i18n;
  const metadataStore = useMetadataStore();
  const route = useRoute();
  const router = useRouter();
  const isExpanded = ref(false);
  const hasTranslation = (key: string): boolean => {
    if (typeof i18n.te === 'function') {
      return i18n.te(key);
    }
    return t(key) !== key;
  };
  const translateApiUpdateLog = (
    key: string,
    fallback: string,
    params?: Record<string, unknown>
  ): string => {
    const translationKey = `page.tasks.api_update_log.${key}`;
    if (!hasTranslation(translationKey)) {
      return fallback;
    }
    return params ? t(translationKey, params) : t(translationKey);
  };
  const isApiTaskState = (state: unknown): state is ApiTaskUpdate['state'] => {
    return state === 'completed' || state === 'failed' || state === 'uncompleted';
  };
  const normalizeApiTaskUpdates = (updates: unknown): ApiTaskUpdate[] => {
    if (!Array.isArray(updates)) return [];
    return updates.filter(
      (task): task is ApiTaskUpdate =>
        Boolean(task) &&
        typeof task === 'object' &&
        typeof (task as { id?: unknown }).id === 'string' &&
        isApiTaskState((task as { state?: unknown }).state)
    );
  };
  const normalizeApiUpdateMeta = (value: unknown): ApiUpdateMeta | null => {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Partial<ApiUpdateMeta>;
    if (
      candidate.source !== 'api' ||
      typeof candidate.id !== 'string' ||
      !candidate.id ||
      typeof candidate.at !== 'number' ||
      !Number.isFinite(candidate.at)
    ) {
      return null;
    }
    const tasks = normalizeApiTaskUpdates(candidate.tasks);
    return {
      at: candidate.at,
      id: candidate.id,
      source: 'api',
      ...(tasks.length ? { tasks } : {}),
    };
  };
  const historyEntries = computed<ApiUpdateMeta[]>(() => {
    const sourceEntries = Array.isArray(props.progressData?.apiUpdateHistory)
      ? props.progressData.apiUpdateHistory
      : [];
    const fallbackEntry = normalizeApiUpdateMeta(props.progressData?.lastApiUpdate);
    const combined = [...sourceEntries, ...(fallbackEntry ? [fallbackEntry] : [])];
    const deduped = new Map<string, ApiUpdateMeta>();
    for (const rawEntry of combined) {
      const entry = normalizeApiUpdateMeta(rawEntry);
      if (!entry) continue;
      const existing = deduped.get(entry.id);
      if (!existing || entry.at >= existing.at) {
        deduped.set(entry.id, entry);
      }
    }
    return Array.from(deduped.values())
      .sort((a, b) => b.at - a.at)
      .slice(0, API_UPDATE_HISTORY_LIMIT);
  });
  const getEntryTasks = (entry: ApiUpdateMeta): ApiTaskUpdate[] => {
    return normalizeApiTaskUpdates(entry.tasks);
  };
  const getTaskCount = (entry: ApiUpdateMeta): number => {
    return getEntryTasks(entry).length;
  };
  const getEntryCountLabel = (entry: ApiUpdateMeta): string => {
    const count = getTaskCount(entry);
    return translateApiUpdateLog('entry_count', `${count} tasks`, { count });
  };
  const getRemainingTaskCount = (entry: ApiUpdateMeta): number => {
    return Math.max(0, getTaskCount(entry) - 3);
  };
  const getStateLabel = (state: ApiTaskUpdate['state']): string => {
    const icons: Record<ApiTaskUpdate['state'], string> = {
      completed: '✓',
      failed: '✗',
      uncompleted: '○',
    };
    return `${icons[state]} ${t(`toast.api_updated.state.${state}`)}`;
  };
  const navigateToTask = async (taskId: string) => {
    const currentTask =
      typeof route.query.task === 'string'
        ? route.query.task
        : Array.isArray(route.query.task)
          ? route.query.task[0]
          : null;
    const currentObjective =
      typeof route.query.highlightObjective === 'string'
        ? route.query.highlightObjective
        : Array.isArray(route.query.highlightObjective)
          ? route.query.highlightObjective[0]
          : null;
    if (currentTask === taskId && !currentObjective) {
      await router.replace({
        query: {
          ...route.query,
          task: undefined,
        },
      });
    }
    await router.replace({
      query: {
        ...route.query,
        highlightObjective: undefined,
        task: taskId,
      },
    });
  };
  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return translateApiUpdateLog('unknown_time', 'Unknown time');
    }
    return date.toLocaleString();
  };
</script>
