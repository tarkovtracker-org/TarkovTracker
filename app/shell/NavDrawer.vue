<template>
  <Transition
    enter-active-class="transition-opacity duration-300 ease-out"
    leave-active-class="transition-opacity duration-300 ease-in"
    enter-from-class="opacity-0"
    leave-to-class="opacity-0"
  >
    <button
      v-if="belowMd && mobileExpanded"
      type="button"
      :aria-label="t('navigation_drawer.close_menu')"
      class="fixed inset-0 z-40 bg-black/60"
      @click="closeMobileDrawer"
      @keydown.esc="closeMobileDrawer"
    />
  </Transition>
  <nav
    :aria-label="t('navigation_drawer.main_navigation')"
    class="bg-sidebar shadow-nav-drawer fixed inset-y-0 left-0 z-50 flex flex-col border-r transition-all duration-300"
    :class="modeBorderClass"
    :style="{ width: sidebarWidth }"
  >
    <div
      class="relative z-10 flex h-full scrollbar-thin flex-col overflow-x-hidden overflow-y-auto"
    >
      <NuxtLink
        to="/"
        :aria-label="t('common.dashboard')"
        class="group mt-1 flex shrink-0 flex-col items-center px-3 py-1.5 transition-opacity hover:opacity-90"
      >
        <div
          :class="isCollapsed ? 'w-8' : 'w-32.5'"
          class="relative mx-auto transition-all duration-200"
        >
          <div
            v-if="isCollapsed"
            class="bg-primary-500/15 ring-primary-400/30 mx-auto flex h-8 w-8 items-center justify-center rounded-md ring-1"
          >
            <UIcon name="i-mdi-target-account" class="text-primary-300 h-5 w-5" />
          </div>
          <NuxtImg
            v-else
            src="/img/logos/tarkovtrackerlogo-light.webp"
            :alt="t('navigation_drawer.brand_name')"
            class="h-auto w-full"
            fetchpriority="high"
            preload
          />
        </div>
        <div v-if="!isCollapsed" class="mt-1 text-center">
          <div class="text-base leading-tight font-medium text-white">
            {{ t('navigation_drawer.brand_name') }}
          </div>
        </div>
      </NuxtLink>
      <template v-if="!isCollapsed">
        <DrawerLevel :is-collapsed="false" />
        <div class="px-4 py-1">
          <h3 class="text-surface-400 text-xs font-semibold tracking-wider uppercase">
            {{ t('common.game_settings') }}
          </h3>
        </div>
        <DrawerGameSettings />
      </template>
      <template v-else>
        <DrawerLevel :is-collapsed="true" />
      </template>
      <div class="bg-surface-800 mx-3 my-2 h-px shrink-0" />
      <DrawerLinks :is-collapsed="isCollapsed" />
      <div class="mt-auto shrink-0">
        <div class="bg-surface-800 mx-3 my-2 h-px" />
        <div v-if="!isCollapsed" class="px-4 py-1">
          <h3 class="text-surface-400 text-xs font-semibold tracking-wider uppercase">
            {{ t('navigation_drawer.section_more') }}
          </h3>
        </div>
        <ul class="flex flex-col gap-0.5 px-1 pb-2">
          <DrawerItem
            icon="i-mdi-compass-outline"
            locale-key="navigation_drawer.resources"
            to="/resources"
            :is-collapsed="isCollapsed"
          />
          <DrawerItem
            icon="i-mdi-cog-outline"
            locale-key="common.settings"
            to="/settings"
            :is-collapsed="isCollapsed"
          />
        </ul>
      </div>
    </div>
  </nav>
</template>
<script setup lang="ts">
  import DrawerGameSettings from '@/features/drawer/DrawerGameSettings.vue';
  import DrawerItem from '@/features/drawer/DrawerItem.vue';
  import DrawerLevel from '@/features/drawer/DrawerLevel.vue';
  import DrawerLinks from '@/features/drawer/DrawerLinks.vue';
  import { useAppStore } from '@/stores/useApp';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { SHELL_DRAWER_COLLAPSED_WIDTH, SHELL_DRAWER_EXPANDED_WIDTH } from '@/utils/shellConfig';
  const { t } = useI18n({ useScope: 'global' });
  const { belowMd } = useSharedBreakpoints();
  const appStore = useAppStore();
  const tarkovStore = useTarkovStore();
  const currentMode = computed(() => tarkovStore.getCurrentGameMode());
  const modeBorderClass = computed(() => {
    if (currentMode.value === 'pve') return 'border-pve-700/50';
    if (currentMode.value === 'seasonal') return 'border-warning-700/50';
    return 'border-pvp-700/50';
  });
  const mobileExpanded = computed(() => appStore.mobileDrawerExpanded);
  watch(belowMd, (isMobile) => {
    if (!isMobile) {
      appStore.setMobileDrawerExpanded(false);
    }
  });
  const closeMobileDrawer = () => {
    appStore.setMobileDrawerExpanded(false);
  };
  const isCollapsed = computed(() => {
    if (belowMd.value) {
      return !mobileExpanded.value;
    }
    return appStore.drawerRail;
  });
  const sidebarWidth = computed(() => {
    if (belowMd.value) {
      return mobileExpanded.value ? SHELL_DRAWER_EXPANDED_WIDTH : SHELL_DRAWER_COLLAPSED_WIDTH;
    }
    return appStore.drawerRail ? SHELL_DRAWER_COLLAPSED_WIDTH : SHELL_DRAWER_EXPANDED_WIDTH;
  });
</script>
