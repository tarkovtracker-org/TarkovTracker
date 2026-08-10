<template>
  <ResourceGuideSection
    id="troubleshooting"
    :title="t('page.resources.guide_sections.troubleshooting', 'Troubleshooting')"
    icon="i-mdi-wrench-outline"
  >
    <div class="space-y-4">
      <div
        v-for="n in resource.guide?.troubleshooting ?? 0"
        :key="n"
        class="border-b border-white/5 pb-4 last:border-0 last:pb-0"
      >
        <h3 class="text-surface-100 text-base font-semibold">
          {{ t(`page.resources.guides.${resource.slug}.troubleshooting_${n}_title`, '') }}
        </h3>
        <p class="text-surface-300 mt-1 text-base leading-relaxed">
          {{ t(`page.resources.guides.${resource.slug}.troubleshooting_${n}_desc`, '') }}
        </p>
      </div>
    </div>
  </ResourceGuideSection>
</template>
<script setup lang="ts">
  import ResourceGuideSection from '@/features/resources/ResourceGuideSection.vue';
  import type { Resource } from '@/features/resources/resourceData';
  defineProps<{ resource: Resource }>();
  const { t } = useI18n({ useScope: 'global' });
</script>
