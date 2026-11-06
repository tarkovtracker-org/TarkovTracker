<template>
  <AppTooltip :text="cardTooltip">
    <div
      class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 flex h-full flex-col rounded-lg border-l-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      :class="[
        itemCardClasses,
        rarityBorderClass,
        { 'cursor-pointer transition-all active:scale-[0.98]': isCollectable },
      ]"
      :role="isCollectable ? 'button' : undefined"
      :tabindex="isCollectable ? 0 : undefined"
      :aria-label="isCollectable ? cardAriaLabel : undefined"
      @click="handleCardClick"
      @keydown.enter="handleCardClick"
      @keydown.space.prevent="handleCardClick"
    >
      <template v-if="hasItem">
        <div :class="imageContainerClasses">
          <div class="absolute top-0 left-0 z-10">
            <div
              class="flex items-center gap-1.5 rounded-br-lg px-2.5 py-1 text-sm font-bold shadow-lg backdrop-blur-sm"
              :class="itemCountTagClasses"
            >
              <template v-if="hiddenForSelf">
                <UIcon name="i-mdi-eye-off" class="h-4 w-4" aria-hidden="true" />
                {{ t('needed_items.hidden_for_you') }}
                <span v-if="teamNeeds.length > 0" class="flex items-center gap-0.5">
                  <UIcon name="i-mdi-account-group" class="h-4 w-4" aria-hidden="true" />
                  {{ formatNumber(teamNeeds.length) }}
                </span>
                <span class="sr-only">{{ hiddenForSelfHint }}</span>
              </template>
              <template v-else>
                {{ formatNumber(currentCount) }}/{{ formatNumber(neededCount) }}
              </template>
              <ItemIndicators
                :found-in-raid="props.need.foundInRaid ?? false"
                fir-icon-class="h-4 w-4"
                :is-craftable="isCraftable"
                :craftable-title="craftableTitle"
                craftable-icon-base-class="h-4 w-4 opacity-90"
                :craftable-icon-class="craftableIconClass"
                :kappa-required="isKappaRequired"
                kappa-icon-class="h-4 w-4 text-kappa"
                :lightkeeper-required="isLightkeeperRequired"
                lightkeeper-icon-class="h-4 w-4 text-lightkeeper"
                @craft="goToCraftStation"
              />
            </div>
          </div>
          <GameItem
            v-if="imageItem"
            :image-item="imageItem"
            :src="imageItem.image512pxLink"
            :is-visible="true"
            :item-id="item?.id"
            :item-name="item?.name ?? null"
            :wiki-link="item?.wikiLink ?? null"
            :dev-link="item?.link ?? null"
            :task-wiki-link="relatedTask?.wikiLink"
            :background-color="imageItem.backgroundColor || 'grey'"
            size="small"
            simple-mode
            fill
            :class="['h-full w-full', { 'cursor-pointer!': isCollectable }]"
          />
          <div
            v-if="hasAlternativeItems"
            class="absolute top-0 right-0 z-10"
            @click.stop
            @keydown.enter.stop
            @keydown.space.stop
          >
            <AcceptedItemsPopover
              v-model:open="acceptedItemsOpen"
              :items="acceptedItems"
              :cycling="isCyclingItems"
              trigger-class="bg-surface-900/80 text-surface-100 px-2 py-1 text-xs font-semibold ring-1 ring-white/10 backdrop-blur-sm rounded-bl-lg"
            />
          </div>
          <div
            v-if="isComplete"
            class="pointer-events-none absolute right-1 bottom-1 z-20"
            aria-hidden="true"
          >
            <div
              class="bg-success-600/90 ring-success-400/30 flex h-7 w-7 items-center justify-center rounded-full shadow-md ring-2"
            >
              <UIcon name="i-mdi-check" class="h-4 w-4 text-white" />
            </div>
          </div>
          <div
            v-if="cardStyle === 'compact' && !isSingleItem && !selfCompletedNeed && !hiddenForSelf"
            class="bg-surface-900/70 absolute inset-x-0 bottom-0 z-20 flex justify-center p-1"
            @click.stop
          >
            <ItemCountControls
              :current-count="currentCount"
              :needed-count="neededCount"
              size="xs"
              @decrease="$emit('decreaseCount')"
              @increase="$emit('increaseCount')"
              @toggle="$emit('toggleCount')"
              @set-count="(count) => $emit('setCount', count)"
            />
          </div>
        </div>
        <div v-if="cardStyle === 'expanded'" class="flex flex-1 flex-col p-2.5">
          <div class="flex min-h-10 items-start justify-center">
            <span class="line-clamp-2 text-center text-xs leading-snug font-medium sm:text-sm">
              {{ item?.name ?? '' }}
            </span>
          </div>
          <div class="mt-0.5 flex min-h-7 w-full items-center justify-center overflow-hidden">
            <template v-if="props.need.needType === 'taskObjective' && relatedTask">
              <TaskLink :task="relatedTask" compact class="max-w-full text-xs" />
            </template>
            <template v-else-if="props.need.needType === 'hideoutModule'">
              <StationLink
                v-if="relatedStation"
                :station="relatedStation"
                :module-id="props.need.hideoutModule.id"
                compact
                class="max-w-full text-xs"
              />
              <span class="text-surface-400 ml-1 text-xs">
                {{ t('common.lvl_level', { level: props.need.hideoutModule.level }) }}
              </span>
            </template>
          </div>
          <div
            class="text-surface-400 flex min-h-10 flex-wrap items-center justify-center gap-x-3 gap-y-0.5 border-t border-white/5 pt-1.5 text-xs"
          >
            <RequirementInfo
              class="justify-center"
              :level-required="levelRequired"
              :locked-before="lockedBefore"
              :player-level="playerLevel"
              icon-class="h-3.5 w-3.5"
            />
          </div>
          <div v-if="hiddenForSelf" class="mt-auto flex items-center justify-center pt-2">
            <TeamNeedsDisplay
              v-if="teamNeeds.length > 0"
              :team-needs="teamNeeds"
              :needed-count="neededCount"
            />
          </div>
          <div v-else-if="!isSingleItem" class="mt-auto flex items-center justify-center pt-2">
            <template v-if="!selfCompletedNeed">
              <ItemCountControls
                :current-count="currentCount"
                :needed-count="neededCount"
                @decrease="$emit('decreaseCount')"
                @increase="$emit('increaseCount')"
                @toggle="$emit('toggleCount')"
                @set-count="(count) => $emit('setCount', count)"
              />
            </template>
            <span v-else class="text-success-400 text-sm font-bold">
              {{ formatNumber(currentCount) }}/{{ formatNumber(neededCount) }} ✓
            </span>
          </div>
        </div>
      </template>
      <template v-else>
        <div :class="imageContainerClasses">
          <div class="bg-surface-700 h-full w-full animate-pulse rounded-t-lg"></div>
        </div>
        <div class="flex flex-1 flex-col p-2">
          <div class="flex min-h-10 items-start justify-center">
            <span class="bg-surface-700 h-4 w-3/4 animate-pulse rounded"></span>
          </div>
          <div class="flex min-h-7 w-full items-center justify-center">
            <span class="bg-surface-700 h-3 w-1/2 animate-pulse rounded"></span>
          </div>
          <div class="flex min-h-10 flex-wrap items-center justify-center gap-x-3 gap-y-0.5">
            <span class="bg-surface-700 h-3 w-1/3 animate-pulse rounded"></span>
            <span class="bg-surface-700 h-3 w-1/3 animate-pulse rounded"></span>
          </div>
          <div class="mt-auto flex items-center justify-center pt-2">
            <span class="bg-surface-700 h-4 w-10 animate-pulse rounded"></span>
          </div>
        </div>
      </template>
    </div>
  </AppTooltip>
