<template>
  <div
    :class="[
      'shadow-card relative overflow-hidden rounded-md border px-4 py-3 transition-all',
      isAchieved ? achievedClasses : 'bg-panel border-border-muted',
    ]"
  >
    <div class="relative z-10">
      <div
        v-if="showsProgressRing"
        :aria-label="progressRingLabel"
        class="bg-field/90 mb-3 flex h-12 w-12 items-center justify-center rounded-full"
        role="img"
      >
        <div
          class="flex h-12 w-12 items-center justify-center rounded-full opacity-85"
          :style="progressRingStyle"
        >
          <div class="bg-panel h-8 w-8 rounded-full" />
        </div>
      </div>
      <UIcon
        v-else
        :name="isAchieved ? achievedIcon : unachievedIcon"
        :class="[
          'mb-3 h-12 w-12',
          isAchieved ? iconColorClass : 'text-foreground-subtle opacity-80',
        ]"
      />
      <div
        :class="[
          'mb-1 text-3xl font-bold',
          isAchieved ? 'text-foreground' : 'text-foreground-muted',
        ]"
      >
        {{ title }}
      </div>
      <div
        :class="[
          'text-xs font-medium tracking-wider uppercase',
          isAchieved ? 'text-foreground-muted' : 'text-foreground-subtle',
        ]"
      >
        {{ subtitle }}
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  export type MilestoneColor = 'primary' | 'info' | 'success' | 'kappa' | 'lightkeeper';
  const props = withDefaults(
    defineProps<{
      title: string;
      subtitle: string;
      isAchieved: boolean;
      achievedIcon: string;
      unachievedIcon: string;
      progressValue?: number | null;
      color?: MilestoneColor;
    }>(),
    {
      color: 'primary',
      progressValue: null,
    }
  );
  const colorClasses: Record<MilestoneColor, { achieved: string; icon: string; progress: string }> =
    {
      primary: {
        achieved: [
          'from-primary-500/10 via-panel to-shell border-primary-500/28',
          'bg-gradient-to-br shadow-lg shadow-primary-500/8',
        ].join(' '),
        icon: 'text-primary-400',
        progress: 'var(--color-primary-500)',
      },
      info: {
        achieved: [
          'from-info-500/10 via-panel to-shell border-info-500/28',
          'bg-gradient-to-br shadow-lg shadow-info-500/8',
        ].join(' '),
        icon: 'text-info-400',
        progress: 'var(--color-info-500)',
      },
      success: {
        achieved: [
          'from-success-500/10 via-panel to-shell border-success-500/28',
          'bg-gradient-to-br shadow-lg shadow-success-500/8',
        ].join(' '),
        icon: 'text-success-400',
        progress: 'var(--color-success-500)',
      },
      kappa: {
        achieved: [
          'from-kappa-500/10 via-panel to-shell border-kappa-500/28',
          'bg-gradient-to-br shadow-lg shadow-kappa-500/8',
        ].join(' '),
        icon: 'text-kappa-400',
        progress: 'var(--color-kappa-500)',
      },
      lightkeeper: {
        achieved: [
          'from-lightkeeper-500/10 via-panel to-shell border-lightkeeper-500/28',
          'bg-gradient-to-br shadow-lg shadow-lightkeeper-500/8',
        ].join(' '),
        icon: 'text-lightkeeper-400',
        progress: 'var(--color-lightkeeper-500)',
      },
    };
  const { t } = useI18n({ useScope: 'global' });
  const achievedClasses = computed(() => colorClasses[props.color].achieved);
  const iconColorClass = computed(() => colorClasses[props.color].icon);
  const showsProgressRing = computed(() => !props.isAchieved && props.progressValue !== null);
  const normalizedProgressValue = computed(() => {
    const rawValue = Number(props.progressValue ?? 0);
    const progressValue = Number.isFinite(rawValue) ? rawValue : 0;
    return Math.max(0, Math.min(100, progressValue));
  });
  const progressRingStyle = computed(() => {
    const progress = normalizedProgressValue.value * 3.6;
    const progressColor = colorClasses[props.color].progress;
    return {
      background: `conic-gradient(${progressColor} 0deg ${progress}deg, var(--theme-border-muted) ${progress}deg 360deg)`,
    };
  });
  const progressRingLabel = computed(() =>
    t('page.dashboard.progress_card.progress_label', {
      label: `${Math.round(normalizedProgressValue.value)}%`,
    })
  );
</script>
