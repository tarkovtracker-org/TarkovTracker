<template>
  <div>
    <component
      :is="isGrid ? 'div' : 'ul'"
      data-testid="needed-items-results"
      :data-layout="isGrid ? 'grid' : 'list'"
      :class="isGrid ? gridClass : listClass"
    >
      <template v-if="groupByItem">
        <component
          :is="isGrid ? 'div' : 'li'"
          v-for="(group, index) in groupedItems"
          :key="group.item.id"
          :data-index="index"
          :class="itemClass"
        >
          <NeededItemGroupEntry
            :group="group"
            :needs="needsFor(group.item.id)"
            :layout="entryLayout"
            @open="openGroup"
          />
        </component>
      </template>
      <template v-else>
        <component
          :is="isGrid ? 'div' : 'li'"
          v-for="(item, index) in items"
          :key="`${item.needType}-${item.id}`"
          :data-index="index"
          :class="itemClass"
        >
          <NeededItem :need="item" :layout="entryLayout" :search="search" />
        </component>
      </template>
    </component>
    <div v-if="hasMore" ref="sentinel" class="h-1 w-full"></div>
    <NeededItemGroupedModal
      v-if="selectedGroup"
      v-model:open="isModalOpen"
      :item-info="selectedGroup.item"
      :task-objectives="selectedObjectives.taskObjectives"
      :hideout-modules="selectedObjectives.hideoutModules"
    />
  </div>
</template>
<script setup lang="ts">
  import NeededItem from '@/features/neededitems/NeededItem.vue';
  import NeededItemGroupedModal from '@/features/neededitems/NeededItemGroupedModal.vue';
  import NeededItemGroupEntry from '@/features/neededitems/NeededItemGroupEntry.vue';
  import type { NeededItemsViewMode } from '@/features/neededitems/neededItemsFilterNormalization';
  import type {
    GroupedNeededItem,
    NeededItemHideoutModule,
    NeededItemTaskObjective,
  } from '@/types/tarkov';
  type GroupObjectives = {
    taskObjectives: NeededItemTaskObjective[];
    hideoutModules: NeededItemHideoutModule[];
  };
  const props = defineProps<{
    groupByItem: boolean;
    viewMode: NeededItemsViewMode;
    groupedItems: GroupedNeededItem[];
    items: (NeededItemTaskObjective | NeededItemHideoutModule)[];
    objectivesByItemId: Map<string, GroupObjectives>;
    search: string;
    /** Renders the infinite-scroll sentinel after the last loaded item. */
    hasMore: boolean;
  }>();
  const isGrid = computed(() => props.viewMode === 'grid');
  const entryLayout = computed(() => (isGrid.value ? 'tile' : 'row'));
  // Both layouts share one surface: a divided panel for rows, a responsive grid for tiles.
  const listClass =
    'bg-surface-900 divide-y divide-white/5 overflow-hidden rounded-lg border border-white/10';
  const gridClass =
    'grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6';
  const itemClass = computed(() =>
    isGrid.value ? 'content-visibility-auto-280 h-full' : 'content-visibility-auto-72'
  );
  const EMPTY_OBJECTIVES: GroupObjectives = { taskObjectives: [], hideoutModules: [] };
  const objectivesFor = (itemId: string | null) =>
    props.objectivesByItemId.get(itemId ?? '') ?? EMPTY_OBJECTIVES;
  const needsFor = (itemId: string) => {
    const { taskObjectives, hideoutModules } = objectivesFor(itemId);
    return [...taskObjectives, ...hideoutModules];
  };
  const selectedItemId = ref<string | null>(null);
  const selectedGroup = computed(
    () => props.groupedItems.find((group) => group.item.id === selectedItemId.value) ?? null
  );
  const selectedObjectives = computed(() => objectivesFor(selectedItemId.value));
  const isModalOpen = ref(false);
  watch(selectedGroup, (group) => {
    if (!group) isModalOpen.value = false;
  });
  function openGroup(itemId: string) {
    selectedItemId.value = itemId;
    isModalOpen.value = true;
  }
  const sentinel = useTemplateRef<HTMLElement>('sentinel');
  defineExpose({ sentinel });
</script>
