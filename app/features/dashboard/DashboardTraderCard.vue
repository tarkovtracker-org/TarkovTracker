<template>
  <div
    class="bg-surface-900 hover:border-surface-600 focus-visible:border-surface-500 focus-visible:ring-surface-700/50 flex h-full min-h-44 flex-col rounded-lg border border-white/12 px-4 py-3 shadow-md transition-all outline-none hover:shadow-lg focus-visible:ring-2"
  >
    <div class="mb-2 flex items-center gap-3">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-3 text-left transition-opacity hover:opacity-80 focus:outline-none"
        :aria-label="$t('page.dashboard.traders.view_tasks', { name: trader.name })"
        @click="navigateToTraderTasks"
      >
        <NuxtImg
          v-if="trader.imageLink"
          :src="trader.imageLink"
          :alt="trader.name"
          width="40"
          height="40"
          sizes="40px"
          class="bg-surface-800 border-surface-700 h-10 w-10 shrink-0 rounded-full border"
        />
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-semibold text-white">
            {{ trader.name }}
          </div>
        </div>
      </button>
      <div class="text-surface-200 text-sm font-semibold tabular-nums">{{ percentage }}%</div>
    </div>
    <div class="text-surface-400 mb-1 flex items-center justify-between text-xs">
      <span>{{ completedTasks }}/{{ totalTasks }} {{ $t('page.dashboard.traders.tasks') }}</span>
    </div>
    <div
      class="bg-surface-800/35 relative h-2 overflow-hidden rounded-full"
      :class="{ 'mb-2': isLocked || hasLoyaltyLevels || isFence }"
    >
      <div
        class="bg-surface-400/60 absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out"
        :style="{ width: `${percentage}%` }"
      ></div>
    </div>
    <div v-if="isLocked && unlockTask" class="text-xs">
      <div class="text-surface-400 mb-0.5 flex items-center gap-1">
        <UIcon name="i-mdi-lock" class="h-3.5 w-3.5" />
        <span>{{ $t('page.dashboard.traders.unlock_required') }}</span>
      </div>
      <NuxtLink
        :to="{ path: '/tasks', query: { task: unlockTaskId } }"
        class="text-info-400 hover:text-info-300 block transition-colors hover:underline"
      >
        {{ unlockTask.name }}
      </NuxtLink>
    </div>
    <div v-else-if="hasLoyaltyLevels" class="space-y-2">
      <div class="text-surface-400 flex items-center justify-between text-xs font-medium">
        <span>{{ $t('page.dashboard.traders.loyalty_level') }}</span>
        <span v-if="hasReputation">{{ $t('page.dashboard.traders.reputation') }}</span>
      </div>
      <div class="flex items-center gap-3">
        <div
          class="bg-surface-800/60 border-surface-700 flex flex-1 overflow-hidden rounded-md border"
        >
          <button
            v-for="lvl in 4"
            :key="lvl"
            type="button"
            class="focus-visible:ring-primary-500/40 min-h-10 flex-1 px-3 py-2 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
            :class="
              currentLevel === lvl
                ? 'bg-surface-600 text-white'
                : 'text-surface-300 hover:bg-surface-700/70 hover:text-surface-100'
            "
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
    </div>
    <div
      v-else-if="isFence"
      class="text-surface-400 flex items-center justify-between text-xs font-medium"
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
  const isLocked = computed(() => {
    if (!availableUnlockTasks.value.length) return false;
    return !availableUnlockTasks.value.some((task) => tarkovStore.isTaskComplete(task.id));
  });
  const currentLevel = computed(() => tarkovStore.getTraderLevel(props.trader.id));
  const currentReputation = computed(() => tarkovStore.getTraderReputation(props.trader.id));
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
  const navigateToTraderTasks = () => {
    preferencesStore.setTaskPrimaryView('traders');
    preferencesStore.setTaskTraderView(props.trader.id);
    router.push('/tasks');
  };
</script>
