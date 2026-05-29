<template>
  <div
    class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-white/5 px-3 py-2 transition-colors first:border-t-0"
    :class="rowClasses"
  >
    <button
      type="button"
      class="ring-offset-surface-900 focus-visible:ring-primary-500/60 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      :class="checkboxClasses"
      :aria-pressed="row.status === 'complete'"
      :aria-label="checkboxLabel"
      :title="checkboxLabel"
      :disabled="row.status === 'locked'"
      @click="onToggle"
    >
      <UIcon v-if="row.status === 'complete'" name="i-mdi-check-bold" class="h-4 w-4" />
      <UIcon v-else-if="row.status === 'failed'" name="i-mdi-close-thick" class="h-4 w-4" />
      <UIcon v-else-if="row.status === 'locked'" name="i-mdi-lock" class="h-3.5 w-3.5" />
    </button>
    <div class="flex min-w-0 flex-col">
      <NuxtLink
        :to="taskHref"
        class="text-link hover:text-link-hover truncate text-sm font-medium no-underline"
        :class="{ 'line-through opacity-70': row.status === 'complete' }"
      >
        {{ row.task.name || row.task.id }}
      </NuxtLink>
      <div class="text-surface-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <span v-if="minLevel">{{ t('page.kappa.row.level_prefix', 'Lv') }} {{ minLevel }}</span>
        <span v-if="traderLevelLabel">{{ traderLevelLabel }}</span>
        <span v-if="row.task.factionName" class="uppercase">{{ row.task.factionName }}</span>
        <span v-if="row.task.map?.name">{{ row.task.map.name }}</span>
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-1.5">
      <UIcon
        v-if="row.task.kappaRequired"
        name="i-mdi-trophy"
        class="text-kappa-400 h-4 w-4"
        :title="t('page.kappa.row.badge_kappa', 'Kappa Required')"
      />
      <UIcon
        v-if="row.task.lightkeeperRequired"
        name="i-mdi-lighthouse"
        class="text-lightkeeper-400 h-4 w-4"
        :title="t('page.kappa.row.badge_lightkeeper', 'Lightkeeper Required')"
      />
      <UIcon :name="statusIcon" :class="statusIconClass" class="h-4 w-4" :title="statusTooltip" />
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useTaskActions } from '@/composables/useTaskActions';
  import type { KappaRowEntry } from '@/features/kappa/useKappaOverview';
  const props = defineProps<{ row: KappaRowEntry }>();
  const { t } = useI18n({ useScope: 'global' });
  const taskRef = computed(() => props.row.task);
  const { markTaskComplete, markTaskUncomplete, markTaskAvailable } = useTaskActions(
    () => taskRef.value
  );
  const taskHref = computed(() => `/tasks?task=${props.row.task.id}`);
  const minLevel = computed(() => {
    const level = props.row.task.minPlayerLevel ?? 0;
    return level > 1 ? level : null;
  });
  const traderLevelLabel = computed(() => {
    const reqs = props.row.task.traderLevelRequirements;
    if (!reqs?.length) return null;
    const primary = reqs[0];
    if (!primary?.trader?.name) return null;
    return t(
      'page.kappa.row.trader_level',
      { trader: primary.trader.name, level: primary.level },
      `${primary.trader.name} Lv${primary.level}`
    );
  });
  const rowClasses = computed(() => {
    switch (props.row.status) {
      case 'complete':
        return 'bg-success-500/5';
      case 'failed':
        return 'bg-error-500/5';
      case 'locked':
        return 'opacity-60';
      default:
        return 'hover:bg-surface-800/40';
    }
  });
  const checkboxClasses = computed(() => {
    switch (props.row.status) {
      case 'complete':
        return 'border-success-500/50 bg-success-500/15 text-success-300 hover:bg-success-500/25';
      case 'failed':
        return 'border-error-500/50 bg-error-500/15 text-error-300 hover:bg-error-500/25';
      case 'locked':
        return 'border-white/10 bg-surface-900/40 text-surface-500 cursor-not-allowed';
      default:
        return 'border-white/15 bg-surface-900/40 text-surface-300 hover:bg-surface-700/40';
    }
  });
  const checkboxLabel = computed(() => {
    switch (props.row.status) {
      case 'complete':
        return t('page.kappa.row.action_uncomplete', 'Mark uncomplete');
      case 'failed':
        return t('page.kappa.row.action_reset_failed', 'Reset failed');
      case 'locked':
        return t('page.kappa.row.status_locked', 'Locked');
      default:
        return t('page.kappa.row.action_complete', 'Mark complete');
    }
  });
  const statusIcon = computed(() => {
    switch (props.row.status) {
      case 'complete':
        return 'i-mdi-check-circle';
      case 'failed':
        return 'i-mdi-alert-circle';
      case 'locked':
        return 'i-mdi-lock-outline';
      default:
        return 'i-mdi-circle-outline';
    }
  });
  const statusIconClass = computed(() => {
    switch (props.row.status) {
      case 'complete':
        return 'text-success-400';
      case 'failed':
        return 'text-error-400';
      case 'locked':
        return 'text-surface-500';
      default:
        return 'text-primary-400';
    }
  });
  const statusTooltip = computed(() => {
    switch (props.row.status) {
      case 'complete':
        return t('page.kappa.row.status_complete', 'Complete');
      case 'failed':
        return t('page.kappa.row.status_failed', 'Failed');
      case 'locked':
        return t('page.kappa.row.status_locked', 'Locked');
      default:
        return t('page.kappa.row.status_available', 'Available');
    }
  });
  function onToggle() {
    if (props.row.status === 'locked') return;
    if (props.row.status === 'complete') {
      markTaskUncomplete();
      return;
    }
    if (props.row.status === 'failed') {
      markTaskUncomplete();
      return;
    }
    if (props.row.status === 'available') {
      markTaskComplete();
      return;
    }
    markTaskAvailable();
  }
</script>
