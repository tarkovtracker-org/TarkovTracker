<template>
  <ResourceGuideSection
    id="tips"
    :title="t('page.resources.guide_sections.tips', 'Tips & Tricks')"
    icon="i-mdi-lightbulb-on-outline"
  >
    <ul class="space-y-3">
      <li
        v-for="n in resource.guide?.tips ?? 0"
        :key="n"
        class="bg-surface-900/40 flex items-start gap-3 rounded-lg border border-white/5 px-3 py-3"
      >
        <UIcon name="i-mdi-lightbulb-outline" class="text-warning-400 mt-0.5 h-4 w-4 shrink-0" />
        <span class="text-surface-200 text-base leading-relaxed">
          {{ t(`page.resources.guides.${resource.slug}.tip_${n}`, '') }}
        </span>
      </li>
    </ul>
  </ResourceGuideSection>
</template>
<script setup lang="ts">
  import ResourceGuideSection from '@/features/resources/ResourceGuideSection.vue';
  import type { Resource } from '@/features/resources/resourceData';
  defineProps<{ resource: Resource }>();
  const { t } = useI18n({ useScope: 'global' });
</script>
