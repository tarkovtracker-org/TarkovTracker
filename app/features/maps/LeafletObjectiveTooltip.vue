<template>
  <div data-testid="objective-popup" class="flex flex-col text-left" :class="rootClass">
    <ObjectivePopupHeader
      :task-name="taskName"
      :wiki-url="taskWikiUrl"
      :tarkov-dev-url="taskTarkovDevUrl"
      :trader-name="trader.name"
      :trader-image="trader.image"
      :level-label="levelLabel"
      :compact="isCompact"
      :translate="translate"
      @close="emitClose"
    />
    <div v-if="!objective" class="text-surface-400 text-xs">
      {{ translate('maps.tooltip.objective_unavailable') }}
    </div>
    <ObjectivePopupDetails
      v-else
      :glyph-kind="glyphKind"
      :description="objective.description ?? ''"
      :complete="isComplete"
      :found-in-raid="objective.foundInRaid === true"
      :item="itemDetails"
      :key-labels="keyLabels"
      :progress="readOnly ? null : progress"
      :compact="isCompact"
      :translate="translate"
    />
    <div class="flex items-center gap-1.5">
      <button
        v-if="!readOnly"
        type="button"
        data-testid="objective-complete-toggle"
        :class="completeButtonClass"
        :aria-label="completeToggle.label"
        :title="isCompact ? completeToggle.label : undefined"
        :aria-pressed="isComplete"
        :disabled="isToggleDisabled"
        @click.stop="toggleObjective"
      >
        <UIcon :name="completeToggle.icon" class="h-4 w-4 shrink-0" />
        <span v-if="!isCompact">{{ completeToggle.label }}</span>
      </button>
      <button
        type="button"
        data-testid="objective-go-to"
        :class="secondaryButtonClass"
        :aria-label="translate('maps.tooltip.go_to_in_task_list')"
        :title="translate('maps.tooltip.go_to_in_task_list')"
        @click.stop="scrollToObjective"
      >
        <UIcon name="i-mdi-format-list-checks" class="h-4 w-4 shrink-0" />
        <span v-if="!isCompact">{{ translate('maps.tooltip.task_list') }}</span>
      </button>
      <div class="ml-auto flex shrink-0 gap-1">
        <LeafletObjectiveTaskActions
          :task-id="taskId"
          :actions="taskVisibilityActions"
          :compact="isCompact"
          :translate="translate"
          @close="emitClose"
        />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useI18n, type Composer } from 'vue-i18n';
  import { useWikiLink } from '@/composables/useWikiLink';
  import LeafletObjectiveTaskActions from '@/features/maps/LeafletObjectiveTaskActions.vue';
  import ObjectivePopupDetails from '@/features/maps/ObjectivePopupDetails.vue';
  import ObjectivePopupHeader from '@/features/maps/ObjectivePopupHeader.vue';
  import { getObjectiveGlyphKind } from '@/features/maps/utils/objectiveGlyphs';
  import {
    describeObjectiveItem,
    getObjectiveKeyLabels,
    getObjectivePopupItem,
    getObjectiveProgress,
    getPopupTrader,
  } from '@/features/maps/utils/objectivePopup';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { logger } from '@/utils/logger';
  import type { MapTaskVisibilityActions } from '@/features/maps/utils/mapTaskVisibility';
  import type { TarkovItem } from '@/types/tarkov';
  import type { Router } from 'vue-router';
  const props = withDefaults(
    defineProps<{
      objectiveId: string;
      readOnly?: boolean;
      t?: Composer['t'];
      taskVisibilityActions?: MapTaskVisibilityActions | null;
    }>(),
    {
      readOnly: false,
      t: undefined,
      taskVisibilityActions: null,
    }
  );
  const emit = defineEmits<{
    (e: 'close'): void;
  }>();
  function getI18nT(): Composer['t'] | undefined {
    try {
      return useI18n({ useScope: 'global' }).t;
    } catch {
      return undefined;
    }
  }
  const i18nT = getI18nT();
  const emitClose = () => {
    emit('close');
  };
  const translate: Composer['t'] = ((...args: Parameters<Composer['t']>) => {
    if (props.t) {
      return props.t(...args);
    }
    if (i18nT) {
      return i18nT(...args);
    }
    const [key] = args;
    if (typeof key === 'string') {
      return key;
    }
    logger.warn('LeafletObjectiveTooltip: invalid translation key', { key });
    return '';
  }) as Composer['t'];
  const router = inject<Router>('router');
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  const preferencesStore = usePreferencesStore();
  const { toWikiUrl } = useWikiLink();
  const isCompact = computed(() => preferencesStore.getMapTooltipDensity === 'compact');
  const rootClass = computed(() =>
    isCompact.value ? 'w-64 max-w-full gap-1.5' : 'w-80 max-w-full gap-2'
  );
  const objective = computed(() => {
    return metadataStore.objectives.find((o) => o.id === props.objectiveId);
  });
  const requiredCount = computed(() => objective.value?.count ?? 1);
  const currentCount = computed(() => tarkovStore.getObjectiveCount(props.objectiveId));
  const task = computed(() => {
    const taskId = objective.value?.taskId;
    if (!taskId) return null;
    return metadataStore.tasks.find((t) => t.id === taskId) ?? null;
  });
  const taskId = computed(() => task.value?.id);
  const taskName = computed(() => task.value?.name ?? translate('common.task'));
  const trader = computed(() => getPopupTrader(task.value));
  const levelLabel = computed(() => {
    const level = task.value?.minPlayerLevel ?? 0;
    return level > 1 ? translate('common.lvl_level', { level }) : '';
  });
  const glyphKind = computed(() => getObjectiveGlyphKind(objective.value?.type));
  const itemName = (item: TarkovItem): string =>
    item.name ?? metadataStore.itemsById?.get(item.id)?.name ?? item.shortName ?? '';
  const itemDetails = computed(() => {
    const entry = objective.value ? getObjectivePopupItem(objective.value) : undefined;
    const name = entry ? itemName(entry.item) : '';
    // An item without a resolvable name would render as a bare count, so it gets no row.
    return entry && name ? describeObjectiveItem(entry, name, requiredCount.value) : null;
  });
  const keyLabels = computed(() =>
    objective.value ? getObjectiveKeyLabels(objective.value, itemName) : []
  );
  const progress = computed(() => getObjectiveProgress(currentCount.value, requiredCount.value));
  const taskTarkovDevUrl = computed(() =>
    task.value?.id ? `https://tarkov.dev/task/${task.value.id}` : ''
  );
  const taskWikiUrl = computed(() => toWikiUrl(task.value?.wikiLink) ?? '');
  const isComplete = computed(() => tarkovStore.isTaskObjectiveComplete(props.objectiveId));
  const completeToggle = computed(() =>
    isComplete.value
      ? {
          icon: 'i-mdi-check-circle',
          label: translate('common.completed'),
        }
      : {
          icon: 'i-mdi-circle-outline',
          label: translate('common.mark_complete'),
        }
  );
  const BUTTON_BASE =
    'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50';
  const buttonSize = computed(() => (isCompact.value ? 'h-7 w-7' : 'h-8 px-2.5'));
  const secondaryButtonClass = computed(() => [
    BUTTON_BASE,
    buttonSize.value,
    'border border-white/12 bg-white/5 text-surface-100 hover:bg-white/10',
  ]);
  const completeButtonClass = computed(() => [
    BUTTON_BASE,
    buttonSize.value,
    isComplete.value
      ? 'border border-success-500/50 bg-success-900/40 text-success-300 enabled:hover:bg-success-900/60'
      : 'border border-primary-400/60 bg-primary-500/25 text-primary-100 enabled:hover:bg-primary-500/40',
  ]);
  // Check if parent task is complete or failed (locked state)
  const isParentTaskLocked = computed(() => {
    const taskId = objective.value?.taskId;
    if (!taskId) return false;
    const isTaskComplete = tarkovStore.isTaskComplete(taskId);
    const isTaskFailed = tarkovStore.isTaskFailed(taskId);
    return isTaskComplete || isTaskFailed;
  });
  // Disable toggle button when parent task is locked or readOnly
  const isToggleDisabled = computed(() => props.readOnly || isParentTaskLocked.value);
  const toggleObjective = () => {
    if (isToggleDisabled.value) return;
    const required = requiredCount.value;
    if (isComplete.value) {
      tarkovStore.setTaskObjectiveUncomplete(props.objectiveId);
      if (required > 1) {
        tarkovStore.setObjectiveCount(props.objectiveId, Math.max(0, required - 1));
      }
      return;
    }
    tarkovStore.setTaskObjectiveComplete(props.objectiveId);
    if (required > 1) {
      tarkovStore.setObjectiveCount(props.objectiveId, required);
    }
  };
  /**
   * Scrolls to the objective in the task list and highlights it.
   * Only highlights objectives, never task cards.
   * Always uses query params to trigger the scroll/highlight via tasks.vue,
   * ensuring the highlight happens even if this tooltip unmounts (e.g., from hover ending).
   */
  const scrollToObjective = () => {
    if (!task.value) return;
    if (!router) {
      logger.warn('LeafletObjectiveTooltip: router not available, cannot scroll to objective');
      return;
    }
    const currentQuery = { ...router.currentRoute.value.query };
    router.replace({
      query: {
        ...currentQuery,
        task: task.value.id,
        highlightObjective: props.objectiveId,
      },
    });
  };
</script>
