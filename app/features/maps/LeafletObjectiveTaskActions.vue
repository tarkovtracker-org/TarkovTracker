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
  const buttonClass = computed(() =>
    props.compact
      ? 'inline-flex h-5 w-5 items-center justify-center rounded border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10'
      : 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10'
  );
  const iconClass = computed(() => (props.compact ? 'h-3 w-3' : 'h-4 w-4'));
  const showOnlyLabel = computed(() => props.translate('page.tasks.map.raid_plan.show_only_quest'));
  const hideLabel = computed(() => props.translate('page.tasks.map.raid_plan.hide_quest'));
  // Hiding removes this marker, so close the popup first rather than leave it orphaned.
  const hide = () => {
    if (!props.actions || !props.taskId) return;
    emit('close');
    props.actions.hideTask(props.taskId);
  };
</script>
