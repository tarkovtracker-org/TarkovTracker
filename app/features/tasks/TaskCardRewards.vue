<template>
  <div
    v-if="hasRewardsSummary || hasExpandableDetails"
    class="border-surface-700/20 relative flex flex-col overflow-hidden rounded-b-md border-t transition-colors"
    :class="[showDetails && hasExpandableDetails ? 'bg-surface-900/40' : 'bg-surface-900/20']"
  >
    <div
      class="text-surface-400 focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 group flex w-full flex-wrap items-center gap-1.5 text-xs transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:gap-2"
      :class="[
        hasExpandableDetails ? 'hover:bg-surface-700/20 cursor-pointer' : '',
        isCompact ? 'px-3 py-1.5' : 'px-4 py-2',
      ]"
      :role="hasExpandableDetails ? 'button' : undefined"
      :tabindex="hasExpandableDetails ? 0 : undefined"
      :aria-expanded="hasExpandableDetails ? showDetails : undefined"
      @click="onAreaClick"
      @keydown.enter="toggleDetails"
      @keydown.space.prevent="toggleDetails"
    >
      <span class="text-surface-500 font-bold tracking-wider uppercase">
        <UIcon name="i-mdi-gift" aria-hidden="true" class="mr-1 inline h-3.5 w-3.5" />
        {{ t('page.tasks.questcard.rewards') }}:
      </span>
      <template v-for="standing in traderStandingRewards" :key="`standing-${standing.trader.id}`">
        <div class="bg-surface-800 inline-flex items-center gap-1 rounded px-1.5 py-0.5">
          <UIcon name="i-mdi-handshake" aria-hidden="true" class="text-surface-400 h-3.5 w-3.5" />
          <span
            class="font-medium"
            :class="standing.standing >= 0 ? 'text-success-400' : 'text-error-400'"
          >
            {{ standing.standing >= 0 ? '+' : '' }}{{ standing.standing.toFixed(2) }}
          </span>
          <span class="text-surface-100">{{ standing.trader.name }}</span>
        </div>
      </template>
      <template v-for="skill in skillRewards" :key="`skill-${skill.name}`">
        <div class="inline-flex items-center gap-1">
          <UIcon name="i-mdi-arm-flex" aria-hidden="true" class="text-secondary-400 h-3.5 w-3.5" />
          <span class="text-secondary-300 font-medium">+{{ skill.level }}</span>
          <span>{{ skill.name }}</span>
        </div>
      </template>
      <div
        v-if="displayedTraderUnlock?.name"
        class="bg-warning-900 inline-flex items-center gap-1 rounded px-1.5 py-0.5"
      >
        <UIcon
          name="i-mdi-lock-open-variant"
          aria-hidden="true"
          class="text-warning-400 h-3.5 w-3.5"
        />
        <span class="text-warning-300 font-medium">{{ displayedTraderUnlock.name }}</span>
      </div>
      <div
        v-if="itemRewards.length > 0"
        class="bg-success-900 inline-flex items-center gap-1 rounded px-1.5 py-0.5"
      >
        <UIcon
          name="i-mdi-package-variant"
          aria-hidden="true"
          class="text-success-400 h-3.5 w-3.5"
        />
        <span class="text-success-300 font-medium">
          {{
            t(
              'page.tasks.questcard.items_count',
              { count: itemRewards.length },
              `${itemRewards.length} items`
            )
          }}
        </span>
      </div>
      <div
        v-if="offerUnlockRewards.length > 0"
        class="bg-info-900 inline-flex items-center gap-1 rounded px-1.5 py-0.5"
      >
        <UIcon name="i-mdi-cart-check" aria-hidden="true" class="text-info-400 h-3.5 w-3.5" />
        <span class="text-info-300 font-medium">
          {{
            t(
              'page.tasks.questcard.unlocks_count',
              { count: offerUnlockRewards.length },
              `${offerUnlockRewards.length} unlocks`
            )
          }}
        </span>
      </div>
      <div
        v-if="showExperienceRewards && experienceValue > 0"
        class="bg-warning-900 inline-flex items-center gap-1 rounded px-1.5 py-0.5"
      >
        <UIcon name="i-mdi-star" aria-hidden="true" class="text-warning-400 h-3.5 w-3.5" />
        <span class="text-warning-300 font-medium">{{ formatNumber(experienceValue) }} XP</span>
      </div>
      <div class="hidden flex-1 sm:block"></div>
      <AppTooltip
        v-if="unlocksNextCount && unlocksNextCount > 0"
        :text="t('page.tasks.questcard.unlocks_next_tooltip')"
      >
        <div
          class="text-surface-400 border-surface-600 inline-flex cursor-help items-center gap-1 border-b border-dotted text-xs"
        >
          <UIcon name="i-mdi-arrow-right-circle-outline" class="h-3.5 w-3.5" />
          <span>{{ t('page.tasks.questcard.unlocks_next') }}: {{ unlocksNextCount }}</span>
        </div>
      </AppTooltip>
      <AppTooltip
        v-if="impactCount && impactCount > 0"
        :text="t('page.tasks.questcard.impact_tooltip')"
      >
        <div
          class="text-surface-400 border-surface-600 inline-flex cursor-help items-center gap-1 border-b border-dotted text-xs"
        >
          <UIcon name="i-mdi-sitemap" class="h-3.5 w-3.5" />
          <span>{{ t('page.tasks.questcard.impact') }}: {{ impactCount }}</span>
        </div>
      </AppTooltip>
      <UIcon
        v-if="hasExpandableDetails"
        name="i-mdi-chevron-down"
        aria-hidden="true"
        class="text-surface-500 group-hover:text-surface-300 h-5 w-5 transition-transform duration-200"
        :class="{ 'rotate-180': showDetails }"
      />
    </div>
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="showDetails && hasExpandableDetails"
        class="border-surface-700/30 bg-surface-900/30 border-t p-4"
        :class="{ 'p-3': isCompact }"
      >
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div v-if="showPreviousTasks" class="space-y-2">
            <div class="text-surface-500 text-[10px] font-bold tracking-wider uppercase">
              {{ t('page.tasks.questcard.previous_tasks') }}
            </div>
            <div class="flex flex-col gap-1.5">
              <NuxtLink
                v-for="parent in parentTasks"
                :key="parent.id"
                :to="`/tasks?task=${parent.id}`"
                class="text-link hover:text-link-hover flex items-center gap-2 text-xs"
              >
                <UIcon name="i-mdi-arrow-left" aria-hidden="true" class="h-3 w-3 shrink-0" />
                <span class="truncate">{{ parent.name }}</span>
              </NuxtLink>
            </div>
          </div>
          <div v-if="itemRewards.length > 0" class="space-y-3">
            <div class="text-surface-500 text-[10px] font-bold tracking-wider uppercase">
              {{ t('page.tasks.questcard.reward_items') }}
            </div>
            <div class="flex flex-wrap gap-2">
              <AppTooltip
                v-for="(reward, index) in itemRewards"
                :key="`item-${reward.item?.id || index}`"
                :text="getItemTooltip(reward.item)"
              >
                <component
                  :is="reward.item?.id ? 'a' : 'span'"
                  :href="reward.item?.id ? `https://tarkov.dev/item/${reward.item?.id}` : undefined"
                  :target="reward.item?.id ? '_blank' : undefined"
                  :rel="reward.item?.id ? 'noopener noreferrer' : undefined"
                  class="group bg-surface-800/80 ring-surface-700/50 hover:bg-surface-700/80 hover:ring-surface-600 relative flex flex-col items-center gap-1 rounded-lg p-2 ring-1 transition-all"
                  @contextmenu.prevent.stop="$emit('item-context-menu', $event, reward.item)"
                  @click.stop
                >
                  <img
                    v-if="reward.item?.iconLink"
                    :src="reward.item?.iconLink"
                    :alt="reward.item?.name ?? 'Reward image'"
                    class="h-14 w-14 object-contain"
                  />
                  <div class="flex flex-col items-center gap-0.5">
                    <span class="text-surface-200 max-w-16 truncate text-center text-[10px]">
                      {{ reward.item?.shortName || reward.item?.name || '' }}
                    </span>
                    <span v-if="reward.count > 1" class="text-surface-400 text-[10px] font-bold">
                      x{{ formatNumber(reward.count) }}
                    </span>
                  </div>
                </component>
              </AppTooltip>
            </div>
          </div>
          <div v-if="offerUnlockRewards.length > 0" class="space-y-3">
            <div class="text-surface-500 text-[10px] font-bold tracking-wider uppercase">
              {{ t('page.tasks.questcard.unlocks_purchase') }}
            </div>
            <div class="flex flex-wrap gap-2">
              <AppTooltip
                v-for="offer in offerUnlockRewards"
                :key="`offer-${offer.id}`"
                :text="getItemTooltip(offer.item)"
              >
                <component
                  :is="offer.item?.id ? 'a' : 'span'"
                  :href="offer.item?.id ? `https://tarkov.dev/item/${offer.item?.id}` : undefined"
                  :target="offer.item?.id ? '_blank' : undefined"
                  :rel="offer.item?.id ? 'noopener noreferrer' : undefined"
                  class="group bg-surface-800/80 ring-surface-700/50 hover:bg-surface-700/80 hover:ring-surface-600 relative flex flex-col items-center gap-1 rounded-lg p-2 ring-1 transition-all"
                  @contextmenu.prevent.stop="$emit('item-context-menu', $event, offer.item)"
                  @click.stop
                >
                  <img
                    v-if="offer.item?.iconLink"
                    :src="offer.item?.iconLink"
                    :alt="offer.item?.name ?? 'Reward image'"
                    class="h-14 w-14 object-contain"
                  />
                  <div class="flex flex-col items-center gap-0.5 text-center">
                    <span class="text-surface-200 max-w-16 truncate text-[10px]">
                      {{ offer.item?.shortName || offer.item?.name || '' }}
                    </span>
                    <span class="text-surface-500 text-[9px] font-medium uppercase">
                      {{ offer.trader.name }} LL{{ offer.level }}
                    </span>
                  </div>
                </component>
              </AppTooltip>
            </div>
          </div>
          <div v-if="showNextTasks && childTasks.length > 0" class="space-y-2">
            <div class="text-surface-500 text-[10px] font-bold tracking-wider uppercase">
              {{ t('page.tasks.questcard.next_tasks') }}
            </div>
            <div class="flex flex-col gap-1.5">
              <NuxtLink
                v-for="child in childTasks"
                :key="child.id"
                :to="`/tasks?task=${child.id}`"
                class="text-link hover:text-link-hover flex items-center gap-2 text-xs"
              >
                <UIcon name="i-mdi-arrow-right" aria-hidden="true" class="h-3 w-3 shrink-0" />
                <span class="truncate">{{ child.name }}</span>
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
<script setup lang="ts">
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import type { Task } from '@/types/tarkov';
  const preferencesStore = usePreferencesStore();
  const showNextTasks = computed(() => preferencesStore.getShowNextQuests);
  const showPreviousTasks = computed(() => preferencesStore.getShowPreviousQuests);
  const showExperienceRewards = computed(() => preferencesStore.getShowExperienceRewards);
  interface TraderStanding {
    trader: { id: string; name: string };
    standing: number;
  }
  interface SkillReward {
    name: string;
    level: number;
  }
  interface TraderUnlock {
    name: string;
  }
  interface ItemReward {
    item?: { id: string; name?: string; shortName?: string; iconLink?: string };
    count: number;
  }
  interface OfferUnlock {
    id: string;
    item?: { id: string; name?: string; shortName?: string; iconLink?: string };
    trader: { name: string };
    level: number;
  }
  const props = defineProps<{
    taskId: string;
    traderStandingRewards: TraderStanding[];
    skillRewards: SkillReward[];
    traderUnlockReward?: TraderUnlock | TraderUnlock[] | null;
    itemRewards: ItemReward[];
    offerUnlockRewards: OfferUnlock[];
    parentTasks: Task[];
    childTasks: Task[];
    experience?: number;
    isCompact?: boolean;
    unlocksNextCount?: number;
    impactCount?: number;
  }>();
  defineEmits<{
    'item-context-menu': [event: MouseEvent, item: ItemReward['item']];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const formatNumber = useLocaleNumberFormatter();
  const displayedTraderUnlock = computed(() => {
    if (Array.isArray(props.traderUnlockReward)) {
      return props.traderUnlockReward.length > 0 ? props.traderUnlockReward[0] : null;
    }
    return props.traderUnlockReward || null;
  });
  const showDetails = ref(false);
  const hasRewardsSummary = computed(() => {
    return (
      props.traderStandingRewards.length > 0 ||
      props.skillRewards.length > 0 ||
      displayedTraderUnlock.value != null ||
      props.itemRewards.length > 0 ||
      props.offerUnlockRewards.length > 0 ||
      (showExperienceRewards.value && (props.experience ?? 0) > 0)
    );
  });
  const hasDetailedRewards = computed(() => {
    return props.itemRewards.length > 0 || props.offerUnlockRewards.length > 0;
  });
  const experienceValue = computed(() => props.experience ?? 0);
  const hasExpandableDetails = computed(() => {
    const hasVisibleNextTasks = showNextTasks.value && props.childTasks.length > 0;
    const hasVisiblePreviousTasks = showPreviousTasks.value && props.parentTasks.length > 0;
    return hasDetailedRewards.value || hasVisibleNextTasks || hasVisiblePreviousTasks;
  });
  const getItemTooltip = (item?: { shortName?: string; name?: string }) => {
    const name = item?.shortName || item?.name || t('page.tasks.questcard.item');
    return t('page.tasks.questcard.open_item_on_tarkov_dev', { name });
  };
  const toggleDetails = () => {
    if (!hasExpandableDetails.value) return;
    showDetails.value = !showDetails.value;
  };
  const onAreaClick = (event: MouseEvent) => {
    if (!hasExpandableDetails.value) return;
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('a, button, input, select, textarea')) return;
    toggleDetails();
  };
</script>
