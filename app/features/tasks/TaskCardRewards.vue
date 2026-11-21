<template>
  <div
    v-if="hasRewards"
    class="border-surface-700/20 bg-surface-900/20 text-surface-400 @container grid w-full gap-1.5 rounded-b-md border-t px-3 py-2 text-xs"
    role="group"
    :aria-label="t('page.tasks.questcard.rewards')"
    data-testid="task-card-rewards"
  >
    <TaskRewardGroup v-if="hasProgression" :label="t('page.tasks.questcard.reward_progression')">
      <div
        v-if="hasExperience"
        class="bg-warning-900 light:bg-warning-100 inline-flex items-center gap-1 rounded px-1.5 py-0.5 leading-none"
      >
        <UIcon name="i-mdi-star" aria-hidden="true" class="text-warning-400 h-3.5 w-3.5 shrink-0" />
        <span class="text-warning-300 leading-none font-medium">
          {{ formatNumber(experienceValue) }} XP
        </span>
      </div>
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
        <span class="text-secondary-300 leading-none font-medium">+{{ skill.level }}</span>
        <span class="leading-none">{{ formatSkillName(skill.name) }}</span>
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
    </TaskRewardGroup>
    <TaskRewardGroup v-for="group in itemGroups" :key="group.label" :label="t(group.label)">
      <TaskRewardItemChip
        v-for="reward in group.rewards"
        :key="reward.key"
        :item="reward.item"
        :count="reward.count"
        :offer="reward.offer"
        :short-label="reward.shortName"
        @item-context-menu="forwardItemContextMenu"
      />
    </TaskRewardGroup>
  </div>
</template>
<script setup lang="ts">
  import TaskRewardGroup from '@/features/tasks/TaskRewardGroup.vue';
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
  function formatSkillName(name: string) {
    return name.replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  function endingQualifier(name?: string) {
    return name?.trim().match(/\([^()]+\)$/)?.[0];
  }
  function variantLabel(
    short: string,
    fullName: string | undefined,
    variants: { item?: TarkovItem }[]
  ) {
    const qualifier = endingQualifier(fullName);
    if (!qualifier) return undefined;
    const distinguishable = variants.every(({ item: variant }) => {
      const otherQualifier = endingQualifier(variant?.name);
      return otherQualifier && otherQualifier !== qualifier;
    });
    return distinguishable ? `${short} ${qualifier}` : undefined;
  }
  function compactName(item: TarkovItem | undefined, group: { item?: TarkovItem }[]) {
    const short = item?.shortName?.trim();
    if (!short) return undefined;
    const variants = group.filter(
      (other) => other.item?.shortName?.trim() === short && other.item?.name !== item?.name
    );
    return variants.length ? variantLabel(short, item?.name, variants) : short;
  }
  const { t } = useI18n({ useScope: 'global' });
  const formatNumber = useLocaleNumberFormatter();
  const traderUnlocks = computed(() =>
    [props.traderUnlockReward ?? []].flat().filter((trader) => trader.name)
  );
  const experienceValue = computed(() => props.experience ?? 0);
  const hasExperience = computed(() => showExperienceRewards.value && experienceValue.value > 0);
  const hasProgression = computed(
    () =>
      hasExperience.value ||
      [props.traderStandingRewards, props.skillRewards, traderUnlocks.value].some(
        (rewards) => rewards.length > 0
      )
  );
  const hasRewards = computed(() => hasProgression.value || itemGroups.value.length > 0);
  const itemGroups = computed(() =>
    [
      {
        label: 'page.tasks.questcard.reward_items_and_cash',
        rewards: props.itemRewards.map(({ item, count }, index) => ({
          key: `item-${index}-${item?.id}`,
          item,
          count,
          offer: undefined,
          shortName: compactName(item, props.itemRewards),
        })),
      },
      {
        label: 'page.tasks.questcard.reward_purchase_unlocks',
        rewards: props.offerUnlockRewards.map((offer) => ({
          key: `offer-${offer.id}`,
          item: offer.item,
          count: undefined,
          offer,
          shortName: compactName(offer.item, props.offerUnlockRewards),
        })),
      },
    ].filter((group) => group.rewards.length)
  );
</script>
