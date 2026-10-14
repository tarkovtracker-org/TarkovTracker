<template>
  <nav
    :aria-label="t('page.tasks.primary_views.aria_label')"
    class="bg-surface-900 flex items-center gap-1 rounded-lg border border-white/12 p-1 shadow-sm"
  >
    <NuxtLink
      v-for="tab in tabs"
      :key="tab.view"
      :to="tab.to"
      :aria-current="tab.isActive ? 'page' : undefined"
      class="focus-visible:ring-primary-500 flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium uppercase transition-colors duration-150 focus:outline-none focus-visible:ring-2"
      :class="[
        tab.class,
        tab.isActive
          ? 'border-primary-500/45 bg-primary-500/12 ring-primary-500/25 light:text-primary-700 text-white ring-1'
          : 'text-surface-400 light:hover:text-surface-50 border-transparent hover:border-white/10 hover:bg-white/5 hover:text-white',
      ]"
      :data-testid="`task-view-tab-${tab.view}`"
    >
      <UIcon :name="tab.icon" class="h-4 w-4 shrink-0" aria-hidden="true" />
      <span class="leading-none">{{ t(tab.labelKey) }}</span>
      <span
        v-if="tab.badge"
        class="bg-warning-500/20 text-warning-400 rounded px-1 py-0.5 text-[10px] leading-none font-bold"
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
    class?: string;
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
      class: 'hidden lg:flex',
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
