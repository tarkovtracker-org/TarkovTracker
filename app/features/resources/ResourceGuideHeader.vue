<template>
  <nav
    class="text-surface-400 flex flex-wrap items-center gap-1.5 text-sm"
    :aria-label="t('page.resources.breadcrumb', 'Breadcrumb')"
  >
    <NuxtLink to="/resources" class="hover:text-primary-300 transition-colors">
      {{ t('page.resources.title', 'Resources & Guides') }}
    </NuxtLink>
    <UIcon name="i-mdi-chevron-right" class="h-4 w-4 shrink-0 opacity-60" />
    <NuxtLink to="/resources" class="hover:text-primary-300 transition-colors">
      {{ categoryLabel }}
    </NuxtLink>
    <UIcon name="i-mdi-chevron-right" class="h-4 w-4 shrink-0 opacity-60" />
    <span class="text-surface-200">{{ title }}</span>
  </nav>
  <header class="space-y-4">
    <ResourceGuideIdentity
      :resource="resource"
      :title="title"
      :description="description"
      :meta-line="metaLine"
    />
    <ResourceGuideActions :resource="resource" />
    <ResourceGuideCompatibility :text="compatibilityText" />
  </header>
</template>
<script setup lang="ts">
  import ResourceGuideActions from '@/features/resources/ResourceGuideActions.vue';
  import ResourceGuideCompatibility from '@/features/resources/ResourceGuideCompatibility.vue';
  import ResourceGuideIdentity from '@/features/resources/ResourceGuideIdentity.vue';
  import type { Resource } from '@/features/resources/resourceData';
  defineProps<{
    resource: Resource;
    title: string;
    description: string;
    categoryLabel: string;
    metaLine: string;
    compatibilityText: string;
  }>();
  const { t } = useI18n({ useScope: 'global' });
</script>
