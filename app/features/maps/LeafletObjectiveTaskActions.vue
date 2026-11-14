<template>
  <template v-if="actions && taskId">
    <button
      type="button"
      data-testid="objective-show-only-task"
      :class="buttonClass"
      :aria-label="showOnlyLabel"
      :title="showOnlyLabel"
      @click.stop="actions.showOnlyTask(taskId)"
    >
      <UIcon name="i-mdi-filter-outline" :class="iconClass" />
    </button>
    <button
      type="button"
      data-testid="objective-hide-task"
      :class="buttonClass"
      :aria-label="hideLabel"
      :title="hideLabel"
      @click.stop="hide"
    >
      <UIcon name="i-mdi-eye-off-outline" :class="iconClass" />
    </button>
  </template>
</template>
<script setup lang="ts">
  import type { MapTaskVisibilityActions } from '@/features/maps/utils/mapTaskVisibility';
  // Rendered inside the Leaflet popup's standalone app, so translation arrives as a prop.
  const props = defineProps<{
    taskId?: string;
    actions?: MapTaskVisibilityActions | null;
    compact: boolean;
    translate: (key: string) => string;
  }>();
  const emit = defineEmits<{ close: [] }>();
  // Matches the popup's footer buttons; compact density keeps them square and slightly smaller.
  const buttonClass = computed(() => [
    'inline-flex items-center justify-center rounded-md border border-white/12 bg-white/5 text-surface-200 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
    props.compact ? 'h-7 w-7' : 'h-8 w-8',
  ]);
  const iconClass = 'h-4 w-4';
  const showOnlyLabel = computed(() => props.translate('page.tasks.map.raid_plan.show_only_quest'));
  const hideLabel = computed(() => props.translate('page.tasks.map.raid_plan.hide_quest'));
  // Hiding removes this marker, so close the popup first rather than leave it orphaned.
  const hide = () => {
    if (!props.actions || !props.taskId) return;
    emit('close');
    props.actions.hideTask(props.taskId);
  };
</script>
