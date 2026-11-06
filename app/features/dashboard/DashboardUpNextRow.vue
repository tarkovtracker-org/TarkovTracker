<template>
  <NuxtLink
    :to="{ path: '/tasks', query: { task: item.taskId } }"
    class="flex min-w-0 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/4"
    :data-testid="`up-next-item-${item.taskId}`"
    @click="onClick"
  >
    <UIcon
      :name="REASON_ICONS[item.reason]"
      class="h-5 w-5 shrink-0"
      :class="REASON_TONES[item.reason]"
      aria-hidden="true"
    />
    <div class="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
      <span class="text-surface-100 light:text-surface-50 block truncate font-medium sm:flex-1">
        {{ item.taskName }}
      </span>
      <span
        class="text-surface-400 mt-0.5 flex min-w-0 items-center gap-2 text-xs sm:mt-0 sm:shrink-0"
      >
        <span class="truncate" data-testid="up-next-reason">{{ detail }}</span>
        <span
          v-if="remaining"
          class="before:text-surface-600 shrink-0 tabular-nums before:mr-2 before:content-['·']"
        >
          {{ remaining }}
        </span>
      </span>
    </div>
  </NuxtLink>
</template>
<script setup lang="ts">
  import { useDashboardFocusAnalytics } from '@/composables/useDashboardFocusAnalytics';
  import { useTaskBlockerText } from '@/composables/useTaskBlockerText';
  import type { UpNextItem, UpNextReason } from '@/features/dashboard/upNext';
  const props = defineProps<{ item: UpNextItem; index: number }>();
  const REASON_ICONS: Record<UpNextReason, string> = {
    'unlock-trader': 'i-mdi-lock-open-variant',
    opens: 'i-mdi-source-branch',
    lightkeeper: 'i-mdi-lighthouse',
    kappa: 'i-mdi-trophy',
    'almost-done': 'i-mdi-flag-checkered',
    'in-progress': 'i-mdi-progress-check',
    ready: 'i-mdi-play-circle-outline',
    blocked: 'i-mdi-lock-outline',
  };
  const REASON_TONES: Record<UpNextReason, string> = {
    'unlock-trader': 'text-primary-400 light:text-primary-700',
    opens: 'text-primary-400 light:text-primary-700',
    lightkeeper: 'text-lightkeeper-400 light:text-lightkeeper-700',
    kappa: 'text-kappa-400 light:text-kappa-700',
    'almost-done': 'text-success-400 light:text-success-700',
    'in-progress': 'text-success-400 light:text-success-700',
    ready: 'text-surface-400',
    blocked: 'text-surface-500',
  };
  const REASON_KEYS: Record<UpNextReason, string> = {
    'unlock-trader': 'unlock_trader',
    opens: 'opens',
    lightkeeper: 'lightkeeper',
    kappa: 'kappa',
    'almost-done': 'almost_done',
    'in-progress': 'in_progress',
    ready: 'ready',
    blocked: 'ready',
  };
  const { t } = useI18n({ useScope: 'global' });
  const { trackRecommendationClick } = useDashboardFocusAnalytics();
  const blockerText = useTaskBlockerText();
  const plural = (count: number, oneKey: string, otherKey: string) =>
    t(count === 1 ? oneKey : otherKey, { count });
  const reasonLabel = (item: UpNextItem) => {
    if (item.reason === 'opens')
      return plural(
        item.opens,
        'page.dashboard.up_next.reason.opens_one',
        'page.dashboard.up_next.reason.opens_other'
      );
    return t(`page.dashboard.up_next.reason.${REASON_KEYS[item.reason]}`, {
      trader: item.traderName ?? '',
    });
  };
  const detail = computed(() =>
    props.item.blocker ? blockerText(props.item.blocker) : reasonLabel(props.item)
  );
  const remaining = computed(() => {
    const { reason, progress } = props.item;
    if (reason === 'blocked') return '';
    if (!progress.remaining) return t('page.dashboard.up_next.turn_in');
    return plural(
      progress.remaining,
      'page.dashboard.up_next.left_one',
      'page.dashboard.up_next.left_other'
    );
  });
  const onClick = () =>
    trackRecommendationClick({
      recommendationId: `${props.item.reason === 'blocked' ? 'blocked' : 'available'}-${props.item.taskId}`,
      reason: props.item.reason,
      taskId: props.item.taskId,
      variant: props.index === 0 ? 'primary' : 'secondary',
    });
</script>
