<template>
  <div class="space-y-2">
    <div class="grid grid-cols-[16px_1fr] items-start gap-2">
      <UIcon :name="`i-${iconName}`" aria-hidden="true" class="text-surface-400 mt-0.5 h-4 w-4" />
      <div class="min-w-0">
        <div class="text-surface-100 flex items-center gap-1.5 text-sm font-medium">
          {{ title }}
          <span v-if="props.optional" class="text-warning-300 text-[10px] font-semibold uppercase">
            ({{ t('page.tasks.questcard.objective_optional_badge') }})
          </span>
        </div>
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
          <span class="text-surface-100 max-w-48 truncate text-xs font-medium">
            {{ row.meta.itemName }}
          </span>
        </AppTooltip>
        <span
          v-if="row.meta.foundInRaid"
          class="bg-kappa-500/20 text-kappa-300 rounded px-1 py-0.5 text-[10px] font-semibold"
        >
          FiR
        </span>
        <span
          v-if="isRowOptional(row)"
          class="bg-warning-500/20 text-warning-300 rounded px-1 py-0.5 text-[10px] font-semibold uppercase"
        >
          {{ t('page.tasks.questcard.objective_optional_badge') }}
        </span>
        <span
          v-if="isRowReadyToHandOver(row)"
          class="bg-info-500/20 text-info-300 rounded px-1 py-0.5 text-[10px] font-semibold"
        >
          {{ t('page.tasks.questcard.ready_to_hand_over', 'Ready to hand over') }}
        </span>
        <AppTooltip v-if="rowHasMapLocation(row)" :text="t('page.tasks.questcard.jump_to_map')">
          <button
            type="button"
            class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 text-surface-300 flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            :class="
              isJumpToMapDisabledForRow(row) ? 'cursor-not-allowed opacity-50' : 'hover:bg-white/10'
            "
            :aria-label="t('page.tasks.questcard.jump_to_map')"
            :disabled="isJumpToMapDisabledForRow(row)"
            @click.stop="onJumpToMapClick($event, row)"
          >
            <UIcon name="i-mdi-map-marker" aria-hidden="true" class="h-4 w-4" />
          </button>
        </AppTooltip>
        <!-- Single set of controls per item - updates all related objectives together -->
        <ObjectiveCountControls
          :current-count="row.currentCount"
          :needed-count="row.meta.neededCount"
          :is-complete="row.allComplete"
          :disabled="isParentTaskLocked"
          @decrease="decreaseCountForRow(row)"
          @increase="increaseCountForRow(row)"
          @toggle="toggleCountForRow(row)"
          @set-count="(value) => setCountForRow(row, value)"
        />
      </div>
    </div>
    <ObjectiveRequiredItems
      v-if="groupRequiredKeys.length > 0"
      variant="keys"
      :required-keys="groupRequiredKeys"
      class="ml-6"
    />
    <ObjectiveRequiredItems
      v-if="groupEquipment.length > 0"
      variant="equipment"
      :equipment="groupEquipment"
      class="ml-6"
    />
  </div>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import ObjectiveCountControls from '@/features/tasks/ObjectiveCountControls.vue';
  import ObjectiveRequiredItems from '@/features/tasks/ObjectiveRequiredItems.vue';
  import { objectiveHasMapLocation } from '@/features/tasks/task-objective-helpers';
  import { resolveObjectiveItemIcon } from '@/features/tasks/task-objective-item-overrides';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useTarkovStore } from '@/stores/useTarkov';
  import type { TaskObjective, TarkovItem } from '@/types/tarkov';
  const jumpToMapObjective = inject<((id: string) => void) | null>('jumpToMapObjective', null);
  const isMapView = inject<Ref<boolean>>('isMapView', ref(false));
  const props = defineProps<{
    title: string;
    iconName: string;
    objectives: TaskObjective[];
    optional?: boolean;
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
  const findObjectiveTypes = new Set(['findItem', 'findQuestItem']);
  const giveObjectiveTypes = new Set(['giveItem', 'giveQuestItem']);
  // Consolidated row groups objectives by item ID
  type ConsolidatedRow = {
    itemKey: string;
    meta: ObjectiveMeta;
    objectives: ObjectiveRow[];
    countObjectives: ObjectiveRow[];
    allComplete: boolean;
    currentCount: number;
  };
  const fullObjectives = computed(() => metadataStore.objectives);
  const groupRequiredKeys = computed<TarkovItem[][]>(() => {
    const allKeys: TarkovItem[][] = [];
    const seen = new Set<string>();
    for (const objective of props.objectives) {
      const full = fullObjectives.value.find((o) => o.id === objective.id);
      const keys = full?.requiredKeys ?? objective.requiredKeys;
      if (!keys) continue;
      for (const group of keys) {
        if (group.length === 0) continue;
        const groupKey = group
          .map((k) => k.id)
          .sort()
          .join(',');
        if (seen.has(groupKey)) continue;
        seen.add(groupKey);
        allKeys.push(group);
      }
    }
    return allKeys;
  });
  const groupEquipment = computed<TarkovItem[]>(() => {
    const seen = new Set<string>();
    const items: TarkovItem[] = [];
    for (const objective of props.objectives) {
      const full = fullObjectives.value.find((o) => o.id === objective.id);
      const marker = full?.markerItem ?? objective.markerItem;
      if (!marker?.id || seen.has(marker.id)) continue;
      seen.add(marker.id);
      items.push(marker);
    }
    return items;
  });
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
      const image8xLink = imageItem?.image8xLink || item?.image8xLink;
      const itemId = imageItem?.id || item?.id;
      const overrideItemIcon = resolveObjectiveItemIcon(itemId);
      map[objective.id] = {
        neededCount,
        currentCount,
        itemName:
          item?.shortName || item?.name || objective.description || t('page.tasks.questcard.item'),
        itemIcon:
          overrideItemIcon ||
          imageItem?.iconLink ||
          imageItem?.image512pxLink ||
          image8xLink ||
          item?.iconLink ||
          item?.image512pxLink ||
          undefined,
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
        itemName: objective.description || t('page.tasks.questcard.item'),
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
          countObjectives: [],
          allComplete: true,
          currentCount: 0,
        });
      }
      const consolidated = itemMap.get(key)!;
      consolidated.objectives.push(row);
    });
    // Second pass to aggregate values
    // For find+give pairs, only count the "give" objectives since "find" is a passive check
    return Array.from(itemMap.values()).map((consolidated) => {
      let allComplete = true;
      const firstRow = consolidated.objectives[0];
      if (!firstRow) return consolidated;
      // Separate objectives by type
      const findObjectives = consolidated.objectives.filter((row) =>
        findObjectiveTypes.has(row.objective.type ?? '')
      );
      const giveObjectives = consolidated.objectives.filter((row) =>
        giveObjectiveTypes.has(row.objective.type ?? '')
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
        countObjectives: objectivesToCount,
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
  const getRowObjectiveIds = (row: ConsolidatedRow): string[] => {
    return row.objectives.map((objRow) => objRow.objective.id);
  };
  const rowHasGiveObjectives = (row: ConsolidatedRow): boolean => {
    return row.objectives.some((objRow) => giveObjectiveTypes.has(objRow.objective.type ?? ''));
  };
  const isRowReadyToHandOver = (row: ConsolidatedRow): boolean => {
    if (!rowHasGiveObjectives(row)) return false;
    return row.currentCount >= row.meta.neededCount && !row.allComplete;
  };
  const rowHasMapLocation = (row: ConsolidatedRow): boolean => {
    if (!isMapView.value) return false;
    return row.objectives.some((objRow) => {
      const fullObj = fullObjectives.value.find((o) => o.id === objRow.objective.id);
      return objectiveHasMapLocation(objRow.objective, fullObj);
    });
  };
  const getMapObjectiveId = (row: ConsolidatedRow): string | null => {
    if (!isMapView.value) return null;
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
  const shouldShowCompletedOnMap = computed(() =>
    ['completed', 'all'].includes(preferencesStore.getTaskSecondaryView)
  );
  const isJumpToMapDisabledForRow = (row: ConsolidatedRow): boolean => {
    const hasLocation = rowHasMapLocation(row);
    const hasIncompleteWithLocation = getMapObjectiveId(row) !== null;
    if (hasIncompleteWithLocation) return false;
    return hasLocation && !shouldShowCompletedOnMap.value;
  };
  const onJumpToMapClick = (event: MouseEvent, row: ConsolidatedRow) => {
    const objectiveId = getMapObjectiveId(row);
    if (!objectiveId) return;
    (event.currentTarget as HTMLElement | null)?.blur();
    jumpToMapObjective?.(objectiveId);
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
    for (let i = row.countObjectives.length - 1; i >= 0; i--) {
      const obj = row.countObjectives[i];
      if (!obj) continue;
      if (obj.meta.currentCount > 0) {
        const newCount = obj.meta.currentCount - 1;
        tarkovStore.setObjectiveCount(obj.objective.id, newCount);
        break;
      }
    }
  };
  const increaseCountForRow = (row: ConsolidatedRow) => {
    if (isParentTaskLocked.value) return;
    if (row.currentCount >= row.meta.neededCount) return;
    for (const obj of row.countObjectives) {
      if (obj.meta.currentCount < obj.meta.neededCount) {
        const newCount = obj.meta.currentCount + 1;
        tarkovStore.setObjectiveCount(obj.objective.id, newCount);
        break;
      }
    }
  };
  const toggleCountForRow = (row: ConsolidatedRow) => {
    if (isParentTaskLocked.value) return;
    row.objectives.forEach((obj) => {
      if (row.allComplete) {
        if (isObjectiveComplete(obj.objective.id)) {
          tarkovStore.setTaskObjectiveUncomplete(obj.objective.id);
        }
      } else if (!isObjectiveComplete(obj.objective.id)) {
        tarkovStore.setTaskObjectiveComplete(obj.objective.id);
      }
    });
  };
  /**
   * Set count to a specific value for a consolidated row (from direct input)
   * Distributes the count across objectives in the row
   */
  const setCountForRow = (row: ConsolidatedRow, newCount: number) => {
    if (isParentTaskLocked.value) return;
    const totalNeeded = row.meta.neededCount;
    const clampedCount = Math.max(0, Math.min(totalNeeded, newCount));
    let remaining = clampedCount;
    row.countObjectives.forEach((obj) => {
      const objNeeded = obj.meta.neededCount;
      const objCount = Math.min(remaining, objNeeded);
      tarkovStore.setObjectiveCount(obj.objective.id, objCount);
      remaining -= objCount;
    });
  };
  const isRowOptional = (row: ConsolidatedRow): boolean => {
    if (props.optional) return false;
    return row.objectives.every((obj) => obj.objective.optional === true);
  };
</script>
