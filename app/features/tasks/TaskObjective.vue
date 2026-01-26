<template>
  <div
    :id="`objective-${props.objective.id}`"
    class="group focus-within:ring-primary-500 focus-within:ring-offset-surface-900 flex w-full items-center gap-4 rounded-md px-2 py-2 transition-colors focus-within:ring-2 focus-within:ring-offset-2"
    :class="[
      isComplete ? 'bg-success-500/10' : 'hover:bg-white/5',
      isParentTaskLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer',
    ]"
    @click="handleRowClick"
    @mouseenter="objectiveMouseEnter()"
    @mouseleave="objectiveMouseLeave()"
  >
    <UIcon
      :name="objectiveIcon.startsWith('mdi-') ? `i-${objectiveIcon}` : objectiveIcon"
      aria-hidden="true"
      class="h-4 w-4 shrink-0"
      :class="isComplete ? 'text-success-300' : 'text-gray-400 group-hover:text-gray-300'"
    />
    <div class="flex flex-1 flex-wrap items-center gap-2">
      <div class="min-w-0">
        <div class="text-sm leading-5 text-gray-100">
          {{ props.objective?.description }}
        </div>
        <AppTooltip
          v-if="userHasTeam && activeUserView === 'all' && userNeeds.length > 0"
          :text="userNeedsTitle"
        >
          <div class="mt-1 inline-flex items-center gap-1 text-[11px] text-gray-500">
            <UIcon name="i-mdi-account-multiple-outline" aria-hidden="true" class="h-3.5 w-3.5" />
            <span>{{ userNeeds.length }}</span>
          </div>
        </AppTooltip>
      </div>
      <div class="flex items-center gap-2" @click.stop>
        <!-- Jump To Map button (only shown when in maps view and objective has actionable coordinates) -->
        <AppTooltip
          v-if="hasMapLocation"
          :text="t('page.tasks.questcard.jumpToMap', 'Jump To Map')"
        >
          <button
            type="button"
            class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-gray-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            :class="isJumpToMapDisabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-white/10'"
            :aria-label="t('page.tasks.questcard.jumpToMap', 'Jump To Map')"
            :disabled="isJumpToMapDisabled"
            @click.stop="onJumpToMapClick"
          >
            <UIcon name="i-mdi-map-marker" aria-hidden="true" class="h-4 w-4" />
          </button>
        </AppTooltip>
        <ObjectiveCountControls
          v-if="neededCount > 1"
          :current-count="currentObjectiveCount"
          :needed-count="neededCount"
          :disabled="isParentTaskLocked"
          @decrease="decreaseCount"
          @increase="increaseCount"
          @toggle="toggleCount"
          @set-count="setCount"
        />
        <AppTooltip
          v-else
          :text="
            isComplete
              ? t('page.tasks.questcard.uncomplete', 'Uncomplete')
              : t('page.tasks.questcard.complete', 'Complete')
          "
        >
          <button
            type="button"
            class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 flex h-7 w-7 items-center justify-center rounded-md border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
            :aria-label="toggleObjectiveLabel"
            :aria-pressed="isComplete"
            :disabled="isParentTaskLocked"
            :class="
              isComplete
                ? 'bg-success-600 border-success-500 hover:bg-success-500 text-white disabled:opacity-60'
                : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-60'
            "
            @click="toggleObjectiveCompletion()"
          >
            <UIcon
              :name="isComplete ? 'i-mdi-check' : 'i-mdi-circle-outline'"
              aria-hidden="true"
              class="h-4 w-4"
            />
          </button>
        </AppTooltip>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { computed, inject, ref, watch, type ComputedRef } from 'vue';
  import { useI18n } from 'vue-i18n';
  import ObjectiveCountControls from '@/features/tasks/ObjectiveCountControls.vue';
  import { OBJECTIVE_ICON_MAP } from '@/features/tasks/task-objective-constants';
  import { objectiveHasMapLocation } from '@/features/tasks/task-objective-helpers';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useProgressStore } from '@/stores/useProgress';
  import { useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  import { useTarkovStore } from '@/stores/useTarkov';
  import type { TaskObjective } from '@/types/tarkov';
  const { t } = useI18n({ useScope: 'global' });
  // Inject functions from tasks.vue
  const jumpToMapObjective = inject<((id: string) => void) | null>('jumpToMapObjective', null);
  const isMapView = inject<ComputedRef<boolean> | null>('isMapView', null);
  const { systemStore } = useSystemStoreWithSupabase();
  // Define the props for the component
  const props = defineProps<{
    objective: TaskObjective;
  }>();
  const metadataStore = useMetadataStore();
  const objectives = computed(() => metadataStore.objectives);
  const tarkovStore = useTarkovStore();
  const progressStore = useProgressStore();
  const preferencesStore = usePreferencesStore();
  const activeUserView = computed(() => preferencesStore.getTaskUserView);
  // Computed property to check if user has a team (for reactivity)
  const userHasTeam = computed(() => {
    return !!systemStore.userTeam;
  });
  const isComplete = computed(() => {
    return tarkovStore.isTaskObjectiveComplete(props.objective.id);
  });
  const objectiveLabel = computed(() => {
    return props.objective.description || t('page.tasks.questcard.objective', 'Objective');
  });
  const toggleObjectiveLabel = computed(() => {
    const actionLabel = isComplete.value
      ? t('page.tasks.questcard.uncomplete', 'Uncomplete')
      : t('page.tasks.questcard.complete', 'Complete');
    return `${actionLabel}: ${objectiveLabel.value}`;
  });
  const fullObjective = computed(() => {
    return objectives.value.find((o) => o.id == props.objective.id);
  });
  const parentTaskId = computed(() => {
    return fullObjective.value?.taskId ?? props.objective.taskId;
  });
  const isParentTaskComplete = computed(() => {
    const taskId = parentTaskId.value;
    if (!taskId) return false;
    return tarkovStore.isTaskComplete(taskId) && !tarkovStore.isTaskFailed(taskId);
  });
  const isParentTaskFailed = computed(() => {
    const taskId = parentTaskId.value;
    if (!taskId) return false;
    return tarkovStore.isTaskFailed(taskId);
  });
  const isParentTaskLocked = computed(() => {
    return isParentTaskComplete.value || isParentTaskFailed.value;
  });
  const userNeeds = computed(() => {
    const needingUsers: string[] = [];
    if (fullObjective.value == undefined) {
      return needingUsers;
    }
    const taskId = fullObjective.value.taskId;
    if (!taskId) return needingUsers;
    const unlocked = progressStore.unlockedTasks[taskId];
    if (!unlocked) return needingUsers;
    Object.entries(unlocked).forEach(([teamId, isUnlocked]) => {
      if (
        isUnlocked &&
        progressStore.objectiveCompletions?.[props.objective.id]?.[teamId] === false
      ) {
        needingUsers.push(teamId);
      }
    });
    return needingUsers;
  });
  const userNeedsTitle = computed(() => {
    return userNeeds.value
      .map((id) => progressStore.getDisplayName(id))
      .filter((name): name is string => typeof name === 'string' && name.length > 0)
      .join(', ');
  });
  const isHovered = ref(false);
  const objectiveMouseEnter = () => {
    if (isParentTaskLocked.value) return;
    isHovered.value = true;
  };
  const objectiveMouseLeave = () => {
    isHovered.value = false;
  };
  const objectiveIcon = computed(() => {
    if (isHovered.value) {
      return isComplete.value ? 'mdi-close-circle' : 'mdi-check-circle';
    }
    const type = props.objective.type;
    if (type && type in OBJECTIVE_ICON_MAP) {
      return OBJECTIVE_ICON_MAP[type as keyof typeof OBJECTIVE_ICON_MAP];
    }
    return 'mdi-help-circle';
  });
  const neededCount = computed(() => fullObjective.value?.count ?? props.objective.count ?? 1);
  // Check if this objective has map location data (on any map)
  const hasMapLocation = computed(() => {
    if (!isMapView?.value) return false;
    return objectiveHasMapLocation(props.objective, fullObjective.value);
  });
  // Disable "Jump to map" when objective is complete and current view doesn't show completed markers
  const shouldShowCompletedOnMap = computed(() =>
    ['completed', 'all'].includes(preferencesStore.getTaskSecondaryView)
  );
  const isJumpToMapDisabled = computed(() => isComplete.value && !shouldShowCompletedOnMap.value);
  const handleJumpToMap = () => {
    if (jumpToMapObjective) {
      jumpToMapObjective(props.objective.id);
    }
  };
  const onJumpToMapClick = (event: MouseEvent) => {
    if (isJumpToMapDisabled.value) return;
    (event.currentTarget as HTMLElement)?.blur();
    handleJumpToMap();
  };
  const handleRowClick = () => {
    if (isParentTaskLocked.value) return;
    if (neededCount.value > 1) {
      toggleCount();
      return;
    }
    toggleObjectiveCompletion();
  };
  const toggleObjectiveCompletion = () => {
    if (isParentTaskLocked.value) return;
    if (isComplete.value) {
      const currentCount = currentObjectiveCount.value;
      const requiredCount = neededCount.value;
      if (currentCount >= requiredCount) {
        tarkovStore.setObjectiveCount(props.objective.id, Math.max(0, requiredCount - 1));
      }
    }
    tarkovStore.toggleTaskObjectiveComplete(props.objective.id);
  };
  const currentObjectiveCount = computed(() => {
    return tarkovStore.getObjectiveCount(props.objective.id);
  });
  // Watch for objective completion to auto-complete item collection
  watch(isComplete, (newVal) => {
    if (newVal) {
      const requiredCount = neededCount.value;
      if (requiredCount > 1) {
        tarkovStore.setObjectiveCount(props.objective.id, requiredCount);
      }
    }
  });
  const decreaseCount = () => {
    if (isParentTaskLocked.value) return;
    const currentCount = currentObjectiveCount.value;
    if (currentCount > 0) {
      const newCount = currentCount - 1;
      tarkovStore.setObjectiveCount(props.objective.id, newCount);
      // If we drop below needed count and objective was complete, uncomplete it
      const requiredCount = neededCount.value;
      if (newCount < requiredCount && isComplete.value) {
        tarkovStore.setTaskObjectiveUncomplete(props.objective.id);
      }
    }
  };
  const increaseCount = () => {
    if (isParentTaskLocked.value) return;
    const currentCount = currentObjectiveCount.value;
    const requiredCount = neededCount.value;
    if (currentCount < requiredCount) {
      const newCount = currentCount + 1;
      tarkovStore.setObjectiveCount(props.objective.id, newCount);
      if (newCount >= requiredCount && !isComplete.value) {
        tarkovStore.setTaskObjectiveComplete(props.objective.id);
      }
    }
  };
  const toggleCount = () => {
    if (isParentTaskLocked.value) return;
    const currentCount = currentObjectiveCount.value;
    const requiredCount = neededCount.value;
    if (currentCount >= requiredCount) {
      tarkovStore.setObjectiveCount(props.objective.id, Math.max(0, requiredCount - 1));
      if (isComplete.value) {
        tarkovStore.setTaskObjectiveUncomplete(props.objective.id);
      }
    } else {
      tarkovStore.setObjectiveCount(props.objective.id, requiredCount);
      if (!isComplete.value) {
        tarkovStore.setTaskObjectiveComplete(props.objective.id);
      }
    }
  };
  /**
   * Set count to a specific value (from direct input)
   */
  const setCount = (newCount: number) => {
    if (isParentTaskLocked.value) return;
    const requiredCount = neededCount.value;
    // Value is already clamped by the component, but ensure it's valid
    const clampedCount = Math.max(0, Math.min(requiredCount, newCount));
    tarkovStore.setObjectiveCount(props.objective.id, clampedCount);
    // Update completion status based on new count
    if (clampedCount >= requiredCount && !isComplete.value) {
      tarkovStore.setTaskObjectiveComplete(props.objective.id);
    } else if (clampedCount < requiredCount && isComplete.value) {
      tarkovStore.setTaskObjectiveUncomplete(props.objective.id);
    }
  };
</script>
