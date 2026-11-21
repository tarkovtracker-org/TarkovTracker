<template>
  <section class="px-3 py-6 sm:px-6 lg:px-10 2xl:px-16">
    <PageHeader
      :title="t('page.kappa.retired_title')"
      :description="t('page.kappa.retired_description')"
    />
    <div class="mt-4 flex flex-wrap gap-3">
      <UButton to="/tasks" color="primary" variant="soft">{{ t('common.tasks') }}</UButton>
      <UButton to="/needed-items" color="neutral" variant="outline">
        {{ t('common.needed_items') }}
      </UButton>
    </div>
  </section>
</template>
<script setup lang="ts">
  import PageHeader from '@/components/ui/PageHeader.vue';
  const { t } = useI18n({ useScope: 'global' });
</script>
