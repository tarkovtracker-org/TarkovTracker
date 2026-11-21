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
      <li>
        <UDropdownMenu
          :items="resourceLinks"
          :content="{ side: props.isCollapsed ? 'right' : 'bottom', align: 'start' }"
        >
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-mdi-compass-outline"
            :trailing-icon="props.isCollapsed ? undefined : 'i-mdi-chevron-down'"
            :label="props.isCollapsed ? undefined : t('navigation_drawer.resources')"
            :aria-label="t('navigation_drawer.resources')"
            class="min-h-10 w-full rounded-sm border-l-2 px-3 text-sm"
            :class="resourceButtonClass"
            :ui="{ trailingIcon: 'ms-auto' }"
          />
        </UDropdownMenu>
      </li>
      <DrawerItem
        icon="i-mdi-cog-outline"
        locale-key="common.settings"
        to="/settings"
        :is-collapsed="props.isCollapsed"
      />
    </ul>
  </div>
</template>
<script setup lang="ts">
  import DrawerItem from '@/features/drawer/DrawerItem.vue';
  import { isNavigationRouteActive } from '@/features/drawer/navigation';
  const props = defineProps({
    isCollapsed: {
      type: Boolean,
      required: true,
    },
  });
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const resourceLinks = computed(() => [
    { label: t('navigation_drawer.resources_overview'), to: '/resources' },
    { label: t('page.seasonal_modifiers.title'), to: '/resources/seasonal-modifiers' },
  ]);
  const resourceButtonClass = computed(() => [
    props.isCollapsed && 'justify-center',
    isNavigationRouteActive('/resources', route.path)
      ? 'border-primary-500 bg-surface-800/50 text-surface-50'
      : 'border-transparent text-surface-300',
  ]);
</script>
