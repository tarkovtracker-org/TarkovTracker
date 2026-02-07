<template>
  <div class="flex items-center gap-0.5">
    <!-- Counter controls group with background -->
    <div class="bg-surface-700 flex items-center rounded-lg border border-white/20 shadow-sm">
      <!-- Decrease button -->
      <AppTooltip :text="$t('needed_items.aria.decrease_count')">
        <button
          class="text-surface-200 hover:bg-surface-600 active:bg-surface-500 flex h-5 w-5 items-center justify-center rounded-l-lg transition-colors hover:text-white sm:h-6 sm:w-6 lg:h-8 lg:w-8"
          :aria-label="$t('needed_items.aria.decrease_count')"
          @click="$emit('decrease')"
        >
          <UIcon name="i-mdi-minus" class="h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-5 lg:w-5" />
        </button>
      </AppTooltip>
      <div
        class="bg-surface-800 flex h-5 min-w-8 items-center justify-center border-x border-white/20 sm:h-6 sm:min-w-10 lg:h-8 lg:min-w-16"
      >
        <template v-if="isEditing">
          <input
            ref="inputRef"
            v-model.number="editValue"
            type="number"
            :min="0"
            :max="neededCount"
            :aria-label="$t('needed_items.aria.enter_count')"
            class="bg-surface-900 focus:ring-primary-500 h-full w-full px-0.5 text-center text-[10px] font-semibold text-white focus:ring-2 focus:outline-none focus:ring-inset sm:text-xs lg:px-2 lg:text-sm"
            @blur="submitEdit"
            @keydown.enter="submitEdit"
            @keydown.escape="cancelEdit"
          />
        </template>
        <template v-else>
          <AppTooltip :text="$t('needed_items.aria.click_to_enter_value')">
            <button
              class="hover:bg-surface-600 h-full w-full px-0.5 text-[10px] font-semibold text-white transition-colors sm:text-xs lg:px-2 lg:text-sm"
              :aria-label="$t('needed_items.aria.click_to_enter_value')"
              @click="startEditing"
            >
              {{ formatNumber(currentCount) }}/{{ formatNumber(neededCount) }}
            </button>
          </AppTooltip>
        </template>
      </div>
      <!-- Increase button -->
      <AppTooltip :text="$t('needed_items.aria.increase_count')">
        <button
          class="text-surface-200 hover:bg-surface-600 active:bg-surface-500 flex h-5 w-5 items-center justify-center rounded-r-lg transition-colors hover:text-white sm:h-6 sm:w-6 lg:h-8 lg:w-8"
          :aria-label="$t('needed_items.aria.increase_count')"
          @click="$emit('increase')"
        >
          <UIcon name="i-mdi-plus" class="h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-5 lg:w-5" />
        </button>
      </AppTooltip>
    </div>
    <!-- Mark as 100% complete button - separated with more spacing -->
    <AppTooltip
      :text="
        currentCount >= neededCount
          ? $t('needed_items.aria.mark_as_incomplete')
          : $t('needed_items.aria.mark_as_complete')
      "
    >
      <button
        class="flex h-5 w-5 items-center justify-center rounded-lg border transition-colors sm:h-6 sm:w-6 lg:h-8 lg:w-8"
        :aria-label="
          currentCount >= neededCount
            ? $t('needed_items.aria.mark_as_incomplete')
            : $t('needed_items.aria.mark_as_complete')
        "
        :class="
          currentCount >= neededCount
            ? 'bg-success-600 border-success-500 hover:bg-success-500 text-white'
            : 'bg-surface-700 text-surface-200 hover:bg-surface-600 border-white/20 hover:text-white'
        "
        @click="$emit('toggle')"
      >
        <UIcon name="i-mdi-check-circle" class="h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-5 lg:w-5" />
      </button>
    </AppTooltip>
  </div>
</template>
<script setup lang="ts">
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  const formatNumber = useLocaleNumberFormatter();
  const props = defineProps<{
    currentCount: number;
    neededCount: number;
  }>();
  const emit = defineEmits<{
    decrease: [];
    increase: [];
    toggle: [];
    setCount: [count: number];
  }>();
  const isEditing = ref(false);
  const editValue = ref(0);
  const inputRef = ref<HTMLInputElement | null>(null);
  const startEditing = () => {
    editValue.value = props.currentCount;
    isEditing.value = true;
    nextTick(() => {
      inputRef.value?.focus();
      inputRef.value?.select();
    });
  };
  const submitEdit = () => {
    if (isEditing.value) {
      // Clamp value between 0 and neededCount
      const clampedValue = Math.max(0, Math.min(editValue.value || 0, props.neededCount));
      emit('setCount', clampedValue);
      isEditing.value = false;
    }
  };
  const cancelEdit = () => {
    isEditing.value = false;
  };
  // Close editing if currentCount changes externally
  watch(
    () => props.currentCount,
    () => {
      if (isEditing.value) {
        isEditing.value = false;
      }
    }
  );
</script>
