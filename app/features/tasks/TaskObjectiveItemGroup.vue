<template>
  <div class="space-y-2 px-2">
    <div class="grid grid-cols-[16px_1fr] items-center gap-2">
      <UIcon :name="`i-${iconName}`" aria-hidden="true" class="h-4 w-4 text-gray-400" />
      <div class="min-w-0">
        <div class="text-sm font-medium text-gray-100">{{ title }}</div>
      </div>
    </div>
    <div class="flex flex-wrap gap-2 pl-6">
      <div
        v-for="row in consolidatedRows"
        :id="getRowObjectiveIds(row)[0] ? `objective-${getRowObjectiveIds(row)[0]}` : undefined"
        :key="row.itemKey"
        :data-objective-ids="getRowObjectiveIds(row).join(',')"
        class="flex max-w-full items-center gap-2 rounded-md border px-2 py-1 transition-colors"
        :class="[
          row.allComplete
            ? 'border-success-500/50 bg-success-500/10'
            : 'border-white/10 bg-white/5',
          isParentTaskLocked ? 'opacity-70' : '',
        ]"
      >
        <img
          v-if="row.meta.itemIcon"
          :src="row.meta.itemIcon"
          :alt="row.meta.itemName"
          class="h-16 w-16 shrink-0 rounded-sm object-contain"
        />
        <AppTooltip :text="row.meta.itemName">
          <span class="max-w-48 truncate text-xs font-medium text-gray-100">
            {{ row.meta.itemName }}
          </span>
        </AppTooltip>
        <span
          v-if="row.meta.foundInRaid"
          class="rounded bg-yellow-500/10 px-1 py-0.5 text-[10px] font-semibold text-yellow-300"
        >
          FiR
        </span>
        <!-- Jump To Map button (only shown when in maps view and any objective has actionable coordinates) -->
        <AppTooltip
          v-if="rowHasMapLocation(row)"
          :text="t('page.tasks.questcard.jumpToMap', 'Jump To Map')"
        >
          <button
            type="button"
            class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-gray-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            :class="
              isJumpToMapDisabledForRow(row) ? 'cursor-not-allowed opacity-50' : 'hover:bg-white/10'
            "
            :aria-label="t('page.tasks.questcard.jumpToMap', 'Jump To Map')"
            :disabled="isJumpToMapDisabledForRow(row)"
            @click.stop="onJumpToMapClick($event, row)"
          >
            <UIcon name="i-mdi-map-marker" aria-hidden="true" class="h-4 w-4" />
          </button>
        </AppTooltip>
        <!-- Single set of controls per item - updates all related objectives together -->
        <ObjectiveCountControls
          v-if="row.meta.neededCount > 1"
          :current-count="row.currentCount"
          :needed-count="row.meta.neededCount"
          :disabled="isParentTaskLocked"
          @decrease="decreaseCountForRow(row)"
          @increase="increaseCountForRow(row)"
          @toggle="toggleCountForRow(row)"
          @set-count="(value) => setCountForRow(row, value)"
        />
        <button
          v-else
          type="button"
          class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 flex h-7 w-7 items-center justify-center rounded-md border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
          :aria-label="
            row.allComplete
              ? t('page.tasks.questcard.uncomplete', 'Uncomplete')
              : t('page.tasks.questcard.complete', 'Complete')
          "
          :aria-pressed="row.allComplete"
          :disabled="isParentTaskLocked"
          :class="
            row.allComplete
              ? 'bg-success-600 border-success-500 hover:bg-success-500 text-white disabled:opacity-60'
              : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-60'
          "
          @click="toggleCountForRow(row)"
        >
          <UIcon
            :name="row.allComplete ? 'i-mdi-check' : 'i-mdi-circle-outline'"
            aria-hidden="true"
            class="h-4 w-4"
          />
        </button>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { computed, inject, type ComputedRef } from 'vue';
  import { useI18n } from 'vue-i18n';
  import ObjectiveCountControls from '@/features/tasks/ObjectiveCountControls.vue';
  import { objectiveHasMapLocation } from '@/features/tasks/task-objective-helpers';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useTarkovStore } from '@/stores/useTarkov';
  import type { TaskObjective } from '@/types/tarkov';
  // Inject functions from tasks.vue for map integration
  const jumpToMapObjective = inject<((id: string) => void) | null>('jumpToMapObjective', null);
  const isMapView = inject<ComputedRef<boolean> | null>('isMapView', null);
  const props = defineProps<{
    title: string;
    iconName: string;
    objectives: TaskObjective[];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  type ObjectiveMeta = {
    neededCount: number;
    currentCount: number;
    itemName: string;
    itemIcon?: string;
    foundInRaid: boolean;
  };
  type ObjectiveRow = {
    objective: TaskObjective;
    meta: ObjectiveMeta;
  };
  // Consolidated row groups objectives by item ID
  type ConsolidatedRow = {
    itemKey: string;
    meta: ObjectiveMeta;
    objectives: ObjectiveRow[];
    allComplete: boolean;
    currentCount: number;
  };
  const fullObjectives = computed(() => metadataStore.objectives);
  const objectiveMetaById = computed<Record<string, ObjectiveMeta>>(() => {
    const map: Record<string, ObjectiveMeta> = {};
    props.objectives.forEach((objective) => {
      const full = fullObjectives.value.find((o) => o.id === objective.id) as
        | TaskObjective
        | undefined;
      const neededCount = (full?.count ?? objective.count ?? 1) as number;
      const currentCount = tarkovStore.getObjectiveCount(objective.id);
      // Use item, markerItem, or questItem (quest items use questItem)
      const item =
        full?.item ||
        full?.items?.[0] ||
        full?.markerItem ||
        full?.questItem ||
        objective.item ||
        objective.items?.[0] ||
        objective.markerItem ||
        objective.questItem;
      // Prefer defaultPreset image for weapons (shows full gun instead of bare receiver)
      const imageItem = item?.properties?.defaultPreset || item;
      const image8xLink = imageItem?.image8xLink;
      map[objective.id] = {
        neededCount,
        currentCount,
        itemName:
          item?.shortName ||
          item?.name ||
          objective.description ||
          t('page.tasks.questcard.item', 'Item'),
        itemIcon: imageItem?.iconLink || imageItem?.image512pxLink || image8xLink,
        foundInRaid: full?.foundInRaid === true || objective.foundInRaid === true,
      };
    });
    return map;
  });
  const objectiveRows = computed<ObjectiveRow[]>(() => {
    return props.objectives.map((objective) => {
      const fallback: ObjectiveMeta = {
        neededCount: objective.count ?? 1,
        currentCount: tarkovStore.getObjectiveCount(objective.id),
        itemName: objective.description || t('page.tasks.questcard.item', 'Item'),
        itemIcon: undefined,
        foundInRaid: objective.foundInRaid === true,
      };
      return { objective, meta: objectiveMetaById.value[objective.id] ?? fallback };
    });
  });
  // Consolidate objectives by item ID - show one card per unique item
  const consolidatedRows = computed<ConsolidatedRow[]>(() => {
    const itemMap = new Map<string, ConsolidatedRow>();
    objectiveRows.value.forEach((row) => {
      // Use item, markerItem, or questItem ID (quest items use questItem)
      const itemId =
        row.objective.item?.id ||
        row.objective.items?.[0]?.id ||
        row.objective.markerItem?.id ||
        row.objective.questItem?.id;
      const foundInRaid = row.meta.foundInRaid;
      // Use item ID + foundInRaid as key, fallback to objective ID if no item
      const key = itemId ? `${itemId}:${foundInRaid ? 1 : 0}` : row.objective.id;
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          itemKey: key,
          meta: { ...row.meta }, // Initial meta, will be aggregated below
          objectives: [],
          allComplete: true,
          currentCount: 0,
        });
      }
      const consolidated = itemMap.get(key)!;
      consolidated.objectives.push(row);
    });
    // Second pass to aggregate values
    // For find+give pairs, only count the "give" objectives since "find" is a passive check
    const findTypes = new Set(['findItem', 'findQuestItem']);
    const giveTypes = new Set(['giveItem', 'giveQuestItem']);
    return Array.from(itemMap.values()).map((consolidated) => {
      let allComplete = true;
      const firstRow = consolidated.objectives[0];
      if (!firstRow) return consolidated;
      // Separate objectives by type
      const findObjectives = consolidated.objectives.filter((row) =>
        findTypes.has(row.objective.type ?? '')
      );
      const giveObjectives = consolidated.objectives.filter((row) =>
        giveTypes.has(row.objective.type ?? '')
      );
      // Determine which objectives to count for the total
      // If we have give objectives, use those (find is just a passive check)
      // If we only have find objectives, use those
      const objectivesToCount =
        giveObjectives.length > 0
          ? giveObjectives
          : findObjectives.length > 0
            ? findObjectives
            : consolidated.objectives;
      let totalCurrent = 0;
      let totalNeeded = 0;
      objectivesToCount.forEach((row) => {
        totalCurrent += row.meta.currentCount;
        totalNeeded += row.meta.neededCount;
      });
      // Check completion status across ALL objectives (both find and give must be complete)
      consolidated.objectives.forEach((row) => {
        if (!isObjectiveComplete(row.objective.id)) {
          allComplete = false;
        }
      });
      return {
        ...consolidated,
        allComplete,
        currentCount: totalCurrent,
        meta: {
          ...firstRow.meta,
          neededCount: totalNeeded,
          currentCount: totalCurrent,
        },
      };
    });
  });
  /**
   * Gets all objective IDs from a consolidated row.
   * Used for highlighting and data attributes.
   */
  const getRowObjectiveIds = (row: ConsolidatedRow): string[] => {
    return row.objectives.map((objRow) => objRow.objective.id);
  };
  const rowHasMapLocation = (row: ConsolidatedRow): boolean => {
    if (!isMapView?.value) return false;
    return row.objectives.some((objRow) => {
      const fullObj = fullObjectives.value.find((o) => o.id === objRow.objective.id);
      return objectiveHasMapLocation(objRow.objective, fullObj);
    });
  };
  /**
   * Finds an objective with map location data from a consolidated row for jumping.
   * Prefers incomplete objectives, but returns completed ones if view shows them.
   */
  const getMapObjectiveId = (row: ConsolidatedRow): string | null => {
    if (!isMapView?.value) return null;
    const showCompleted = ['completed', 'all'].includes(preferencesStore.getTaskSecondaryView);
    let fallbackCompleteId: string | null = null;
    for (const objRow of row.objectives) {
      const obj = objRow.objective;
      const fullObj = fullObjectives.value.find((o) => o.id === obj.id);
      if (!objectiveHasMapLocation(obj, fullObj)) continue;
      const isComplete = tarkovStore.isTaskObjectiveComplete(obj.id);
      if (!isComplete) {
        return obj.id;
      }
      if (showCompleted && !fallbackCompleteId) {
        fallbackCompleteId = obj.id;
      }
    }
    return fallbackCompleteId;
  };
  // Check if current view shows completed objectives on map
  const shouldShowCompletedOnMap = computed(() =>
    ['completed', 'all'].includes(preferencesStore.getTaskSecondaryView)
  );
  /**
   * Checks if the "Jump to Map" button should be disabled for a row.
   * Disabled when all objectives with map location are complete AND current view doesn't show completed markers.
   */
  const isJumpToMapDisabledForRow = (row: ConsolidatedRow): boolean => {
    const hasLocation = rowHasMapLocation(row);
    const hasIncompleteWithLocation = getMapObjectiveId(row) !== null;
    // If there's an incomplete objective with location, always enabled
    if (hasIncompleteWithLocation) return false;
    // If all are complete, only disable if current view doesn't show completed
    return hasLocation && !shouldShowCompletedOnMap.value;
  };
  const onJumpToMapClick = (event: MouseEvent, row: ConsolidatedRow) => {
    const objectiveId = getMapObjectiveId(row);
    if (objectiveId) {
      (event.currentTarget as HTMLElement)?.blur();
      if (jumpToMapObjective) {
        jumpToMapObjective(objectiveId);
      }
    }
  };
  const isObjectiveComplete = (objectiveId: string) => {
    return tarkovStore.isTaskObjectiveComplete(objectiveId);
  };
  const getObjectiveTaskId = (objective: TaskObjective): string | undefined => {
    return (
      objective.taskId ?? fullObjectives.value.find((entry) => entry.id === objective.id)?.taskId
    );
  };
  const parentTaskIds = computed(() => {
    const ids = new Set<string>();
    props.objectives.forEach((objective) => {
      const taskId = getObjectiveTaskId(objective);
      if (taskId) {
        ids.add(taskId);
      }
    });
    return Array.from(ids);
  });
  const isParentTaskComplete = computed(() => {
    return parentTaskIds.value.some(
      (taskId) => tarkovStore.isTaskComplete(taskId) && !tarkovStore.isTaskFailed(taskId)
    );
  });
  const isParentTaskFailed = computed(() => {
    return parentTaskIds.value.some((taskId) => tarkovStore.isTaskFailed(taskId));
  });
  const isParentTaskLocked = computed(() => {
    return isParentTaskComplete.value || isParentTaskFailed.value;
  });
  // Update all objectives in a row together
  const decreaseCountForRow = (row: ConsolidatedRow) => {
    if (isParentTaskLocked.value) return;
    if (row.currentCount <= 0) return;
    // Find the last objective with progress and decrement it
    for (let i = row.objectives.length - 1; i >= 0; i--) {
      const obj = row.objectives[i];
      if (!obj) continue;
      if (obj.meta.currentCount > 0) {
        const newCount = obj.meta.currentCount - 1;
        tarkovStore.setObjectiveCount(obj.objective.id, newCount);
        if (newCount < obj.meta.neededCount && isObjectiveComplete(obj.objective.id)) {
          tarkovStore.setTaskObjectiveUncomplete(obj.objective.id);
        }
        break;
      }
    }
  };
  const increaseCountForRow = (row: ConsolidatedRow) => {
    if (isParentTaskLocked.value) return;
    if (row.currentCount >= row.meta.neededCount) return;
    // Find the first objective that isn't complete and increment it
    for (const obj of row.objectives) {
      if (obj.meta.currentCount < obj.meta.neededCount) {
        const newCount = obj.meta.currentCount + 1;
        tarkovStore.setObjectiveCount(obj.objective.id, newCount);
        if (newCount >= obj.meta.neededCount && !isObjectiveComplete(obj.objective.id)) {
          tarkovStore.setTaskObjectiveComplete(obj.objective.id);
        }
        break;
      }
    }
  };
  const toggleCountForRow = (row: ConsolidatedRow) => {
    if (isParentTaskLocked.value) return;
    const isAllComplete = row.allComplete;
    if (isAllComplete) {
      // Set all to 0
      row.objectives.forEach((obj) => {
        tarkovStore.setObjectiveCount(obj.objective.id, 0);
        if (isObjectiveComplete(obj.objective.id)) {
          tarkovStore.setTaskObjectiveUncomplete(obj.objective.id);
        }
      });
    } else {
      // Set all to their needed count
      row.objectives.forEach((obj) => {
        tarkovStore.setObjectiveCount(obj.objective.id, obj.meta.neededCount);
        if (!isObjectiveComplete(obj.objective.id)) {
          tarkovStore.setTaskObjectiveComplete(obj.objective.id);
        }
      });
    }
  };
  /**
   * Set count to a specific value for a consolidated row (from direct input)
   * Distributes the count across objectives in the row
   */
  const setCountForRow = (row: ConsolidatedRow, newCount: number) => {
    if (isParentTaskLocked.value) return;
    const totalNeeded = row.meta.neededCount;
    const clampedCount = Math.max(0, Math.min(totalNeeded, newCount));
    // Distribute the count across objectives
    let remaining = clampedCount;
    row.objectives.forEach((obj) => {
      const objNeeded = obj.meta.neededCount;
      const objCount = Math.min(remaining, objNeeded);
      tarkovStore.setObjectiveCount(obj.objective.id, objCount);
      // Update completion status
      if (objCount >= objNeeded && !isObjectiveComplete(obj.objective.id)) {
        tarkovStore.setTaskObjectiveComplete(obj.objective.id);
      } else if (objCount < objNeeded && isObjectiveComplete(obj.objective.id)) {
        tarkovStore.setTaskObjectiveUncomplete(obj.objective.id);
      }
      remaining -= objCount;
    });
  };
</script>
