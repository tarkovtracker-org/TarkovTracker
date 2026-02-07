<template>
  <KeepAlive>
    <AppTooltip
      :text="
        isSingleItem && !selfCompletedNeed
          ? currentCount >= neededCount
            ? t('needed_items.click_to_uncollect')
            : t('needed_items.click_to_collect')
          : ''
      "
    >
      <div
        class="flex h-full flex-col rounded-lg"
        :class="[
          itemCardClasses,
          {
            'cursor-pointer transition-all active:scale-[0.98]':
              hasItem && isSingleItem && !selfCompletedNeed,
          },
        ]"
        :role="hasItem && isSingleItem && !selfCompletedNeed ? 'button' : undefined"
        :tabindex="hasItem && isSingleItem && !selfCompletedNeed ? 0 : undefined"
        :aria-label="hasItem && isSingleItem && !selfCompletedNeed ? cardAriaLabel : undefined"
        @click="handleCardClick"
        @keydown.enter="handleCardClick"
        @keydown.space.prevent="handleCardClick"
      >
        <template v-if="hasItem">
          <div :class="imageContainerClasses">
            <div class="absolute top-0 left-0 z-10">
              <div
                class="flex items-center gap-1 rounded-br-lg px-2 py-1 text-sm font-bold shadow-lg"
                :class="itemCountTagClasses"
              >
                {{ formatNumber(currentCount) }}/{{ formatNumber(neededCount) }}
                <ItemIndicators
                  :found-in-raid="props.need.foundInRaid ?? false"
                  fir-icon-class="h-4 w-4"
                  :is-craftable="isCraftable"
                  :craftable-title="craftableTitle"
                  craftable-icon-base-class="h-4 w-4 opacity-90"
                  :craftable-icon-class="craftableIconClass"
                  :kappa-required="isKappaRequired"
                  :kappa-title="$t('needed_items.task_kappa_req')"
                  kappa-icon-class="h-4 w-4 text-kappa"
                  :lightkeeper-required="isLightkeeperRequired"
                  :lightkeeper-title="$t('page.tasks.questcard.lightkeeper_tooltip')"
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
              :item-name="item?.name ?? null"
              :wiki-link="item?.wikiLink ?? null"
              :dev-link="item?.link ?? null"
              :task-wiki-link="relatedTask?.wikiLink"
              :background-color="imageItem.backgroundColor || 'grey'"
              size="small"
              simple-mode
              fill
              :class="[
                'h-full w-full',
                isSingleItem && !selfCompletedNeed ? '!cursor-pointer' : '',
              ]"
            />
            <div
              v-if="selfCompletedNeed || currentCount >= neededCount"
              class="pointer-events-none absolute right-1 bottom-1 z-20"
              aria-hidden="true"
            >
              <div
                class="bg-success-600 flex h-6 w-6 items-center justify-center rounded-full shadow-md"
              >
                <UIcon name="i-mdi-check" class="h-4 w-4 text-white" />
              </div>
            </div>
            <div
              v-if="cardStyle === 'compact' && !isSingleItem && !selfCompletedNeed"
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
          <div v-if="cardStyle === 'expanded'" class="flex flex-1 flex-col p-2">
            <div class="flex min-h-10 items-start justify-center">
              <span
                class="line-clamp-2 text-center text-[clamp(0.7rem,2.5vw,0.875rem)] leading-snug font-medium"
              >
                {{ item?.name ?? '' }}
              </span>
            </div>
            <div class="flex min-h-7 w-full items-center justify-center overflow-hidden">
              <template v-if="props.need.needType == 'taskObjective' && relatedTask">
                <TaskLink
                  :task="relatedTask"
                  compact
                  class="max-w-full text-[clamp(0.625rem,2vw,0.75rem)]"
                />
              </template>
              <template v-else-if="props.need.needType == 'hideoutModule'">
                <StationLink
                  v-if="relatedStation"
                  :station="relatedStation"
                  :module-id="props.need.hideoutModule.id"
                  compact
                  class="max-w-full text-[clamp(0.625rem,2vw,0.75rem)]"
                />
                <span class="text-surface-400 ml-1 text-[clamp(0.625rem,2vw,0.75rem)]">
                  {{ props.need.hideoutModule.level }}
                </span>
              </template>
            </div>
            <div
              class="text-surface-400 flex min-h-10 flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[clamp(0.625rem,1.8vw,0.75rem)]"
            >
              <span
                v-if="levelRequired > 0 && levelRequired > playerLevel"
                class="flex items-center gap-1"
              >
                <UIcon name="i-mdi-account" class="h-3.5 w-3.5" />
                {{ $t('needed_items.level_required', { level: levelRequired }) }}
              </span>
              <span v-if="lockedBefore > 0" class="flex items-center gap-1">
                <UIcon name="i-mdi-lock-outline" class="h-3.5 w-3.5" />
                {{ $t('needed_items.locked_before', { count: lockedBefore }) }}
              </span>
            </div>
            <div v-if="!isSingleItem" class="mt-auto flex items-center justify-center pt-2">
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
  </KeepAlive>
