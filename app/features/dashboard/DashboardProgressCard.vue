<template>
  <div
    :class="[
      'bg-surface-900 cursor-pointer rounded-lg border border-white/12 px-4 py-3 shadow-md',
      'transition-all duration-150',
      'focus-visible:ring-surface-700/50 outline-none hover:shadow-lg focus-visible:ring-2',
      hoverBorderClass,
    ]"
    role="button"
    tabindex="0"
    :aria-label="buttonAriaLabel"
    @click="$emit('click')"
    @keydown.enter="$emit('click')"
    @keydown.space.prevent="$emit('click')"
  >
    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3">
        <div
          class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg"
          :class="iconBgClass"
        >
          <UIcon :name="icon" class="h-7 w-7" :class="iconColorClass" />
        </div>
        <div>
          <div class="text-surface-400 text-xs font-medium tracking-wider uppercase">
            {{ label }}
          </div>
          <div class="text-xl font-bold text-white">{{ completedDisplay }}/{{ totalDisplay }}</div>
        </div>
      </div>
      <div class="text-3xl font-bold" :class="percentageColorClass">{{ percentageDisplay }}%</div>
    </div>
    <div class="bg-surface-800/35 relative h-2 overflow-hidden rounded-full">
      <div
        class="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out"
        :class="barGradientClass"
        :style="{ width: `${percentage}%` }"
        role="progressbar"
        :aria-label="progressAriaLabel"
        :aria-valuenow="percentage"
        aria-valuemin="0"
        aria-valuemax="100"
      ></div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import type { ProgressCardColor } from '@/features/dashboard/progressCard';
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
  const colorClasses: Record<
    ProgressCardColor,
    { hover: string; iconBg: string; icon: string; percentage: string; bar: string }
  > = {
    primary: {
      hover: 'hover:border-surface-600',
      iconBg: 'bg-primary-600/15',
      icon: 'text-primary-400',
      percentage: 'text-primary-400',
      bar: 'bg-primary-500/60',
    },
    neutral: {
      hover: 'hover:border-surface-600',
      iconBg: 'bg-surface-700',
      icon: 'text-surface-300',
      percentage: 'text-surface-50',
      bar: 'bg-surface-400/60',
    },
    info: {
      hover: 'hover:border-surface-600',
      iconBg: 'bg-info-600/15',
      icon: 'text-info-400',
      percentage: 'text-info-400',
      bar: 'bg-info-500/60',
    },
    success: {
      hover: 'hover:border-surface-600',
      iconBg: 'bg-success-600/15',
      icon: 'text-success-400',
      percentage: 'text-success-400',
      bar: 'bg-success-500/60',
    },
    kappa: {
      hover: 'hover:border-surface-600',
      iconBg: 'bg-kappa-600/15',
      icon: 'text-kappa-400',
      percentage: 'text-kappa-400',
      bar: 'bg-kappa-500/60',
    },
    lightkeeper: {
      hover: 'hover:border-surface-600',
      iconBg: 'bg-lightkeeper-600/15',
      icon: 'text-lightkeeper-400',
      percentage: 'text-lightkeeper-400',
      bar: 'bg-lightkeeper-500/60',
    },
  };
  const hoverBorderClass = computed(() => colorClasses[props.color].hover);
  const iconBgClass = computed(() => colorClasses[props.color].iconBg);
  const iconColorClass = computed(() => colorClasses[props.color].icon);
  const percentageColorClass = computed(() => colorClasses[props.color].percentage);
  const barGradientClass = computed(() => colorClasses[props.color].bar);
  const percentageDisplay = computed(() => props.percentage.toFixed(2));
  const completedDisplay = computed(() => formatNumber(props.completed));
  const totalDisplay = computed(() => formatNumber(props.total));
</script>
