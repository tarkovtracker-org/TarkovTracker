<template>
  <div v-if="actionButtons.length" class="flex flex-wrap items-center gap-2">
    <UButton
      v-for="button in actionButtons"
      :key="button.key"
      :to="button.to"
      :href="button.href"
      :target="button.target"
      :rel="button.rel"
      :size="button.size"
      :color="button.color"
      :variant="button.variant"
      class="min-h-10 w-full justify-center sm:w-auto"
      :icon="button.icon"
      :trailing-icon="button.trailingIcon"
    >
      <span class="text-center sm:truncate">{{ button.label }}</span>
    </UButton>
  </div>
</template>
<script setup lang="ts">
  import {
    getGuidePrimaryAction,
    getGuideQuickActions,
    getGuideSecondaryLinks,
    type Resource,
    type ResourceAction,
  } from '@/features/resources/resourceData';
  const props = defineProps<{ resource: Resource }>();
  const { t } = useI18n({ useScope: 'global' });
  const toGuideButton = (action: ResourceAction, isPrimary: boolean) => ({
    key: `${action.kind}:${action.href}`,
    to: action.kind === 'internal' ? action.href : undefined,
    href: action.kind === 'external' ? action.href : undefined,
    target: action.external ? ('_blank' as const) : undefined,
    rel: action.external ? 'noopener noreferrer' : undefined,
    size: (isPrimary ? 'md' : 'sm') as 'md' | 'sm',
    color: (isPrimary ? 'primary' : 'neutral') as 'primary' | 'neutral',
    variant: (isPrimary ? 'solid' : 'soft') as 'solid' | 'soft',
    icon: action.icon,
    trailingIcon: action.external ? 'i-mdi-open-in-new' : undefined,
    label: t(action.labelKey, action.labelFallback),
  });
  const actionButtons = computed(() => {
    const primary = getGuidePrimaryAction(props.resource);
    const quick = getGuideQuickActions(props.resource);
    const secondary = getGuideSecondaryLinks(props.resource);
    const buttons = [];
    if (primary) {
      buttons.push(toGuideButton(primary, true));
    }
    quick.forEach((action, index) => {
      buttons.push(toGuideButton(action, !primary && index === 0));
    });
    for (const link of secondary) {
      buttons.push(toGuideButton(link, false));
    }
    return buttons;
  });
</script>
