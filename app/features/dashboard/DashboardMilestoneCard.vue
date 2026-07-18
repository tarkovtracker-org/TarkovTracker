<template>
  <div
    :class="[
      'relative overflow-hidden rounded-md border px-4 py-3 transition-all',
      isAchieved ? achievedClasses : 'bg-surface-900/50 border-white/12 opacity-70',
    ]"
  >
    <div class="relative z-10">
      <UIcon
        :name="isAchieved ? achievedIcon : unachievedIcon"
        :class="['mb-3 h-12 w-12', isAchieved ? iconColorClass : 'text-surface-500']"
      />
      <div class="mb-1 text-3xl font-bold text-white">{{ title }}</div>
      <div class="text-surface-200 text-xs font-medium tracking-wider uppercase">
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
      color?: MilestoneColor;
    }>(),
    {
      color: 'primary',
    }
  );
  const colorClasses: Record<MilestoneColor, { achieved: string; icon: string }> = {
    primary: {
      achieved: [
        'from-primary-900/40 to-surface-900 border-primary-600/50',
        'shadow-primary-900/20 bg-gradient-to-br shadow-lg',
      ].join(' '),
      icon: 'text-primary-400',
    },
    info: {
      achieved: [
        'from-info-900/40 to-surface-900 border-info-600/50',
        'shadow-info-900/20 bg-gradient-to-br shadow-lg',
      ].join(' '),
      icon: 'text-info-400',
    },
    success: {
      achieved: [
        'from-success-900/40 to-surface-900 border-success-600/50',
        'shadow-success-900/20 bg-gradient-to-br shadow-lg',
      ].join(' '),
      icon: 'text-success-400',
    },
    kappa: {
      achieved: [
        'from-kappa-900/40 to-surface-900 border-kappa-600/50',
        'shadow-kappa-900/20 bg-gradient-to-br shadow-lg',
      ].join(' '),
      icon: 'text-kappa-400',
    },
    lightkeeper: {
      achieved: [
        'from-lightkeeper-900/40 to-surface-900 border-lightkeeper-600/50',
        'shadow-lightkeeper-900/20 bg-gradient-to-br shadow-lg',
      ].join(' '),
      icon: 'text-lightkeeper-400',
    },
  };
  const achievedClasses = computed(() => colorClasses[props.color].achieved);
  const iconColorClass = computed(() => colorClasses[props.color].icon);
</script>
