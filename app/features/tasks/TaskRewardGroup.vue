<template>
  <div
    :class="groupClass"
    :role="grouped ? 'group' : undefined"
    :aria-label="grouped ? label : undefined"
  >
    <span
      v-if="grouped"
      class="text-surface-300 shrink-0 text-[11px] font-medium @md:w-32 @md:pt-0.5"
      aria-hidden="true"
    >
      {{ label }}
    </span>
    <div
      :class="
        grouped ? 'flex max-w-3xl min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5' : 'contents'
      "
    >
      <slot />
    </div>
  </div>
</template>
<script setup lang="ts">
  const props = defineProps<{ grouped: boolean; label: string }>();
  const groupClass = computed(() =>
    props.grouped
      ? 'border-surface-700/30 flex min-w-0 flex-col gap-1 border-t pt-1.5 @md:flex-row @md:gap-3'
      : 'contents'
  );
</script>
