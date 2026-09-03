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
  // `team` is excluded from the parameter type because it must never reach this gate: it has no
  // corresponding summary preference, so falling through to either chip would be wrong.
  const isCategoryEnabled = (category: Exclude<MapObjectiveCategory, 'team'>): boolean => {
    if (category === 'pinned') return preferencesStore.getMapShowPinnedObjectives;
    return preferencesStore.getMapShowSelfObjectives;
  };
  // A `team` category means only teammates still need the objective, so it carries no requirement
  // for this player. The Team chip therefore never alters the summary.
  const isPlayerRequirement = (visibility: MapObjectiveVisibility): boolean => {
    if (!visibility.hasActiveObjective) return false;
    if (visibility.category === 'team') return false;
    return isCategoryEnabled(visibility.category);
  };
  const isObjectiveVisible = (objective: TaskObjective, selfComplete: boolean): boolean => {
    // The summary is the local player's shopping list for this map, so an objective they have
    // already completed never contributes items, even when a teammate still needs it.
    if (selfComplete) return false;
    if (!props.objectiveVisibility) return true;
    const visibility = props.objectiveVisibility.get(objective.id);
    return visibility ? isPlayerRequirement(visibility) : false;
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
    () => preferencesStore.getMapShowSelfObjectives && activeHasContent.value
  );
  const pinnedAccent = computed(() => preferencesStore.getMapMarkerColors.PINNED_OBJECTIVE);
</script>
