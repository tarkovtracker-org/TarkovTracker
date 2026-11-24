<template>
  <div v-if="hasActions" class="flex flex-wrap items-center gap-2">
    <UButton
      v-if="primaryAction"
      :href="primaryAction.href"
      target="_blank"
      rel="noopener noreferrer"
      size="md"
      color="primary"
      variant="solid"
      class="min-h-10 w-full justify-center sm:w-auto"
      :icon="primaryAction.icon"
      trailing-icon="i-mdi-open-in-new"
    >
      <span class="text-center sm:truncate">
        {{ t(primaryAction.labelKey, primaryAction.labelFallback) }}
      </span>
    </UButton>
    <UButton
      v-for="(action, index) in quickActions"
      :key="action.href"
      :to="action.href"
      :size="!primaryAction && index === 0 ? 'md' : 'sm'"
      :color="!primaryAction && index === 0 ? 'primary' : 'neutral'"
      :variant="!primaryAction && index === 0 ? 'solid' : 'soft'"
      class="min-h-10 w-full justify-center sm:w-auto"
      :icon="action.icon"
    >
      <span class="text-center sm:truncate">
        {{ t(action.labelKey, action.labelFallback) }}
      </span>
    </UButton>
    <UButton
      v-for="link in secondaryLinks"
      :key="link.href"
      :href="link.href"
      target="_blank"
      rel="noopener noreferrer"
      size="sm"
      color="neutral"
      variant="soft"
      class="min-h-10 w-full justify-center sm:w-auto"
      :icon="link.icon"
      trailing-icon="i-mdi-open-in-new"
    >
      <span class="text-center sm:truncate">{{ t(link.labelKey, link.labelFallback) }}</span>
    </UButton>
  </div>
</template>
<script setup lang="ts">
  import {
    getGuidePrimaryAction,
    getGuideQuickActions,
    getGuideSecondaryLinks,
    type Resource,
  } from '@/features/resources/resourceData';
  const props = defineProps<{ resource: Resource }>();
  const { t } = useI18n({ useScope: 'global' });
  const primaryAction = computed(() => getGuidePrimaryAction(props.resource));
  const quickActions = computed(() => getGuideQuickActions(props.resource));
  const secondaryLinks = computed(() => getGuideSecondaryLinks(props.resource));
  const hasActions = computed(
    () =>
      Boolean(primaryAction.value) ||
      quickActions.value.length > 0 ||
      secondaryLinks.value.length > 0
  );
</script>
