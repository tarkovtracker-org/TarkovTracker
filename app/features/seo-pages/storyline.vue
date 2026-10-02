<template>
  <div>
    <PublicPageIntro
      :title="t('seo.routes.storyline.heading')"
      :description="t('seo.routes.storyline.description')"
    />
    <ClientOnly>
      <StorylinePage />
    </ClientOnly>
  </div>
</template>
<script setup lang="ts">
  import PublicPageIntro from '@/components/PublicPageIntro.vue';
  import StorylinePage from '@/pages/storyline.vue';
  const { t } = useI18n({ useScope: 'global' });
  definePageMeta({
    layout: 'default',
  });
</script>
