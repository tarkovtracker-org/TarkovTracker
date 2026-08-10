<template>
  <ResourceGuideSection
    id="setup"
    :title="t('common.getting_started', 'Getting Started')"
    icon="i-mdi-playlist-check"
  >
    <ol class="space-y-5">
      <li
        v-for="n in resource.guide?.steps ?? 0"
        :key="n"
        class="flex items-start gap-4 border-b border-white/5 pb-5 last:border-0 last:pb-0"
      >
        <span
          class="bg-primary-500/20 text-primary-300 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
        >
          {{ n }}
        </span>
        <div class="min-w-0 flex-1 space-y-1.5">
          <h3 class="text-surface-100 text-base font-semibold sm:text-lg">
            {{ t(`page.resources.guides.${resource.slug}.step_${n}_title`, '') }}
          </h3>
          <p class="text-surface-300 text-base leading-relaxed">
            {{ t(`page.resources.guides.${resource.slug}.step_${n}_desc`, '') }}
          </p>
        </div>
      </li>
    </ol>
  </ResourceGuideSection>
</template>
<script setup lang="ts">
  import ResourceGuideSection from '@/features/resources/ResourceGuideSection.vue';
  import type { Resource } from '@/features/resources/resourceData';
  defineProps<{ resource: Resource }>();
  const { t } = useI18n({ useScope: 'global' });
</script>
