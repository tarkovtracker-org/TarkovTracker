<template>
  <div class="flex min-w-0 flex-1 items-center gap-1">
    <AppTooltip :text="tooltipText">
      <a
        v-if="primaryUrl"
        :href="primaryUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="text-link hover:text-link-hover focus-visible:ring-primary-500 flex min-w-0 items-center gap-0.5 rounded-sm text-xs font-bold no-underline focus:outline-none focus-visible:ring-2"
      >
        <span class="truncate">{{ label }}</span>
        <UIcon
          name="i-mdi-open-in-new"
          class="text-surface-400 h-2.5 w-2.5 shrink-0"
          aria-hidden="true"
        />
      </a>
      <span v-else class="text-surface-100 block truncate text-xs font-semibold">{{ label }}</span>
    </AppTooltip>
    <slot />
    <AppTooltip v-if="devUrl" :text="t('common.view_on_tarkov_dev')">
      <a
        :href="devUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="text-surface-400 hover:text-surface-200 inline-flex shrink-0 items-center self-center rounded p-0.5 transition-colors"
      >
        <img
          src="/img/logos/tarkovdevlogo.webp"
          :alt="t('common.view_on_tarkov_dev')"
          class="h-4 w-4"
        />
      </a>
    </AppTooltip>
  </div>
</template>
<script setup lang="ts">
  import { useWikiLink } from '@/composables/useWikiLink';
  import { getKeyDevUrl, getKeyPrimaryUrl } from '@/utils/tarkovKeyHelpers';
  import type { TarkovItem } from '@/types/tarkov';
  const props = defineProps<{ item?: TarkovItem; label: string; tooltipText: string }>();
  const { t } = useI18n({ useScope: 'global' });
  const { toWikiUrl } = useWikiLink();
  const primaryUrl = computed(() =>
    props.item ? toWikiUrl(getKeyPrimaryUrl(props.item)) : undefined
  );
  const devUrl = computed(() => (props.item ? getKeyDevUrl(props.item) : undefined));
</script>
