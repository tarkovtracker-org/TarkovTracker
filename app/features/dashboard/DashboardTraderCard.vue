<template>
  <div v-if="unlock" class="flex items-center gap-3">
    <span class="text-surface-200 min-w-0 basis-36 text-sm font-medium break-words">
      {{ trader.name }}
    </span>
    <DashboardTraderUnlockLink class="min-w-0 flex-1" :unlock="unlock" />
  </div>
  <button
    v-else
    type="button"
    class="bg-surface-900 hover:bg-surface-800 focus-visible:ring-primary-500 flex min-h-12 w-full cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-start focus-visible:ring-2 focus-visible:outline-none"
    :class="borderClass"
    :aria-expanded="editable ? expanded : undefined"
    :aria-controls="expanded ? `dashboard-trader-editor-${trader.id}` : undefined"
    :aria-label="
      editable ? undefined : $t('page.dashboard.traders.view_tasks', { name: trader.name })
    "
    @click="onClick"
  >
    <NuxtImg
      v-if="trader.imageLink"
      :src="trader.imageLink"
      alt=""
      width="28"
      height="28"
      sizes="28px"
      class="bg-surface-800 size-7 shrink-0 rounded-full object-cover"
    />
    <UIcon
      v-else
      name="i-mdi-account"
      class="text-surface-400 size-7 shrink-0"
      aria-hidden="true"
    />
    <span class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="flex items-baseline justify-between gap-2">
        <span class="min-w-0 text-sm font-semibold wrap-anywhere">{{ trader.name }}</span>
        <span class="text-primary-400 light:text-primary-800 shrink-0 text-xs tabular-nums">
          {{ standingLabel }}
        </span>
      </span>
      <span class="text-surface-300 flex justify-between gap-2 text-xs tabular-nums">
        <span>
          {{ completedTasks }}/{{ totalTasks }}
          <span class="sr-only">{{ $t('page.dashboard.traders.tasks') }}</span>
        </span>
        <span>{{ reputationLabel }}</span>
      </span>
      <DashboardProgressBar
        :percentage="percentage"
        :color="complete ? 'success' : 'gradient'"
        size="sm"
        aria-hidden="true"
      />
    </span>
    <UIcon :name="indicator" class="text-surface-400 size-4 shrink-0" aria-hidden="true" />
  </button>
</template>
<script setup lang="ts">
  import { hasTraderLoyalty, hasTraderReputation } from '@/features/dashboard/traderStanding';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useTarkovStore } from '@/stores/useTarkov';
  import type { TraderUnlockRequirement } from '@/features/dashboard/traderLockStatus';
  import type { Trader } from '@/types/tarkov';
  const props = defineProps<{
    trader: Trader;
    completedTasks: number;
    totalTasks: number;
    percentage: number;
    unlock?: TraderUnlockRequirement | null;
    expanded?: boolean;
  }>();
  const emit = defineEmits<{ toggle: [] }>();
  const { t } = useI18n({ useScope: 'global' });
  const router = useRouter();
  const preferencesStore = usePreferencesStore();
  const tarkovStore = useTarkovStore();
  const hasLoyalty = computed(() => hasTraderLoyalty(props.trader));
  const hasReputation = computed(() => hasTraderReputation(props.trader));
  const editable = computed(() => hasLoyalty.value || hasReputation.value);
  const level = computed(() => tarkovStore.getTraderLevel(props.trader.id));
  const reputation = computed(() =>
    (tarkovStore.getTraderReputation(props.trader.id) ?? 0).toFixed(2)
  );
  const standingLabel = computed(() => {
    if (hasLoyalty.value) return t('page.dashboard.traders.loyalty_short', { level: level.value });
    if (hasReputation.value)
      return t('page.dashboard.traders.karma_short', { value: reputation.value });
    return '';
  });
  const reputationLabel = computed(() =>
    hasLoyalty.value && hasReputation.value
      ? t('page.dashboard.traders.reputation_short', { value: reputation.value })
      : ''
  );
  const maxLevel = computed(
    () => Math.max(0, ...(props.trader.levels ?? []).map((entry) => entry.level)) || 4
  );
  const complete = computed(
    () => props.percentage >= 100 && (!hasLoyalty.value || level.value >= maxLevel.value)
  );
  const borderClass = computed(() => {
    if (props.expanded) return 'border-primary-500/60 bg-surface-800';
    return complete.value ? 'border-success-500/15' : 'border-surface-700/70';
  });
  const indicator = computed(() => {
    if (!editable.value) return 'i-mdi-arrow-right';
    return props.expanded ? 'i-mdi-chevron-up' : 'i-mdi-chevron-down';
  });
  function onClick() {
    if (editable.value) {
      emit('toggle');
      return;
    }
    preferencesStore.setTaskTraderView(props.trader.id);
    void router.push({ path: '/tasks/traders', query: { trader: props.trader.id } });
  }
</script>
