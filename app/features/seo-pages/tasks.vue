<template>
  <div>
    <PublicPageIntro
      :title="t('seo.routes.tasks.heading')"
      :description="t('seo.routes.tasks.description')"
    />
    <ClientOnly>
      <TasksPage />
    </ClientOnly>
  </div>
</template>
<script setup lang="ts">
  import PublicPageIntro from '@/components/PublicPageIntro.vue';
  import TasksPage from '@/pages/tasks.vue';
  const { t } = useI18n({ useScope: 'global' });
  definePageMeta({
    usesWindowScroll: true,
  });
</script>
