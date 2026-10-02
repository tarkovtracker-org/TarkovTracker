<template>
  <header class="mx-auto w-full max-w-350 px-4 pt-5 pb-3 sm:px-6">
    <h1 class="text-surface-50 text-xl font-bold sm:text-2xl">{{ title }}</h1>
    <p class="text-surface-400 mt-2 max-w-3xl text-sm leading-relaxed">{{ description }}</p>
  </header>
</template>
<script setup lang="ts">
  defineProps<{ title: string; description: string }>();
</script>
