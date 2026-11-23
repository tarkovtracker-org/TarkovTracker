<template>
  <div class="@container">
    <div
      ref="traderGrid"
      class="grid grid-cols-1 gap-1.5 @min-[32rem]:grid-cols-2 @min-[60rem]:grid-cols-4"
    >
      <template v-for="item in traderGridItems" :key="item.key">
        <DashboardTraderEditor
          v-if="item.editor"
          :id="`dashboard-trader-editor-${item.trader.id}`"
          :trader="item.trader"
          class="col-span-full"
        />
        <DashboardTraderCard
          v-else
          :id="`dashboard-trader-${item.trader.id}`"
          :trader="item.trader"
          :completed-tasks="item.trader.completedTasks"
          :total-tasks="item.trader.totalTasks"
          :percentage="item.trader.percentage"
          :unlock="item.trader.unlock"
          :expanded="expandedTraderId === item.trader.id"
          :class="traderHighlightClass(item.trader.id)"
          @toggle="toggleTraderEditor(item.trader.id)"
        />
      </template>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useResizeObserver } from '@vueuse/core';
  import type { TraderStats } from '@/composables/useDashboardStats';
  import type { TraderUnlockRequirement } from '@/features/dashboard/traderLockStatus';
  const props = defineProps<{
    traders: Array<TraderStats & { unlock: TraderUnlockRequirement | null }>;
    highlightedTraderId: string | null;
  }>();
  const expandedTraderId = ref<string | null>(null);
  const traderGrid = useTemplateRef('traderGrid');
  const traderGridColumns = ref(1);
  useResizeObserver(traderGrid, ([entry]) => {
    if (!entry || entry.contentRect.width === 0) return;
    traderGridColumns.value = getComputedStyle(entry.target).gridTemplateColumns.split(' ').length;
  });
  const unlockedTraders = computed(() => props.traders.filter((trader) => !trader.unlock));
  const lockedTraders = computed(() => props.traders.filter((trader) => trader.unlock));
  watch(unlockedTraders, (traders) => {
    if (traders.some(({ id }) => id === expandedTraderId.value)) return;
    expandedTraderId.value = null;
  });
  const traderGridItems = computed(() => {
    const items = [...unlockedTraders.value, ...lockedTraders.value].map((trader) => ({
      trader,
      key: `trader-${trader.id}`,
      editor: false,
    }));
    const index = items.findIndex(({ trader }) => trader.id === expandedTraderId.value);
    const selected = items[index];
    if (!selected || selected.trader.unlock) return items;
    const columns = traderGridColumns.value;
    const rowEnd = Math.ceil((index + 1) / columns) * columns;
    items.splice(rowEnd, 0, {
      trader: selected.trader,
      key: `editor-${selected.trader.id}`,
      editor: true,
    });
    return items;
  });
  const toggleTraderEditor = (id: string) => {
    expandedTraderId.value = expandedTraderId.value === id ? null : id;
  };
  const traderHighlightClass = (id: string) =>
    props.highlightedTraderId === id
      ? 'ring-primary-500 ring-offset-surface-950 rounded-lg ring-2 ring-offset-2'
      : undefined;
</script>
