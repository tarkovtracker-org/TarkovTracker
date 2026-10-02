<template>
  <ClientOnly>
    <ChangelogPage>
      <template #header>
        <PageHeader v-bind="header" />
      </template>
    </ChangelogPage>
    <template #fallback>
      <UContainer class="px-4 py-6">
        <div class="mx-auto w-full max-w-3xl">
          <PageHeader v-bind="header" />
        </div>
      </UContainer>
    </template>
  </ClientOnly>
</template>
<script setup lang="ts">
  import PageHeader from '@/components/ui/PageHeader.vue';
  import ChangelogPage from '@/pages/changelog.vue';
  const { t } = useI18n({ useScope: 'global' });
  const header = computed(() => ({
    title: t('page.changelog.title'),
    description: t('page.changelog.description'),
  }));
  definePageMeta({
    layout: 'default',
  });
</script>
