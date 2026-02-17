<template>
  <template v-if="props.itemStyle === 'card'">
    <div class="h-full">
      <LazyNeededItemSmallCard
        :need="props.need"
        @decrease-count="decreaseCount()"
        @toggle-count="toggleCount()"
        @increase-count="increaseCount()"
        @set-count="setCount"
      />
    </div>
  </template>
  <template v-else-if="props.itemStyle === 'row'">
    <div class="w-full pt-1">
      <LazyNeededItemRow
        :need="props.need"
        :initially-visible="props.initiallyVisible"
        @decrease-count="decreaseCount()"
        @toggle-count="toggleCount()"
        @increase-count="increaseCount()"
        @set-count="setCount"
      />
    </div>
  </template>
</template>
<script setup lang="ts">
  import { useCraftableItem } from '@/composables/useCraftableItem';
  import { neededItemKey, type NeededItemTeamNeed } from '@/features/neededitems/neededitem-keys';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useProgressStore } from '@/stores/useProgress';
  import { useTarkovStore } from '@/stores/useTarkov';
  import type { NeededItemHideoutModule, NeededItemTaskObjective } from '@/types/tarkov';
  const props = withDefaults(
    defineProps<{
      need: NeededItemTaskObjective | NeededItemHideoutModule;
      itemStyle?: 'card' | 'row';
      initiallyVisible?: boolean;
      cardStyle?: 'compact' | 'expanded';
    }>(),
    {
      itemStyle: 'card',
      initiallyVisible: false,
      cardStyle: 'expanded',
    }
  );
  const progressStore = useProgressStore();
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const tasks = computed(() => metadataStore.tasks);
  const hideoutStations = computed(() => metadataStore.hideoutStations);
  const alternativeTasks = computed(() => metadataStore.alternativeTasks);
  // Emit functions to update the user's progress towards the need
  // the child functions emit these functions and we watch for them here
  const decreaseCount = () => {
    if (props.need.needType == 'taskObjective') {
      if (currentCount.value > 0) {
        const newCount = currentCount.value - 1;
        tarkovStore.setObjectiveCount(props.need.id, newCount);
      }
    } else if (props.need.needType == 'hideoutModule') {
      if (currentCount.value > 0) {
        const newCount = currentCount.value - 1;
        tarkovStore.setHideoutPartCount(props.need.id, newCount);
        // If we drop below needed count and module was complete, uncomplete it
        // Note: Hideout modules are complex, usually parts contribute to a module.
        // If this is a part, we might want to uncomplete the part?
        // The store has setHideoutPartUncomplete.
        if (newCount < neededCount.value && tarkovStore.isHideoutPartComplete(props.need.id)) {
          tarkovStore.setHideoutPartUncomplete(props.need.id);
        }
      }
    }
  };
  const increaseCount = () => {
    if (props.need.needType == 'taskObjective') {
      if (currentCount.value < neededCount.value) {
        const newCount = currentCount.value + 1;
        tarkovStore.setObjectiveCount(props.need.id, newCount);
      }
    } else if (props.need.needType == 'hideoutModule') {
      if (currentCount.value < neededCount.value) {
        const newCount = currentCount.value + 1;
        tarkovStore.setHideoutPartCount(props.need.id, newCount);
        // If we reach needed count, mark part as complete
        if (newCount >= neededCount.value && !tarkovStore.isHideoutPartComplete(props.need.id)) {
          tarkovStore.setHideoutPartComplete(props.need.id);
        }
      }
    }
  };
  const toggleCount = () => {
    if (props.need.needType == 'taskObjective') {
      if (currentCount.value === 0) {
        tarkovStore.setObjectiveCount(props.need.id, neededCount.value);
      } else if (currentCount.value === neededCount.value) {
        tarkovStore.setObjectiveCount(props.need.id, Math.max(0, neededCount.value - 1));
      } else {
        tarkovStore.setObjectiveCount(props.need.id, neededCount.value);
      }
    } else if (props.need.needType == 'hideoutModule') {
      if (currentCount.value === 0) {
        tarkovStore.setHideoutPartCount(props.need.id, neededCount.value);
        tarkovStore.setHideoutPartComplete(props.need.id);
      } else if (currentCount.value === neededCount.value) {
        tarkovStore.setHideoutPartCount(props.need.id, Math.max(0, neededCount.value - 1));
        tarkovStore.setHideoutPartUncomplete(props.need.id);
      } else {
        tarkovStore.setHideoutPartCount(props.need.id, neededCount.value);
        tarkovStore.setHideoutPartComplete(props.need.id);
      }
    }
  };
  const setCount = (count: number) => {
    if (props.need.needType == 'taskObjective') {
      tarkovStore.setObjectiveCount(props.need.id, count);
    } else if (props.need.needType == 'hideoutModule') {
      tarkovStore.setHideoutPartCount(props.need.id, count);
      // Update completion status based on new count
      if (count >= neededCount.value) {
        if (!tarkovStore.isHideoutPartComplete(props.need.id)) {
          tarkovStore.setHideoutPartComplete(props.need.id);
        }
      } else {
        if (tarkovStore.isHideoutPartComplete(props.need.id)) {
          tarkovStore.setHideoutPartUncomplete(props.need.id);
        }
      }
    }
  };
  const imageItem = computed(() => {
    if (!item.value) {
      return null;
    }
    if (item.value.properties?.defaultPreset) {
      return item.value.properties.defaultPreset;
    }
    return item.value;
  });
  const itemId = computed(() => item.value?.id);
  const { isCraftable, craftableIconClass, craftableTitle, goToCraftStation } =
    useCraftableItem(itemId);
  // Helper functions and data to calculate the item's progress
  // These are passed to the child components via provide/inject
  const currentCount = computed(() => {
    if (selfCompletedNeed.value) {
      return neededCount.value;
    }
    if (props.need.needType == 'taskObjective') {
      return tarkovStore.getObjectiveCount(props.need.id);
    } else if (props.need.needType == 'hideoutModule') {
      return tarkovStore.getHideoutPartCount(props.need.id);
    } else {
      return 0;
    }
  });
  const neededCount = computed(() => {
    if (props.need.needType == 'taskObjective' && props.need.count) {
      return props.need.count;
    } else if (props.need.needType == 'hideoutModule' && props.need.count) {
      return props.need.count;
    } else {
      return 1;
    }
  });
  const relatedTask = computed(() => {
    const need = props.need;
    if (need.needType === 'taskObjective') {
      return tasks.value.find((t) => t.id === need.taskId) ?? null;
    }
    return null;
  });
  const isKappaRequired = computed(() => {
    if (props.need.needType !== 'taskObjective') {
      return false;
    }
    return relatedTask.value?.kappaRequired === true;
  });
  const isLightkeeperRequired = computed(() => {
    if (props.need.needType !== 'taskObjective') {
      return false;
    }
    return relatedTask.value?.lightkeeperRequired === true;
  });
  const isTaskSuccessful = (taskId: string) =>
    tarkovStore.isTaskComplete(taskId) && !tarkovStore.isTaskFailed(taskId);
  const item = computed(() => {
    if (props.need.needType == 'taskObjective') {
      // Prefer the objective's item; fall back to marker item (e.g., beacons/cameras) when present
      if (props.need.item) {
        return props.need.item;
      }
      if (props.need.markerItem) {
        return props.need.markerItem;
      }
      return null;
    } else if (props.need.needType == 'hideoutModule') {
      // For hideout modules, return the associated item
      return props.need.item;
    } else {
      return null;
    }
  });
  const lockedBefore = computed(() => {
    if (props.need.needType == 'taskObjective') {
      if (!relatedTask.value?.parents) return 0;
      return relatedTask.value.parents.filter((s) => !isTaskSuccessful(s)).length;
    } else if (props.need.needType == 'hideoutModule') {
      return props.need.hideoutModule.predecessors.filter(
        (s: string) => !tarkovStore.isHideoutModuleComplete(s)
      ).length;
    } else {
      return 0;
    }
  });
  const selfCompletedNeed = computed(() => {
    if (props.need.needType == 'taskObjective') {
      const alternativeTaskCompleted =
        alternativeTasks.value[props.need.taskId]?.some((altTaskId) =>
          isTaskSuccessful(altTaskId)
        ) ?? false;
      // Only consider the need "completed" when the parent TASK is completed (turned in)
      // Not when just the objective is marked complete - that should still allow adjustments
      return isTaskSuccessful(props.need.taskId) || alternativeTaskCompleted;
    } else if (props.need.needType == 'hideoutModule') {
      // Only consider the need "completed" when the parent MODULE is built
      // Not when just the part is marked complete - that should still allow adjustments
      return progressStore.moduleCompletions?.[props.need.hideoutModule.id]?.['self'] ?? false;
    } else {
      return false;
    }
  });
  const relatedStation = computed(() => {
    const need = props.need;
    if (need.needType === 'hideoutModule') {
      return (
        Object.values(hideoutStations.value).find((s) => s.id === need.hideoutModule.stationId) ??
        null
      );
    }
    return null;
  });
  const levelRequired = computed(() => {
    if (props.need.needType == 'taskObjective') {
      return relatedTask.value?.minPlayerLevel ?? 0;
    } else if (props.need.needType == 'hideoutModule') {
      return 0;
    } else {
      return 0;
    }
  });
  const teamNeeds = computed(() => {
    const needingUsers: NeededItemTeamNeed[] = [];
    // Check if team items should be hidden based on preferences
    if (preferencesStore.itemsTeamAllHidden) {
      return needingUsers;
    }
    // Check FIR preference - if hiding non-FIR and this item is not FIR, hide team needs
    if (preferencesStore.itemsTeamNonFIRHidden && !props.need.foundInRaid) {
      return needingUsers;
    }
    // Check hideout preference - if hiding hideout items and this is a hideout module
    if (preferencesStore.itemsTeamHideoutHidden && props.need.needType === 'hideoutModule') {
      return needingUsers;
    }
    if (props.need.needType == 'taskObjective') {
      // Safely get completions, defaulting to empty object
      const objectiveCompletions = progressStore.objectiveCompletions?.[props.need.id] || {};
      const taskCompletions = progressStore.tasksCompletions?.[props.need.taskId] || {};
      // Find all teammates (not self) that need this objective
      Object.entries(objectiveCompletions).forEach(([user, completed]) => {
        // Skip self - we only want to show teammates
        if (user === 'self') return;
        // Skip if objective is completed or parent task is completed
        if (completed || taskCompletions[user]) return;
        // Get the teammate's store and count
        const teammateStore = progressStore.teamStores?.[user] as
          | { getObjectiveCount?: (id: string) => number }
          | undefined;
        if (teammateStore) {
          needingUsers.push({
            user: user,
            count: teammateStore.getObjectiveCount?.(props.need.id) ?? 0,
          });
        }
      });
    } else if (props.need.needType == 'hideoutModule') {
      // Safely get completions, defaulting to empty object
      const partCompletions = progressStore.modulePartCompletions?.[props.need.id] || {};
      // Find all teammates (not self) that need this module part
      Object.entries(partCompletions).forEach(([user, completed]) => {
        // Skip self - we only want to show teammates
        if (user === 'self') return;
        // Skip if part is completed
        if (completed) return;
        // Get the teammate's store and count
        const teammateStore = progressStore.teamStores?.[user] as
          | { getHideoutPartCount?: (id: string) => number }
          | undefined;
        if (teammateStore) {
          needingUsers.push({
            user: user,
            count: teammateStore.getHideoutPartCount?.(props.need.id) ?? 0,
          });
        }
      });
    }
    return needingUsers;
  });
  // Check if the parent task/module is completed (for Completed tab display)
  const isParentCompleted = computed(() => {
    if (props.need.needType == 'taskObjective') {
      return progressStore.tasksCompletions?.[props.need.taskId]?.['self'] ?? false;
    } else if (props.need.needType == 'hideoutModule') {
      return progressStore.moduleCompletions?.[props.need.hideoutModule.id]?.['self'] ?? false;
    }
    return false;
  });
  provide(neededItemKey, {
    item,
    relatedTask,
    relatedStation,
    selfCompletedNeed,
    isParentCompleted,
    isKappaRequired,
    isLightkeeperRequired,
    lockedBefore,
    currentCount,
    neededCount,
    levelRequired,
    teamNeeds,
    imageItem,
    craftableIconClass,
    craftableTitle,
    isCraftable,
    goToCraftStation,
    cardStyle: computed(() => props.cardStyle),
  });
</script>
