<template>
  <button
    type="button"
    :class="[
      'bg-surface-900 cursor-pointer rounded-lg border border-white/12 px-4 py-3 shadow-md',
      'transition-all duration-150',
      'focus-visible:ring-surface-700/50 outline-none hover:shadow-lg focus-visible:ring-2',
      colorClasses.hover,
    ]"
    :aria-label="buttonAriaLabel"
    @click="$emit('click')"
  >
    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3">
        <div
          class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg"
          :class="colorClasses.iconBg"
        >
          <UIcon :name="icon" class="h-7 w-7" :class="colorClasses.icon" />
        </div>
        <div>
          <div class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
            {{ label }}
          </div>
          <div class="text-xl font-bold text-white">{{ completedDisplay }}/{{ totalDisplay }}</div>
        </div>
      </div>
      <div class="text-3xl font-bold" :class="colorClasses.percentage">
        {{ percentageDisplay }}%
      </div>
    </div>
    <DashboardProgressBar :percentage="percentage" :color="color" :aria-label="progressAriaLabel" />
  </button>
</template>
<script setup lang="ts">
  import {
    PROGRESS_CARD_COLOR_CLASSES,
    type ProgressCardColor,
  } from '@/features/dashboard/progressCard';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  const props = defineProps<{
    icon: string;
    label: string;
    completed: number;
    total: number;
    percentage: number;
    color: ProgressCardColor;
  }>();
  defineEmits<{
    click: [];
  }>();
  const formatNumber = useLocaleNumberFormatter();
  // Normalize the label to avoid awkward fallback phrases
  const normalizedLabel = computed(() => {
    const trimmed = props.label.trim();
    return trimmed || 'unlabeled progress';
  });
  // Computed aria-labels for accessibility
  const { t } = useI18n({ useScope: 'global' });
  const buttonAriaLabel = computed(() =>
    t('page.dashboard.progress_card.view_details', { label: normalizedLabel.value })
  );
  const progressAriaLabel = computed(() =>
    t('page.dashboard.progress_card.progress_label', { label: normalizedLabel.value })
  );
  const colorClasses = computed(() => PROGRESS_CARD_COLOR_CLASSES[props.color]);
  const percentageDisplay = computed(() => props.percentage.toFixed(2));
  const completedDisplay = computed(() => formatNumber(props.completed));
  const totalDisplay = computed(() => formatNumber(props.total));
</script>
