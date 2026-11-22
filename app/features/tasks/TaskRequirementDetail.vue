<template>
  <AppTooltip :text="text">
    <button
      type="button"
      class="text-surface-500 hover:text-surface-300 focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 ml-1 inline-flex shrink-0 items-center rounded-sm align-middle focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
      :aria-label="text"
      data-testid="task-requirement-detail"
      @click.stop.prevent
    >
      <UIcon name="i-mdi-information-outline" aria-hidden="true" class="h-3.5 w-3.5" />
    </button>
  </AppTooltip>
</template>
<script setup lang="ts">
  defineProps<{ text: string }>();
</script>
