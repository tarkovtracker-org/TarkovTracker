<template>
  <div>
    <PublicPageIntro
      :title="t('seo.routes.hideout.heading')"
      :description="t('seo.routes.hideout.description')"
    />
    <ClientOnly>
      <HideoutPage />
    </ClientOnly>
  </div>
</template>
<script setup lang="ts">
  import PublicPageIntro from '@/components/PublicPageIntro.vue';
  import HideoutPage from '@/pages/hideout.vue';
  const { t } = useI18n({ useScope: 'global' });
</script>
