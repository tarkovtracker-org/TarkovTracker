<template>
  <div :class="viewMode === 'list' && !groupByItem ? undefined : 'p-2'">
    <NeededItemsGroupedGrid
      v-if="groupByItem"
      :active-filter="activeFilter"
      :grouped-items="groupedItems"
      :objectives-by-item-id="objectivesByItemId"
    />
    <template v-else-if="viewMode === 'list'">
      <div
        v-for="(item, index) in items"
        :key="`${item.needType}-${item.id}`"
        class="content-visibility-auto-128 border-b border-white/5 pb-1"
      >
        <NeededItem
          :need="item"
          item-style="row"
          :initially-visible="index < initiallyVisibleCount"
          :search="search"
        />
      </div>
    </template>
    <div
      v-else
      class="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
    >
      <NeededItem
        v-for="(item, index) in items"
        :key="`${item.needType}-${item.id}`"
        :need="item"
        item-style="card"
        :card-style="cardStyle"
        :initially-visible="index < initiallyVisibleCount"
        :search="search"
        :data-index="index"
        class="content-visibility-auto-240 h-full"
      />
    </div>
    <div v-if="hasMore" ref="sentinel" class="h-1 w-full"></div>
  </div>
</template>
<script setup lang="ts">
  import NeededItem from '@/features/neededitems/NeededItem.vue';
  import NeededItemsGroupedGrid from '@/features/neededitems/NeededItemsGroupedGrid.vue';
  import type { NeededItemsFilterType } from '@/features/neededitems/neededitems-constants';
  import type {
    NeededItemsCardStyle,
    NeededItemsViewMode,
  } from '@/features/neededitems/neededItemsFilterNormalization';
  import type {
    GroupedNeededItem,
    NeededItemHideoutModule,
    NeededItemTaskObjective,
  } from '@/types/tarkov';
  defineProps<{
    groupByItem: boolean;
    viewMode: NeededItemsViewMode;
    cardStyle: NeededItemsCardStyle;
    activeFilter: NeededItemsFilterType;
    groupedItems: GroupedNeededItem[];
    items: (NeededItemTaskObjective | NeededItemHideoutModule)[];
    objectivesByItemId: Map<
      string,
      { taskObjectives: NeededItemTaskObjective[]; hideoutModules: NeededItemHideoutModule[] }
    >;
    search: string;
    initiallyVisibleCount: number;
    /** Renders the infinite-scroll sentinel after the last loaded item. */
    hasMore: boolean;
  }>();
  const sentinel = useTemplateRef<HTMLElement>('sentinel');
  defineExpose({ sentinel });
</script>
