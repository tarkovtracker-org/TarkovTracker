<template>
  <SelectMenuFixed
    :model-value="modelValue"
    :items="items"
    value-key="value"
    size="sm"
    class="min-w-0 flex-1 sm:w-40 sm:flex-none 2xl:w-44"
    :aria-label="t('page.tasks.filters.trader_aria_label')"
    @update:model-value="onSelect"
  >
    <template #default>
      <span class="flex min-w-0 items-center gap-2">
        <span class="bg-surface-800 h-5 w-5 shrink-0 overflow-hidden rounded-full">
          <img
            v-if="selectedItem?.imageLink"
            :src="selectedItem.imageLink"
            alt=""
            class="h-full w-full object-cover"
          />
          <UIcon v-else name="i-mdi-account-group" class="text-surface-400 h-full w-full p-0.5" />
        </span>
        <span class="truncate">{{ selectedItem?.label ?? anyLabel }}</span>
      </span>
    </template>
    <template #item="{ item }">
      <span class="flex w-full items-center gap-2" :class="{ 'opacity-50': item.count === 0 }">
        <span class="bg-surface-800 h-6 w-6 shrink-0 overflow-hidden rounded-full">
          <img
            v-if="item.imageLink"
            :src="item.imageLink"
            alt=""
            class="h-full w-full object-cover"
          />
          <UIcon v-else name="i-mdi-account-group" class="text-surface-400 h-full w-full p-0.5" />
        </span>
        <span class="flex-1 truncate">{{ item.label }}</span>
        <span
          v-if="item.count !== undefined"
          class="light:text-surface-50 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white"
          :class="item.count > 0 ? 'bg-pve-500' : 'bg-surface-600'"
        >
          {{ item.count }}
        </span>
      </span>
    </template>
  </SelectMenuFixed>
</template>
<script setup lang="ts">
  type TraderOption = { id: string; name: string; imageLink?: string | null };
  type TraderFilterItem = {
    value: string;
    label: string;
    imageLink?: string | null;
    count?: number;
  };
  const props = defineProps<{
    /** Selected trader id, or `all` for every trader. */
    modelValue: string;
    traders: TraderOption[];
    counts: Record<string, number>;
    /** Offers the every-trader option; the graph always needs one trader. */
    allowAny?: boolean;
  }>();
  const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
  const { t } = useI18n({ useScope: 'global' });
  const anyLabel = computed(() => t('page.tasks.filters.all_traders'));
  const items = computed<TraderFilterItem[]>(() => {
    const traderItems = props.traders.map((trader) => ({
      value: trader.id,
      label: trader.name,
      imageLink: trader.imageLink,
      count: props.counts[trader.id] ?? 0,
    }));
    return props.allowAny ? [{ value: 'all', label: anyLabel.value }, ...traderItems] : traderItems;
  });
  const selectedItem = computed(() => items.value.find((item) => item.value === props.modelValue));
  const onSelect = (value: unknown) => {
    if (typeof value === 'string' && value !== props.modelValue) emit('update:modelValue', value);
  };
</script>
