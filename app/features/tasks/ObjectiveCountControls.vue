<template>
  <div class="flex items-center gap-1">
    <span class="sr-only" aria-live="polite" aria-atomic="true">
      {{ formatNumber(currentCount) }} {{ t('page.tasks.questcard.of') }}
      {{ formatNumber(neededCount) }}
    </span>
    <div class="flex items-center rounded-md border border-white/10 bg-white/5">
      <AppTooltip :text="t('page.tasks.questcard.decrease')">
        <span class="inline-flex">
          <button
            type="button"
            :disabled="disabled || currentCount <= 0"
            :aria-label="t('page.tasks.questcard.decrease')"
            class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 text-surface-300 flex h-7 w-7 items-center justify-center rounded-l-md transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
            @click="$emit('decrease')"
          >
            <UIcon name="i-mdi-minus" aria-hidden="true" class="h-4 w-4" />
          </button>
        </span>
      </AppTooltip>
      <div
        v-if="!isEditing"
        class="text-surface-100 flex h-7 min-w-14 items-center justify-center px-2 text-[11px] font-semibold tabular-nums hover:bg-white/10"
        :title="t('page.tasks.questcard.click_to_edit')"
        @click="startEditing"
      >
        {{ formatNumber(currentCount) }}/{{ formatNumber(neededCount) }}
      </div>
      <div v-else class="flex h-7 min-w-14 items-center justify-center px-1">
        <input
          ref="inputRef"
          v-model.number="editValue"
          type="number"
          :min="0"
          :max="neededCount"
          class="focus:border-surface-400 text-surface-100 h-6 w-10 rounded border border-white/20 bg-white/10 px-1 text-center text-[11px] font-semibold tabular-nums focus:outline-none"
          @blur="commitEdit"
          @keydown.enter="commitEdit"
          @keydown.escape="cancelEdit"
        />
        <span class="text-surface-100 text-[11px] font-semibold">
          /{{ formatNumber(neededCount) }}
        </span>
      </div>
      <AppTooltip :text="t('page.tasks.questcard.increase')">
        <span class="inline-flex">
          <button
            type="button"
            :disabled="disabled || currentCount >= neededCount"
            :aria-label="t('page.tasks.questcard.increase')"
            class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 text-surface-300 flex h-7 w-7 items-center justify-center rounded-r-md transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
            @click="$emit('increase')"
          >
            <UIcon name="i-mdi-plus" aria-hidden="true" class="h-4 w-4" />
          </button>
        </span>
      </AppTooltip>
    </div>
    <AppTooltip
      :text="
        currentCount >= neededCount
          ? t('page.tasks.questcard.complete')
          : t('page.tasks.questcard.mark_complete')
      "
    >
      <button
        type="button"
        :disabled="disabled"
        class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 flex h-7 w-7 items-center justify-center rounded-md border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        :aria-label="
          currentCount >= neededCount
            ? t('page.tasks.questcard.complete')
            : t('page.tasks.questcard.mark_complete')
        "
        :aria-pressed="currentCount >= neededCount"
        :class="
          currentCount >= neededCount
            ? 'bg-success-600 border-success-500 hover:bg-success-500 text-white'
            : 'text-surface-300 border-white/10 bg-white/5 hover:bg-white/10'
        "
        @click="$emit('toggle')"
      >
        <UIcon name="i-mdi-check" aria-hidden="true" class="h-4 w-4" />
      </button>
    </AppTooltip>
  </div>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import { useCountEditController } from '@/composables/useCountEditController';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  const props = defineProps<{
    currentCount: number;
    neededCount: number;
    disabled?: boolean;
  }>();
  const emit = defineEmits<{
    decrease: [];
    increase: [];
    toggle: [];
    'set-count': [value: number];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const formatNumber = useLocaleNumberFormatter();
  const toast = useToast();
  const { isEditing, editValue, inputRef, startEdit, commitEdit, cancelEdit } =
    useCountEditController({
      current: () => props.currentCount,
      max: () => props.neededCount,
      onUpdate: (value) => {
        if (value !== props.currentCount) {
          emit('set-count', value);
        }
      },
      onExternalChange: (value) => {
        toast.add({
          title: t('toast.count_edit_updated.title'),
          description: t('toast.count_edit_updated.description', { value }),
          color: 'warning',
        });
      },
    });
  const startEditing = () => {
    if (props.disabled) return;
    startEdit();
  };
</script>
