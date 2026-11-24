<template>
  <PageHeader v-bind="header" class="mb-4">
    <template v-if="resolveTaskRouteView(route.path) === 'list'" #description-link>
      <NuxtLink
        to="/resources/tarkovmonitor"
        class="text-primary-400 inline-block underline underline-offset-2"
      >
        {{ t('page.tasks.auto_tracking_guide') }}
      </NuxtLink>
    </template>
    <template #actions>
      <TaskViewTabs />
    </template>
  </PageHeader>
</template>
<script setup lang="ts">
  import PageHeader from '@/components/ui/PageHeader.vue';
  import TaskViewTabs from '@/features/tasks/TaskViewTabs.vue';
  import { resolveTaskRouteView, type TaskRouteView } from '@/utils/taskRouteView';
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const HEADER_KEYS: Record<TaskRouteView, { title: string; description: string }> = {
    list: { title: 'common.tasks', description: 'seo.routes.tasks.description' },
    traders: { title: 'common.traders', description: 'seo.routes.tasks_traders.description' },
    maps: { title: 'common.maps', description: 'seo.routes.tasks_maps.description' },
    graph: {
      title: 'page.tasks.primary_views.graph',
      description: 'seo.routes.tasks_graph.description',
    },
  };
  const header = computed(() => {
    const keys = HEADER_KEYS[resolveTaskRouteView(route.path)];
    return { title: t(keys.title), description: t(keys.description) };
  });
</script>
