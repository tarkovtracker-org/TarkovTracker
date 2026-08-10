<template>
  <ResourceGuideSection
    id="faq"
    :title="t('page.resources.guide_sections.faq', 'Common Questions')"
    icon="i-mdi-help-circle-outline"
  >
    <div class="divide-y divide-white/5 rounded-xl border border-white/10">
      <details v-for="n in resource.guide?.faq ?? 0" :id="`faq-${n}`" :key="n" class="group px-4">
        <summary
          class="text-surface-100 hover:text-primary-200 focus-visible:ring-primary-400/40 flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 text-base font-medium transition-colors marker:content-none focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden"
        >
          <span>{{ t(`page.resources.guides.${resource.slug}.faq_${n}_q`, '') }}</span>
          <UIcon
            name="i-mdi-chevron-down"
            class="text-surface-500 h-5 w-5 shrink-0 transition-transform group-open:rotate-180"
          />
        </summary>
        <p class="text-surface-300 pb-4 text-base leading-relaxed">
          {{ t(`page.resources.guides.${resource.slug}.faq_${n}_a`, '') }}
        </p>
      </details>
    </div>
  </ResourceGuideSection>
</template>
<script setup lang="ts">
  import ResourceGuideSection from '@/features/resources/ResourceGuideSection.vue';
  import type { Resource } from '@/features/resources/resourceData';
  defineProps<{ resource: Resource }>();
  const { t } = useI18n({ useScope: 'global' });
</script>
