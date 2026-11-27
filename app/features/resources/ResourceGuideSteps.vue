<template>
  <ResourceGuideSection id="setup" :title="sectionTitle" icon="i-mdi-playlist-check">
    <ol class="space-y-5">
      <li
        v-for="(n, index) in resource.guide?.steps"
        :key="n"
        class="flex items-start gap-4 border-b border-white/5 pb-5 last:border-0 last:pb-0"
      >
        <span
          class="bg-primary-500/20 text-primary-300 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
        >
          {{ index + 1 }}
        </span>
        <div class="min-w-0 flex-1 space-y-1.5">
          <h3 class="text-surface-100 text-base font-semibold sm:text-lg">
            {{ t(`page.resources.guides.${resource.slug}.step_${n}_title`, '') }}
          </h3>
          <p class="text-surface-300 text-base leading-relaxed wrap-break-word">
            {{ t(`page.resources.guides.${resource.slug}.step_${n}_desc`, '') }}
          </p>
        </div>
      </li>
    </ol>
  </ResourceGuideSection>
</template>
<script setup lang="ts">
  import { getGuideStepsHeading, type Resource } from '@/features/resources/resourceData';
  import ResourceGuideSection from '@/features/resources/ResourceGuideSection.vue';
  const props = defineProps<{ resource: Resource }>();
  const { t } = useI18n({ useScope: 'global' });
  const sectionTitle = computed(() => {
    const heading = getGuideStepsHeading(props.resource);
    return t(heading.key, heading.fallback);
  });
</script>
