<template>
  <button
    v-if="available"
    type="button"
    :aria-label="label"
    :aria-pressed="enabled"
    class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-850 flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    :class="enabled ? MAP_BUTTON_ACTIVE_CLASS : MAP_BUTTON_INACTIVE_CLASS"
    @click="enabled = !enabled"
  >
    <UIcon :name="icon" class="h-4 w-4 shrink-0" />
    <span class="whitespace-nowrap">{{ label }}</span>
  </button>
</template>
<script setup lang="ts">
  import {
    MAP_BUTTON_ACTIVE_CLASS,
    MAP_BUTTON_INACTIVE_CLASS,
  } from '@/features/maps/composables/useLeafletMapControls';
  defineProps<{ available: boolean; label: string; icon: string }>();
  const enabled = defineModel<boolean>({ required: true });
</script>
