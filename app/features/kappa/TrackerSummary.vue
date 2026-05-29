<template>
  <div class="mb-5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span class="text-[13px] font-semibold text-white">
        {{ label }} {{ t('page.kappa.summary.progress') }}
      </span>
      <span class="text-surface-300 text-xs tabular-nums">
        {{ completed }} / {{ total }} {{ t('page.kappa.summary.complete') }}
      </span>
      <span
        class="text-xs font-semibold tabular-nums"
        :class="accent === 'kappa' ? 'text-warning-400' : 'text-info-400'"
      >
        {{ displayPercent }}%
      </span>
      <span class="text-surface-500 text-[11px] tabular-nums">
        {{ t('page.kappa.stats.available') }} {{ available }}
      </span>
      <span class="text-surface-500 text-[11px] tabular-nums">
        {{ t('page.kappa.stats.locked') }} {{ locked }}
      </span>
      <span class="text-surface-500 text-[11px] tabular-nums">
        {{ t('page.kappa.stats.failed') }} {{ failed }}
      </span>
    </div>
    <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
      <div
        class="h-full rounded-full transition-all duration-300"
        :class="accent === 'kappa' ? 'bg-warning-500' : 'bg-info-500'"
        :style="{ width: `${barWidth}%` }"
      />
    </div>
    <div
      v-if="collector"
      class="mt-2 flex items-center gap-2.5 rounded-md border px-2.5 py-2"
      :class="milestoneClasses"
    >
      <div
        class="bg-surface-900/70 h-7 w-7 shrink-0 overflow-hidden rounded-full border border-white/10"
      >
        <img
          v-if="collector.task.trader?.imageLink"
          :src="collector.task.trader.imageLink"
          :alt="collector.task.trader?.name"
          class="h-full w-full object-cover"
          loading="lazy"
        />
        <div v-else class="flex h-full w-full items-center justify-center">
          <UIcon name="i-mdi-account" class="text-surface-500 h-4 w-4" />
        </div>
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <span class="text-surface-500 text-[11px] font-medium">
            {{ t('page.kappa.summary.final_goal') }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <NuxtLink
            :to="taskHref"
            class="text-link hover:text-link-hover min-w-0 truncate text-xs font-semibold no-underline"
            :class="{ 'line-through opacity-70': collector.status === 'complete' }"
          >
            {{ collector.task.name }}
          </NuxtLink>
          <span
            v-if="minLevel"
            class="shrink-0 rounded border px-1 text-[10px] font-medium tabular-nums"
            :class="
              levelMet
                ? 'border-success-500/30 bg-success-500/10 text-success-300'
                : 'border-error-500/30 bg-error-500/10 text-error-300'
            "
          >
            {{ t('page.kappa.row.level_prefix', 'Lv') }} {{ minLevel }}
          </span>
        </div>
      </div>
      <button
        type="button"
        class="ring-offset-surface-900 focus-visible:ring-primary-500/60 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        :class="toggleClasses"
        :aria-pressed="collector.status === 'complete'"
        :aria-label="toggleAriaLabel"
        :disabled="collector.status === 'locked'"
        @click="onToggleCollector"
      >
        <UIcon v-if="collector.status === 'complete'" name="i-mdi-check-bold" class="h-3 w-3" />
        <UIcon v-else-if="collector.status === 'failed'" name="i-mdi-close-thick" class="h-3 w-3" />
        <UIcon v-else-if="collector.status === 'locked'" name="i-mdi-lock" class="h-3 w-3" />
        <UIcon v-else name="i-mdi-flag-checkered" class="h-3 w-3" />
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useTaskActions } from '@/composables/useTaskActions';
  import { useProgressStore } from '@/stores/useProgress';
  import type { KappaRowEntry, KappaTabKey } from '@/features/kappa/useKappaOverview';
  import type { Task } from '@/types/tarkov';
  const { t } = useI18n({ useScope: 'global' });
  const props = defineProps<{
    label: string;
    total: number;
    completed: number;
    failed: number;
    available: number;
    locked: number;
    accent: KappaTabKey;
    collector?: KappaRowEntry | null;
  }>();
  const progressStore = useProgressStore();
  const playerLevel = computed(() => progressStore.getLevel('self'));
  function getCollectorTask(): Task {
    return props.collector!.task;
  }
  const { markTaskComplete, markTaskUncomplete, markTaskAvailable } =
    useTaskActions(getCollectorTask);
  const taskHref = computed(() =>
    props.collector ? `/tasks?task=${props.collector.task.id}` : ''
  );
  const minLevel = computed(() => {
    if (!props.collector) return null;
    const level = props.collector.task.minPlayerLevel ?? 0;
    return level > 1 ? level : null;
  });
  const levelMet = computed(() => {
    if (minLevel.value == null) return true;
    return playerLevel.value >= minLevel.value;
  });
  const displayPercent = computed(() => {
    if (props.total === 0) return 0;
    if (props.completed === props.total) return 100;
    return Math.min(99, Math.round((props.completed / props.total) * 100));
  });
  const barWidth = computed(() => {
    if (props.total === 0) return 0;
    return Math.round((props.completed / props.total) * 100);
  });
  const milestoneClasses = computed(() => {
    if (!props.collector) return '';
    switch (props.collector.status) {
      case 'complete':
        return 'border-success-500/30 bg-success-500/5';
      case 'failed':
        return 'border-error-500/30 bg-error-500/5';
      case 'locked':
        return 'border-white/5 bg-surface-900/30';
      default:
        return 'border-warning-500/20 bg-warning-500/5';
    }
  });
  const toggleClasses = computed(() => {
    if (!props.collector) return '';
    switch (props.collector.status) {
      case 'complete':
        return 'border-success-500/60 bg-success-500/20 text-success-200 hover:bg-success-500/30';
      case 'failed':
        return 'border-error-500/60 bg-error-500/20 text-error-200 hover:bg-error-500/30';
      case 'locked':
        return 'border-white/10 bg-surface-900/40 text-surface-500 cursor-not-allowed';
      default:
        return 'border-warning-500/40 bg-warning-500/15 text-warning-300 hover:bg-warning-500/25';
    }
  });
  const toggleAriaLabel = computed(() => {
    if (!props.collector) return '';
    const name = props.collector.task.name ?? props.collector.task.id;
    switch (props.collector.status) {
      case 'complete':
        return t('page.kappa.row.action_uncomplete', 'Mark uncomplete') + `: ${name}`;
      case 'failed':
        return t('page.kappa.row.action_reset_failed', 'Reset failed') + `: ${name}`;
      case 'locked':
        return t('page.kappa.row.status_locked', 'Locked') + `: ${name}`;
      default:
        return t('page.kappa.row.action_complete', 'Mark complete') + `: ${name}`;
    }
  });
  function onToggleCollector() {
    if (!props.collector) return;
    if (props.collector.status === 'locked') return;
    if (props.collector.status === 'complete' || props.collector.status === 'failed') {
      markTaskUncomplete();
      return;
    }
    if (props.collector.status === 'available') {
      markTaskComplete();
      return;
    }
    markTaskAvailable();
  }
</script>
