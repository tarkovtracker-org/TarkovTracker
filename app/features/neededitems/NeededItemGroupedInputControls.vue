<template>
  <div class="space-y-3">
    <div v-for="row in visibleRows" :key="row.key" class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-2">
        <UIcon :name="row.icon" :class="['h-4 w-4', row.iconClass]" />
        <span class="text-sm font-medium">{{ $t(row.labelKey) }}</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="bg-surface-700 flex items-center rounded-lg border border-white/20">
          <button
            type="button"
            :disabled="row.current <= 0"
            :class="[
              'text-surface-200 flex h-8 w-8 items-center justify-center rounded-l-lg transition-colors',
              stepperStateClass(row.current <= 0),
            ]"
            :aria-label="$t(row.decreaseKey)"
            @click="row.controller.decrease"
          >
            <UIcon name="i-mdi-minus" class="h-4 w-4" />
          </button>
          <div
            class="bg-surface-800 flex h-8 min-w-16 items-center justify-center border-x border-white/20"
          >
            <input
              v-if="row.controller.isEditing.value"
              :ref="(el) => bindInput(row, el)"
              v-model.number="row.controller.editValue.value"
              type="number"
              :min="0"
              :max="row.needed"
              step="1"
              class="bg-surface-900 focus:ring-primary-500 light:text-surface-50 h-full w-full px-2 text-center text-sm font-semibold text-white focus:ring-2 focus:outline-none focus:ring-inset"
              @blur="row.controller.commitEdit"
              @keydown.enter="row.controller.commitEdit"
              @keydown.escape="row.controller.cancelEdit"
            />
            <button
              v-else
              type="button"
              class="hover:bg-surface-600 light:text-surface-50 h-full w-full px-2 text-sm font-semibold text-white transition-colors"
              @click="row.controller.startEdit"
            >
              {{ row.current }}
            </button>
          </div>
          <button
            type="button"
            :disabled="row.current >= row.needed"
            :class="[
              'text-surface-200 flex h-8 w-8 items-center justify-center rounded-r-lg transition-colors',
              stepperStateClass(row.current >= row.needed),
            ]"
            :aria-label="$t(row.increaseKey)"
            @click="row.controller.increase"
          >
            <UIcon name="i-mdi-plus" class="h-4 w-4" />
          </button>
        </div>
        <span class="text-surface-400 text-sm">
          / {{ row.needed }} {{ $t('needed_items.needed') }}
        </span>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useCountEditController } from '@/composables/useCountEditController';
  const props = defineProps<{
    firNeeded: number;
    firCurrent: number;
    nonFirNeeded: number;
    nonFirCurrent: number;
  }>();
  const emit = defineEmits<{
    'update:fir': [count: number];
    'update:nonFir': [count: number];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const handleExternalChange = (value: number) => {
    toast.add({
      title: t('toast.count_edit_updated.title'),
      description: t('toast.count_edit_updated.description', { value }),
      color: 'warning',
    });
  };
  const firController = useCountEditController({
    current: () => props.firCurrent,
    max: () => props.firNeeded,
    onUpdate: (value) => emit('update:fir', value),
    onExternalChange: handleExternalChange,
  });
  const nonFirController = useCountEditController({
    current: () => props.nonFirCurrent,
    max: () => props.nonFirNeeded,
    onUpdate: (value) => emit('update:nonFir', value),
    onExternalChange: handleExternalChange,
  });
  const visibleRows = computed(() =>
    [
      {
        key: 'fir' as const,
        icon: 'i-mdi-checkbox-marked-circle-outline',
        iconClass: 'text-warning-400',
        labelKey: 'common.fir',
        decreaseKey: 'needed_items.aria.decrease_fir',
        increaseKey: 'needed_items.aria.increase_fir',
        needed: props.firNeeded,
        current: props.firCurrent,
        controller: firController,
      },
      {
        key: 'nonFir' as const,
        icon: 'i-mdi-checkbox-blank-circle-outline',
        iconClass: 'text-surface-400',
        labelKey: 'needed_items.non_fir',
        decreaseKey: 'needed_items.aria.decrease_non_fir',
        increaseKey: 'needed_items.aria.increase_non_fir',
        needed: props.nonFirNeeded,
        current: props.nonFirCurrent,
        controller: nonFirController,
      },
    ].filter((row) => row.needed > 0)
  );
  type Row = (typeof visibleRows.value)[number];
  const stepperStateClass = (disabled: boolean) =>
    disabled
      ? 'opacity-40'
      : 'hover:bg-surface-600 active:bg-surface-500 light:hover:text-surface-50 hover:text-white';
  const bindInput = (row: Row, el: unknown) => {
    row.controller.inputRef.value = el instanceof HTMLInputElement ? el : null;
  };
</script>
