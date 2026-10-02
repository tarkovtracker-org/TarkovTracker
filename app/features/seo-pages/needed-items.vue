<template>
  <ClientOnly>
    <NeededItemsPage>
      <template #header>
        <PageHeader v-bind="header" class="mb-4" />
      </template>
    </NeededItemsPage>
    <template #fallback>
      <div class="px-3 py-6 sm:px-6">
        <div class="mx-auto max-w-350">
          <PageHeader v-bind="header" class="mb-4" />
        </div>
      </div>
    </template>
  </ClientOnly>
</template>
<script setup lang="ts">
  import PageHeader from '@/components/ui/PageHeader.vue';
  import NeededItemsPage from '@/pages/needed-items.vue';
  const { t } = useI18n({ useScope: 'global' });
  const header = computed(() => ({
    title: t('common.needed_items'),
    description: t('seo.routes.needed_items.description'),
  }));
  definePageMeta({
    usesWindowScroll: true,
  });
</script>
