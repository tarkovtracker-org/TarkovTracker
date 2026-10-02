<template>
  <div class="px-4 py-6 sm:px-6">
    <div class="mx-auto w-full max-w-6xl">
      <PageHeader
        :title="t('common.page_not_found')"
        :description="t('page.not_found.not_found_description')"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
  import PageHeader from '@/components/ui/PageHeader.vue';
  const { t } = useI18n({ useScope: 'global' });
  definePageMeta({
    layout: 'default',
  });
</script>
