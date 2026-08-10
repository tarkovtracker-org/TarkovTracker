<template>
  <nav :aria-label="title">
    <h2 class="text-surface-300 text-xs font-semibold tracking-wider uppercase">{{ title }}</h2>
    <div role="list" class="mt-3 flex flex-col gap-0.5">
      <div v-for="item in items" :key="item.label" role="listitem">
        <button v-if="item.onClick" type="button" :class="linkClass" @click="item.onClick">
          {{ item.label }}
        </button>
        <NuxtLink v-else :to="item.to" :class="linkClass">{{ item.label }}</NuxtLink>
      </div>
    </div>
  </nav>
</template>
<script setup lang="ts">
  import type { FooterNavItem } from '@/shell/footerNavigation';
  defineProps<{
    title: string;
    items: FooterNavItem[];
  }>();
  const linkClass =
    'text-info-400 hover:text-info-300 focus-visible:ring-primary-500 inline-flex min-h-8 items-center rounded text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none';
</script>
