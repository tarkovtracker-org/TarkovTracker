<template>
  <div
    :id="`objective-${props.objective.id}`"
    :role="isRowInteractive ? 'button' : undefined"
    :tabindex="isRowInteractive ? 0 : undefined"
    :aria-label="isRowInteractive ? objectiveAriaLabel : undefined"
    :aria-disabled="isRowInteractive ? undefined : true"
    class="group w-full rounded-md px-2 py-2 transition-colors"
    :class="[
      isComplete ? 'bg-success-500/10' : '',
      isRowInteractive
        ? 'focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 cursor-pointer hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-offset-2'
        : 'opacity-80',
    ]"
    @click="handleRowClick"
    @keydown.enter.self="handleRowClick"
    @keydown.space.prevent.self="handleRowClick"
    @mouseenter="objectiveMouseEnter()"
    @mouseleave="objectiveMouseLeave()"
  >
    <div :class="hasBuildWeaponItemRows ? 'space-y-2' : undefined">
      <div class="flex w-full items-start" :class="hasBuildWeaponItemRows ? 'gap-2' : 'gap-4'">
        <UIcon
          :name="objectiveIcon.startsWith('mdi-') ? `i-${objectiveIcon}` : objectiveIcon"
          aria-hidden="true"
          class="h-4 w-4 shrink-0"
          :class="[
            hasBuildWeaponItemRows ? 'mt-0.5' : 'mt-1.5',
            isComplete
              ? 'text-success-300'
              : isParentTaskLocked
                ? 'text-surface-400'
                : 'text-surface-300 group-hover:text-surface-200',
          ]"
        />
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <div class="text-surface-100 min-w-0 text-sm leading-5">
              {{ props.objective.description }}
              <AppTooltip
                v-if="objectiveModeCountDifference"
                :text="objectiveModeCountDifferenceText"
              >
                <UBadge
                  variant="soft"
                  size="xs"
                  class="ml-1 text-[10px] font-semibold uppercase"
                  :class="currentModeBadgeClass"
                >
                  {{ currentModeBadgeLabel }}
                </UBadge>
              </AppTooltip>
              <span
                v-if="props.objective.optional"
                class="text-warning-300 ml-1 text-[10px] font-semibold uppercase"
              >
                ({{ t('common.optional') }})
              </span>
            </div>
            <div class="flex shrink-0 items-center gap-2" @click.stop>
              <AppTooltip v-if="hasMapLocation" :text="t('page.tasks.questcard.jump_to_map')">
                <button
                  type="button"
                  class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 text-surface-300 flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  :class="
                    isJumpToMapDisabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-white/10'
                  "
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
                :text="isComplete ? t('page.tasks.questcard.uncomplete') : t('common.complete')"
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
          <template v-if="!hasBuildWeaponItemRows">
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
              <div class="text-surface-500 inline-flex items-center gap-1 text-[11px]">
                <UIcon
                  name="i-mdi-account-multiple-outline"
                  aria-hidden="true"
                  class="h-3.5 w-3.5"
                />
                <span>{{ userNeeds.length }}</span>
              </div>
            </AppTooltip>
          </template>
        </div>
      </div>
      <div v-if="hasBuildWeaponItemRows" class="space-y-1.5 pl-6">
        <div
          v-for="row in buildWeaponRequiredItems"
          :key="row.progressId"
          class="flex w-full max-w-full items-center gap-1.5 rounded-md border px-1.5 py-1 transition-colors"
          :class="[
            isBuildWeaponRowComplete(row)
              ? 'border-success-500/50 bg-success-500/10'
              : 'border-white/10 bg-white/5',
            isParentTaskLocked ? 'opacity-70' : '',
          ]"
          @click.stop
        >
          <ObjectiveItemDisplay
            :primary-item="row.item"
            :fallback-name="row.item.name || row.item.shortName || t('common.item', 'Item')"
            :paused="isParentTaskLocked"
          />
          <div class="ml-auto">
            <ObjectiveCountControls
              :current-count="getBuildWeaponRowCount(row)"
              :needed-count="row.neededCount"
              :is-complete="isBuildWeaponRowComplete(row)"
              :disabled="isParentTaskLocked"
              @decrease="decreaseBuildWeaponRowCount(row)"
              @increase="increaseBuildWeaponRowCount(row)"
              @toggle="toggleBuildWeaponRowCount(row)"
              @set-count="(value) => setBuildWeaponRowCount(row, value)"
            />
          </div>
        </div>
      </div>
      <template v-if="hasBuildWeaponItemRows">
        <ObjectiveRequiredItems
          v-if="objectiveRequiredKeys.length"
          variant="keys"
          :required-keys="objectiveRequiredKeys"
          class="ml-6"
        />
        <ObjectiveRequiredItems
          v-if="objectiveEquipment.length"
          variant="equipment"
          :equipment="objectiveEquipment"
          class="ml-6"
        />
        <AppTooltip
          v-if="userHasTeam && activeUserView === 'all' && userNeeds.length > 0"
          :text="userNeedsTitle"
        >
          <div class="text-surface-500 ml-6 inline-flex items-center gap-1 text-[11px]">
            <UIcon name="i-mdi-account-multiple-outline" aria-hidden="true" class="h-3.5 w-3.5" />
            <span>{{ userNeeds.length }}</span>
          </div>
        </AppTooltip>
      </template>
    </div>
  </div>
