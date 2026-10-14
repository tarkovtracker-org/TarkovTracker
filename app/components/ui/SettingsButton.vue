<template>
  <UButton
    variant="ghost"
    color="neutral"
    size="sm"
    icon="i-mdi-tune-variant"
    class="border leading-none"
    :class="
      isOpen
        ? 'light:bg-surface-700/70 light:text-surface-50 border-white/20 bg-white/10 text-white'
        : 'text-surface-200 border-white/10'
    "
    :aria-label="label"
    :aria-expanded="isOpen"
    @click="toggle"
  >
    <span class="hidden text-xs leading-none uppercase sm:inline">
      {{ t('common.settings') }}
    </span>
  </UButton>
</template>
<script setup lang="ts">
  import { usePageSettingsDrawer } from '@/composables/usePageSettingsDrawer';
  import type { PageSettingsDrawerKey } from '@/composables/usePageSettingsDrawer';
  const props = defineProps<{
    pageKey: PageSettingsDrawerKey;
    /** Accessible name naming the page, e.g. "Task settings". */
    label: string;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const { isOpen, toggle } = usePageSettingsDrawer(props.pageKey);
</script>
