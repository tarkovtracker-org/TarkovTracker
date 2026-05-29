<template>
  <nav
    :aria-label="t('page.kappa.trader_selector.label', 'Select Trader')"
    class="scrollbar-none -mx-3 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-3 py-1 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10"
  >
    <button
      v-for="group in groups"
      :key="group.trader.id"
      type="button"
      class="flex shrink-0 snap-start items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors"
      :class="
        modelValue === group.trader.id
          ? activePillClasses
          : 'bg-surface-900/40 hover:bg-surface-800/60 text-surface-300 border-white/8 hover:text-white'
      "
      :aria-pressed="modelValue === group.trader.id"
      @click="$emit('update:modelValue', group.trader.id)"
    >
      <div
        class="h-6 w-6 shrink-0 overflow-hidden rounded-full border border-white/10"
        :class="modelValue === group.trader.id ? 'bg-surface-800' : 'bg-surface-900/70'"
      >
        <img
          v-if="group.trader.imageLink"
          :src="group.trader.imageLink"
          :alt="group.trader.name"
          class="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <span class="text-xs font-medium whitespace-nowrap">
        {{ group.trader.name }}
      </span>
      <span
        class="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums"
        :class="modelValue === group.trader.id ? activeBadgeClasses : 'text-surface-400 bg-white/5'"
      >
        {{ group.completedCount }}/{{ group.totalCount }}
      </span>
    </button>
  </nav>
</template>
<script setup lang="ts">
  import type { KappaTabKey, KappaTraderGroupEntry } from '@/features/kappa/useKappaOverview';
  const props = defineProps<{
    modelValue: string;
    groups: KappaTraderGroupEntry[];
    accent: KappaTabKey;
  }>();
  defineEmits<{
    'update:modelValue': [value: string];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const activePillClasses = computed(() =>
    props.accent === 'kappa'
      ? 'border-warning-500/40 bg-warning-500/10 text-white'
      : 'border-info-500/40 bg-info-500/10 text-white'
  );
  const activeBadgeClasses = computed(() =>
    props.accent === 'kappa' ? 'bg-warning-500/20 text-warning-300' : 'bg-info-500/20 text-info-300'
  );
</script>