</template>
<script setup lang="ts">
  import ItemCountControls from '@/features/neededitems/ItemCountControls.vue';
  import {
    createDefaultNeededItemContext,
    neededItemKey,
  } from '@/features/neededitems/neededitem-keys';
  import {
    neededItemBorderClass,
    neededItemSurfaceClass,
  } from '@/features/neededitems/neededItemStateClasses';
  import RequirementInfo from '@/features/neededitems/RequirementInfo.vue';
  import TeamNeedsDisplay from '@/features/neededitems/TeamNeedsDisplay.vue';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import type { NeededItemsCardStyle } from '@/features/neededitems/neededItemsFilterNormalization';
  import type { NeededItemHideoutModule, NeededItemTaskObjective } from '@/types/tarkov';
  const TaskLink = defineAsyncComponent(() => import('@/features/tasks/TaskLink.vue'));
  const StationLink = defineAsyncComponent(() => import('@/features/hideout/StationLink.vue'));
  const emit = defineEmits<{
    (event: 'decreaseCount' | 'increaseCount' | 'toggleCount'): void;
    (event: 'setCount', count: number): void;
  }>();
  const props = withDefaults(
    defineProps<{
      need: NeededItemTaskObjective | NeededItemHideoutModule;
      cardStyle?: NeededItemsCardStyle;
    }>(),
    { cardStyle: 'expanded' }
  );
  const { t } = useI18n({ useScope: 'global' });
  const formatNumber = useLocaleNumberFormatter();
  const tarkovStore = useTarkovStore();
  const playerLevel = computed(() => tarkovStore.playerLevel());
  const {
    selfCompletedNeed,
    relatedTask,
    relatedStation,
    craftableIconClass,
    craftableTitle,
    goToCraftStation,
    neededCount,
    currentCount,
    isCraftable,
    isKappaRequired,
    isLightkeeperRequired,
    levelRequired,
    lockedBefore,
    item,
    imageItem,
    acceptedItems,
    hasAlternativeItems,
    isCyclingItems,
    setCyclingPaused,
    teamNeeds,
    hiddenForSelf,
    hiddenForSelfHint,
  } = inject(neededItemKey, createDefaultNeededItemContext());
  const hasItem = computed(() => Boolean(item.value));
  const isSingleItem = computed(() => neededCount.value === 1);
  const isComplete = computed(
    () =>
      !hiddenForSelf.value && (selfCompletedNeed.value || currentCount.value >= neededCount.value)
  );
  const isCollectable = computed(
    () => hasItem.value && isSingleItem.value && !selfCompletedNeed.value && !hiddenForSelf.value
  );
  const acceptedItemsOpen = ref(false);
  watch(acceptedItemsOpen, (isOpen) => setCyclingPaused(isOpen));
  onBeforeUnmount(() => setCyclingPaused(false));
  const isCollected = computed(() => currentCount.value >= neededCount.value);
  const collectActionLabel = computed(() =>
    isCollected.value ? t('needed_items.click_to_uncollect') : t('needed_items.click_to_collect')
  );
  const cardTooltip = computed(() => {
    if (hiddenForSelf.value) return hiddenForSelfHint.value;
    return isCollectable.value ? collectActionLabel.value : '';
  });
  const cardAriaLabel = computed(() => {
    const itemName = item.value?.name || t('common.item');
    const status = isCollected.value
      ? t('needed_items.collected')
      : t('needed_items.not_collected');
    return `${itemName}. ${status}. ${collectActionLabel.value}`;
  });
  const handleCardClick = () => {
    if (isCollectable.value) emit('toggleCount');
  };
  const itemCardClasses = computed(() => neededItemSurfaceClass(isComplete.value, 't'));
  const rarityBorderClass = computed(() =>
    neededItemBorderClass(imageItem.value?.backgroundColor, props.need.needType)
  );
  const imageContainerClasses = computed(() => [
    'relative z-0 aspect-[4/3] w-full shrink-0 overflow-hidden',
    props.cardStyle === 'compact' ? 'rounded-lg' : 'rounded-t-lg',
    { 'cursor-pointer': isCollectable.value },
  ]);
  const itemCountTagClasses = computed(() =>
    isComplete.value
      ? 'bg-complete text-white'
      : 'bg-surface-800/90 text-surface-100 ring-1 ring-white/10'
  );
</script>
