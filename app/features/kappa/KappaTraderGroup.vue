<template>
  <section class="bg-surface-800/50 flex flex-col overflow-hidden rounded-lg border border-white/5">
    <button
      type="button"
      class="hover:bg-surface-800/70 ring-offset-surface-900 focus-visible:ring-primary-500/50 flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      :aria-expanded="expanded"
      @click="$emit('toggle')"
    >
      <UIcon
        name="i-mdi-chevron-down"
        class="text-surface-400 h-4 w-4 shrink-0 transition-transform duration-150"
        :class="{ '-rotate-90': !expanded }"
      />
      <div
        class="bg-surface-900/70 h-7 w-7 shrink-0 overflow-hidden rounded-full border border-white/5"
      >
        <img
          v-if="group.trader.imageLink"
          :src="group.trader.imageLink"
          :alt="group.trader.name"
          class="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <span class="truncate text-xs font-semibold text-white">
            {{ group.trader.name }}
          </span>
          <span class="text-surface-400 text-[10px] tabular-nums">
            {{ group.completedCount }} / {{ group.totalCount }}
          </span>
        </div>
        <div class="bg-surface-900/70 mt-1 h-0.5 overflow-hidden rounded-full">
          <div
            class="h-full rounded-full transition-all duration-300"
            :class="accentBarClass"
            :style="{ width: `${percent}%` }"
          />
        </div>
      </div>
      <span class="text-surface-400 shrink-0 text-[10px] tabular-nums">{{ percent }}%</span>
    </button>
    <div v-if="expanded" class="grid gap-1 px-1.5 pt-0.5 pb-2" :class="gridColsClass">
      <KappaTaskRow v-for="row in group.rows" :key="row.task.id" :row="row" />
    </div>
  </section>
</template>
<script setup lang="ts">
  import KappaTaskRow from '@/features/kappa/KappaTaskRow.vue';
  import type { KappaTabKey, KappaTraderGroupEntry } from '@/features/kappa/useKappaOverview';
  const props = defineProps<{
    group: KappaTraderGroupEntry;
    expanded: boolean;
    accent: KappaTabKey;
  }>();
  defineEmits<{ toggle: [] }>();
  const percent = computed(() => {
    if (props.group.totalCount === 0) return 0;
    return Math.round((props.group.completedCount / props.group.totalCount) * 100);
  });
  const accentBarClass = computed(() =>
    props.accent === 'kappa' ? 'bg-kappa-500' : 'bg-lightkeeper-500'
  );
  const gridColsClass = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';
</script>
