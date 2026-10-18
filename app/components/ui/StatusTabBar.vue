<template>
  <div
    class="bg-surface-900 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-white/12 px-3 py-2.5 shadow-sm sm:px-4"
  >
    <div
      role="group"
      :aria-label="groupLabel"
      :data-help-target="tabsHelpTarget"
      class="flex max-w-full min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:flex-none"
    >
      <template v-for="tab in orderedTabs" :key="tab.value">
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          :class="[
            'shrink-0 gap-1.5',
            ...getTabClass(tab.tone, tab.value === modelValue),
            { 'cursor-default!': inertWhenSelected && tab.value === modelValue },
          ]"
          :aria-pressed="tab.value === modelValue"
          :data-help-target="tab.helpTarget"
          @click="onTabClick(tab.value)"
        >
          <UIcon :name="tab.icon" class="h-4 w-4 shrink-0" />
          <span class="sr-only text-xs uppercase sm:not-sr-only">{{ tab.label }}</span>
          <span
            :class="[
              'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white',
              getStatusBadgeClass(tab.tone, tab.count),
            ]"
          >
            {{ tab.count }}
          </span>
        </UButton>
        <span
          v-if="tab.value === ALL_TAB && showDivider"
          aria-hidden="true"
          data-testid="status-tab-divider"
          class="bg-surface-700/60 light:bg-surface-600 mx-0.5 h-6 w-px shrink-0 self-center"
        ></span>
      </template>
    </div>
    <div
      v-if="$slots.actions"
      class="ml-auto flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0"
    >
      <slot name="actions" />
    </div>
  </div>
</template>
<script setup lang="ts" generic="T extends string">
  import { getStatusBadgeClass, getTabClass } from '@/utils/statusTones';
  import type { StatusTabItem } from '@/utils/statusTones';
  const props = withDefaults(
    defineProps<{
      tabs: StatusTabItem<T>[];
      modelValue: T;
      /** Accessible name for the tab group. */
      groupLabel: string;
      /** The selected tab ignores clicks; pages that re-pick the current tab turn this off. */
      inertWhenSelected?: boolean;
      /** Help tour anchor for the tab group as a whole. */
      tabsHelpTarget?: string;
    }>(),
    { inertWhenSelected: true, tabsHelpTarget: undefined }
  );
  const emit = defineEmits<{
    'update:modelValue': [value: T];
  }>();
  const onTabClick = (value: T) => {
    if (props.inertWhenSelected && value === props.modelValue) return;
    emit('update:modelValue', value);
  };
  defineSlots<{ actions?: () => unknown }>();
  const ALL_TAB = 'all';
  // "All" always leads and is set apart from the narrowing tabs by a divider.
  const orderedTabs = computed(() => [
    ...props.tabs.filter((tab) => tab.value === ALL_TAB),
    ...props.tabs.filter((tab) => tab.value !== ALL_TAB),
  ]);
  const showDivider = computed(
    () => orderedTabs.value.length > 1 && orderedTabs.value[0]?.value === ALL_TAB
  );
</script>
