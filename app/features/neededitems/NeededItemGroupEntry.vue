<template>
  <div
    v-if="layout === 'row'"
    data-testid="needed-item-group"
    class="relative flex items-center gap-3 px-3 py-2.5 transition-colors sm:px-4"
    :class="look.surface"
  >
    <NeededItemThumb
      class="z-10 cursor-pointer"
      :image-item="group.item"
      :item="group.item"
      :complete="isComplete"
      @click="open"
    />
    <!-- Phones put the total under the name so it stays readable. -->
    <div class="flex min-w-0 flex-1 flex-col gap-x-3 gap-y-2 sm:flex-row sm:items-center">
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-1.5">
          <h3 class="text-surface-50 truncate text-sm leading-snug font-semibold">
            {{ group.item.name }}
          </h3>
          <ItemIndicators v-bind="indicators" class="relative z-10" @craft="goToCraftStation" />
        </div>
        <p class="text-surface-50 mt-1 text-sm font-semibold tabular-nums">
          {{ remainingLabel }}
        </p>
        <NeededItemGroupBreakdown class="mt-1" :sections="sections" />
        <button type="button" :class="openButtonClass" :aria-label="openLabel" @click="open">
          {{ requirementsLabel }}
          <UIcon name="i-mdi-chevron-right" class="size-4 shrink-0" aria-hidden="true" />
        </button>
      </div>
      <NeededItemCounter
        v-if="single"
        class="relative z-10 shrink-0 self-end sm:self-auto"
        v-bind="single.counter"
        v-on="single.events"
      />
      <NeededItemGroupProgress
        v-else
        class="w-full shrink-0 sm:w-36"
        :current="group.currentCount"
        :total="group.total"
      />
    </div>
    <UIcon name="i-mdi-chevron-right" class="text-surface-500 size-5 shrink-0" aria-hidden="true" />
  </div>
  <article
    v-else
    data-testid="needed-item-group"
    class="relative flex h-full flex-col overflow-hidden rounded-lg border transition-colors"
    :class="look.tile"
  >
    <NeededItemThumb
      class="z-10 aspect-video w-full cursor-pointer"
      fill
      :image-item="group.item"
      :item="group.item"
      :complete="isComplete"
      @click="open"
    />
    <ItemIndicators
      v-bind="indicators"
      class="bg-surface-900/85 absolute top-1.5 right-1.5 z-10 backdrop-blur-sm"
      @craft="goToCraftStation"
    />
    <div class="flex flex-1 flex-col gap-1.5 p-2.5">
      <h3
        class="text-surface-50 line-clamp-2 min-h-10 text-center text-sm leading-snug font-semibold"
      >
        {{ group.item.name }}
      </h3>
      <p class="text-surface-50 text-center text-sm font-semibold tabular-nums">
        {{ remainingLabel }}
      </p>
      <NeededItemGroupBreakdown centered :sections="sections" />
      <div class="mt-auto pt-1">
        <div v-if="single" class="relative z-10 flex justify-center">
          <NeededItemCounter wide v-bind="single.counter" v-on="single.events" />
        </div>
        <NeededItemGroupProgress v-else :current="group.currentCount" :total="group.total" />
      </div>
      <button
        type="button"
        :class="[openButtonClass, 'justify-center text-center']"
        :aria-label="openLabel"
        @click="open"
      >
        {{ requirementsLabel }}
        <UIcon name="i-mdi-chevron-right" class="size-4 shrink-0" aria-hidden="true" />
      </button>
    </div>
  </article>
