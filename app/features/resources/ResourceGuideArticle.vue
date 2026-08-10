<template>
  <article class="min-w-0 space-y-10">
    <ResourceGuideSection
      id="overview"
      :title="t('common.overview', 'Overview')"
      icon="i-mdi-information-outline"
    >
      <p class="text-surface-200 text-base leading-relaxed">{{ overview }}</p>
    </ResourceGuideSection>
    <component
      :is="section.component"
      v-for="section in enabledSections"
      :key="section.id"
      v-bind="section.props"
    />
  </article>
</template>
<script setup lang="ts">
  import ResourceGuideFaq from '@/features/resources/ResourceGuideFaq.vue';
  import ResourceGuideSection from '@/features/resources/ResourceGuideSection.vue';
  import ResourceGuideSteps from '@/features/resources/ResourceGuideSteps.vue';
  import ResourceGuideTips from '@/features/resources/ResourceGuideTips.vue';
  import ResourceGuideTroubleshooting from '@/features/resources/ResourceGuideTroubleshooting.vue';
  import ResourceGuideVideo from '@/features/resources/ResourceGuideVideo.vue';
  import type { ResourceWithGuide } from '@/features/resources/resourceData';
  const props = defineProps<{
    resource: ResourceWithGuide;
    guideTitle: string;
    overview: string;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const enabledSections = computed(() => {
    const guide = props.resource.guide;
    return [
      {
        id: 'video',
        component: ResourceGuideVideo,
        enabled: Boolean(props.resource.videoId),
        props: { resource: props.resource, guideTitle: props.guideTitle },
      },
      {
        id: 'setup',
        component: ResourceGuideSteps,
        enabled: Boolean(guide.steps),
        props: { resource: props.resource },
      },
      {
        id: 'troubleshooting',
        component: ResourceGuideTroubleshooting,
        enabled: Boolean(guide.troubleshooting),
        props: { resource: props.resource },
      },
      {
        id: 'tips',
        component: ResourceGuideTips,
        enabled: Boolean(guide.tips),
        props: { resource: props.resource },
      },
      {
        id: 'faq',
        component: ResourceGuideFaq,
        enabled: Boolean(guide.faq),
        props: { resource: props.resource },
      },
    ].filter((section) => section.enabled);
  });
</script>
