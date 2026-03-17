<template>
  <div class="flex items-center gap-1">
    <span class="sr-only" aria-live="polite" aria-atomic="true">
      {{ formatNumber(currentCount) }} {{ t('page.tasks.questcard.of') }}
      {{ formatNumber(neededCount) }}
    </span>
    <div class="bg-field border-border flex items-center rounded-md border">
      <AppTooltip :text="t('page.tasks.questcard.decrease')">
        <span class="inline-flex">
          <button
            type="button"
            :disabled="disabled || currentCount <= 0"
            :aria-label="t('page.tasks.questcard.decrease')"
            class="focus-visible:ring-primary-500 focus-visible:ring-offset-panel text-foreground-muted hover:bg-interactive active:bg-interactive-hover flex h-7 w-7 items-center justify-center rounded-l-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            @click="$emit('decrease')"
          >
            <UIcon name="i-mdi-minus" aria-hidden="true" class="h-4 w-4" />
          </button>
        </span>
      </AppTooltip>
      <div
        v-if="!isEditing"
        class="text-foreground hover:bg-interactive flex h-7 min-w-14 items-center justify-center px-2 text-[11px] font-semibold tabular-nums"
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
          class="bg-panel border-border focus:border-border-strong text-foreground h-6 w-10 rounded border px-1 text-center text-[11px] font-semibold tabular-nums focus:outline-none"
          @blur="commitEdit"
          @keydown.enter="commitEdit"
          @keydown.escape="cancelEdit"
        />
        <span class="text-foreground text-[11px] font-semibold">
          /{{ formatNumber(neededCount) }}
        </span>
      </div>
      <AppTooltip :text="t('page.tasks.questcard.increase')">
        <span class="inline-flex">
          <button
            type="button"
            :disabled="disabled || currentCount >= neededCount"
            :aria-label="t('page.tasks.questcard.increase')"
            class="focus-visible:ring-primary-500 focus-visible:ring-offset-panel text-foreground-muted hover:bg-interactive active:bg-interactive-hover flex h-7 w-7 items-center justify-center rounded-r-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            @click="$emit('increase')"
          >
            <UIcon name="i-mdi-plus" aria-hidden="true" class="h-4 w-4" />
          </button>
        </span>
      </AppTooltip>
    </div>
    <AppTooltip
      :text="
        resolvedIsComplete
          ? t('page.tasks.questcard.complete')
          : t('page.tasks.questcard.mark_complete')
      "
    >
      <button
        type="button"
        :disabled="disabled"
        class="focus-visible:ring-primary-500 focus-visible:ring-offset-panel flex h-7 w-7 items-center justify-center rounded-md border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        :aria-label="
          resolvedIsComplete
            ? t('page.tasks.questcard.complete')
            : t('page.tasks.questcard.mark_complete')
        "
        :aria-pressed="resolvedIsComplete"
        :class="
          resolvedIsComplete
            ? 'bg-success-600 border-success-500 hover:bg-success-500 text-white'
            : 'text-foreground-muted border-border bg-field hover:bg-interactive'
        "
        @click="$emit('toggle')"
      >
        <UIcon name="i-mdi-check" aria-hidden="true" class="h-4 w-4" />
      </button>
    </AppTooltip>
  </div>
</template>
<script setup lang="ts">
  import { useCountEditController } from '@/composables/useCountEditController';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  const props = withDefaults(
    defineProps<{
      currentCount: number;
      neededCount: number;
      disabled?: boolean;
      isComplete?: boolean | null;
    }>(),
    {
      disabled: false,
      isComplete: null,
    }
  );
  const emit = defineEmits<{
    decrease: [];
    increase: [];
    toggle: [];
    'set-count': [value: number];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const formatNumber = useLocaleNumberFormatter();
  const toast = useToast();
  const resolvedIsComplete = computed(() => {
    if (props.isComplete !== null) {
      return props.isComplete;
    }
    return props.currentCount >= props.neededCount;
  });
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
