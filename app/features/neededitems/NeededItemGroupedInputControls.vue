<template>
  <div class="space-y-3">
    <div v-if="firNeeded > 0" class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-mdi-checkbox-marked-circle-outline" class="text-warning-400 h-4 w-4" />
        <span class="text-sm font-medium">{{ $t('needed_items.fir') }}</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="bg-surface-700 flex items-center rounded-lg border border-white/20">
          <button
            :disabled="isFirDecreaseDisabled"
            :class="[
              'text-surface-200 flex h-8 w-8 items-center justify-center rounded-l-lg transition-colors',
              isFirDecreaseDisabled
                ? 'opacity-40'
                : 'hover:bg-surface-600 active:bg-surface-500 hover:text-white',
            ]"
            :aria-label="$t('needed_items.aria.decrease_fir')"
            @click="handleDecreaseFir"
          >
            <UIcon name="i-mdi-minus" class="h-4 w-4" />
          </button>
          <div
            class="bg-surface-800 flex h-8 min-w-16 items-center justify-center border-x border-white/20"
          >
            <input
              v-if="isEditingFir"
              ref="firInputRef"
              v-model.number="firEditValue"
              type="number"
              :min="0"
              :max="firNeeded"
              step="1"
              class="bg-surface-900 focus:ring-primary-500 h-full w-full px-2 text-center text-sm font-semibold text-white focus:ring-2 focus:outline-none focus:ring-inset"
              @blur="submitFirEdit"
              @keydown.enter="submitFirEdit"
              @keydown.escape="cancelFirEdit"
            />
            <button
              v-else
              class="hover:bg-surface-600 h-full w-full px-2 text-sm font-semibold text-white transition-colors"
              @click="startFirEdit"
            >
              {{ firCurrent }}
            </button>
          </div>
          <button
            :disabled="isFirIncreaseDisabled"
            :class="[
              'text-surface-200 flex h-8 w-8 items-center justify-center rounded-r-lg transition-colors',
              isFirIncreaseDisabled
                ? 'opacity-40'
                : 'hover:bg-surface-600 active:bg-surface-500 hover:text-white',
            ]"
            :aria-label="$t('needed_items.aria.increase_fir')"
            @click="handleIncreaseFir"
          >
            <UIcon name="i-mdi-plus" class="h-4 w-4" />
          </button>
        </div>
        <span class="text-surface-400 text-sm">
          / {{ firNeeded }} {{ $t('needed_items.needed') }}
        </span>
      </div>
    </div>
    <div v-if="nonFirNeeded > 0" class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-mdi-checkbox-blank-circle-outline" class="text-surface-400 h-4 w-4" />
        <span class="text-sm font-medium">{{ $t('needed_items.non_fir') }}</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="bg-surface-700 flex items-center rounded-lg border border-white/20">
          <button
            :disabled="isNonFirDecreaseDisabled"
            :class="[
              'text-surface-200 flex h-8 w-8 items-center justify-center rounded-l-lg transition-colors',
              isNonFirDecreaseDisabled
                ? 'opacity-40'
                : 'hover:bg-surface-600 active:bg-surface-500 hover:text-white',
            ]"
            :aria-label="$t('needed_items.aria.decrease_non_fir')"
            @click="handleDecreaseNonFir"
          >
            <UIcon name="i-mdi-minus" class="h-4 w-4" />
          </button>
          <div
            class="bg-surface-800 flex h-8 min-w-16 items-center justify-center border-x border-white/20"
          >
            <input
              v-if="isEditingNonFir"
              ref="nonFirInputRef"
              v-model.number="nonFirEditValue"
              type="number"
              :min="0"
              :max="nonFirNeeded"
              step="1"
              class="bg-surface-900 focus:ring-primary-500 h-full w-full px-2 text-center text-sm font-semibold text-white focus:ring-2 focus:outline-none focus:ring-inset"
              @blur="submitNonFirEdit"
              @keydown.enter="submitNonFirEdit"
              @keydown.escape="cancelNonFirEdit"
            />
            <button
              v-else
              class="hover:bg-surface-600 h-full w-full px-2 text-sm font-semibold text-white transition-colors"
              @click="startNonFirEdit"
            >
              {{ nonFirCurrent }}
            </button>
          </div>
          <button
            :disabled="isNonFirIncreaseDisabled"
            :class="[
              'text-surface-200 flex h-8 w-8 items-center justify-center rounded-r-lg transition-colors',
              isNonFirIncreaseDisabled
                ? 'opacity-40'
                : 'hover:bg-surface-600 active:bg-surface-500 hover:text-white',
            ]"
            :aria-label="$t('needed_items.aria.increase_non_fir')"
            @click="handleIncreaseNonFir"
          >
            <UIcon name="i-mdi-plus" class="h-4 w-4" />
          </button>
        </div>
        <span class="text-surface-400 text-sm">
          / {{ nonFirNeeded }} {{ $t('needed_items.needed') }}
        </span>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
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
  const firInputRef = ref<HTMLInputElement | null>(null);
  const nonFirInputRef = ref<HTMLInputElement | null>(null);
  const handleExternalChange = (value: number) => {
    toast.add({
      title: t('toast.count_edit_updated.title'),
      description: t('toast.count_edit_updated.description', { value }),
      color: 'warning',
    });
  };
  const {
    isEditing: isEditingFir,
    editValue: firEditValue,
    startEdit: startFirEditBase,
    commitEdit: submitFirEdit,
    cancelEdit: cancelFirEdit,
    increase: increaseFir,
    decrease: decreaseFir,
  } = useCountEditController({
    current: () => props.firCurrent,
    max: () => props.firNeeded,
    onUpdate: (value) => emit('update:fir', value),
    onExternalChange: handleExternalChange,
  });
  const {
    isEditing: isEditingNonFir,
    editValue: nonFirEditValue,
    startEdit: startNonFirEditBase,
    commitEdit: submitNonFirEdit,
    cancelEdit: cancelNonFirEdit,
    increase: increaseNonFir,
    decrease: decreaseNonFir,
  } = useCountEditController({
    current: () => props.nonFirCurrent,
    max: () => props.nonFirNeeded,
    onUpdate: (value) => emit('update:nonFir', value),
    onExternalChange: handleExternalChange,
  });
  const isFirDecreaseDisabled = computed(() => props.firCurrent <= 0);
  const isFirIncreaseDisabled = computed(() => props.firCurrent >= props.firNeeded);
  const isNonFirDecreaseDisabled = computed(() => props.nonFirCurrent <= 0);
  const isNonFirIncreaseDisabled = computed(() => props.nonFirCurrent >= props.nonFirNeeded);
  const handleDecreaseFir = () => {
    decreaseFir();
  };
  const handleIncreaseFir = () => {
    increaseFir();
  };
  const handleDecreaseNonFir = () => {
    decreaseNonFir();
  };
  const handleIncreaseNonFir = () => {
    increaseNonFir();
  };
  const startFirEdit = () => {
    startFirEditBase();
    nextTick(() => firInputRef.value?.focus());
  };
  const startNonFirEdit = () => {
    startNonFirEditBase();
    nextTick(() => nonFirInputRef.value?.focus());
  };
</script>
