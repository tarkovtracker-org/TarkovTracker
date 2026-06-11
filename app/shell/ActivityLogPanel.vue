<template>
  <div class="w-80 p-4">
    <div class="border-surface-700 mb-3 flex items-center justify-between border-b pb-2">
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-bell" class="text-primary-400 h-4 w-4" />
        <h3 class="text-surface-50 text-sm font-semibold">
          {{ t('activity_log.title', 'Activity Log') }}
        </h3>
      </div>
      <div class="flex gap-2">
        <UButton
          v-if="activityLogStore.hasUnread"
          variant="ghost"
          color="neutral"
          size="xs"
          class="text-xs"
          @click="activityLogStore.markAllAsRead"
        >
          {{ t('activity_log.mark_read', 'Mark read') }}
        </UButton>
        <UButton
          variant="ghost"
          color="neutral"
          size="xs"
          class="text-xs"
          @click="activityLogStore.clearLog"
        >
          {{ t('activity_log.clear', 'Clear') }}
        </UButton>
      </div>
    </div>
    <div v-if="entries.length === 0" class="text-surface-400 py-8 text-center text-xs sm:text-sm">
      {{ t('activity_log.empty', 'No activity recorded yet.') }}
    </div>
    <div v-else class="max-h-80 space-y-2 overflow-y-auto pr-1">
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="border-surface-800/80 bg-surface-950/40 hover:bg-surface-800/40 rounded-xl border p-2.5 transition-colors"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-surface-400 text-[10px] font-medium">
            {{ formatTimestamp(entry.timestamp) }}
          </span>
          <UBadge
            :color="entry.source === 'api' ? 'info' : 'primary'"
            variant="soft"
            size="xs"
            class="text-[10px]"
          >
            {{
              entry.source === 'api'
                ? t('activity_log.badge_api', 'API Sync')
                : t('activity_log.badge_manual', 'Manual')
            }}
          </UBadge>
        </div>
        <!-- API Sync Entry -->
        <template v-if="entry.source === 'api'">
          <div class="mt-1">
            <p class="text-surface-100 text-xs font-semibold">
              {{ t('activity_log.api_synced', 'API Progress Synced') }}
            </p>
            <div class="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs">
              <button
                v-for="task in getEntryTasks(entry.metadata).slice(0, 3)"
                :key="task.id"
                class="text-surface-300 hover:text-primary-400 text-[11px] underline decoration-dotted underline-offset-2 transition-colors"
                @click="navigateToTask(task.id)"
              >
                {{ metadataStore.getTaskById(task.id)?.name ?? task.id }}
                <span class="text-surface-400">{{ getStateLabel(task.state) }}</span>
              </button>
              <span
                v-if="getRemainingTaskCount(entry.metadata) > 0"
                class="text-surface-400 text-[10px]"
              >
                {{ t('activity_log.more_count', { count: getRemainingTaskCount(entry.metadata) }) }}
              </span>
            </div>
          </div>
        </template>
        <!-- Manual Entry -->
        <template v-else>
          <p class="text-surface-100 mt-1 text-xs font-medium">
            {{ entry.title }}
          </p>
          <p v-if="entry.details" class="text-surface-400 mt-0.5 text-[11px] leading-snug">
            {{ entry.details }}
          </p>
        </template>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useActivityLogStore } from '@/stores/useActivityLogStore';
  import { useMetadataStore } from '@/stores/useMetadata';
  import type { ApiTaskUpdate, ApiUpdateMeta } from '@/stores/progressState';
  const activityLogStore = useActivityLogStore();
  const metadataStore = useMetadataStore();
  const route = useRoute();
  const router = useRouter();
  const { t, locale } = useI18n({ useScope: 'global' });
  const entries = computed(() => activityLogStore.allEntries);
  const getEntryTasks = (entryMeta: unknown): ApiTaskUpdate[] => {
    if (!entryMeta || typeof entryMeta !== 'object') return [];
    const meta = entryMeta as ApiUpdateMeta;
    if (!Array.isArray(meta.tasks)) return [];
    return meta.tasks;
  };
  const getRemainingTaskCount = (entryMeta: unknown): number => {
    return Math.max(0, getEntryTasks(entryMeta).length - 3);
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
    await router.replace({
      path: '/tasks',
      query: {
        ...route.query,
        highlightObjective: undefined,
        task: taskId,
      },
    });
  };
  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return t('activity_log.unknown_time', 'Unknown');
    return date.toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' });
  };
</script>
