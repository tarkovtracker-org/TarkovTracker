<template>
  <nav
    :aria-label="t('page.tasks.primary_views.aria_label')"
    class="bg-surface-900 flex w-full items-stretch gap-1 rounded-lg border border-white/12 p-1 shadow-sm sm:w-auto"
  >
    <NuxtLink
      v-for="tab in tabs"
      :key="tab.view"
      :to="tab.to"
      :aria-current="tab.isActive ? 'page' : undefined"
      class="focus-visible:ring-primary-500 flex min-w-0 flex-auto items-center justify-center gap-1 rounded-md border px-1.5 py-1.5 text-[11px] font-medium uppercase transition-colors duration-150 focus:outline-none focus-visible:ring-2 sm:flex-none sm:gap-1.5 sm:px-3 sm:text-xs"
      :class="
        tab.isActive
          ? 'border-primary-500/45 bg-primary-500/12 ring-primary-500/25 light:text-primary-700 text-white ring-1'
          : 'text-surface-400 light:hover:text-surface-50 border-transparent hover:border-white/10 hover:bg-white/5 hover:text-white'
      "
      :data-testid="`task-view-tab-${tab.view}`"
    >
      <!-- Icons are decorative; below sm the labels alone keep all four tabs on one row. -->
      <UIcon :name="tab.icon" class="hidden h-4 w-4 shrink-0 sm:inline-block" aria-hidden="true" />
      <span class="truncate leading-none">{{ t(tab.labelKey) }}</span>
      <template v-if="tab.needsWideScreen">
        <UIcon
          name="i-mdi-monitor"
          class="h-3.5 w-3.5 shrink-0 opacity-70 lg:hidden"
          aria-hidden="true"
          data-testid="task-view-tab-wide-screen-hint"
        />
        <span class="sr-only normal-case lg:hidden">
          {{ t('page.tasks.primary_views.needs_wider_screen') }}
        </span>
      </template>
      <span
        v-if="tab.badge"
        class="bg-warning-500/20 text-warning-400 hidden rounded px-1 py-0.5 text-[10px] leading-none font-bold lg:inline"
      >
        {{ t(tab.badge) }}
      </span>
    </NuxtLink>
  </nav>
</template>
<script setup lang="ts">
  import { useRouteSearchQuery } from '@/composables/useRouteSearchQuery';
  import {
    resolveTaskRouteView,
    TASK_ROUTE_PATHS,
    type TaskRouteView,
  } from '@/utils/taskRouteView';
  type TabConfig = {
    view: TaskRouteView;
    icon: string;
    labelKey: string;
    badge?: string;
    /** The view only renders from the lg breakpoint; narrower screens get its explanation. */
    needsWideScreen?: boolean;
  };
  const TAB_CONFIGS: TabConfig[] = [
    { view: 'list', icon: 'i-mdi-format-list-checks', labelKey: 'common.list' },
    { view: 'traders', icon: 'i-mdi-account-group-outline', labelKey: 'common.traders' },
    { view: 'maps', icon: 'i-mdi-map-outline', labelKey: 'common.maps' },
    {
      view: 'graph',
      icon: 'i-mdi-graph-outline',
      labelKey: 'page.tasks.primary_views.graph',
      badge: 'page.storyline.wip_badge',
      needsWideScreen: true,
    },
  ];
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const { searchQuery } = useRouteSearchQuery();
  const activeView = computed(() => resolveTaskRouteView(route.path));
  // Only the search carries over: status, sort, trader and map are restored from preferences,
  // and the Graph route's forced status must not overwrite the list's saved one. The search
  // includes a debounced write that has not reached `?q=` yet, so a quick tab click keeps it.
  const carriedQuery = computed(() => {
    const search = searchQuery.value;
    return search ? { q: search } : {};
  });
  const tabs = computed(() =>
    TAB_CONFIGS.map((tab) => ({
      ...tab,
      to: { path: TASK_ROUTE_PATHS[tab.view], query: carriedQuery.value },
      isActive: activeView.value === tab.view,
    }))
  );
</script>
