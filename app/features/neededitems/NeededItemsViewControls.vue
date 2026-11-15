<template>
  <div class="flex items-center gap-2">
    <div
      v-for="control in controls"
      :key="control.key"
      role="group"
      :aria-label="control.label"
      :data-testid="`needed-items-${control.key}`"
      class="bg-surface-950 flex items-center rounded-md p-0.5 ring-1 ring-white/10"
    >
      <button
        v-for="option in control.options"
        :key="option.value"
        type="button"
        :aria-pressed="option.active"
        :aria-label="option.label"
        :title="option.hint"
        :data-testid="`needed-items-${control.key}-${option.value}`"
        class="focus-visible:ring-primary-400 flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        :class="
          option.active
            ? 'bg-surface-700 text-surface-50'
            : 'text-surface-400 hover:text-surface-100'
        "
        @click="option.select"
      >
        <UIcon :name="option.icon" class="size-4 shrink-0" aria-hidden="true" />
        <span v-if="control.showText">{{ option.label }}</span>
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
  import type { NeededItemsViewMode } from '@/features/neededitems/neededItemsFilterNormalization';
  /**
   * Two independent choices: what one entry stands for (an item, or one quest/hideout need)
   * and how entries are laid out (list rows or grid tiles). Every combination uses the same
   * entry design and the same tracking controls.
   */
  const viewMode = defineModel<NeededItemsViewMode>('viewMode', { required: true });
  const groupByItem = defineModel<boolean>('groupByItem', { required: true });
  const { t } = useI18n({ useScope: 'global' });
  const controls = computed(() => [
    {
      key: 'show',
      label: t('page.needed_items.view.show'),
      showText: true,
      options: [
        {
          value: 'items',
          icon: 'i-mdi-package-variant-closed',
          label: t('page.needed_items.view.items'),
          hint: t('page.needed_items.view.items_hint'),
          active: groupByItem.value,
          select: () => (groupByItem.value = true),
        },
        {
          value: 'needs',
          icon: 'i-mdi-format-list-checks',
          label: t('page.needed_items.view.needs'),
          hint: t('page.needed_items.view.needs_hint'),
          active: !groupByItem.value,
          select: () => (groupByItem.value = false),
        },
      ],
    },
    {
      key: 'layout',
      label: t('page.needed_items.view.layout'),
      showText: false,
      options: [
        {
          value: 'list',
          icon: 'i-mdi-view-list',
          label: t('page.needed_items.view.list'),
          hint: t('page.needed_items.view.list'),
          active: viewMode.value === 'list',
          select: () => (viewMode.value = 'list'),
        },
        {
          value: 'grid',
          icon: 'i-mdi-view-grid',
          label: t('page.needed_items.view.grid'),
          hint: t('page.needed_items.view.grid'),
          active: viewMode.value === 'grid',
          select: () => (viewMode.value = 'grid'),
        },
      ],
    },
  ]);
</script>
