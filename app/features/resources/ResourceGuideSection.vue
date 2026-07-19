<template>
  <section :id="id" class="scroll-mt-16 space-y-3">
    <div class="flex items-center gap-2 border-b border-white/10 pb-2">
      <UIcon v-if="icon" :name="icon" class="text-primary-400 h-5 w-5 shrink-0" />
      <h2 class="text-lg font-semibold tracking-wide text-white sm:text-xl">{{ title }}</h2>
    </div>
    <div class="min-w-0">
      <slot />
    </div>
  </section>
</template>
<script setup lang="ts">
  defineProps<{
    title: string;
    icon?: string;
    id?: string;
  }>();
</script>
