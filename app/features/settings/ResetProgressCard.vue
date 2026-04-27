<template>
  <GenericCard
    icon="mdi-delete-sweep"
    icon-color="error"
    highlight-color="error"
    :fill-height="false"
    :title="$t('settings.data_management.reset_title')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="px-4 py-4">
        <ResetProgressSection />
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import ResetProgressSection from '@/features/settings/ResetProgressSection.vue';
</script>
