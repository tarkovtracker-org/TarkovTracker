<template>
  <div>
    <div v-if="!props.isCollapsed" class="px-4 py-1">
      <h3 class="text-surface-400 text-xs font-semibold tracking-wider uppercase">
        {{ t('navigation_drawer.section_navigation') }}
      </h3>
    </div>
    <ul class="flex flex-col gap-0.5 px-1">
      <DrawerItem
        icon="i-heroicons-squares-2x2"
        locale-key="common.dashboard"
        to="/"
        :is-collapsed="props.isCollapsed"
      ></DrawerItem>
      <DrawerItem
        icon="i-mdi-book-open-variant"
        locale-key="common.storyline"
        to="/storyline"
        :is-collapsed="props.isCollapsed"
        :badge="t('page.storyline.wip_badge')"
      ></DrawerItem>
      <DrawerItem
        icon="i-heroicons-sparkles"
        locale-key="navigation_drawer.season_planner"
        to="/season-planner"
        :is-collapsed="props.isCollapsed"
      ></DrawerItem>
      <DrawerItemGroup
        icon="i-heroicons-clipboard-document-list"
        locale-key="common.tasks"
        to="/tasks"
        :items="taskViewItems"
        :is-collapsed="props.isCollapsed"
      />
      <DrawerItem
        icon="i-heroicons-cube"
        locale-key="common.needed_items"
        to="/needed-items"
        :is-collapsed="props.isCollapsed"
      ></DrawerItem>
      <DrawerItem
        icon="i-heroicons-home"
        locale-key="common.hideout"
        to="/hideout"
        :is-collapsed="props.isCollapsed"
      ></DrawerItem>
      <DrawerItem
        icon="i-heroicons-user-group"
        locale-key="common.team"
        to="/team"
        :is-collapsed="props.isCollapsed"
      ></DrawerItem>
      <DrawerItem
        icon="i-mdi-trophy"
        locale-key="common.kappa_lightkeeper"
        to="/kappa"
        :is-collapsed="props.isCollapsed"
      ></DrawerItem>
    </ul>
  </div>
</template>
<script setup lang="ts">
  import DrawerItem from '@/features/drawer/DrawerItem.vue';
  import DrawerItemGroup, { type DrawerGroupChild } from '@/features/drawer/DrawerItemGroup.vue';
  const props = defineProps({
    isCollapsed: {
      type: Boolean,
      required: true,
    },
  });
  const { t } = useI18n({ useScope: 'global' });
  const taskViewItems = computed<DrawerGroupChild[]>(() => [
    { icon: 'i-mdi-account-group-outline', localeKey: 'common.traders', to: '/tasks/traders' },
    { icon: 'i-mdi-map-outline', localeKey: 'common.maps', to: '/tasks/maps' },
    {
      icon: 'i-mdi-graph-outline',
      localeKey: 'page.tasks.primary_views.graph',
      to: '/tasks/graph',
      badge: t('page.storyline.wip_badge'),
      class: 'hidden lg:block',
    },
  ]);
</script>
