<template>
  <div class="flex min-h-full flex-col px-3 py-6 sm:px-6 lg:px-10 2xl:px-16">
    <div class="mb-4">
      <div class="flex items-center gap-3">
        <span
          class="bg-kappa/15 border-kappa/25 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
        >
          <UIcon name="i-mdi-trophy" class="text-kappa h-5 w-5" />
        </span>
        <div>
          <h1 class="text-2xl font-bold text-white">
            {{ t('page.kappa.title') }}
          </h1>
          <p class="text-surface-400 text-sm">
            {{ t('page.kappa.subtitle') }}
          </p>
        </div>
      </div>
    </div>
    <UTabs
      v-model="activeTabKey"
      :items="tabItems"
      :content="false"
      color="neutral"
      size="md"
      class="mb-3 w-fit"
      :ui="{
        list: 'gap-0 rounded-lg border border-white/[0.08] bg-surface-900/60 p-0.5',
        indicator: 'rounded-md bg-white/[0.08]',
        trigger:
          'relative px-4 py-2 text-sm font-medium transition-colors rounded-md data-[state=active]:text-white',
      }"
    >
      <template #default="{ item }">
        <div class="flex items-center gap-2">
          <UIcon
            :name="item.iconName"
            class="h-4 w-4"
            :class="item.value === 'kappa' ? 'text-kappa-400' : 'text-lightkeeper-400'"
          />
          <span>{{ item.label }}</span>
          <span
            class="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
            :class="
              item.value === 'kappa'
                ? 'bg-warning-500/20 text-warning-300'
                : 'bg-info-500/20 text-info-300'
            "
          >
            {{ item.count }}
          </span>
        </div>
      </template>
    </UTabs>
    <TrackerSummary
      :label="tabLabel"
      :total="totals.total"
      :completed="totals.completed"
      :failed="totals.failed"
      :available="totals.available"
      :locked="totals.locked"
      :accent="activeTab"
      :collector="collectorRow"
    />
    <div v-if="totals.total === 0" class="py-12 text-center">
      <UIcon name="i-mdi-cloud-off-outline" class="text-surface-500 mx-auto mb-3 h-12 w-12" />
      <p class="text-surface-300 text-lg font-medium">
        {{ t('page.kappa.empty', 'No tasks for this list yet.') }}
      </p>
    </div>
    <template v-else>
      <div
        v-if="xxlAndUp"
        class="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] items-start gap-3"
      >
        <KappaTraderColumn
          v-for="group in groupedByTraderWithoutFence"
          :key="group.trader.id"
          :group="group"
          :accent="activeTab"
        />
      </div>
      <div
        v-else-if="lgAndUp"
        class="-mx-3 flex snap-x scrollbar-thin gap-3 overflow-x-auto px-3 pb-2 lg:-mx-10 lg:px-10"
      >
        <KappaTraderColumn
          v-for="group in groupedByTraderWithoutFence"
          :key="group.trader.id"
          :group="group"
          :accent="activeTab"
          class="w-64 shrink-0 snap-start"
        />
      </div>
      <template v-else>
        <div
          class="bg-military-background/95 sticky top-0 z-10 -mx-3 px-3 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6"
        >
          <KappaTraderSelector
            v-model="selectedTraderId"
            :groups="groupedByTraderWithoutFence"
            :accent="activeTab"
          />
        </div>
        <KappaTraderColumn
          v-if="selectedTraderGroup"
          :group="selectedTraderGroup"
          :accent="activeTab"
        />
      </template>
    </template>
  </div>
</template>
<script setup lang="ts">
  import { useSharedBreakpoints } from '@/composables/useSharedBreakpoints';
  import KappaTraderColumn from '@/features/kappa/KappaTraderColumn.vue';
  import KappaTraderSelector from '@/features/kappa/KappaTraderSelector.vue';
  import TrackerSummary from '@/features/kappa/TrackerSummary.vue';
  import { useKappaOverview, type KappaTabKey } from '@/features/kappa/useKappaOverview';
  const { t } = useI18n({ useScope: 'global' });
  const { lgAndUp, xxlAndUp } = useSharedBreakpoints();
  const activeTab = ref<KappaTabKey>('kappa');
  const selectedTraderId = ref<string>('');
  const { totals: kappaTotals } = useKappaOverview(() => 'kappa');
  const { totals: lightkeeperTotals } = useKappaOverview(() => 'lightkeeper');
  const { totals, groupedByTraderWithoutFence, collectorRow } = useKappaOverview(
    () => activeTab.value
  );
  watch(
    groupedByTraderWithoutFence,
    (groups) => {
      if (groups.length > 0 && !groups.some((g) => g.trader.id === selectedTraderId.value)) {
        selectedTraderId.value = groups[0]!.trader.id;
      }
    },
    { immediate: true }
  );
  const selectedTraderGroup = computed(() =>
    groupedByTraderWithoutFence.value.find((g) => g.trader.id === selectedTraderId.value)
  );
  const tabLabel = computed(() =>
    activeTab.value === 'kappa' ? t('page.kappa.tabs.kappa') : t('page.kappa.tabs.lightkeeper')
  );
  const tabItems = computed(() => [
    {
      label: t('page.kappa.tabs.kappa'),
      value: 'kappa' as KappaTabKey,
      count: kappaTotals.value.total,
      iconName: 'i-mdi-trophy',
    },
    {
      label: t('page.kappa.tabs.lightkeeper'),
      value: 'lightkeeper' as KappaTabKey,
      count: lightkeeperTotals.value.total,
      iconName: 'i-mdi-lighthouse',
    },
  ]);
  const activeTabKey = computed({
    get: () => activeTab.value,
    set: (val: KappaTabKey) => {
      activeTab.value = val;
    },
  });
  useSeoMeta({
    title: () => t('page.kappa.title'),
    description: () => t('page.kappa.subtitle'),
  });
</script>
