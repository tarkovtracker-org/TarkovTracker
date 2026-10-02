<template>
  <div>
    <PublicPageIntro
      :title="t('seo.routes.needed_items.heading')"
      :description="t('seo.routes.needed_items.description')"
    />
    <ClientOnly>
      <NeededItemsPage />
    </ClientOnly>
  </div>
</template>
<script setup lang="ts">
  import PublicPageIntro from '@/components/PublicPageIntro.vue';
  import NeededItemsPage from '@/pages/needed-items.vue';
  const { t } = useI18n({ useScope: 'global' });
  definePageMeta({
    usesWindowScroll: true,
  });
</script>
