<template>
  <div
    class="flex h-full min-h-44 cursor-pointer flex-col rounded-lg border px-5 py-4 shadow-md transition-all outline-none"
    :class="cardContainerClasses"
    @click="handleCardClick"
  >
    <div class="mb-3 flex items-center gap-3">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-3 text-left transition-opacity hover:opacity-80 focus:outline-none"
        :aria-label="$t('page.dashboard.traders.view_tasks', { name: trader.name })"
        @click="navigateToTraderTasks"
      >
        <div class="relative shrink-0">
          <NuxtImg
            v-if="trader.imageLink"
            :src="trader.imageLink"
            :alt="trader.name"
            width="40"
            height="40"
            sizes="40px"
            class="h-10 w-10 rounded-full border"
            :class="portraitClasses"
          />
          <div
            v-if="isLocked"
            class="bg-surface-800 ring-surface-600 absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full ring-1"
            aria-hidden="true"
          >
            <UIcon name="i-mdi-lock" class="text-surface-400 h-3 w-3" />
          </div>
          <div
            v-else-if="isComplete"
            class="bg-success-900/80 ring-success-500/50 absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full ring-1"
            aria-hidden="true"
          >
            <UIcon name="i-mdi-check-bold" class="text-success-400 h-3 w-3" />
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <div
            class="truncate text-sm font-semibold"
            :class="isLocked ? 'text-surface-400' : isComplete ? 'text-surface-300' : 'text-white'"
          >
            {{ trader.name }}
          </div>
        </div>
      </button>
      <div
        class="text-sm font-semibold tabular-nums"
        :class="percentageTextClass"
        :style="percentageTextStyle"
      >
        {{ percentage }}%
      </div>
    </div>
    <div
      class="mb-2 flex items-center justify-between text-xs font-medium"
      :class="isLocked ? 'text-surface-400' : isComplete ? 'text-surface-400' : 'text-surface-300'"
    >
      <span>{{ completedTasks }}/{{ totalTasks }} {{ $t('page.dashboard.traders.tasks') }}</span>
    </div>
    <DashboardProgressBar
      :percentage="percentage"
      :color="mainBarColor"
      :class="{ 'mb-4': isLocked || hasLoyaltyLevels || isFence }"
    />
    <div v-if="isLocked && unlockTask">
      <div class="border-warning-500/15 bg-warning-950/20 rounded-lg border px-3 py-2.5">
        <div class="mb-1.5 flex items-center gap-1.5 leading-none">
          <UIcon name="i-mdi-lock-outline" class="text-warning-400/80 h-3.5 w-3.5 shrink-0" />
          <span class="text-warning-300/80 text-xs leading-none font-medium">
            {{ $t('page.dashboard.traders.unlock_required') }}
          </span>
        </div>
        <NuxtLink
          :to="{ path: '/tasks', query: { task: unlockTaskId } }"
          class="text-info-400 hover:text-info-300 block text-sm font-medium transition-colors hover:underline"
        >
          {{ unlockTask.name }}
        </NuxtLink>
      </div>
    </div>
    <div v-else-if="hasLoyaltyLevels" class="space-y-2">
      <div
        class="flex items-center justify-between text-xs font-medium"
        :class="isComplete ? 'text-surface-400' : 'text-surface-300'"
      >
        <span>{{ $t('page.dashboard.traders.loyalty_level') }}</span>
        <span v-if="hasReputation">{{ $t('page.dashboard.traders.reputation') }}</span>
      </div>
      <div class="flex items-center gap-3">
        <div
          class="flex flex-1 overflow-hidden rounded-md border"
          :class="
            isComplete
              ? 'bg-surface-800/40 border-surface-700/60'
              : 'bg-surface-800/60 border-surface-700'
          "
        >
          <button
            v-for="lvl in 4"
            :key="lvl"
            type="button"
            class="focus-visible:ring-primary-500/40 min-h-10 flex-1 px-3 py-2 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
            :class="loyaltyButtonClasses(lvl)"
            :aria-label="$t('page.dashboard.traders.set_loyalty_level', { level: lvl })"
            :aria-pressed="currentLevel === lvl"
            @click="updateLevel(lvl)"
          >
            {{ lvl }}
          </button>
        </div>
        <ReputationInput
          :has-reputation="hasReputation"
          :input-id="reputationInputId"
          :input-name="reputationInputName"
          :reputation-input="reputationInput"
          :title="$t('page.dashboard.traders.reputation')"
          @blur="onReputationBlur"
          @focus="isEditingReputation = true"
          @input="onReputationInput"
          @keydown="onReputationKeydown"
        />
      </div>
      <div v-if="nextLevelInfo" class="pt-0.5">
        <div class="text-surface-300 flex items-center justify-between text-[11px] tabular-nums">
          <span>
            {{
              $t('page.dashboard.traders.rep_progress_label', { level: nextLevelInfo.nextLevel })
            }}
          </span>
          <span>
            {{ formatReputation(currentReputation) }} /
            {{ nextLevelInfo.requiredReputation.toFixed(2) }}
          </span>
        </div>
        <DashboardProgressBar
          :percentage="nextLevelInfo.progress"
          color="primary"
          size="sm"
          class="mt-1"
        />
      </div>
    </div>
    <div
      v-else-if="isFence"
      class="flex items-center justify-between text-xs font-medium"
      :class="isComplete ? 'text-surface-400' : 'text-surface-300'"
    >
      <span>{{ $t('page.dashboard.traders.scav_karma') }}</span>
      <ReputationInput
        :has-reputation="true"
        :input-id="reputationInputId"
        :input-name="reputationInputName"
        :reputation-input="reputationInput"
        :title="$t('page.dashboard.traders.reputation')"
        @blur="onReputationBlur"
        @focus="isEditingReputation = true"
        @input="onReputationInput"
        @keydown="onReputationKeydown"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
  import { isTraderLocked } from '@/features/dashboard/traderLockStatus';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useTarkovStore } from '@/stores/useTarkov';
  import {
    GAME_MODES,
    resolveTraderUnlockTaskIds,
    TRADERS_WITHOUT_LOYALTY_LEVELS,
    TRADERS_WITHOUT_REPUTATION,
  } from '@/utils/constants';
  import type { Trader, TraderLoyaltyLevel } from '@/types/tarkov';
  const MIN_REPUTATION = -10;
  const MAX_REPUTATION = 10;
  const clampReputation = (value: number) =>
    Math.max(MIN_REPUTATION, Math.min(MAX_REPUTATION, value));
  const props = defineProps<{
    trader: Trader & { levels?: TraderLoyaltyLevel[] };
    completedTasks: number;
    totalTasks: number;
    percentage: number;
  }>();
  const router = useRouter();
  const preferencesStore = usePreferencesStore();
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const hasLoyaltyLevels = computed(
    () =>
      !TRADERS_WITHOUT_LOYALTY_LEVELS.includes(
        props.trader.normalizedName as (typeof TRADERS_WITHOUT_LOYALTY_LEVELS)[number]
      )
  );
  const hasReputation = computed(
    () =>
      !TRADERS_WITHOUT_REPUTATION.includes(
        props.trader.normalizedName as (typeof TRADERS_WITHOUT_REPUTATION)[number]
      )
  );
  const isFence = computed(() => props.trader.normalizedName === 'fence');
  const unlockTaskIds = computed(() =>
    resolveTraderUnlockTaskIds(
      props.trader.normalizedName,
      tarkovStore.getCurrentGameMode?.() ?? GAME_MODES.PVP
    )
  );
  const availableUnlockTasks = computed(() => {
    if (!unlockTaskIds.value.length || !metadataStore.tasks?.length) return [];
    const unlockTaskIdSet = new Set(unlockTaskIds.value);
    return metadataStore.tasks.filter((task) => unlockTaskIdSet.has(task.id));
  });
  const unlockTaskId = computed(() => {
    const firstTask = availableUnlockTasks.value[0];
    return firstTask?.id ?? null;
  });
  const unlockTask = computed(() => {
    const firstTask = availableUnlockTasks.value[0];
    return firstTask ?? null;
  });
  const isLocked = computed(() =>
    isTraderLocked(props.trader, {
      tasks: metadataStore.tasks,
      isTaskComplete: (id) => tarkovStore.isTaskComplete(id),
      gameMode: tarkovStore.getCurrentGameMode?.() ?? GAME_MODES.PVP,
    })
  );
  const currentLevel = computed(() => tarkovStore.getTraderLevel(props.trader.id));
  const currentReputation = computed(() => tarkovStore.getTraderReputation(props.trader.id));
  const maxLevel = computed(() => {
    if (!props.trader.levels?.length) return 4;
    return Math.max(...props.trader.levels.map((l) => l.level));
  });
  const isComplete = computed(() => {
    if (isLocked.value) return false;
    if (props.percentage < 100) return false;
    if (!hasLoyaltyLevels.value) return true;
    return currentLevel.value >= maxLevel.value;
  });
  const cardContainerClasses = computed(() => {
    if (isLocked.value) {
      return 'bg-surface-950/80 border-surface-700/25';
    }
    if (isComplete.value) {
      return [
        'bg-surface-950/50 border-success-500/15',
        'hover:border-success-500/25 hover:shadow-lg',
        'focus-visible:border-success-500/30 focus-visible:ring-success-700/30 focus-visible:ring-2',
      ];
    }
    return [
      'bg-surface-900 border-white/12',
      'hover:border-surface-600 hover:shadow-lg',
      'focus-visible:border-surface-500 focus-visible:ring-surface-700/50 focus-visible:ring-2',
    ];
  });
  const portraitClasses = computed(() => {
    if (isLocked.value) return 'bg-surface-800 border-surface-700/50 opacity-50 grayscale';
    if (isComplete.value) return 'bg-surface-800 border-success-600/40';
    return 'bg-surface-800 border-surface-700';
  });
  const mainBarColor = computed(() => {
    if (isLocked.value) return 'locked' as const;
    if (isComplete.value) return 'success' as const;
    return 'gradient' as const;
  });
  const percentageTextStyle = computed(() => {
    if (isLocked.value || isComplete.value) return {};
    if (props.percentage <= 0) return {};
    const hue = (props.percentage / 100) * 120;
    return { color: `hsl(${hue}, 70%, 55%)` };
  });
  const percentageTextClass = computed(() => {
    if (isLocked.value) return 'text-surface-500';
    if (isComplete.value) return 'text-success-400/70';
    if (props.percentage <= 0) return 'text-surface-400';
    return '';
  });
  const loyaltyButtonClasses = (lvl: number) => {
    const isActive = currentLevel.value === lvl;
    if (isComplete.value) {
      return isActive
        ? 'bg-success-900/40 text-success-300/70'
        : 'text-surface-500 hover:bg-surface-700/40 hover:text-surface-400';
    }
    return isActive
      ? 'bg-surface-600 text-white'
      : 'text-surface-300 hover:bg-surface-700/70 hover:text-surface-100';
  };
  const nextLevelInfo = computed(() => {
    if (isComplete.value) return null;
    if (!hasLoyaltyLevels.value || !props.trader.levels?.length) return null;
    const levels = props.trader.levels;
    const current = currentLevel.value;
    if (current >= maxLevel.value) return null;
    const currentReqRep = levels.find((l) => l.level === current)?.requiredReputation ?? 0;
    const targetLevel = levels
      .filter((l) => l.level > current && l.requiredReputation > currentReqRep)
      .sort((a, b) => a.level - b.level)[0];
    if (!targetLevel) return null;
    const rep = currentReputation.value ?? 0;
    const range = targetLevel.requiredReputation - currentReqRep;
    const progress = Math.max(0, Math.min(100, ((rep - currentReqRep) / range) * 100));
    return {
      nextLevel: targetLevel.level,
      requiredReputation: targetLevel.requiredReputation,
      progress,
    };
  });
  const reputationInputId = computed(() => `trader-reputation-${props.trader.id}`);
  const reputationInputName = computed(() => `trader-reputation-${props.trader.id}`);
  const updateLevel = (level: number) => {
    tarkovStore.setTraderLevel(props.trader.id, level);
  };
  const reputationInput = ref('');
  const isEditingReputation = ref(false);
  const formatReputation = (value: number | null | undefined) => {
    const numeric = Number.isFinite(value) ? (value as number) : 0;
    return clampReputation(numeric).toFixed(2);
  };
  watch(
    currentReputation,
    (value) => {
      if (isEditingReputation.value) return;
      reputationInput.value = formatReputation(value ?? 0);
    },
    { immediate: true }
  );
  const commitReputationInput = () => {
    const normalized = reputationInput.value.replace(',', '.').trim();
    const value = parseFloat(normalized);
    if (Number.isNaN(value)) {
      reputationInput.value = formatReputation(currentReputation.value ?? 0);
      return;
    }
    const clamped = clampReputation(value);
    const rounded = parseFloat(clamped.toFixed(2));
    tarkovStore.setTraderReputation(props.trader.id, rounded);
    reputationInput.value = formatReputation(rounded);
  };
  const onReputationInput = (event: Event) => {
    const target = event.target as HTMLInputElement;
    reputationInput.value = target.value;
  };
  const onReputationBlur = () => {
    isEditingReputation.value = false;
    commitReputationInput();
  };
  const onReputationKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    const target = event.target as HTMLInputElement;
    target.blur();
  };
  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    Boolean(target.closest('a,button,input,label,select,textarea,[role="button"]'));
  const handleCardClick = (event: MouseEvent) => {
    if (isInteractiveTarget(event.target)) {
      return;
    }
    navigateToTraderTasks();
  };
  const navigateToTraderTasks = () => {
    preferencesStore.setTaskPrimaryView('traders');
    preferencesStore.setTaskTraderView(props.trader.id);
    router.push('/tasks');
  };
</script>
