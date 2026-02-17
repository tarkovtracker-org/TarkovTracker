<template>
  <div>
    <UAlert
      v-if="!countedTasks.length"
      icon="i-mdi-clipboard-text-off-outline"
      color="neutral"
      variant="soft"
      :title="t('page.profile.no_tasks')"
    />
    <div v-else class="space-y-4">
      <div v-for="group in tasksByTrader" :key="group.traderId">
        <div class="mb-2 flex items-center gap-2">
          <img
            v-if="group.traderImage"
            :src="group.traderImage"
            :alt="group.traderName"
            class="h-8 w-8 rounded-md"
          />
          <div v-else class="bg-surface-800 flex h-8 w-8 items-center justify-center rounded-md">
            <UIcon name="i-mdi-account" class="text-surface-400 h-5 w-5" />
          </div>
          <span class="text-surface-100 text-sm font-semibold">{{ group.traderName }}</span>
          <UBadge color="neutral" variant="soft" size="xs">
            {{ group.completed }}/{{ group.total }}
          </UBadge>
        </div>
        <div class="bg-surface-900 rounded-lg border border-white/10">
          <div
            v-for="(task, idx) in group.tasks"
            :key="task.id"
            class="flex items-center gap-2 px-3 py-2"
            :class="[
              idx !== group.tasks.length - 1 ? 'border-b border-white/5' : '',
              isTaskSuccessful(task.id) ? 'opacity-50' : '',
            ]"
          >
            <UIcon
              :name="taskStatusIcon(task.id)"
              class="h-4 w-4 shrink-0"
              :class="taskStatusColor(task.id)"
            />
            <span class="text-surface-200 min-w-0 flex-1 truncate text-sm">
              {{ task.name || t('page.profile.task_fallback') }}
            </span>
            <UBadge
              v-if="task.minPlayerLevel && task.minPlayerLevel > 1"
              color="neutral"
              variant="soft"
              size="xs"
              class="shrink-0"
            >
              {{ t('page.profile.level_prefix') }}{{ task.minPlayerLevel }}
            </UBadge>
            <UIcon
              v-if="task.kappaRequired"
              name="i-mdi-trophy"
              class="text-kappa-400 h-3.5 w-3.5 shrink-0"
            />
            <UIcon
              v-if="task.lightkeeperRequired"
              name="i-mdi-lighthouse"
              class="text-lightkeeper-400 h-3.5 w-3.5 shrink-0"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useMetadataStore } from '@/stores/useMetadata';
  import type { Task } from '@/types/tarkov';
  interface Props {
    countedTasks: Task[];
    isTaskSuccessful: (taskId: string) => boolean;
    isTaskFailed: (taskId: string) => boolean;
  }
  const props = defineProps<Props>();
  const { t } = useI18n({ useScope: 'global' });
  const metadataStore = useMetadataStore();
  interface TraderGroup {
    traderId: string;
    traderName: string;
    traderImage: string | undefined;
    completed: number;
    total: number;
    tasks: Task[];
  }
  const tasksByTrader = computed<TraderGroup[]>(() => {
    const grouped = new Map<string, { tasks: Task[]; completed: number }>();
    for (const task of props.countedTasks) {
      const traderId = task.trader?.id ?? '_unknown';
      let entry = grouped.get(traderId);
      if (!entry) {
        entry = { tasks: [], completed: 0 };
        grouped.set(traderId, entry);
      }
      entry.tasks.push(task);
      if (props.isTaskSuccessful(task.id)) {
        entry.completed++;
      }
    }
    const traderOrder = metadataStore.sortedTraders.map((tr) => tr.id);
    const traderLookup = new Map(metadataStore.sortedTraders.map((tr) => [tr.id, tr]));
    const sorted = [...grouped.entries()].sort((a, b) => {
      const idxA = traderOrder.indexOf(a[0]);
      const idxB = traderOrder.indexOf(b[0]);
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });
    return sorted.map(([traderId, entry]) => {
      const trader = traderLookup.get(traderId);
      return {
        traderId,
        traderName: trader?.name ?? t('page.profile.unknown_trader'),
        traderImage: trader?.imageLink,
        completed: entry.completed,
        total: entry.tasks.length,
        tasks: entry.tasks,
      };
    });
  });
  const taskStatusIcon = (taskId: string): string => {
    if (props.isTaskFailed(taskId)) return 'i-mdi-close-circle';
    if (props.isTaskSuccessful(taskId)) return 'i-mdi-check-circle';
    return 'i-mdi-circle-outline';
  };
  const taskStatusColor = (taskId: string): string => {
    if (props.isTaskFailed(taskId)) return 'text-error-400';
    if (props.isTaskSuccessful(taskId)) return 'text-success-400';
    return 'text-surface-500';
  };
</script>
