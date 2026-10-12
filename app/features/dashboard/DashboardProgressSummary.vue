<template>
  <section
    class="bg-surface-900 mb-8 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-white/12 px-4 py-3 text-sm"
    data-testid="dashboard-progress-summary"
  >
    <dl class="flex flex-wrap items-baseline gap-x-6 gap-y-1">
      <div v-for="stat in stats" :key="stat.key" class="flex items-baseline gap-1.5">
        <dt class="text-surface-400">{{ stat.label }}</dt>
        <dd
          class="text-surface-100 font-semibold tabular-nums"
          :data-testid="`summary-${stat.key}`"
        >
          {{ stat.value }}
        </dd>
      </div>
    </dl>
    <AppTooltip
      v-if="hasDashboardFiltersActive"
      :text="$t('page.dashboard.progress.filtered_warning_tooltip')"
    >
      <span
        class="text-warning-300 flex items-center gap-1 text-xs"
        data-testid="dashboard-filter-notice"
      >
        <UIcon name="i-mdi-filter-variant-minus" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {{ $t('page.dashboard.progress.filtered_status_active') }}
      </span>
    </AppTooltip>
    <NuxtLink
      to="/profile"
      class="text-primary-400 hover:text-primary-300 light:text-primary-800 ml-auto flex items-center gap-1 font-medium transition-colors hover:underline"
    >
      {{ $t('page.dashboard.progress.view_full_progress') }}
      <UIcon name="i-mdi-arrow-right" class="h-4 w-4" aria-hidden="true" />
    </NuxtLink>
  </section>
</template>
<script setup lang="ts">
  import { useDashboardFilters } from '@/composables/useDashboardFilters';
  const { t } = useI18n({ useScope: 'global' });
  const dashboardStats = useDashboardStats();
  const { hasDashboardFiltersActive } = useDashboardFilters();
  // Integer floor (multiply first to avoid 29/100 -> 28.99…) so unfinished never reads 100%.
  const percent = (completed: number, total: number) =>
    `${total > 0 ? Math.floor((completed * 100) / total) : 0}%`;
  const stats = computed(() => [
    {
      key: 'tasks',
      label: t('common.tasks'),
      value: percent(dashboardStats.completedTasks.value, dashboardStats.totalTasks.value),
    },
    {
      key: 'kappa',
      label: t('common.kappa'),
      value: `${dashboardStats.completedKappaTasks.value}/${dashboardStats.totalKappaTasks.value}`,
    },
    {
      key: 'hideout',
      label: t('page.dashboard.progress.hideout_items'),
      value: percent(
        dashboardStats.completedHideoutItems.value,
        dashboardStats.totalHideoutItems.value
      ),
    },
  ]);
</script>
