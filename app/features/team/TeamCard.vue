<template>
  <section
    class="bg-surface-850 font-ui overflow-hidden rounded-xl border border-white/10 shadow-md"
  >
    <header class="border-surface-700/70 flex items-start gap-3 border-b px-5 py-4 sm:px-6">
      <span
        class="bg-primary-500/12 border-primary-500/25 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
      >
        <slot name="icon" />
      </span>
      <div class="min-w-0 flex-1">
        <h2 class="text-surface-100 text-lg font-semibold sm:text-xl">{{ title }}</h2>
        <p v-if="subtitle" class="text-surface-400 mt-1 text-sm leading-5">{{ subtitle }}</p>
      </div>
      <div v-if="$slots['header-actions']" class="shrink-0">
        <slot name="header-actions" />
      </div>
    </header>
    <div class="p-5 sm:p-6">
      <slot />
    </div>
  </section>
</template>
<script setup lang="ts">
  defineProps<{
    title: string;
    subtitle?: string;
  }>();
</script>
