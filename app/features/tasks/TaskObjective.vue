<template>
  <div
    :id="`objective-${props.objective.id}`"
    role="button"
    :tabindex="isParentTaskLocked ? -1 : 0"
    :aria-label="objectiveAriaLabel"
    :aria-disabled="isParentTaskLocked"
    class="group focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 flex w-full items-start gap-4 rounded-md px-2 py-2 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2"
    :class="[
      isComplete ? 'bg-success-500/10' : 'hover:bg-white/5',
      isParentTaskLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer',
    ]"
    @click="handleRowClick"
    @keydown.enter.self="handleRowClick"
    @keydown.space.prevent.self="handleRowClick"
    @mouseenter="objectiveMouseEnter()"
    @mouseleave="objectiveMouseLeave()"
  >
    <UIcon
      :name="objectiveIcon.startsWith('mdi-') ? `i-${objectiveIcon}` : objectiveIcon"
      aria-hidden="true"
      class="mt-1.5 h-4 w-4 shrink-0"
      :class="
        isComplete
          ? 'text-success-300'
          : isParentTaskLocked
            ? 'text-surface-400'
            : 'text-surface-300 group-hover:text-surface-200'
      "
    />
    <div class="flex flex-1 flex-wrap items-center gap-2">
      <div class="min-w-0">
        <div class="text-surface-100 text-sm leading-5">
          {{ props.objective?.description }}
          <span
            v-if="props.objective.optional"
            class="text-warning-300 ml-1 text-[10px] font-semibold uppercase"
          >
            ({{ t('page.tasks.questcard.objective_optional_badge') }})
          </span>
        </div>
        <ObjectiveRequiredItems
          v-if="objectiveRequiredKeys.length"
          variant="keys"
          :required-keys="objectiveRequiredKeys"
        />
        <ObjectiveRequiredItems
          v-if="objectiveEquipment.length"
          variant="equipment"
          :equipment="objectiveEquipment"
        />
        <AppTooltip
          v-if="userHasTeam && activeUserView === 'all' && userNeeds.length > 0"
          :text="userNeedsTitle"
        >
          <div class="text-surface-500 mt-1 inline-flex items-center gap-1 text-[11px]">
            <UIcon name="i-mdi-account-multiple-outline" aria-hidden="true" class="h-3.5 w-3.5" />
            <span>{{ userNeeds.length }}</span>
          </div>
        </AppTooltip>
      </div>
      <div class="flex items-center gap-2" @click.stop>
        <AppTooltip v-if="hasMapLocation" :text="t('page.tasks.questcard.jump_to_map')">
          <button
            type="button"
            class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 text-surface-300 flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            :class="isJumpToMapDisabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-white/10'"
            :aria-label="t('page.tasks.questcard.jump_to_map')"
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
            isComplete ? t('page.tasks.questcard.uncomplete') : t('page.tasks.questcard.complete')
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
                : 'text-surface-300 border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-60'
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
  import { useI18n } from 'vue-i18n';
  import ObjectiveCountControls from '@/features/tasks/ObjectiveCountControls.vue';
  import ObjectiveRequiredItems from '@/features/tasks/ObjectiveRequiredItems.vue';
  import { OBJECTIVE_ICON_MAP } from '@/features/tasks/task-objective-constants';
  import { objectiveHasMapLocation } from '@/features/tasks/task-objective-helpers';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useProgressStore } from '@/stores/useProgress';
  import { useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  import { useTarkovStore } from '@/stores/useTarkov';
  import type { TarkovItem, TaskObjective } from '@/types/tarkov';
  const FALLBACK_IS_MAP_VIEW_REF = ref(false);
  const { t } = useI18n({ useScope: 'global' });
  const jumpToMapObjective = inject<((id: string) => void) | null>('jumpToMapObjective', null);
  const isMapView = inject<Ref<boolean>>('isMapView', FALLBACK_IS_MAP_VIEW_REF);
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
    return props.objective.description || t('page.tasks.questcard.objective');
  });
  const toggleObjectiveLabel = computed(() => {
    const actionLabel = isComplete.value
      ? t('page.tasks.questcard.uncomplete')
      : t('page.tasks.questcard.complete');
    return `${actionLabel}: ${objectiveLabel.value}`;
  });
  const objectiveAriaLabel = computed(() => {
    const optionalPrefix = props.objective.optional
      ? `${t('page.tasks.questcard.objective_optional_badge')}. `
      : '';
    const status = isComplete.value
      ? t('page.tasks.questcard.completed')
      : t('page.tasks.questcard.not_completed');
    const toggleAction = isComplete.value
      ? t('page.tasks.questcard.uncomplete')
      : t('page.tasks.questcard.complete');
    return `${optionalPrefix}${objectiveLabel.value}. ${status}. ${toggleAction}.`;
  });
  const fullObjective = computed(() => {
    return objectives.value.find((o) => o.id == props.objective.id);
  });
  const objectiveRequiredKeys = computed(() => {
    const keys = fullObjective.value?.requiredKeys ?? props.objective.requiredKeys;
    return (keys ?? []).filter((group) => group.length > 0);
  });
  const objectiveEquipment = computed(() => {
    const obj = fullObjective.value ?? props.objective;
    const items: TarkovItem[] = [];
    if (obj.markerItem?.id) items.push(obj.markerItem);
    if (obj.items?.length) items.push(...obj.items);
    if (obj.questItem?.id) items.push(obj.questItem);
    if (obj.useAny?.length) items.push(...obj.useAny);
    if (obj.usingWeapon?.id) items.push(obj.usingWeapon);
    if (obj.usingWeaponMods?.length) items.push(...obj.usingWeaponMods);
    if (obj.wearing?.length) items.push(...obj.wearing);
    const seenItemIds = new Set<TarkovItem['id']>();
    const uniqueItems: TarkovItem[] = [];
    for (const item of items) {
      if (!item?.id || seenItemIds.has(item.id)) continue;
      seenItemIds.add(item.id);
      uniqueItems.push(item);
    }
    return uniqueItems;
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
  const hasMapLocation = computed(() => {
    if (!isMapView.value) return false;
    return objectiveHasMapLocation(props.objective, fullObjective.value);
  });
  const shouldShowCompletedOnMap = computed(() =>
    ['completed', 'all'].includes(preferencesStore.getTaskSecondaryView)
  );
  const isJumpToMapDisabled = computed(() => isComplete.value && !shouldShowCompletedOnMap.value);
  const onJumpToMapClick = (event: MouseEvent) => {
    if (isJumpToMapDisabled.value) return;
    (event.currentTarget as HTMLElement | null)?.blur();
    jumpToMapObjective?.(props.objective.id);
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
