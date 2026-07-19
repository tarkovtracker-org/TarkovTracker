<template>
  <div class="bg-surface-700/70 relative overflow-hidden rounded-full" :class="sizeClass">
    <div
      class="absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-300 ease-out"
      :class="fillClass"
      :style="fillStyle"
      role="progressbar"
      :aria-label="ariaLabel"
      :aria-valuenow="percentage"
      aria-valuemin="0"
      aria-valuemax="100"
    ></div>
  </div>
</template>
<script setup lang="ts">
  import type { ProgressBarColor } from '@/features/dashboard/progressCard';
  const props = withDefaults(
    defineProps<{
      percentage: number;
      color?: ProgressBarColor;
      size?: 'sm' | 'md';
      ariaLabel?: string;
    }>(),
    {
      color: 'neutral',
      size: 'md',
      ariaLabel: undefined,
    }
  );
  const fillColors: Record<ProgressBarColor, string> = {
    primary: 'bg-primary-500',
    neutral: 'bg-surface-400',
    info: 'bg-info-500',
    success: 'bg-success-500',
    kappa: 'bg-kappa-500',
    lightkeeper: 'bg-lightkeeper-500',
    locked: 'bg-surface-600/40',
    gradient: '',
  };
  const sizeClass = computed(() => (props.size === 'sm' ? 'h-1' : 'h-2.5'));
  const fillClass = computed(() => fillColors[props.color]);
  const fillStyle = computed(() => {
    const style: Record<string, string> = { width: `${props.percentage}%` };
    if (props.color === 'gradient') {
      const hue = (props.percentage / 100) * 120;
      style.backgroundColor = `hsl(${hue}, 70%, 45%)`;
    }
    return style;
  });
</script>
