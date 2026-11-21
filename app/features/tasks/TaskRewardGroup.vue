<template>
  <div
    class="border-surface-700/30 flex min-w-0 flex-col gap-1 border-t pt-1.5 first:border-t-0 first:pt-0 @md:flex-row @md:gap-3"
    role="group"
    :aria-label="label"
  >
    <span
      class="text-surface-300 shrink-0 text-[11px] font-medium @md:w-32 @md:pt-0.5"
      aria-hidden="true"
    >
      {{ label }}
    </span>
    <div class="flex max-w-3xl min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
      <slot />
    </div>
  </div>
</template>
<script setup lang="ts">
  defineProps<{ label: string }>();
</script>
