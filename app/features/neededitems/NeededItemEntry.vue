<template>
  <div
    v-if="layout === 'row'"
    data-testid="needed-item-entry"
    class="flex items-center gap-3 px-3 py-2.5 transition-colors sm:px-4"
    :class="look.surface"
  >
    <NeededItemThumb
      :image-item="imageItem"
      :item="item"
      :task-wiki-link="relatedTask?.wikiLink"
      :complete="isComplete"
    />
    <!-- Phones put the stepper under the text so long item names stay readable. -->
    <div
      class="flex min-w-0 flex-1 gap-x-3 gap-y-2"
      :class="stacksOnPhone ? 'flex-col sm:flex-row sm:items-center' : 'items-center'"
    >
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-1.5">
          <p class="truncate text-sm font-semibold" :class="look.name">{{ itemName }}</p>
          <AcceptedItemsPopover
            v-if="hasAlternativeItems"
            v-model:open="acceptedItemsOpen"
            :items="acceptedItems"
            :cycling="isCyclingItems"
            trigger-class="bg-surface-700/80 text-surface-200 shrink-0 px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ring-1 ring-white/5"
          />
          <ItemIndicators v-bind="badges" @craft="goToCraftStation" />
        </div>
        <NeededItemSource class="mt-0.5" v-bind="source" />
      </div>
      <NeededItemCounter
        class="shrink-0 self-end sm:self-auto"
        v-bind="counter"
        v-on="counterEvents"
      />
    </div>
  </div>
  <article
    v-else
    data-testid="needed-item-entry"
    class="flex h-full flex-col overflow-hidden rounded-lg border transition-colors"
    :class="look.tile"
  >
    <div class="relative">
      <NeededItemThumb
        class="aspect-video w-full"
        fill
        :image-item="imageItem"
        :item="item"
        :task-wiki-link="relatedTask?.wikiLink"
        :complete="isComplete"
      />
      <div
        class="pointer-events-none absolute inset-x-1.5 top-1.5 flex items-start justify-between gap-1"
      >
        <AcceptedItemsPopover
          v-if="hasAlternativeItems"
          v-model:open="acceptedItemsOpen"
          :items="acceptedItems"
          :cycling="isCyclingItems"
          trigger-class="pointer-events-auto bg-surface-900/85 text-surface-100 px-1.5 py-0.5 text-[10px] font-bold uppercase ring-1 ring-white/10 backdrop-blur-sm"
        />
        <span v-else />
        <ItemIndicators
          class="bg-surface-900/85 pointer-events-auto backdrop-blur-sm"
          v-bind="badges"
          @craft="goToCraftStation"
        />
      </div>
    </div>
    <div class="flex flex-1 flex-col gap-1.5 p-2.5">
      <p
        class="line-clamp-2 min-h-10 text-center text-sm leading-snug font-semibold"
        :class="look.name"
      >
        {{ itemName }}
      </p>
      <NeededItemSource centered v-bind="source" />
      <div class="mt-auto flex justify-center pt-1">
        <NeededItemCounter wide v-bind="counter" v-on="counterEvents" />
      </div>
    </div>
  </article>
</template>
<script setup lang="ts">
  import ItemIndicators from '@/features/neededitems/ItemIndicators.vue';
  import {
    createDefaultNeededItemContext,
    neededItemKey,
  } from '@/features/neededitems/neededitem-keys';
  import NeededItemCounter from '@/features/neededitems/NeededItemCounter.vue';
  import NeededItemSource from '@/features/neededitems/NeededItemSource.vue';
  import NeededItemThumb from '@/features/neededitems/NeededItemThumb.vue';
  import { useTarkovStore } from '@/stores/useTarkov';
  import type { NeededItemHideoutModule, NeededItemTaskObjective } from '@/types/tarkov';
  /**
   * One quest or hideout requirement. `row` is the list layout and `tile` the grid layout;
   * both show the same information and the same tracking control.
   */
  const props = withDefaults(
    defineProps<{
      need: NeededItemTaskObjective | NeededItemHideoutModule;
      layout?: 'row' | 'tile';
    }>(),
    { layout: 'row' }
  );
  const emit = defineEmits<{
    decreaseCount: [];
    increaseCount: [];
    toggleCount: [];
    setCount: [count: number];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const tarkovStore = useTarkovStore();
  const context = inject(neededItemKey, createDefaultNeededItemContext());
  const {
    item,
    imageItem,
    relatedTask,
    relatedStation,
    selfCompletedNeed,
    currentCount,
    neededCount,
    levelRequired,
    lockedBefore,
    teamNeeds,
    hiddenForSelf,
    hiddenForSelfHint,
    acceptedItems,
    hasAlternativeItems,
    isCyclingItems,
    setCyclingPaused,
    goToCraftStation,
  } = context;
  const itemName = computed(() => item.value?.name ?? t('common.item'));
  const acceptedItemsOpen = ref(false);
  watch(acceptedItemsOpen, (isOpen) => setCyclingPaused(isOpen));
  onBeforeUnmount(() => setCyclingPaused(false));
  const isComplete = computed(
    () =>
      !hiddenForSelf.value && (selfCompletedNeed.value || currentCount.value >= neededCount.value)
  );
  const handedOver = computed(() => {
    if (props.need.needType !== 'taskObjective') return false;
    return selfCompletedNeed.value || tarkovStore.isTaskObjectiveComplete(props.need.id);
  });
  const look = computed(() => {
    if (isComplete.value)
      return {
        surface: 'bg-success-500/5 hover:bg-success-500/10',
        tile: 'border-success-500/30 bg-success-500/5',
        name: 'text-surface-300',
      };
    if (hiddenForSelf.value)
      return {
        surface: 'opacity-75 hover:bg-surface-800/60',
        tile: 'border-surface-700 bg-surface-850 opacity-75',
        name: 'text-surface-300',
      };
    return {
      surface: 'hover:bg-surface-800/60',
      tile: 'border-surface-700 bg-surface-850 hover:border-surface-600',
      name: 'text-surface-50',
    };
  });
  const badges = computed(() => ({
    foundInRaid: props.need.foundInRaid === true,
    kappaRequired: context.isKappaRequired.value,
    lightkeeperRequired: context.isLightkeeperRequired.value,
    isCraftable: context.isCraftable.value,
    craftableTitle: context.craftableTitle.value,
    craftableIconClass: context.craftableIconClass.value,
  }));
  const source = computed(() => ({
    need: props.need,
    relatedTask: relatedTask.value,
    relatedStation: relatedStation.value,
    levelRequired: levelRequired.value,
    lockedBefore: lockedBefore.value,
    neededCount: neededCount.value,
    teamNeeds: teamNeeds.value,
    hiddenForSelf: hiddenForSelf.value,
    hiddenForSelfHint: hiddenForSelfHint.value,
    handedOver: handedOver.value,
    collected: props.need.needType === 'taskObjective' && currentCount.value >= neededCount.value,
  }));
  const counter = computed(() => ({
    currentCount: currentCount.value,
    neededCount: neededCount.value,
    done: selfCompletedNeed.value,
    hiddenForSelf: hiddenForSelf.value,
    hiddenForSelfHint: hiddenForSelfHint.value,
  }));
  /** Only the wide stepper needs its own line on phones; a single check fits beside the name. */
  const stacksOnPhone = computed(
    () => neededCount.value > 1 && !selfCompletedNeed.value && !hiddenForSelf.value
  );
  const counterEvents = {
    decrease: () => emit('decreaseCount'),
    increase: () => emit('increaseCount'),
    toggle: () => emit('toggleCount'),
    setCount: (count: number) => emit('setCount', count),
  };
</script>
