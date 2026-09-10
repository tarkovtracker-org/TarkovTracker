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
        <UIcon
          v-else-if="row.status === 'active'"
          name="i-mdi-play-circle-outline"
          class="h-3 w-3"
        />
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
        class="shrink-0 rounded border px-1 text-[10px] font-medium tabular-nums"
        :class="levelChipClasses"
        :aria-label="levelChipAriaLabel"
        :title="levelChipTitle"
      >
        {{ t('common.lv', 'Lv') }} {{ minLevel }}
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
  import { useProgressStore } from '@/stores/useProgress';
  import type { KappaRowEntry } from '@/features/kappa/useKappaOverview';
  type KappaTaskStatus = KappaRowEntry['status'];
  const KAPPA_STATUS_LABELS: Record<KappaTaskStatus, { key: string; fallback: string }> = {
    complete: { key: 'common.complete', fallback: 'Complete' },
    failed: { key: 'common.failed', fallback: 'Failed' },
    active: { key: 'common.active', fallback: 'Active' },
    locked: { key: 'common.locked', fallback: 'Locked' },
    available: { key: 'common.available', fallback: 'Available' },
  };
  const KAPPA_TILE_CLASSES: Record<KappaTaskStatus, string> = {
    complete: 'border-success-500/30 bg-success-500/5 hover:bg-success-500/10',
    failed: 'border-error-500/30 bg-error-500/5 hover:bg-error-500/10',
    active: 'border-primary-500/30 bg-primary-500/5 hover:bg-primary-500/10',
    locked: 'border-white/5 bg-surface-900/30',
    available: 'border-white/10 bg-surface-900/40 hover:bg-surface-700/40',
  };
  const KAPPA_CHECKBOX_CLASSES: Record<KappaTaskStatus, string> = {
    complete: 'border-success-500/60 bg-success-500/20 text-success-200 hover:bg-success-500/30',
    failed: 'border-error-500/60 bg-error-500/20 text-error-200 hover:bg-error-500/30',
    active: 'border-primary-500/60 bg-primary-500/20 text-primary-200 hover:bg-primary-500/30',
    locked: 'border-white/10 bg-surface-900/40 text-surface-500 cursor-not-allowed',
    available: 'border-white/20 bg-surface-900/40 text-surface-300 hover:bg-surface-700/50',
  };
  const props = defineProps<{ row: KappaRowEntry }>();
  const { t } = useI18n({ useScope: 'global' });
  const progressStore = useProgressStore();
  const playerLevel = computed(() => progressStore.getLevel('self'));
  const taskRef = computed(() => props.row.task);
  const { markTaskActive, markTaskComplete, markTaskUncomplete } = useTaskActions(
    () => taskRef.value
  );
  const taskHref = computed(() => `/tasks?task=${props.row.task.id}`);
  const minLevel = computed(() => {
    const level = props.row.task.minPlayerLevel ?? 0;
    return level > 1 ? level : null;
  });
  const levelMet = computed(() => {
    if (minLevel.value == null) return true;
    return playerLevel.value >= minLevel.value;
  });
  const levelChipClasses = computed(() =>
    levelMet.value
      ? 'border-success-500/30 bg-success-500/10 text-success-300'
      : 'border-error-500/30 bg-error-500/10 text-error-300'
  );
  const levelChipAriaLabel = computed(() => {
    if (minLevel.value == null) return undefined;
    return levelMet.value
      ? t(
          'page.kappa.row.level_met_aria',
          { required: minLevel.value, current: playerLevel.value },
          `Required level ${minLevel.value}, you are level ${playerLevel.value}`
        )
      : t(
          'page.kappa.row.level_unmet_aria',
          { required: minLevel.value, current: playerLevel.value },
          `Requires level ${minLevel.value}, you are level ${playerLevel.value}`
        );
  });
  const levelChipTitle = computed(() => {
    if (minLevel.value == null) return undefined;
    return t(
      'page.kappa.row.level_title',
      { required: minLevel.value, current: playerLevel.value },
      `Required level ${minLevel.value} (you are ${playerLevel.value})`
    );
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
    const label = KAPPA_STATUS_LABELS[props.row.status];
    return t(label.key, label.fallback);
  });
  const tooltipText = computed(() => {
    const parts: string[] = [props.row.task.name ?? props.row.task.id];
    parts.push(`(${statusLabel.value})`);
    if (minLevel.value != null) {
      parts.push(
        t(
          'page.kappa.row.level_summary',
          { required: minLevel.value, current: playerLevel.value },
          `Lv ${minLevel.value} (you ${playerLevel.value})`
        )
      );
    }
    if (traderLevelLabel.value) parts.push(traderLevelLabel.value);
    if (props.row.task.factionName) parts.push(props.row.task.factionName);
    if (props.row.task.map?.name) parts.push(props.row.task.map.name);
    if (props.row.lockedBy) {
      const blocker = props.row.lockedBy.name ?? props.row.lockedBy.id;
      parts.push(t('page.kappa.row.locked_by', { task: blocker }, `Requires: ${blocker}`));
    }
    return parts.join(' · ');
  });
  const tileClasses = computed(() => KAPPA_TILE_CLASSES[props.row.status]);
  const checkboxClasses = computed(() => KAPPA_CHECKBOX_CLASSES[props.row.status]);
  const checkboxLabel = computed(() => {
    const name = props.row.task.name ?? props.row.task.id;
    switch (props.row.status) {
      case 'complete':
        return t('page.kappa.row.action_uncomplete', 'Mark uncomplete') + `: ${name}`;
      case 'failed':
        return t('page.kappa.row.action_reset_failed', 'Reset failed') + `: ${name}`;
      case 'active':
        return t('common.mark_complete', 'Mark complete') + `: ${name}`;
      case 'available':
        return t('common.accept', 'Accept') + `: ${name}`;
      case 'locked':
        return t('common.locked', 'Locked') + `: ${name}`;
      default:
        return t('common.mark_complete', 'Mark complete') + `: ${name}`;
    }
  });
  function onToggle() {
    if (props.row.status === 'locked') return;
    if (props.row.status === 'complete' || props.row.status === 'failed') {
      markTaskUncomplete();
      return;
    }
    if (props.row.status === 'available') {
      markTaskActive();
      return;
    }
    markTaskComplete();
  }
</script>
