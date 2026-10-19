<template>
  <div
    class="flex scrollbar-none flex-wrap items-center gap-1.5 sm:flex-nowrap sm:justify-end sm:overflow-x-auto"
  >
    <AppTooltip :text="locationTooltip">
      <UBadge
        size="xs"
        color="neutral"
        variant="soft"
        class="inline-flex max-w-40 shrink-0 cursor-help items-center gap-1 text-[11px] leading-none"
      >
        <UIcon
          :name="task?.map?.name ? 'i-mdi-map-marker' : 'i-mdi-earth'"
          aria-hidden="true"
          class="h-3 w-3 shrink-0"
        />
        <span class="truncate leading-none">
          {{ task?.map?.name || t('page.tasks.questcard.any_map') }}
        </span>
      </UBadge>
    </AppTooltip>
    <UBadge
      v-if="showProgress && hasProgress"
      data-testid="task-card-progress"
      size="xs"
      color="neutral"
      variant="soft"
      class="inline-flex shrink-0 cursor-help items-center gap-1 text-[11px] leading-none"
    >
      <UIcon name="i-mdi-check-circle-outline" aria-hidden="true" class="h-3 w-3 shrink-0" />
      <span class="truncate leading-none">
        {{
          t('page.tasks.questcard.progress', {
            completed: props.progressCompleted,
            total: props.progressTotal,
          })
        }}
      </span>
    </UBadge>
    <UBadge v-if="isFailed" size="xs" color="error" variant="soft" class="shrink-0 text-[11px]">
      {{ t('common.failed', 'Failed') }}
    </UBadge>
    <AppTooltip
      v-if="isInvalid && !isFailed"
      :text="
        t(
          'page.tasks.questcard.blocked_tooltip',
          'This task is permanently blocked and can never be completed due to choices made in other tasks'
        )
      "
    >
      <UBadge size="xs" color="neutral" variant="soft" class="shrink-0 cursor-help text-[11px]">
        {{ t('common.blocked', 'Blocked') }}
      </UBadge>
    </AppTooltip>
    <AppTooltip
      v-if="showRequiredLabels && task.kappaRequired"
      :text="t('page.tasks.questcard.kappa_tooltip')"
    >
      <UIcon
        name="i-mdi-trophy"
        class="text-kappa h-4 w-4 shrink-0 cursor-help"
        aria-hidden="true"
      />
    </AppTooltip>
    <AppTooltip
      v-if="showRequiredLabels && task.lightkeeperRequired"
      :text="t('page.tasks.questcard.lightkeeper_tooltip')"
    >
      <UIcon
        name="i-mdi-lighthouse"
        class="text-lightkeeper h-4 w-4 shrink-0 cursor-help"
        aria-hidden="true"
      />
    </AppTooltip>
    <AppTooltip
      v-if="task.alternatives && task.alternatives.length > 0"
      :text="t('page.tasks.questcard.alternatives_tooltip', { count: task.alternatives.length })"
    >
      <UBadge size="xs" color="warning" variant="soft" class="shrink-0 cursor-help text-[11px]">
        <UIcon name="i-mdi-swap-horizontal" class="mr-0.5 h-3 w-3" aria-hidden="true" />
        {{ t('page.tasks.questcard.alternatives_badge', { count: task.alternatives.length }) }}
      </UBadge>
    </AppTooltip>
    <AppTooltip
      v-if="showRequiredLabels && exclusiveEditionBadge"
      :text="
        t(
          'page.tasks.questcard.edition_exclusive_tooltip',
          { editions: exclusiveEditionBadge },
          `This quest is only available to players with ${exclusiveEditionBadge} edition`
        )
      "
    >
      <UBadge size="xs" color="primary" variant="soft" class="shrink-0 cursor-help text-[11px]">
        {{ exclusiveEditionBadge }}
      </UBadge>
    </AppTooltip>
    <div class="flex shrink-0 items-center" data-testid="task-card-icon-actions">
      <AppTooltip
        :text="isPinned ? t('page.tasks.questcard.unpin_task') : t('page.tasks.questcard.pin_task')"
      >
        <UButton
          size="xs"
          variant="ghost"
          :color="isPinned ? 'primary' : 'neutral'"
          :icon="isPinned ? 'i-mdi-pin' : 'i-mdi-pin-outline'"
          class="shrink-0"
          :aria-label="
            isPinned ? t('page.tasks.questcard.unpin_task') : t('page.tasks.questcard.pin_task')
          "
          @click.stop="emit('togglePin')"
        />
      </AppTooltip>
      <AppTooltip :text="hideLabel">
        <UButton
          size="xs"
          variant="ghost"
          :color="isHidden ? 'primary' : 'neutral'"
          :icon="isHidden ? 'i-mdi-eye-off-outline' : 'i-mdi-eye-outline'"
          class="shrink-0"
          data-testid="task-card-hide"
          :aria-label="hideLabel"
          @click.stop="emit('toggleHide')"
        />
      </AppTooltip>
      <AppTooltip :text="t('page.tasks.questcard.copy_task_link')">
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-mdi-link-variant"
          class="shrink-0"
          data-testid="task-card-copy-link"
          :aria-label="t('page.tasks.questcard.copy_task_link')"
          @click.stop="emit('copyLink')"
        />
      </AppTooltip>
      <TaskMapVisibilityToggles :task-id="task.id" />
    </div>
    <slot name="actions" />
  </div>
</template>
<script setup lang="ts">
  import TaskMapVisibilityToggles from '@/features/tasks/TaskMapVisibilityToggles.vue';
  import type { Task } from '@/types/tarkov';
  const props = defineProps<{
    task: Task;
    isPinned: boolean;
    isHidden: boolean;
    locationTooltip: string;
    isFailed: boolean;
    isInvalid: boolean;
    showRequiredLabels: boolean;
    exclusiveEditionBadge?: string;
    progressCompleted: number;
    progressTotal: number;
    showProgress: boolean;
  }>();
  const emit = defineEmits<{
    togglePin: [];
    toggleHide: [];
    copyLink: [];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const hasProgress = computed(() => props.progressTotal > 0);
  const hideLabel = computed(() =>
    props.isHidden ? t('page.tasks.questcard.unhide_task') : t('page.tasks.questcard.hide_task')
  );
</script>
