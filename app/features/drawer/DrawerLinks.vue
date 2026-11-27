<template>
  <div>
    <ul class="flex flex-col gap-0.5 px-1">
      <DrawerItem
        v-for="item in primaryLinks"
        :key="item.to"
        :icon-src="item.iconSrc"
        :locale-key="item.localeKey"
        :to="item.to"
        :badge="item.badge"
        :is-collapsed="props.isCollapsed"
      />
    </ul>
    <div class="bg-divider mx-3 my-2 h-px" aria-hidden="true"></div>
    <ul class="flex flex-col gap-0.5 px-1 pb-2">
      <DrawerItem
        v-if="props.isCollapsed"
        icon="i-mdi-compass"
        locale-key="navigation_drawer.resources"
        to="/resources"
        :is-collapsed="true"
      />
      <li v-else>
        <div
          class="group flex items-center rounded-sm border-l-2 transition-colors duration-150"
          :class="resourcesRowClass"
        >
          <NuxtLink
            to="/resources"
            :aria-label="t('navigation_drawer.resources')"
            :aria-current="resourcesAriaCurrent"
            class="flex min-h-10 min-w-0 flex-1 items-center py-2 pr-1 pl-3 text-sm font-medium"
          >
            <DrawerItemIcon icon="i-mdi-compass" :color-class="resourceIconClass" has-margin />
            <span class="truncate leading-none">{{ t('navigation_drawer.resources') }}</span>
          </NuxtLink>
          <button
            type="button"
            :aria-expanded="isResourcesOpen"
            aria-controls="drawer-resources-sublinks"
            :aria-label="t('navigation_drawer.resources_toggle')"
            class="text-surface-400 light:hover:text-surface-50 flex min-h-10 w-9 shrink-0 items-center justify-center rounded-r-sm transition-colors hover:text-white"
            @click="toggleResourcesMenu"
          >
            <UIcon
              name="i-mdi-chevron-down"
              class="h-4 w-4 transition-transform duration-150"
              :class="chevronIconClass"
              aria-hidden="true"
            />
          </button>
        </div>
        <ul
          v-show="isResourcesOpen"
          id="drawer-resources-sublinks"
          class="border-surface-700/60 mt-0.5 ml-6 flex flex-col gap-0.5 border-l pl-2"
        >
          <li v-for="item in resourceSubLinks" :key="item.to">
            <NuxtLink
              :to="item.to"
              :aria-current="getSubLinkAriaCurrent(item.to)"
              class="flex min-h-8 items-center rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors duration-150"
              :class="getSubLinkClass(item.to)"
            >
              <span class="truncate leading-none">{{ item.label }}</span>
            </NuxtLink>
          </li>
        </ul>
      </li>
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
  import DrawerItemIcon from '@/features/drawer/DrawerItemIcon.vue';
  import { getDrawerIconClass, isNavigationRouteActive } from '@/features/drawer/navigation';
  const props = defineProps({
    isCollapsed: {
      type: Boolean,
      required: true,
    },
  });
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const primaryLinks = computed(() => [
    { iconSrc: '/img/sidebar/dashboard.svg', localeKey: 'common.dashboard', to: '/' },
    {
      iconSrc: '/img/sidebar/storyline.svg',
      localeKey: 'common.storyline',
      to: '/storyline',
      badge: t('page.storyline.wip_badge'),
    },
    { iconSrc: '/img/sidebar/tasks.svg', localeKey: 'common.tasks', to: '/tasks' },
    { iconSrc: '/img/sidebar/stash.png', localeKey: 'common.needed_items', to: '/needed-items' },
    { iconSrc: '/img/sidebar/hideout.webp', localeKey: 'common.hideout', to: '/hideout' },
    { iconSrc: '/img/sidebar/team.svg', localeKey: 'common.team', to: '/team' },
  ]);
  const resourceSubLinks = computed(() => [
    { label: t('page.seasonal_modifiers.title'), to: '/resources/seasonal-modifiers' },
  ]);
  const isSubLinkActive = (path: string) => route.path === path;
  const hasActiveResourceSubLink = computed(() =>
    resourceSubLinks.value.some((item) => isSubLinkActive(item.to))
  );
  const isResourcesOpen = ref(hasActiveResourceSubLink.value);
  watch(hasActiveResourceSubLink, (active) => {
    if (active) {
      isResourcesOpen.value = true;
    }
  });
  const toggleResourcesMenu = () => {
    isResourcesOpen.value = !isResourcesOpen.value;
  };
  const isResourcesActive = computed(() => isNavigationRouteActive('/resources', route.path));
  const resourceIconClass = computed(() => getDrawerIconClass(isResourcesActive.value));
  const resourcesRowClass = computed(() =>
    isResourcesActive.value
      ? 'border-primary-500 bg-surface-800/50 light:text-surface-50 text-white'
      : 'text-surface-300 hover:bg-surface-800/30 light:hover:text-surface-50 border-transparent hover:text-white'
  );
  const resourcesAriaCurrent = computed(() => (route.path === '/resources' ? 'page' : undefined));
  const chevronIconClass = computed(() => (isResourcesOpen.value ? 'rotate-180' : ''));
  const getSubLinkAriaCurrent = (path: string) => (isSubLinkActive(path) ? 'page' : undefined);
  const getSubLinkClass = (path: string) =>
    isSubLinkActive(path)
      ? 'bg-surface-800/60 light:text-surface-50 text-white'
      : 'text-surface-300 hover:bg-surface-800/30 light:hover:text-surface-50 hover:text-white';
</script>
