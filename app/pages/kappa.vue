<template>
  <div class="flex min-h-full flex-col px-3 py-6 sm:px-6">
    <div class="mx-auto w-full max-w-[1600px]">
      <div class="mb-6">
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
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <UButton
          :variant="activeTab === 'kappa' ? 'solid' : 'outline'"
          color="primary"
          size="sm"
          @click="setTab('kappa')"
        >
          <UIcon name="i-mdi-trophy" class="mr-1.5 h-4 w-4" />
          {{ t('page.kappa.tabs.kappa') }} ({{ kappaTotals.total }})
        </UButton>
        <UButton
          :variant="activeTab === 'lightkeeper' ? 'solid' : 'outline'"
          color="info"
          size="sm"
          @click="setTab('lightkeeper')"
        >
          <UIcon name="i-mdi-lighthouse" class="mr-1.5 h-4 w-4" />
          {{ t('page.kappa.tabs.lightkeeper') }} ({{ lightkeeperTotals.total }})
        </UButton>
      </div>
      <div class="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div class="bg-surface-800/50 rounded-lg border border-white/5 p-3">
          <div class="text-surface-400 text-xs font-medium tracking-wide uppercase">
            {{ tabIsKappa ? t('page.kappa.stats.total') : t('page.kappa.stats.lightkeeper_total') }}
          </div>
          <div class="mt-1 text-2xl font-bold text-white">{{ totals.total }}</div>
        </div>
        <div class="bg-surface-800/50 rounded-lg border border-white/5 p-3">
          <div class="text-surface-400 text-xs font-medium tracking-wide uppercase">
            {{
              tabIsKappa
                ? t('page.kappa.stats.completed')
                : t('page.kappa.stats.lightkeeper_completed')
            }}
          </div>
          <div class="mt-1 text-2xl font-bold" :class="completedColorClass">
            {{ totals.completed }}
          </div>
        </div>
        <div class="bg-surface-800/50 rounded-lg border border-white/5 p-3">
          <div class="text-surface-400 text-xs font-medium tracking-wide uppercase">
            {{ t('page.kappa.stats.available', 'Available') }}
          </div>
          <div class="text-primary-400 mt-1 text-2xl font-bold">{{ totals.available }}</div>
        </div>
        <div class="bg-surface-800/50 rounded-lg border border-white/5 p-3">
          <div class="text-surface-400 text-xs font-medium tracking-wide uppercase">
            {{ t('page.kappa.stats.locked', 'Locked') }}
          </div>
          <div class="text-surface-300 mt-1 text-2xl font-bold">{{ totals.locked }}</div>
        </div>
      </div>
      <div class="mb-6">
        <div class="bg-surface-800 h-2 overflow-hidden rounded-full">
          <div
            class="h-full rounded-full transition-all duration-300"
            :class="tabIsKappa ? 'bg-kappa' : 'bg-lightkeeper'"
            :style="{ width: `${progressPercent}%` }"
          />
        </div>
        <div class="text-surface-400 mt-1 text-right text-xs">
          {{ progressPercent }}% {{ t('page.kappa.progress_label') }}
        </div>
      </div>
      <div v-if="totals.total === 0" class="py-12 text-center">
        <UIcon name="i-mdi-cloud-off-outline" class="text-surface-500 mx-auto mb-3 h-12 w-12" />
        <p class="text-surface-300 text-lg font-medium">
          {{ t('page.kappa.empty', 'No tasks for this list yet.') }}
        </p>
      </div>
      <div v-else-if="totals.completed === totals.total" class="py-12 text-center">
        <UIcon name="i-mdi-check-circle-outline" class="text-success-400 mx-auto mb-3 h-12 w-12" />
        <p class="text-surface-300 text-lg font-medium">
          {{ t('page.kappa.all_complete') }}
        </p>
      </div>
      <div
        v-else
        class="grid items-start gap-3"
        style="grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr))"
      >
        <KappaTraderColumn
          v-for="group in groupedByTrader"
          :key="group.trader.id"
          :group="group"
          :accent="activeTab"
        />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import KappaTraderColumn from '@/features/kappa/KappaTraderColumn.vue';
  import { useKappaOverview, type KappaTabKey } from '@/features/kappa/useKappaOverview';
  const { t } = useI18n({ useScope: 'global' });
  const activeTab = ref<KappaTabKey>('kappa');
  const { totals: kappaTotals } = useKappaOverview(() => 'kappa');
  const { totals: lightkeeperTotals } = useKappaOverview(() => 'lightkeeper');
  const { totals, groupedByTrader } = useKappaOverview(() => activeTab.value);
  const tabIsKappa = computed(() => activeTab.value === 'kappa');
  const completedColorClass = computed(() =>
    tabIsKappa.value ? 'text-kappa' : 'text-lightkeeper'
  );
  const progressPercent = computed(() => {
    if (totals.value.total === 0) return 0;
    return Math.round((totals.value.completed / totals.value.total) * 100);
  });
  function setTab(tab: KappaTabKey) {
    activeTab.value = tab;
  }
  useSeoMeta({
    title: () => t('page.kappa.title'),
    description: () => t('page.kappa.subtitle'),
  });
</script>
