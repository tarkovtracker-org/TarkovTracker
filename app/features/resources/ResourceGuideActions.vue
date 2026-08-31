<template>
  <div class="flex flex-wrap items-center gap-2">
    <UButton
      v-if="primaryAction"
      :href="primaryAction.href"
      target="_blank"
      rel="noopener noreferrer"
      size="md"
      color="primary"
      variant="solid"
      class="min-h-10"
      :icon="primaryAction.icon"
      trailing-icon="i-mdi-open-in-new"
      :label="t(primaryAction.labelKey, primaryAction.labelFallback)"
    />
    <UButton
      v-for="link in secondaryLinks"
      :key="link.href"
      :href="link.href"
      target="_blank"
      rel="noopener noreferrer"
      size="sm"
      color="neutral"
      variant="soft"
      class="min-h-10"
      :icon="link.icon"
      trailing-icon="i-mdi-open-in-new"
      :label="t(link.labelKey, link.labelFallback)"
    />
  </div>
</template>
<script setup lang="ts">
  import {
    getGuidePrimaryAction,
    getGuideSecondaryLinks,
    type Resource,
  } from '@/features/resources/resourceData';
  const props = defineProps<{ resource: Resource }>();
  const { t } = useI18n({ useScope: 'global' });
  const primaryAction = computed(() => getGuidePrimaryAction(props.resource));
  const secondaryLinks = computed(() => getGuideSecondaryLinks(props.resource));
</script>
