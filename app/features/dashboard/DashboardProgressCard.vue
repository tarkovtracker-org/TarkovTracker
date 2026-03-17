<template>
  <button
    type="button"
    :class="[
      'bg-panel border-border shadow-card cursor-pointer rounded-lg border px-4 py-3',
      'transition-all duration-150',
      'hover:bg-raised/65 outline-none hover:shadow-lg focus-visible:ring-2',
      hoverBorderClass,
    ]"
    :aria-label="buttonAriaLabel"
    @click="$emit('click')"
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
          <div class="text-foreground-muted text-xs font-semibold tracking-wider uppercase">
            {{ label }}
          </div>
          <div class="text-foreground text-xl font-bold">
            {{ completedDisplay }}/{{ totalDisplay }}
          </div>
        </div>
      </div>
      <div class="text-3xl font-bold" :class="percentageColorClass">{{ percentageDisplay }}%</div>
    </div>
    <DashboardProgressBar :percentage="percentage" :color="color" :aria-label="progressAriaLabel" />
  </button>
</template>
<script setup lang="ts">
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
    { hover: string; iconBg: string; icon: string; percentage: string }
  > = {
    primary: {
      hover: 'hover:border-primary-500/25 focus-visible:ring-primary-500/20',
      iconBg: 'bg-primary-600/15',
      icon: 'text-primary-400',
      percentage: 'text-primary-400',
    },
    neutral: {
      hover: 'hover:border-border-strong focus-visible:ring-border-strong/25',
      iconBg: 'bg-raised',
      icon: 'text-foreground-muted',
      percentage: 'text-foreground',
    },
    info: {
      hover: 'hover:border-info-500/25 focus-visible:ring-info-500/20',
      iconBg: 'bg-info-600/15',
      icon: 'text-info-400',
      percentage: 'text-info-400',
    },
    success: {
      hover: 'hover:border-success-500/25 focus-visible:ring-success-500/20',
      iconBg: 'bg-success-600/15',
      icon: 'text-success-400',
      percentage: 'text-success-400',
    },
    kappa: {
      hover: 'hover:border-kappa-500/25 focus-visible:ring-kappa-500/20',
      iconBg: 'bg-kappa-600/15',
      icon: 'text-kappa-400',
      percentage: 'text-kappa-400',
    },
    lightkeeper: {
      hover: 'hover:border-lightkeeper-500/25 focus-visible:ring-lightkeeper-500/20',
      iconBg: 'bg-lightkeeper-600/15',
      icon: 'text-lightkeeper-400',
      percentage: 'text-lightkeeper-400',
    },
  };
  const hoverBorderClass = computed(() => colorClasses[props.color].hover);
  const iconBgClass = computed(() => colorClasses[props.color].iconBg);
  const iconColorClass = computed(() => colorClasses[props.color].icon);
  const percentageColorClass = computed(() => colorClasses[props.color].percentage);
  const percentageDisplay = computed(() => props.percentage.toFixed(2));
  const completedDisplay = computed(() => formatNumber(props.completed));
  const totalDisplay = computed(() => formatNumber(props.total));
</script>
