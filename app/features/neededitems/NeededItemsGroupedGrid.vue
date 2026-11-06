<template>
  <div
    class="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
  >
    <NeededItemGroupedCard
      v-for="(group, index) in groupedItems"
      :key="group.item.id"
      :grouped-item="group"
      :active-filter="activeFilter"
      :data-index="index"
      class="content-visibility-auto-220 h-full"
      @open="openGroup"
    />
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
  import NeededItemGroupedCard from '@/features/neededitems/NeededItemGroupedCard.vue';
  import NeededItemGroupedModal from '@/features/neededitems/NeededItemGroupedModal.vue';
  import type { NeededItemsFilterType } from '@/features/neededitems/neededitems-constants';
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
    activeFilter: NeededItemsFilterType;
    groupedItems: GroupedNeededItem[];
    objectivesByItemId: Map<string, GroupObjectives>;
  }>();
  const EMPTY_OBJECTIVES: GroupObjectives = { taskObjectives: [], hideoutModules: [] };
  const selectedItemId = ref<string | null>(null);
  const selectedGroup = computed(
    () => props.groupedItems.find((group) => group.item.id === selectedItemId.value) ?? null
  );
  const selectedObjectives = computed(
    () => props.objectivesByItemId.get(selectedItemId.value ?? '') ?? EMPTY_OBJECTIVES
  );
  const isModalOpen = ref(false);
  watch(selectedGroup, (group) => {
    if (!group) isModalOpen.value = false;
  });
  const openGroup = (itemId: string) => {
    selectedItemId.value = itemId;
    isModalOpen.value = true;
  };
</script>
