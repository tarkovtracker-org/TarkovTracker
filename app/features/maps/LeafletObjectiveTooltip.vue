<template>
  <div class="min-w-55">
    <div class="flex items-center justify-between gap-2">
      <div class="flex min-w-0 flex-1 items-center gap-1">
        <component
          :is="taskTitleComponent"
          v-bind="taskTitleProps"
          :class="taskTitleClass"
          @click.stop
        >
          <span class="truncate">{{ taskName }}</span>
          <UIcon
            v-if="task?.wikiLink"
            name="i-mdi-open-in-new"
            class="h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
        </component>
        <a
          v-if="taskTarkovDevUrl"
          :href="taskTarkovDevUrl"
          target="_blank"
          rel="noopener noreferrer"
          :class="linkButtonClass"
          :title="translate('page.tasks.questcard.view_on_tarkov_dev')"
          :aria-label="translate('page.tasks.questcard.view_on_tarkov_dev')"
          @click.stop
        >
          <img
            src="/img/logos/tarkovdevlogo.webp"
            alt="tarkov.dev"
            aria-hidden="true"
            class="h-4 w-4"
          />
        </a>
      </div>
      <div class="flex shrink-0 gap-1">
        <button
          type="button"
          class="bg-shell border-border text-foreground hover:bg-interactive inline-flex h-7 w-7 items-center justify-center rounded-md border"
          :aria-label="translate('maps.tooltip.go_to_in_task_list')"
          :title="translate('maps.tooltip.go_to')"
          @click.stop="scrollToObjective"
        >
          <UIcon name="i-mdi-arrow-down-circle-outline" class="h-4 w-4" />
        </button>
        <button
          v-if="!readOnly"
          type="button"
          class="bg-shell border-border text-foreground inline-flex h-7 w-7 items-center justify-center rounded-md border"
          :class="isToggleDisabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-interactive'"
          :aria-label="
            isComplete ? translate('maps.tooltip.uncomplete') : translate('maps.tooltip.complete')
          "
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
          data-testid="objective-close-button"
          class="text-foreground-muted hover:bg-interactive inline-flex h-7 w-7 items-center justify-center rounded-md"
          :aria-label="translate('generic.close_button')"
          @click.stop="emitClose"
        >
          <UIcon name="i-mdi-close" class="h-4 w-4" />
        </button>
      </div>
    </div>
    <div class="mt-1">
      <div v-if="!objective" class="text-foreground-subtle text-xs">
        {{ translate('maps.tooltip.objective_unavailable') }}
      </div>
      <div v-else class="text-foreground text-sm">
        <div class="text-foreground-muted">{{ objective.description }}</div>
        <div v-if="!readOnly && requiredCount > 1" class="text-foreground-subtle mt-1 text-[11px]">
          {{ currentCount }}/{{ requiredCount }}
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useMetadataStore } from '@/stores/useMetadata';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { logger } from '@/utils/logger';
  import type { Composer } from 'vue-i18n';
  import type { Router } from 'vue-router';
  const props = withDefaults(
    defineProps<{
      objectiveId: string;
      readOnly?: boolean;
      t?: Composer['t'];
    }>(),
    {
      readOnly: false,
      t: undefined,
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
  const objective = computed(() => {
    return metadataStore.objectives.find((o) => o.id === props.objectiveId);
  });
  const task = computed(() => {
    const taskId = objective.value?.taskId;
    if (!taskId) return null;
    return metadataStore.tasks.find((t) => t.id === taskId) ?? null;
  });
  const taskName = computed(() => task.value?.name ?? translate('maps.tooltip.task_fallback'));
  const taskTarkovDevUrl = computed(() => {
    if (!task.value?.id) return '';
    return `https://tarkov.dev/task/${task.value.id}`;
  });
  const taskTitleComponent = computed(() => (task.value?.wikiLink ? 'a' : 'div'));
  const taskTitleProps = computed(() => {
    if (task.value?.wikiLink) {
      return {
        href: task.value.wikiLink,
        target: '_blank',
        rel: 'noopener noreferrer',
      };
    }
    return {};
  });
  const taskTitleClass = computed(() => {
    const base = 'flex min-w-0 max-w-full items-center gap-1 text-sm leading-snug font-semibold';
    if (task.value?.wikiLink) {
      return `${base} text-link hover:text-link-hover no-underline`;
    }
    return `${base} text-foreground`;
  });
  const linkButtonClass = [
    'inline-flex items-center justify-center rounded p-1 transition-colors',
    'text-foreground-muted hover:text-foreground hover:bg-interactive',
    'focus-visible:ring-primary-500 focus-visible:ring-offset-panel',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
  ];
  const isComplete = computed(() => tarkovStore.isTaskObjectiveComplete(props.objectiveId));
  const requiredCount = computed(() => objective.value?.count ?? 1);
  const currentCount = computed(() => tarkovStore.getObjectiveCount(props.objectiveId));
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
