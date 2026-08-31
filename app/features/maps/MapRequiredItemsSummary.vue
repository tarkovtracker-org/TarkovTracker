<template>
  <div
    v-if="showPinnedGroup || showActiveGroup"
    class="bg-surface-800/50 mt-4 mb-4 shrink-0 rounded-lg p-4"
  >
    <MapRequiredItemsGroup
      v-if="showPinnedGroup"
      :title="$t('page.tasks.pinned_tasks_section')"
      :accent="pinnedAccent"
      :equipment="pinnedEquipment"
      :equipment-counts="pinnedEquipmentCounts"
      :key-groups="pinnedKeyGroups"
    />
    <MapRequiredItemsGroup
      v-if="showActiveGroup"
      :class="{ 'mt-6': showPinnedGroup }"
      :title="showPinnedGroup ? $t('page.tasks.map.active_tasks_group') : undefined"
      :equipment="activeEquipment"
      :equipment-counts="activeEquipmentCounts"
      :key-groups="activeKeyGroups"
    />
  </div>
</template>
<script setup lang="ts">
  import { useMapRequiredItems } from '@/features/maps/composables/useMapRequiredItems';
  import MapRequiredItemsGroup from '@/features/maps/MapRequiredItemsGroup.vue';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import type {
    MapObjectiveCategory,
    MapObjectiveVisibility,
  } from '@/composables/useMapObjectiveMarks';
  import type { Task, TaskObjective } from '@/types/tarkov';
  const props = defineProps<{
    mapId: string;
    tasks: Task[];
    objectiveVisibility?: ReadonlyMap<string, MapObjectiveVisibility>;
  }>();
  const preferencesStore = usePreferencesStore();
  const mapId = computed(() => props.mapId);
  const pinnedIds = computed(() => new Set(preferencesStore.getPinnedTaskIds));
  const pinnedTasks = computed(() => props.tasks.filter((task) => pinnedIds.value.has(task.id)));
  const activeTasks = computed(() => props.tasks.filter((task) => !pinnedIds.value.has(task.id)));
  const isCategoryEnabled = (category: MapObjectiveCategory): boolean => {
    if (category === 'pinned') return preferencesStore.getMapShowPinnedObjectives;
    if (category === 'team') return preferencesStore.getMapShowTeamObjectives;
    return preferencesStore.getMapShowSelfObjectives;
  };
  const isObjectiveVisible = (objective: TaskObjective, selfComplete: boolean): boolean => {
    if (!props.objectiveVisibility) return !selfComplete;
    const visibility = props.objectiveVisibility.get(objective.id);
    if (!visibility) return false;
    return visibility.hasActiveObjective && isCategoryEnabled(visibility.category);
  };
  const {
    equipment: pinnedEquipment,
    equipmentCounts: pinnedEquipmentCounts,
    keyGroups: pinnedKeyGroups,
    hasContent: pinnedHasContent,
  } = useMapRequiredItems({ mapId, objectiveFilter: isObjectiveVisible, tasks: pinnedTasks });
  const {
    equipment: activeEquipment,
    equipmentCounts: activeEquipmentCounts,
    keyGroups: activeKeyGroups,
    hasContent: activeHasContent,
  } = useMapRequiredItems({ mapId, objectiveFilter: isObjectiveVisible, tasks: activeTasks });
  const showPinnedGroup = computed(
    () => preferencesStore.getMapShowPinnedObjectives && pinnedHasContent.value
  );
  const showActiveGroup = computed(
    () =>
      (preferencesStore.getMapShowSelfObjectives || preferencesStore.getMapShowTeamObjectives) &&
      activeHasContent.value
  );
  const pinnedAccent = computed(() => preferencesStore.getMapMarkerColors.PINNED_OBJECTIVE);
</script>
