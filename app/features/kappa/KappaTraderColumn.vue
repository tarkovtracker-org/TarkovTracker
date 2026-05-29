<template>
  <section
    class="bg-surface-800/50 flex min-w-0 flex-col overflow-hidden rounded-lg border border-white/5"
  >
    <header
      class="border-b border-white/5 px-2.5 py-2"
      :class="{ 'bg-success-500/5': allComplete }"
    >
      <div class="flex items-center gap-2">
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
          </div>
          <div class="text-surface-400 mt-0.5 flex items-center gap-1.5 text-[10px] tabular-nums">
            <span>{{ group.completedCount }} / {{ group.totalCount }}</span>
            <span>·</span>
            <span>{{ percent }}%</span>
          </div>
        </div>
      </div>
      <div class="bg-surface-900/70 mt-1.5 h-0.5 overflow-hidden rounded-full">
        <div
          class="h-full rounded-full transition-all duration-300"
          :class="accentBarClass"
          :style="{ width: `${percent}%` }"
        />
      </div>
    </header>
    <ol class="flex flex-col gap-1 p-1.5">
      <li v-for="row in group.rows" :key="row.task.id">
        <KappaTaskRow :row="row" />
      </li>
    </ol>
  </section>
</template>
<script setup lang="ts">
  import KappaTaskRow from '@/features/kappa/KappaTaskRow.vue';
  import type { KappaTabKey, KappaTraderGroupEntry } from '@/features/kappa/useKappaOverview';
  const props = defineProps<{
    group: KappaTraderGroupEntry;
    accent: KappaTabKey;
  }>();
  const percent = computed(() => {
    if (props.group.totalCount === 0) return 0;
    return Math.round((props.group.completedCount / props.group.totalCount) * 100);
  });
  const allComplete = computed(
    () => props.group.totalCount > 0 && props.group.completedCount === props.group.totalCount
  );
  const accentBarClass = computed(() =>
    props.accent === 'kappa' ? 'bg-warning-500' : 'bg-info-500'
  );
</script>
