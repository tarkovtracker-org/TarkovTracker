<template>
  <ResourceGuideSection
    id="video"
    :title="t('page.resources.guide_sections.video_walkthrough', 'Video Walkthrough')"
    icon="i-mdi-play-circle-outline"
  >
    <ResourceVideoEmbed :video-id="resource.videoId ?? ''" :title="videoTitle" />
    <p class="text-surface-400 mt-2 text-sm">
      {{
        t(
          'page.resources.video.caption',
          'Community video walkthrough. Steps may differ slightly from the written guide.'
        )
      }}
    </p>
  </ResourceGuideSection>
</template>
<script setup lang="ts">
  import ResourceGuideSection from '@/features/resources/ResourceGuideSection.vue';
  import ResourceVideoEmbed from '@/features/resources/ResourceVideoEmbed.vue';
  import type { Resource } from '@/features/resources/resourceData';
  const props = defineProps<{ resource: Resource; guideTitle: string }>();
  const { t } = useI18n({ useScope: 'global' });
  const videoTitle = computed(() =>
    t(
      'page.resources.video.walkthrough_title',
      { name: props.guideTitle },
      `${props.guideTitle} video walkthrough`
    )
  );
</script>
