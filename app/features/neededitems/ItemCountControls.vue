<template>
  <div class="flex items-center gap-0.5">
    <div class="bg-surface-700 flex items-center rounded-lg border border-white/20 shadow-sm">
      <AppTooltip :text="$t('needed_items.aria.decrease_count')">
        <button
          type="button"
          class="text-surface-200 hover:bg-surface-600 active:bg-surface-500 light:hover:text-surface-50 flex items-center justify-center rounded-l-lg transition-colors hover:text-white"
          :class="sizeClasses.button"
          :aria-label="$t('needed_items.aria.decrease_count')"
          @click="$emit('decrease')"
        >
          <UIcon name="i-mdi-minus" :class="sizeClasses.icon" />
        </button>
      </AppTooltip>
      <div
        class="bg-surface-800 flex items-center justify-center border-x border-white/20"
        :class="sizeClasses.value"
      >
        <template v-if="isEditing">
          <input
            ref="inputRef"
            v-model.number="editValue"
            type="number"
            :min="0"
            :max="neededCount"
            :aria-label="$t('needed_items.aria.enter_count')"
            class="bg-surface-900 focus:ring-primary-500 light:text-surface-50 h-full w-full text-center font-semibold text-white focus:ring-2 focus:outline-none focus:ring-inset"
            :class="sizeClasses.text"
            @blur="commitEdit"
            @keydown.enter="commitEdit"
            @keydown.escape="cancelEdit"
          />
        </template>
        <template v-else>
          <AppTooltip :text="$t('needed_items.aria.click_to_enter_value')">
            <button
              type="button"
              class="hover:bg-surface-600 light:text-surface-50 h-full w-full font-semibold text-white transition-colors"
              :class="sizeClasses.text"
              :aria-label="$t('needed_items.aria.click_to_enter_value')"
              @click="startEdit"
            >
              {{ formatNumber(currentCount) }}/{{ formatNumber(neededCount) }}
            </button>
          </AppTooltip>
        </template>
      </div>
      <AppTooltip :text="$t('needed_items.aria.increase_count')">
        <button
          type="button"
          class="text-surface-200 hover:bg-surface-600 active:bg-surface-500 light:hover:text-surface-50 flex items-center justify-center rounded-r-lg transition-colors hover:text-white"
          :class="sizeClasses.button"
          :aria-label="$t('needed_items.aria.increase_count')"
          @click="$emit('increase')"
        >
          <UIcon name="i-mdi-plus" :class="sizeClasses.icon" />
        </button>
      </AppTooltip>
    </div>
    <AppTooltip :text="toggleLabel">
      <button
        type="button"
        class="flex items-center justify-center rounded-lg border transition-colors"
        :aria-label="toggleLabel"
        :class="[
          sizeClasses.button,
          isComplete
            ? 'bg-success-600 border-success-500 hover:bg-success-500 text-white'
            : 'bg-surface-700 text-surface-200 hover:bg-surface-600 light:hover:text-surface-50 border-white/20 hover:text-white',
        ]"
        @click="$emit('toggle')"
      >
        <UIcon name="i-mdi-check-circle" :class="sizeClasses.icon" />
      </button>
    </AppTooltip>
  </div>
</template>
<script setup lang="ts">
  import { useCountEditController } from '@/composables/useCountEditController';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  type ItemCountControlsSize = 'xs' | 'sm' | 'responsive';
  const SIZE_CLASSES: Record<
    ItemCountControlsSize,
    { button: string; icon: string; value: string; text: string }
  > = {
    xs: {
      button: 'h-5 w-5',
      icon: 'h-3 w-3',
      value: 'h-5 min-w-8',
      text: 'px-0.5 text-[10px]',
    },
    sm: {
      button: 'h-6 w-6',
      icon: 'h-3.5 w-3.5',
      value: 'h-6 min-w-10',
      text: 'px-1 text-xs',
    },
    responsive: {
      button: 'h-5 w-5 sm:h-6 sm:w-6 lg:h-8 lg:w-8',
      icon: 'h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-5 lg:w-5',
      value: 'h-5 min-w-8 sm:h-6 sm:min-w-10 lg:h-8 lg:min-w-16',
      text: 'px-0.5 text-[10px] sm:text-xs lg:px-2 lg:text-sm',
    },
  };
  const formatNumber = useLocaleNumberFormatter();
  const { t } = useI18n({ useScope: 'global' });
  const props = withDefaults(
    defineProps<{
      currentCount: number;
      neededCount: number;
      size?: ItemCountControlsSize;
    }>(),
    { size: 'responsive' }
  );
  const emit = defineEmits<{
    decrease: [];
    increase: [];
    toggle: [];
    setCount: [count: number];
  }>();
  const sizeClasses = computed(() => SIZE_CLASSES[props.size]);
  const isComplete = computed(() => props.currentCount >= props.neededCount);
  const toggleLabel = computed(() =>
    isComplete.value
      ? t('needed_items.aria.mark_as_incomplete')
      : t('needed_items.aria.mark_as_complete')
  );
  const { isEditing, editValue, inputRef, startEdit, commitEdit, cancelEdit } =
    useCountEditController({
      current: () => props.currentCount,
      max: () => props.neededCount,
      onUpdate: (count) => emit('setCount', count),
      externalChangeBehavior: 'cancel',
    });
</script>
