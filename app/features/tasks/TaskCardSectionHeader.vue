<template>
  <div
    class="hover:bg-surface-700/20 flex items-center gap-1 px-3 transition-colors select-none"
    :data-testid="testId"
  >
    <button
      type="button"
      class="focus-visible:ring-primary-500/40 focus-visible:ring-offset-surface-900 flex min-w-0 flex-1 cursor-pointer items-baseline gap-1.5 rounded-sm py-1.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      :aria-expanded="expanded"
      :aria-controls="controls"
      @click="emit('toggle')"
    >
      <span class="text-surface-400 text-[10px] font-bold tracking-wider uppercase">
        {{ label }}
      </span>
      <span v-if="meta" class="text-surface-500 truncate text-[11px]">{{ meta }}</span>
    </button>
    <slot name="actions" />
    <span
      aria-hidden="true"
      class="text-surface-400 flex h-5 w-7 shrink-0 cursor-pointer items-center justify-center"
      @click="emit('toggle')"
    >
      <UIcon
        name="i-mdi-chevron-down"
        class="h-4 w-4 transition-transform duration-200"
        :class="{ 'rotate-180': expanded }"
      />
    </span>
  </div>
</template>
<script setup lang="ts">
  defineProps<{
    label: string;
    meta?: string;
    expanded: boolean;
    controls: string;
    testId?: string;
  }>();
  const emit = defineEmits<{ toggle: [] }>();
</script>
