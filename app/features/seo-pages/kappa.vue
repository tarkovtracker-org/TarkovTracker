<template>
  <div>
    <PublicPageIntro
      :title="t('seo.routes.kappa.heading')"
      :description="t('seo.routes.kappa.description')"
    />
    <ClientOnly>
      <KappaPage />
    </ClientOnly>
  </div>
</template>
<script setup lang="ts">
  import PublicPageIntro from '@/components/PublicPageIntro.vue';
  import KappaPage from '@/pages/kappa.vue';
  const { t } = useI18n({ useScope: 'global' });
</script>
