<template>
  <div class="px-3 sm:px-6">
    <div
      class="mx-auto flex max-w-350 flex-col lg:has-data-hideout-map:min-h-[calc(100dvh-var(--shell-bar-h))] lg:has-data-hideout-map:max-w-none"
    >
      <div class="pt-6">
        <PageHeader v-bind="header" />
        <PublicHideoutRequirements />
      </div>
      <ClientOnly><HideoutPage /></ClientOnly>
    </div>
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
