<template>
  <AppTooltip :text="tooltipText">
    <div
      class="group ring-offset-surface-900 focus-within:ring-primary-500/40 flex min-w-0 items-center gap-1.5 rounded-md border px-1.5 py-1 transition-colors focus-within:ring-2 focus-within:ring-offset-1"
      :class="tileClasses"
    >
      <button
        type="button"
        class="ring-offset-surface-900 focus-visible:ring-primary-500/60 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        :class="checkboxClasses"
        :aria-pressed="row.status === 'complete'"
        :aria-label="checkboxLabel"
        :disabled="row.status === 'locked'"
        @click="onToggle"
      >
        <UIcon v-if="row.status === 'complete'" name="i-mdi-check-bold" class="h-3 w-3" />
        <UIcon v-else-if="row.status === 'failed'" name="i-mdi-close-thick" class="h-3 w-3" />
        <UIcon v-else-if="row.status === 'locked'" name="i-mdi-lock" class="h-2.5 w-2.5" />
      </button>
      <NuxtLink
        :to="taskHref"
        class="text-link hover:text-link-hover min-w-0 flex-1 truncate text-xs no-underline"
        :class="{ 'line-through opacity-70': row.status === 'complete' }"
      >
        {{ row.task.name || row.task.id }}
      </NuxtLink>
      <span
        v-if="minLevel"
        class="bg-surface-900/70 text-surface-400 shrink-0 rounded px-1 text-[10px] tabular-nums"
        aria-hidden="true"
      >
        {{ minLevel }}
      </span>
      <UIcon
        v-if="row.task.lightkeeperRequired && !row.task.kappaRequired"
        name="i-mdi-lighthouse"
        class="text-lightkeeper-400 h-3 w-3 shrink-0"
        aria-hidden="true"
      />
    </div>
  </AppTooltip>
</template>
<script setup lang="ts">
  import AppTooltip from '@/components/ui/AppTooltip.vue';
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
  const statusLabel = computed(() => {
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
  const tooltipText = computed(() => {
    const parts: string[] = [props.row.task.name ?? props.row.task.id];
    parts.push(`(${statusLabel.value})`);
    if (traderLevelLabel.value) parts.push(traderLevelLabel.value);
    if (props.row.task.factionName) parts.push(props.row.task.factionName);
    if (props.row.task.map?.name) parts.push(props.row.task.map.name);
    return parts.join(' · ');
  });
  const tileClasses = computed(() => {
    switch (props.row.status) {
      case 'complete':
        return 'border-success-500/30 bg-success-500/5 hover:bg-success-500/10';
      case 'failed':
        return 'border-error-500/30 bg-error-500/5 hover:bg-error-500/10';
      case 'locked':
        return 'border-white/5 bg-surface-900/30 opacity-60';
      default:
        return 'border-white/10 bg-surface-900/40 hover:bg-surface-700/40';
    }
  });
  const checkboxClasses = computed(() => {
    switch (props.row.status) {
      case 'complete':
        return 'border-success-500/60 bg-success-500/20 text-success-200 hover:bg-success-500/30';
      case 'failed':
        return 'border-error-500/60 bg-error-500/20 text-error-200 hover:bg-error-500/30';
      case 'locked':
        return 'border-white/10 bg-surface-900/40 text-surface-500 cursor-not-allowed';
      default:
        return 'border-white/20 bg-surface-900/40 text-surface-300 hover:bg-surface-700/50';
    }
  });
  const checkboxLabel = computed(() => {
    const name = props.row.task.name ?? props.row.task.id;
    switch (props.row.status) {
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
  function onToggle() {
    if (props.row.status === 'locked') return;
    if (props.row.status === 'complete' || props.row.status === 'failed') {
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
