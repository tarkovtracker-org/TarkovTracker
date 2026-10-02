<template>
  <ClientOnly>
    <StorylinePage>
      <template #header>
        <PageHeader v-bind="header" />
      </template>
    </StorylinePage>
    <template #fallback>
      <div class="min-h-[calc(100vh-250px)] px-3 py-6 sm:px-6">
        <div class="mx-auto max-w-350">
          <PageHeader v-bind="header" />
        </div>
      </div>
    </template>
  </ClientOnly>
</template>
<script setup lang="ts">
  import PageHeader from '@/components/ui/PageHeader.vue';
  import StorylinePage from '@/pages/storyline.vue';
  const { t } = useI18n({ useScope: 'global' });
  const header = computed(() => ({
    title: t('common.storyline'),
    description: t('page.storyline.subtitle'),
  }));
  definePageMeta({
    layout: 'default',
  });
</script>
