<template>
  <button
    type="button"
    class="group focus:ring-primary-500 focus:ring-offset-surface-900 relative flex w-full flex-col gap-1.5 rounded-lg border p-4 text-left transition-all duration-200 focus:ring-2 focus:ring-offset-2 focus:outline-none"
    :class="[
      selected
        ? 'bg-primary-500/10 border-primary-500/50 shadow-primary-500/5 shadow-lg'
        : 'bg-surface-800/40 border-surface-700 hover:bg-surface-800/60 hover:border-surface-600',
    ]"
    @click="$emit('toggle')"
  >
    <div class="flex items-start justify-between gap-3">
      <span
        class="text-sm font-semibold transition-colors"
        :class="selected ? 'text-primary-300' : 'text-surface-100'"
      >
        {{ modifier.name }}
      </span>
      <span
        v-if="modifier.points !== null"
        class="text-xs font-bold tabular-nums"
        :class="[
          modifier.points > 0 ? 'text-primary-400' : 'text-red-400',
          selected ? 'opacity-100' : 'opacity-70',
        ]"
      >
        {{ modifier.points > 0 ? '+' : '' }}{{ modifier.points }}
      </span>
      <span v-else class="text-surface-500 text-[10px] font-medium tracking-wider uppercase">
        {{ t('page.season_planner.unknown_points') }}
      </span>
    </div>
    <p class="text-surface-400 line-clamp-2 text-xs leading-relaxed">
      {{ modifier.description }}
    </p>
    <div v-if="selected" class="bg-primary-500 absolute top-2 right-2 h-1.5 w-1.5 rounded-full" />
  </button>
</template>
<script setup lang="ts">
  import type { SeasonalModifier } from '@/types/season';
  const { t } = useI18n({ useScope: 'global' });
  defineProps<{
    modifier: SeasonalModifier;
    selected: boolean;
  }>();
  defineEmits(['toggle']);
</script>
