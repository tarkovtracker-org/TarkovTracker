<template>
  <div class="flex min-w-0 items-center sm:gap-2">
    <div class="flex min-w-0 items-center">
      <PreferenceSwitch
        v-model="groupByItem"
        :label="$t('page.needed_items.view.show_once')"
        test-id="needed-items-show"
        class="min-w-0 max-sm:gap-0.5 max-sm:px-0"
      />
      <UPopover>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-mdi-information-outline"
          :aria-label="$t('page.needed_items.view.show_once_hint')"
        />
        <template #content>
          <p class="max-w-64 px-3 py-2 text-sm">
            {{ $t('page.needed_items.view.show_once_hint') }}
          </p>
        </template>
      </UPopover>
    </div>
    <div
      v-for="control in controls"
      :key="control.key"
      role="group"
      :aria-label="control.label"
      :data-testid="`needed-items-${control.key}`"
      class="bg-surface-950 flex shrink-0 items-center gap-0.5 rounded-md p-0.5 ring-1 ring-white/10"
    >
      <UButton
        v-for="option in control.options"
        :key="option.value"
        size="xs"
        color="neutral"
        variant="ghost"
        :icon="option.icon"
        :aria-pressed="option.active"
        :aria-label="option.label"
        :title="option.hint"
        :data-testid="`needed-items-${control.key}-${option.value}`"
        :class="
          option.active
            ? 'bg-surface-700 text-surface-50 hover:bg-surface-700'
            : 'text-surface-400 hover:text-surface-100'
        "
        @click="option.select"
      >
        <template v-if="control.showText">{{ option.label }}</template>
      </UButton>
    </div>
  </div>
</template>
<script setup lang="ts">
  import PreferenceSwitch from '@/components/ui/PreferenceSwitch.vue';
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