</template>
<script setup lang="ts">
  import ItemCountControls from '@/features/neededitems/ItemCountControls.vue';
  import {
    createDefaultNeededItemContext,
    neededItemKey,
  } from '@/features/neededitems/neededitem-keys';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import type { NeededItemHideoutModule, NeededItemTaskObjective } from '@/types/tarkov';
  const TaskLink = defineAsyncComponent(() => import('@/features/tasks/TaskLink.vue'));
  const StationLink = defineAsyncComponent(() => import('@/features/hideout/StationLink.vue'));
  const emit = defineEmits<{
    (event: 'decreaseCount' | 'increaseCount' | 'toggleCount'): void;
    (event: 'setCount', count: number): void;
  }>();
  const props = defineProps<{
    need: NeededItemTaskObjective | NeededItemHideoutModule;
  }>();
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
    cardStyle,
  } = inject(neededItemKey, createDefaultNeededItemContext());
  const hasItem = computed(() => Boolean(item.value));
  const isSingleItem = computed(() => neededCount.value === 1);
  const cardAriaLabel = computed(() => {
    const itemName = item.value?.name || t('needed_items.item');
    const status =
      currentCount.value >= neededCount.value
        ? t('needed_items.collected')
        : t('needed_items.not_collected');
    const action =
      currentCount.value >= neededCount.value
        ? t('needed_items.click_to_uncollect')
        : t('needed_items.click_to_collect');
    return `${itemName}. ${status}. ${action}`;
  });
  const handleCardClick = () => {
    if (hasItem.value && isSingleItem.value && !selfCompletedNeed.value) {
      emit('toggleCount');
    }
  };
  const itemCardClasses = computed(() => {
    return {
      'bg-gradient-to-t from-complete to-surface':
        selfCompletedNeed.value || currentCount.value >= neededCount.value,
      'bg-surface-800': !(selfCompletedNeed.value || currentCount.value >= neededCount.value),
    };
  });
  const imageContainerClasses = computed(() => {
    const baseLayoutClasses =
      'relative z-0 aspect-[4/3] w-full shrink-0 origin-bottom overflow-hidden';
    const roundedClasses = cardStyle.value === 'compact' ? 'rounded-lg' : 'rounded-t-lg';
    const cursorClass = isSingleItem.value && !selfCompletedNeed.value ? 'cursor-pointer' : '';
    return [baseLayoutClasses, roundedClasses, cursorClass];
  });
  const itemCountTagClasses = computed(() => {
    return {
      'bg-clip-padding rounded-tl-[5px] rounded-br-[10px]': true,
      'bg-surface-800/90 text-surface-100 ring-1 ring-white/10': !(
        selfCompletedNeed.value || currentCount.value >= neededCount.value
      ),
      'bg-complete text-white': selfCompletedNeed.value || currentCount.value >= neededCount.value,
    };
  });
</script>
