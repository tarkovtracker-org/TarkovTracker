<template>
  <div class="flex items-center gap-1">
    <UButton
      v-for="option in viewOptions"
      :key="option.key"
      :icon="option.icon"
      :color="option.isActive ? 'primary' : 'neutral'"
      :variant="option.isActive ? 'soft' : 'ghost'"
      size="sm"
      :aria-pressed="option.isActive"
      :title="option.label"
      :aria-label="option.label"
      @click="option.select"
    />
    <!-- Card style only applies to the ungrouped grid. -->
    <div v-if="isGridViewActive" class="ml-1 border-l border-white/10 pl-1">
      <UButton
        :icon="cardStyle === 'compact' ? 'i-mdi-image' : 'i-mdi-image-text'"
        color="neutral"
        variant="ghost"
        size="sm"
        :title="cardStyleLabel"
        :aria-label="cardStyleLabel"
        @click="cardStyle = cardStyle === 'compact' ? 'expanded' : 'compact'"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
  import type {
    NeededItemsCardStyle,
    NeededItemsViewMode,
  } from '@/features/neededitems/neededItemsFilterNormalization';
  const viewMode = defineModel<NeededItemsViewMode>('viewMode', { required: true });
  const groupByItem = defineModel<boolean>('groupByItem', { required: true });
  const cardStyle = defineModel<NeededItemsCardStyle>('cardStyle', { required: true });
  const { t } = useI18n({ useScope: 'global' });
  const isListViewActive = computed(() => !groupByItem.value && viewMode.value === 'list');
  const isGridViewActive = computed(() => !groupByItem.value && viewMode.value === 'grid');
  const cardStyleLabel = computed(() =>
    cardStyle.value === 'compact'
      ? t('needed_items.switch_to_expanded')
      : t('needed_items.switch_to_compact')
  );
  const setViewMode = (mode: NeededItemsViewMode) => {
    groupByItem.value = false;
    viewMode.value = mode;
  };
  const viewOptions = computed(() => [
    {
      key: 'list',
      icon: 'i-mdi-view-list',
      label: t('page.needed_items.view.list'),
      isActive: isListViewActive.value,
      select: () => setViewMode('list'),
    },
    {
      key: 'grid',
      icon: 'i-mdi-view-grid',
      label: t('page.needed_items.view.grid'),
      isActive: isGridViewActive.value,
      select: () => setViewMode('grid'),
    },
    {
      key: 'combined',
      icon: 'i-mdi-group',
      label: t('page.needed_items.view.combined'),
      isActive: groupByItem.value,
      select: () => {
        groupByItem.value = true;
      },
    },
  ]);
</script>
