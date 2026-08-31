<template>
  <div class="flex items-start gap-4">
    <div
      v-if="resource.logo"
      class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/5"
    >
      <NuxtImg :src="resource.logo" alt="" class="h-full w-full object-contain" />
    </div>
    <div
      v-else
      class="bg-primary-500/15 text-primary-300 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
    >
      <UIcon name="i-mdi-bookmark" class="h-6 w-6" />
    </div>
    <div class="min-w-0 flex-1 space-y-2">
      <div>
        <p class="text-primary-300/90 text-xs font-semibold tracking-[0.25em] uppercase">
          {{ guideLabel }}
        </p>
        <h1 class="mt-1 text-2xl font-bold tracking-wide text-white sm:text-3xl">{{ title }}</h1>
      </div>
      <p class="text-surface-200 max-w-3xl text-base leading-relaxed">{{ description }}</p>
      <p class="text-surface-400 text-sm">{{ metaLine }}</p>
    </div>
  </div>
</template>
<script setup lang="ts">
  import type { Resource } from '@/features/resources/resourceData';
  const props = defineProps<{
    resource: Resource;
    title: string;
    description: string;
    metaLine: string;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const guideLabel = computed(() =>
    props.resource.category === 'tarkovtracker_guides'
      ? t('page.resources.official_guide_label', 'TarkovTracker.org Guide')
      : t('page.resources.guide_label', 'Guide')
  );
</script>
