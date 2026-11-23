<template>
  <UPopover :open="open" :content="contentOptions" @update:open="setOpen">
    <button
      type="button"
      class="text-surface-500 hover:text-surface-300 focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 ml-1 inline-flex shrink-0 items-center rounded-sm align-middle focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
      :aria-label="text"
      data-testid="task-requirement-detail"
      @pointerenter="openOnHover"
      @pointerleave="scheduleHoverClose"
      @focus="openOnFocus"
      @blur="closeOnBlur"
      @click.capture="keepHoverOpen"
    >
      <UIcon name="i-mdi-information-outline" aria-hidden="true" class="h-3.5 w-3.5" />
    </button>
    <template #content>
      <p
        class="text-surface-200 max-w-72 p-2 text-xs"
        data-testid="task-requirement-detail-text"
        @pointerenter="cancelHoverClose"
        @pointerleave="scheduleHoverClose"
      >
        {{ text }}
      </p>
    </template>
  </UPopover>
</template>
<script setup lang="ts">
  import { useTaskCardPreview } from '@/features/tasks/composables/useTaskCardPreview';
  const props = defineProps<{ text: string }>();
  // Hover and keyboard focus preview the text; a tap or click toggles it for touch.
  const {
    open,
    setOpen,
    openOnHover,
    openOnFocus,
    closeOnBlur,
    scheduleHoverClose,
    cancelHoverClose,
    onOpenAutoFocus,
    onCloseAutoFocus,
    keepHoverOpen,
  } = useTaskCardPreview();
  const contentOptions = computed(() => ({
    'aria-label': props.text,
    side: 'top' as const,
    sideOffset: 6,
    onOpenAutoFocus,
    onCloseAutoFocus,
  }));
</script>