</template>
<script setup lang="ts">
  import { useCraftableItem } from '@/composables/useCraftableItem';
  import ItemIndicators from '@/features/neededitems/ItemIndicators.vue';
  import NeededItemCounter from '@/features/neededitems/NeededItemCounter.vue';
  import NeededItemGroupBreakdown, {
    type BreakdownSection,
  } from '@/features/neededitems/NeededItemGroupBreakdown.vue';
  import NeededItemGroupProgress from '@/features/neededitems/NeededItemGroupProgress.vue';
  import NeededItemThumb from '@/features/neededitems/NeededItemThumb.vue';
  import {
    neededCountOf,
    useNeededItemProgress,
  } from '@/features/neededitems/useNeededItemProgress';
  import { useNeedSelfCompletion } from '@/features/neededitems/useNeedSelfCompletion';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import type {
    GroupedNeededItem,
    NeededItemHideoutModule,
    NeededItemTaskObjective,
  } from '@/types/tarkov';
  type Need = NeededItemTaskObjective | NeededItemHideoutModule;
  /**
   * One item with every quest and hideout need for it added together. Opening it shows
   * the per-need breakdown and Smart Fill; an item with a single need is tracked in place.
   */
  const props = withDefaults(
    defineProps<{
      group: GroupedNeededItem;
      needs: Need[];
      layout?: 'row' | 'tile';
    }>(),
    { layout: 'row' }
  );
  const emit = defineEmits<{ open: [itemId: string] }>();
  const { t } = useI18n({ useScope: 'global' });
  const progress = useNeededItemProgress();
  const { isSelfCompleted } = useNeedSelfCompletion();
  const openLabel = computed(() =>
    t('needed_items.view_details_for', { name: props.group.item.name })
  );
  const formatNumber = useLocaleNumberFormatter();
  const remainingLabel = computed(() =>
    t('needed_items.remaining_count', {
      count: formatNumber(Math.max(0, props.group.total - props.group.currentCount)),
    })
  );
  const requirementsLabel = computed(() =>
    t('needed_items.view_requirements', { count: props.needs.length }, props.needs.length)
  );
  const { isCraftable, craftableIconClass, craftableTitle, goToCraftStation } = useCraftableItem(
    () => props.group.item.id
  );
  // The whole entry opens the details; nested controls sit above this stretched target. The
  // thumbnail sits above it too so its context menu (wiki, tarkov.dev, copy name) still works.
  const openButtonClass =
    'text-primary-400 mt-1 inline-flex items-center gap-1 text-xs leading-snug underline underline-offset-2 after:absolute after:inset-0 after:rounded-lg focus-visible:outline-hidden focus-visible:after:ring-2 focus-visible:after:ring-primary-400 focus-visible:after:ring-inset';
  const isComplete = computed(() => props.group.currentCount >= props.group.total);
  const look = computed(() =>
    isComplete.value
      ? {
          surface: 'bg-success-500/5 hover:bg-success-500/10',
          tile: 'border-success-500/30 bg-success-500/5',
        }
      : {
          surface: 'hover:bg-surface-800/60',
          tile: 'border-surface-700 bg-surface-850 hover:border-surface-600',
        }
  );
  /** FIR and non-FIR needs stay separate: they are filled from different items. */
  const sections = computed(() => {
    const { group } = props;
    return [
      {
        key: 'tasks-fir',
        source: 'tasks',
        fir: true,
        current: group.taskFirCurrent,
        total: group.taskFir,
      },
      {
        key: 'tasks',
        source: 'tasks',
        fir: false,
        current: group.taskNonFirCurrent,
        total: group.taskNonFir,
      },
      {
        key: 'hideout-fir',
        source: 'hideout',
        fir: true,
        current: group.hideoutFirCurrent,
        total: group.hideoutFir,
      },
      {
        key: 'hideout',
        source: 'hideout',
        fir: false,
        current: group.hideoutNonFirCurrent,
        total: group.hideoutNonFir,
      },
    ].filter((section) => section.total > 0) as BreakdownSection[];
  });
  const indicators = computed(() => ({
    foundInRaid: false,
    isCraftable: isCraftable.value,
    craftableTitle: craftableTitle.value,
    craftableIconClass: craftableIconClass.value,
  }));
  /** A single need needs no breakdown: track it right here, read-only once it is finished. */
  const single = computed(() => {
    if (props.needs.length !== 1) return undefined;
    const need = props.needs[0]!;
    const neededCount = neededCountOf(need);
    const done = isSelfCompleted(need);
    return {
      counter: {
        currentCount: done ? neededCount : Math.min(progress.storedCountOf(need), neededCount),
        neededCount,
        done,
      },
      events: {
        decrease: () => progress.decrease(need),
        increase: () => progress.increase(need),
        toggle: () => progress.toggle(need),
        setCount: (count: number) => progress.setCount(need, count),
      },
    };
  });
  function open() {
    emit('open', props.group.item.id);
  }
</script>
