<script setup lang="ts">
  import type { SelectMenuItem } from '#ui/types';
  type SelectMenuItemLike =
    | SelectMenuItem
    | (Record<string, string | number | boolean | undefined> & {
        label?: string;
        value?: string | number;
      });
  type SelectMenuValue = SelectMenuItemLike | number | string;
  const props = defineProps<{
    modelValue?: SelectMenuValue;
    items?: SelectMenuValue[];
    valueKey?: string;
    labelKey?: string;
  }>();
  defineEmits(['update:modelValue']);
  const slots = useSlots();
  const attrs = useAttrs();
  const hasCustomDefault = computed(() => !!slots.default);
  const valueKey = computed(() => props.valueKey || 'value');
  const labelKey = computed(() => props.labelKey || 'label');
  const asRecord = (value: SelectMenuValue | undefined) =>
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  const getProp = (value: SelectMenuValue | undefined, key: string) => {
    const record = asRecord(value);
    if (!record) return value;
    const hasKey = Object.prototype.hasOwnProperty.call(record, key) || key in (record as object);
    return hasKey ? record[key] : value;
  };
  const getCurrentLabel = () => {
    if (!props.items?.length) return '';
    const currentItem = props.items.find((item) => {
      const itemValue = getProp(item, valueKey.value);
      const compareValue = getProp(props.modelValue, valueKey.value);
      return itemValue === compareValue;
    });
    if (!currentItem) return '';
    const currentRecord = asRecord(currentItem);
    return currentRecord ? currentRecord[labelKey.value] : currentItem;
  };
  const getLongestLabel = () => {
    if (!props.items?.length) return '';
    const labels = props.items.map((item) => {
      const record = asRecord(item);
      return record ? record[labelKey.value] : item;
    });
    return labels.reduce((longest, label) => {
      const labelStr = String(label || '');
      const longestStr = String(longest || '');
      return labelStr.length > longestStr.length ? labelStr : longestStr;
    }, '');
  };
  const defaultUi = {
    base: 'cursor-pointer rounded-md border border-border bg-field px-3 py-2 ring-0 outline-none',
    leading: 'shrink-0 text-foreground-muted',
    trailing: 'shrink-0 text-foreground-subtle',
    value: 'text-foreground',
    placeholder: 'text-foreground-subtle',
    content:
      'z-[9999] !w-[var(--reka-combobox-trigger-width)] rounded-lg border border-border bg-panel shadow-elevated',
    viewport: 'p-1 max-h-60 overflow-y-auto',
    item: 'cursor-pointer rounded px-3 py-2 text-sm text-foreground-muted transition-colors data-[highlighted]:bg-interactive data-[highlighted]:text-foreground data-[state=checked]:bg-selected-surface data-[state=checked]:font-medium data-[state=checked]:text-foreground',
    itemLabel: 'whitespace-nowrap',
    itemTrailingIcon: 'shrink-0 text-foreground-subtle',
  };
  const mergedUi = computed(() => {
    const attrsUi = (attrs.ui as Record<string, string>) || {};
    return { ...defaultUi, ...attrsUi };
  });
</script>
<template>
  <USelectMenu
    v-bind="$attrs"
    :model-value="modelValue"
    :items="items"
    :value-key="valueKey"
    :label-key="labelKey"
    :search-input="false"
    :ui="mergedUi"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template v-if="!hasCustomDefault" #default>
      <span class="inline-grid">
        <span class="col-start-1 row-start-1 justify-self-start">
          {{ getCurrentLabel() }}
        </span>
        <span class="invisible col-start-1 row-start-1 pr-6 whitespace-nowrap">
          {{ getLongestLabel() }}
        </span>
      </span>
    </template>
    <template v-for="(_, name) in $slots" #[name]="slotData">
      <slot :name="name" v-bind="slotData" />
    </template>
  </USelectMenu>
</template>
