<template>
  <section
    v-if="state !== 'empty'"
    class="bg-surface-900 mb-8 rounded-lg border border-white/12 text-sm"
    data-testid="dashboard-up-next"
    :data-state="state"
  >
    <header class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 pb-2">
      <h2 class="text-surface-100 light:text-surface-50 text-base font-semibold">{{ title }}</h2>
      <span
        v-if="filtersActive"
        class="text-warning-300 flex items-center gap-1 text-xs"
        data-testid="up-next-filter-badge"
      >
        <UIcon name="i-mdi-filter-variant" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {{ t('page.dashboard.up_next.filtered_badge') }}
      </span>
      <NuxtLink
        to="/tasks"
        class="text-primary-400 hover:text-primary-300 light:text-primary-800 ml-auto flex items-center gap-1 font-medium transition-colors hover:underline"
      >
        {{ t('page.dashboard.up_next.view_all') }}
        <UIcon name="i-mdi-arrow-right" class="h-4 w-4" aria-hidden="true" />
      </NuxtLink>
    </header>
    <ol v-if="items.length" class="divide-y divide-white/8 border-t border-white/8">
      <li v-for="(item, index) in items" :key="item.taskId">
        <DashboardUpNextRow :item="item" :index="index" />
      </li>
    </ol>
    <NuxtLink
      v-else-if="state === 'filtered'"
      to="/tasks"
      class="text-warning-300 flex items-center gap-3 border-t border-white/8 px-4 py-2.5 transition-colors hover:bg-white/4"
      data-testid="up-next-filtered"
    >
      <UIcon name="i-mdi-filter-variant-minus" class="h-5 w-5 shrink-0" aria-hidden="true" />
      {{ hiddenLabel }}
    </NuxtLink>
    <p
      v-else
      class="text-surface-400 border-t border-white/8 px-4 py-2.5"
      data-testid="up-next-message"
    >
      {{ message }}
    </p>
  </section>
</template>
<script setup lang="ts">
  import { useDashboardUpNext } from '@/composables/useDashboardUpNext';
  const { t } = useI18n({ useScope: 'global' });
  const { filtersActive, hiddenAvailableCount, items, state } = useDashboardUpNext();
  const title = computed(() =>
    state.value === 'blocked'
      ? t('page.dashboard.up_next.blocked_title')
      : t('page.dashboard.up_next.title')
  );
  const hiddenLabel = computed(() =>
    hiddenAvailableCount.value === 1
      ? t('page.dashboard.up_next.hidden_one', { count: 1 })
      : t('page.dashboard.up_next.hidden_other', { count: hiddenAvailableCount.value })
  );
  const message = computed(() =>
    state.value === 'complete'
      ? t('page.dashboard.up_next.complete')
      : t('page.dashboard.up_next.none_ready')
  );
</script>
