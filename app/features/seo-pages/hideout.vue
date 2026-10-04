<template>
  <ClientOnly>
    <HideoutPage>
      <template #header>
        <PageHeader v-bind="header" />
      </template>
    </HideoutPage>
    <template #fallback>
      <div class="px-3 py-6 sm:px-6">
        <div class="mx-auto max-w-350">
          <PageHeader v-bind="header" />
        </div>
      </div>
    </template>
  </ClientOnly>
</template>
<script setup lang="ts">
  import PageHeader from '@/components/ui/PageHeader.vue';
  import HideoutPage from '@/pages/hideout.vue';
  const { t } = useI18n({ useScope: 'global' });
  const header = computed(() => ({
    title: t('common.hideout'),
    description: t('seo.routes.hideout.description'),
  }));
</script>
