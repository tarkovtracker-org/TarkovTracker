<template>
  <div>
    <div class="px-3 pt-6 sm:px-6">
      <div class="mx-auto max-w-350">
        <PageHeader v-bind="header" />
        <PublicHideoutRequirements />
      </div>
    </div>
    <ClientOnly><HideoutPage /></ClientOnly>
  </div>
</template>
<script setup lang="ts">
  import PageHeader from '@/components/ui/PageHeader.vue';
  import PublicHideoutRequirements from '@/features/hideout/PublicHideoutRequirements.vue';
  import HideoutPage from '@/pages/hideout.vue';
  const { t } = useI18n({ useScope: 'global' });
  const header = computed(() => ({
    title: t('common.hideout'),
    description: t('seo.routes.hideout.description'),
  }));
</script>
