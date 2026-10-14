<template>
  <SelectMenuFixed
    v-model="sortBy"
    :items="items"
    value-key="value"
    size="sm"
    :class="selectClass"
    :aria-label="label"
  >
    <template #leading>
      <UIcon :name="leadingIcon" class="h-4 w-4" />
    </template>
    <template #item="{ item }">
      <div class="flex items-center gap-2">
        <UIcon :name="item.icon" class="h-4 w-4" />
        <span>{{ item.label }}</span>
      </div>
    </template>
  </SelectMenuFixed>
  <UButton
    color="neutral"
    variant="ghost"
    size="sm"
    :icon="direction === 'asc' ? 'i-mdi-sort-ascending' : 'i-mdi-sort-descending'"
    :aria-label="
      direction === 'asc' ? t('filter_menu.sort_ascending') : t('filter_menu.sort_descending')
    "
    @click="emit('toggle-direction')"
  />
</template>
<script setup lang="ts" generic="T extends string">
  import SelectMenuFixed from '@/components/SelectMenuFixed.vue';
  defineProps<{
    items: Array<{ value: T; label: string; icon: string }>;
    label: string;
    leadingIcon: string;
    direction: 'asc' | 'desc';
    selectClass?: string;
  }>();
  const emit = defineEmits<{ 'toggle-direction': [] }>();
  /** The select emits whatever it receives, so pages normalize the value in their own setter. */
  const sortBy = defineModel<T>({ required: true });
  const { t } = useI18n({ useScope: 'global' });
</script>
