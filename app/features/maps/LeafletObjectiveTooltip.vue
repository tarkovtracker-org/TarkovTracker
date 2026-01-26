<template>
  <div class="min-w-55">
    <div class="flex items-center justify-between gap-2">
      <div class="min-w-0 flex-1">
        <div class="text-sm leading-snug font-semibold text-gray-100">{{ taskName }}</div>
      </div>
      <div class="flex shrink-0 gap-1">
        <button
          type="button"
          class="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10"
          :aria-label="t('maps.tooltip.goToInTaskList')"
          :title="t('maps.tooltip.goTo')"
          @click.stop="scrollToObjective"
        >
          <UIcon name="i-mdi-arrow-down-circle-outline" class="h-4 w-4" />
        </button>
        <button
          v-if="!readOnly"
          type="button"
          class="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-gray-200"
          :class="isToggleDisabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-white/10'"
          :aria-label="isComplete ? t('maps.tooltip.uncomplete') : t('maps.tooltip.complete')"
          :aria-pressed="isComplete"
          :disabled="isToggleDisabled"
          @click.stop="toggleObjective"
        >
          <UIcon
            :name="isComplete ? 'i-mdi-check-circle' : 'i-mdi-circle-outline'"
            class="h-4 w-4"
          />
        </button>
        <button
          type="button"
          class="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-300 hover:bg-white/10"
          :aria-label="t('generic.close_button')"
          @click.stop="emitClose"
        >
          <UIcon name="i-mdi-close" class="h-4 w-4" />
        </button>
      </div>
    </div>
    <div class="mt-1">
      <div v-if="!objective" class="text-xs text-gray-400">
        {{ t('maps.tooltip.objectiveUnavailable') }}
      </div>
      <div v-else class="text-sm text-gray-200">
        <div class="text-gray-300">{{ objective.description }}</div>
        <div v-if="!readOnly && requiredCount > 1" class="mt-1 text-[11px] text-gray-400">
          {{ currentCount }}/{{ requiredCount }}
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { computed, inject } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { logger } from '@/utils/logger';
  import type { Router } from 'vue-router';
  const props = withDefaults(
    defineProps<{
      objectiveId: string;
      readOnly?: boolean;
      onClose?: () => void;
    }>(),
    {
      readOnly: false,
      onClose: undefined,
    }
  );
  const emit = defineEmits<{
    (e: 'close'): void;
  }>();
  // Inject clearPinnedTask to dismiss the pinned task when tooltip closes
  const clearPinnedTask = inject<(() => void) | null>('clearPinnedTask', null);
  const emitClose = () => {
    emit('close');
    props.onClose?.();
    // Clear the pinned task when user closes the tooltip
    clearPinnedTask?.();
  };
  const { t } = useI18n();
  const router = inject<Router>('router');
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  const objective = computed(() => {
    return metadataStore.objectives.find((o) => o.id === props.objectiveId);
  });
  const task = computed(() => {
    const taskId = objective.value?.taskId;
    if (!taskId) return null;
    return metadataStore.tasks.find((t) => t.id === taskId) ?? null;
  });
  const taskName = computed(() => task.value?.name ?? t('maps.tooltip.taskFallback'));
  const isComplete = computed(() => tarkovStore.isTaskObjectiveComplete(props.objectiveId));
  const requiredCount = computed(() => objective.value?.count ?? 1);
  const currentCount = computed(() => tarkovStore.getObjectiveCount(props.objectiveId));
  // Check if parent task is complete or failed (locked state)
  const isParentTaskLocked = computed(() => {
    const taskId = objective.value?.taskId;
    if (!taskId) return false;
    const isTaskComplete = tarkovStore.isTaskComplete(taskId) && !tarkovStore.isTaskFailed(taskId);
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