</template>
<script setup lang="ts">
  import ObjectiveCountControls from '@/features/tasks/ObjectiveCountControls.vue';
  import ObjectiveItemDisplay from '@/features/tasks/ObjectiveItemDisplay.vue';
  import ObjectiveRequiredItems from '@/features/tasks/ObjectiveRequiredItems.vue';
  import {
    isMapViewKey,
    jumpToMapObjectiveKey,
    trackTaskProgressInteractionKey,
  } from '@/features/tasks/task-context';
  import {
    getBuildWeaponRequiredItems,
    type BuildWeaponRequiredItem,
  } from '@/features/tasks/task-objective-build-weapon';
  import { OBJECTIVE_ICON_MAP } from '@/features/tasks/task-objective-constants';
  import { getObjectiveEquipmentItems } from '@/features/tasks/task-objective-equipment';
  import { objectiveHasMapLocation } from '@/features/tasks/task-objective-helpers';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useProgressStore } from '@/stores/useProgress';
  import { useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { GAME_MODES } from '@/utils/constants';
  import type { TaskObjective } from '@/types/tarkov';
  const FALLBACK_IS_MAP_VIEW_REF = ref(false);
  const { t } = useI18n({ useScope: 'global' });
  const jumpToMapObjective = inject(jumpToMapObjectiveKey, null);
  const isMapView = inject(isMapViewKey, FALLBACK_IS_MAP_VIEW_REF);
  const trackTaskProgressInteraction = inject(trackTaskProgressInteractionKey, null);
  const { systemStore } = useSystemStoreWithSupabase();
  const props = defineProps<{
    objective: TaskObjective;
  }>();
  const metadataStore = useMetadataStore();
  const objectives = computed(() => metadataStore.objectives);
  const tarkovStore = useTarkovStore();
  const progressStore = useProgressStore();
  const preferencesStore = usePreferencesStore();
  const activeUserView = computed(() => preferencesStore.getTaskUserView);
  const userHasTeam = computed(() => !!systemStore.userTeam);
  const isComplete = computed(() => tarkovStore.isTaskObjectiveComplete(props.objective.id));
  const objectiveLabel = computed(() => props.objective.description || t('common.objective'));
  const toggleObjectiveLabel = computed(() => {
    const actionLabel = isComplete.value
      ? t('page.tasks.questcard.uncomplete')
      : t('common.complete');
    return `${actionLabel}: ${objectiveLabel.value}`;
  });
  const objectiveAriaLabel = computed(() => {
    const optionalPrefix = props.objective.optional ? `${t('common.optional')}. ` : '';
    const status = isComplete.value
      ? t('common.completed')
      : t('page.tasks.questcard.not_completed');
    const toggleAction = isComplete.value
      ? t('page.tasks.questcard.uncomplete')
      : t('common.complete');
    return `${optionalPrefix}${objectiveLabel.value}. ${status}. ${toggleAction}.`;
  });
  const fullObjective = computed(() => objectives.value.find((o) => o.id == props.objective.id));
  const objectiveRequiredKeys = computed(() => {
    const keys = fullObjective.value?.requiredKeys ?? props.objective.requiredKeys;
    return (keys ?? []).filter((group) => group.length > 0);
  });
  const objectiveEquipment = computed(() =>
    getObjectiveEquipmentItems(fullObjective.value ?? props.objective)
  );
  const buildWeaponRequiredItems = computed(() =>
    getBuildWeaponRequiredItems(fullObjective.value ?? props.objective)
  );
  const hasBuildWeaponItemRows = computed(() => buildWeaponRequiredItems.value.length > 0);
  const parentTaskId = computed(() => fullObjective.value?.taskId ?? props.objective.taskId);
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
  const isParentTaskLocked = computed(() => isParentTaskComplete.value || isParentTaskFailed.value);
  const isRowInteractive = computed(
    () => !isParentTaskLocked.value && !hasBuildWeaponItemRows.value
  );
  const userNeeds = computed(() => {
    const needingUsers: string[] = [];
    if (!fullObjective.value) return needingUsers;
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
  const userNeedsTitle = computed(() =>
    userNeeds.value
      .map((id) => progressStore.getDisplayName(id))
      .filter((name): name is string => typeof name === 'string' && name.length > 0)
      .join(', ')
  );
  const isHovered = ref(false);
  const objectiveMouseEnter = () => {
    if (!isParentTaskLocked.value) isHovered.value = true;
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
  const objectiveModeCountDifference = computed(() =>
    metadataStore.getObjectiveModeCountDifference(props.objective.id)
  );
  const currentGameMode = computed(() => tarkovStore.getCurrentGameMode());
  const currentModeBadgeLabel = computed(() => {
    if (currentGameMode.value === GAME_MODES.PVE) return t('common.pve', 'PvE');
    if (currentGameMode.value === GAME_MODES.SEASONAL) {
      return t('common.seasonal_pvp', 'Seasonal PvP');
    }
    return t('common.pvp', 'PvP');
  });
  const currentModeBadgeClass = computed(() => {
    if (currentGameMode.value === GAME_MODES.PVE) {
      return 'border border-pve-500/30 bg-pve-700/25 text-pve-200';
    }
    if (currentGameMode.value === GAME_MODES.SEASONAL) {
      return 'border border-warning-500/30 bg-warning-700/20 text-warning-200';
    }
    return 'border border-pvp-500/30 bg-pvp-700/25 text-pvp-200';
  });
  const objectiveModeCountDifferenceText = computed(() => {
    const difference = objectiveModeCountDifference.value;
    if (!difference) return '';
    return `${t('common.pvp')} ${difference.pvp} • ${t('common.pve')} ${difference.pve}`;
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
  const trackDashboardFocusProgress = () => {
    const taskId = parentTaskId.value;
    if (!taskId) return;
    trackTaskProgressInteraction?.(taskId, 'objective_progress');
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
    trackDashboardFocusProgress();
  };
  const currentObjectiveCount = computed(() => tarkovStore.getObjectiveCount(props.objective.id));
  watch(isComplete, (newVal) => {
    if (newVal && neededCount.value > 1) {
      tarkovStore.setObjectiveCount(props.objective.id, neededCount.value);
    }
  });
  // fallow-ignore-next-line complexity
  const applyObjectiveCount = (progressId: string, requiredCount: number, newCount: number) => {
    if (isParentTaskLocked.value) return;
    const clampedCount = Math.max(0, Math.min(requiredCount, newCount));
    tarkovStore.setObjectiveCount(progressId, clampedCount);
    const complete = tarkovStore.isTaskObjectiveComplete(progressId);
    if (clampedCount >= requiredCount && !complete) {
      tarkovStore.setTaskObjectiveComplete(progressId);
    } else if (clampedCount < requiredCount && complete) {
      tarkovStore.setTaskObjectiveUncomplete(progressId);
    }
    trackDashboardFocusProgress();
  };
  const decreaseCount = () => {
    const currentCount = currentObjectiveCount.value;
    if (currentCount > 0) {
      applyObjectiveCount(props.objective.id, neededCount.value, currentCount - 1);
    }
  };
  const increaseCount = () => {
    const currentCount = currentObjectiveCount.value;
    if (currentCount < neededCount.value) {
      applyObjectiveCount(props.objective.id, neededCount.value, currentCount + 1);
    }
  };
  const toggleCount = () => {
    const currentCount = currentObjectiveCount.value;
    const requiredCount = neededCount.value;
    if (currentCount >= requiredCount) {
      applyObjectiveCount(props.objective.id, requiredCount, Math.max(0, requiredCount - 1));
      return;
    }
    applyObjectiveCount(props.objective.id, requiredCount, requiredCount);
  };
  const setCount = (newCount: number) => {
    applyObjectiveCount(props.objective.id, neededCount.value, newCount);
  };
  const getBuildWeaponRowCount = (row: BuildWeaponRequiredItem) =>
    tarkovStore.getObjectiveCount(row.progressId);
  const isBuildWeaponRowComplete = (row: BuildWeaponRequiredItem) =>
    tarkovStore.isTaskObjectiveComplete(row.progressId);
  const applyBuildWeaponRowCount = (row: BuildWeaponRequiredItem, newCount: number) => {
    applyObjectiveCount(row.progressId, row.neededCount, newCount);
  };
  const decreaseBuildWeaponRowCount = (row: BuildWeaponRequiredItem) => {
    const currentCount = getBuildWeaponRowCount(row);
    if (currentCount > 0) {
      applyBuildWeaponRowCount(row, currentCount - 1);
    }
  };
  const increaseBuildWeaponRowCount = (row: BuildWeaponRequiredItem) => {
    const currentCount = getBuildWeaponRowCount(row);
    if (currentCount < row.neededCount) {
      applyBuildWeaponRowCount(row, currentCount + 1);
    }
  };
  const toggleBuildWeaponRowCount = (row: BuildWeaponRequiredItem) => {
    const currentCount = getBuildWeaponRowCount(row);
    if (currentCount >= row.neededCount) {
      applyBuildWeaponRowCount(row, Math.max(0, row.neededCount - 1));
      return;
    }
    applyBuildWeaponRowCount(row, row.neededCount);
  };
  const setBuildWeaponRowCount = (row: BuildWeaponRequiredItem, newCount: number) => {
    applyBuildWeaponRowCount(row, newCount);
  };
</script>
