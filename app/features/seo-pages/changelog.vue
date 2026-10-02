<template>
  <div>
    <PublicPageIntro
      :title="t('page.changelog.title')"
      :description="t('page.changelog.description')"
    />
    <NuxtLink
      to="/"
      class="text-surface-400 hover:text-primary-400 mx-4 inline-flex items-center gap-1 text-sm transition-colors sm:mx-6"
    >
      <UIcon name="i-mdi-arrow-left" class="h-4 w-4" />
      {{ t('page.changelog.back') }}
    </NuxtLink>
    <ClientOnly>
      <ChangelogPage />
    </ClientOnly>
  </div>
</template>
<script setup lang="ts">
  import PublicPageIntro from '@/components/PublicPageIntro.vue';
  import ChangelogPage from '@/pages/changelog.vue';
  const { t } = useI18n({ useScope: 'global' });
  definePageMeta({
    layout: 'default',
  });
</script>
