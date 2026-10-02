<template>
  <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
    <div class="min-w-0">
      <h1 class="text-surface-50 text-xl leading-tight font-bold sm:text-2xl">{{ title }}</h1>
      <p v-if="description" class="text-surface-400 mt-1 max-w-3xl text-sm">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 items-center gap-3">
      <slot name="actions" />
    </div>
  </header>
</template>
<script setup lang="ts">
  defineProps<{ title: string; description?: string }>();
</script>
