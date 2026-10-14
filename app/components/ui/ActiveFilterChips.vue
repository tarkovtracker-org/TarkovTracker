<template>
  <div
    v-if="filters.length > 0"
    :data-testid="testIdPrefix"
    class="flex flex-wrap items-center gap-1.5"
    role="group"
    :aria-label="t('filter_menu.active_label')"
  >
    <span class="text-surface-400 mr-0.5 text-xs" aria-hidden="true">
      {{ t('filter_menu.active_label') }}
    </span>
    <button
      v-for="filter in filters"
      :key="filter.key"
      type="button"
      :data-testid="`${testIdPrefix}-${filter.key}`"
      class="border-primary-500/35 bg-primary-500/10 hover:bg-primary-500/20 light:text-primary-700 inline-flex items-center gap-1 rounded-full border py-0.5 pr-1.5 pl-2.5 text-xs text-white transition-colors"
      :aria-label="t('filter_menu.remove_filter', { name: filter.label })"
      @click="filter.clear()"
    >
      {{ filter.label }}
      <UIcon name="i-mdi-close" class="h-3.5 w-3.5" aria-hidden="true" />
    </button>
    <UButton
      v-if="filters.length > 1"
      :data-testid="`${testIdPrefix}-clear`"
      variant="link"
      color="neutral"
      size="xs"
      @click="clearAll"
    >
      {{ t('filter_menu.clear_all') }}
    </UButton>
  </div>
</template>
<script setup lang="ts">
  import type { ActiveFilter } from '@/types/filters';
  const props = defineProps<{
    filters: ActiveFilter[];
    /** Test id of the chip row; chips get `<prefix>-<key>` and the clear button `<prefix>-clear`. */
    testIdPrefix: string;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const clearAll = () => {
    props.filters.forEach((filter) => filter.clear());
  };
</script>
