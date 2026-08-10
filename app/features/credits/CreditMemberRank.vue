<template>
  <span
    v-if="rank != null"
    class="text-surface-300 w-7 shrink-0 text-right text-xs font-semibold tabular-nums"
  >
    {{ rank }}.
  </span>
</template>
<script setup lang="ts">
  defineProps<{ rank?: number }>();
</script>
