<template>
  <span
    v-if="step === null"
    class="bg-warning-500/80 absolute top-2.75 left-2.25 size-2.5 rotate-45"
    aria-hidden="true"
  ></span>
  <span
    v-else
    class="absolute top-0.5 left-0 flex size-7 items-center justify-center rounded-full border text-xs font-semibold tabular-nums"
    :class="complete ? STEP_NODE_CLASS.complete : STEP_NODE_CLASS.open"
    aria-hidden="true"
  >
    <UIcon v-if="complete" name="i-mdi-check-bold" class="size-3.5" />
    <template v-else>{{ step }}</template>
  </span>
</template>
<script setup lang="ts">
  /** Marks a timeline entry on the rail: a numbered circle for a main step, a diamond for an optional. */
  defineProps<{ step: number | null; complete: boolean }>();
  const STEP_NODE_CLASS = {
    complete: 'border-success-600/60 bg-success-900/60 text-success-200',
    open: 'border-surface-600 bg-surface-900 text-surface-300',
  };
</script>
