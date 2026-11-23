<template>
  <div>
    <ul class="flex flex-col gap-0.5 px-1">
      <DrawerItem
        icon-src="/img/sidebar/dashboard.svg"
        locale-key="common.dashboard"
        to="/"
        :is-collapsed="props.isCollapsed"
      ></DrawerItem>
      <DrawerItem
        icon-src="/img/sidebar/storyline.svg"
        locale-key="common.storyline"
        to="/storyline"
        :is-collapsed="props.isCollapsed"
        :badge="t('page.storyline.wip_badge')"
      ></DrawerItem>
      <DrawerItem
        icon-src="/img/sidebar/tasks.svg"
        locale-key="common.tasks"
        to="/tasks"
        :is-collapsed="props.isCollapsed"
      ></DrawerItem>
      <DrawerItem
        icon-src="/img/sidebar/stash.png"
        locale-key="common.needed_items"
        to="/needed-items"
        :is-collapsed="props.isCollapsed"
      ></DrawerItem>
      <DrawerItem
        icon-src="/img/sidebar/hideout.webp"
        locale-key="common.hideout"
        to="/hideout"
        :is-collapsed="props.isCollapsed"
      ></DrawerItem>
      <DrawerItem
        icon-src="/img/sidebar/team.svg"
        locale-key="common.team"
        to="/team"
        :is-collapsed="props.isCollapsed"
      ></DrawerItem>
    </ul>
    <div class="bg-divider mx-3 my-2 h-px" aria-hidden="true"></div>
    <ul class="flex flex-col gap-0.5 px-1 pb-2">
      <DrawerItem
        icon="i-mdi-compass"
        locale-key="navigation_drawer.resources"
        to="/resources"
        :is-collapsed="props.isCollapsed"
      />
      <DrawerItem
        icon="i-mdi-cog"
        locale-key="common.settings"
        to="/settings"
        :is-collapsed="props.isCollapsed"
      />
    </ul>
  </div>
</template>
<script setup lang="ts">
  import DrawerItem from '@/features/drawer/DrawerItem.vue';
  const props = defineProps({
    isCollapsed: {
      type: Boolean,
      required: true,
    },
  });
  const { t } = useI18n({ useScope: 'global' });
</script>
