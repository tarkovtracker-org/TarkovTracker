<template>
  <div
    v-if="hasRewards"
    class="border-surface-700/20 bg-surface-900/20 text-surface-400 flex min-h-7 w-full flex-wrap items-center gap-1.5 rounded-b-md border-t px-3 py-1 text-xs sm:gap-2"
    data-testid="task-card-rewards"
  >
    <span class="text-surface-400 text-[10px] leading-none font-bold tracking-wider uppercase">
      {{ t('page.tasks.questcard.rewards') }}
    </span>
    <div
      v-for="standing in traderStandingRewards"
      :key="`standing-${standing.trader.id}`"
      class="bg-surface-800 inline-flex items-center gap-1 rounded px-1.5 py-0.5 leading-none"
    >
      <UIcon
        name="i-mdi-handshake"
        aria-hidden="true"
        class="text-surface-400 h-3.5 w-3.5 shrink-0"
      />
      <span
        class="leading-none font-medium"
        :class="standing.standing >= 0 ? 'text-success-400' : 'text-error-400'"
      >
        {{ standing.standing >= 0 ? '+' : '' }}{{ standing.standing.toFixed(2) }}
      </span>
      <span class="text-surface-100 leading-none">{{ standing.trader.name }}</span>
    </div>
    <div
      v-for="skill in skillRewards"
      :key="`skill-${skill.name}`"
      class="inline-flex items-center gap-1 leading-none"
    >
      <UIcon
        name="i-mdi-arm-flex"
        aria-hidden="true"
        class="text-secondary-400 h-3.5 w-3.5 shrink-0"
      />
      <span class="text-secondary-300 leading-none font-medium">+{{ skill.level }}</span>
      <span class="leading-none">{{ skill.name }}</span>
    </div>
    <div
      v-for="unlock in traderUnlocks"
      :key="unlock.id"
      class="bg-warning-900 light:bg-warning-100 inline-flex items-center gap-1 rounded px-1.5 py-0.5 leading-none"
    >
      <UIcon
        name="i-mdi-lock-open-variant"
        aria-hidden="true"
        class="text-warning-400 h-3.5 w-3.5 shrink-0"
      />
      <span class="text-warning-300 leading-none font-medium">
        {{ unlock.name }}
      </span>
    </div>
    <TaskRewardItemChip
      v-for="reward in itemChips"
      :key="reward.key"
      :item="reward.item"
      :count="reward.count"
      :offer="reward.offer"
      @item-context-menu="forwardItemContextMenu"
    />
    <div
      v-if="hasExperience"
      class="bg-warning-900 light:bg-warning-100 inline-flex items-center gap-1 rounded px-1.5 py-0.5 leading-none"
    >
      <UIcon name="i-mdi-star" aria-hidden="true" class="text-warning-400 h-3.5 w-3.5 shrink-0" />
      <span class="text-warning-300 leading-none font-medium">
        {{ formatNumber(experienceValue) }} XP
      </span>
    </div>
  </div>
</template>
<script setup lang="ts">
  import TaskRewardItemChip from '@/features/tasks/TaskRewardItemChip.vue';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import type {
    ItemReward,
    OfferUnlockReward,
    SkillLevelReward,
    TarkovItem,
    TraderStandingReward,
    TraderUnlock,
  } from '@/types/tarkov';
  const preferencesStore = usePreferencesStore();
  const showExperienceRewards = computed(() => preferencesStore.getShowExperienceRewards);
  const props = defineProps<{
    traderStandingRewards: TraderStandingReward[];
    skillRewards: SkillLevelReward[];
    traderUnlockReward?: TraderUnlock | TraderUnlock[] | null;
    itemRewards: ItemReward[];
    offerUnlockRewards: OfferUnlockReward[];
    experience?: number;
  }>();
  const emit = defineEmits<{
    itemContextMenu: [event: MouseEvent, item: TarkovItem | undefined];
  }>();
  function forwardItemContextMenu(event: MouseEvent, item: TarkovItem) {
    emit('itemContextMenu', event, item);
  }
  const { t } = useI18n({ useScope: 'global' });
  const formatNumber = useLocaleNumberFormatter();
  const traderUnlocks = computed(() =>
    [props.traderUnlockReward ?? []].flat().filter((trader) => trader.name)
  );
  const itemChips = computed(() => [
    ...props.itemRewards.map(({ item, count }, index) => ({
      key: `item-${index}-${item?.id}`,
      item,
      count,
      offer: undefined,
    })),
    ...props.offerUnlockRewards.map((offer) => ({
      key: `offer-${offer.id}`,
      item: offer.item,
      count: undefined,
      offer,
    })),
  ]);
  const experienceValue = computed(() => props.experience ?? 0);
  const hasExperience = computed(() => showExperienceRewards.value && experienceValue.value > 0);
  const hasRewards = computed(
    () =>
      hasExperience.value ||
      [props.traderStandingRewards, props.skillRewards, traderUnlocks.value, itemChips.value].some(
        (rewards) => rewards.length > 0
      )
  );
</script>
