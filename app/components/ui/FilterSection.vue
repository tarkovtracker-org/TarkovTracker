<template>
  <section class="space-y-1" :aria-labelledby="headingId">
    <h3 :id="headingId" class="text-surface-400 mb-1 text-xs font-semibold tracking-wide uppercase">
      {{ title }}
    </h3>
    <p v-if="hint" class="text-surface-400 mb-2 text-xs">{{ hint }}</p>
    <slot />
  </section>
</template>
<script setup lang="ts">
  defineProps<{
    title: string;
    hint?: string;
  }>();
  const headingId = useId();
</script>
