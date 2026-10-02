<template>
  <ClientOnly>
    <HomePage>
      <template #header>
        <PageHeader v-bind="header" class="mb-4" />
      </template>
    </HomePage>
    <template #fallback>
      <div class="min-h-[calc(100vh-250px)] px-3 py-6 sm:px-6">
        <div class="mx-auto max-w-350 xl:max-w-400 2xl:max-w-450">
          <PageHeader v-bind="header" class="mb-4" />
        </div>
      </div>
    </template>
  </ClientOnly>
</template>
<script setup lang="ts">
  import PageHeader from '@/components/ui/PageHeader.vue';
  import HomePage from '@/pages/index.vue';
  const { t } = useI18n({ useScope: 'global' });
  const header = computed(() => ({
    title: t('seo.routes.home.heading'),
    description: t('seo.routes.home.description'),
  }));
</script>
