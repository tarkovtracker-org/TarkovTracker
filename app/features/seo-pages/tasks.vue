<template>
  <ClientOnly>
    <TasksPage>
      <template #header>
        <PageHeader v-bind="header" class="mb-4" />
      </template>
    </TasksPage>
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
  import TasksPage from '@/pages/tasks.vue';
  const { t } = useI18n({ useScope: 'global' });
  const header = computed(() => ({
    title: t('common.tasks'),
    description: t('seo.routes.tasks.description'),
  }));
  definePageMeta({
    usesWindowScroll: true,
  });
</script>
