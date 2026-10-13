<template>
  <li class="relative">
    <UPopover
      v-if="!isPinned"
      mode="hover"
      enable-touch
      :open-delay="100"
      :close-delay="150"
      :content="{ side: 'right', align: 'start', sideOffset: 8 }"
    >
      <DrawerItemContent
        :to="props.to"
        :is-collapsed="props.isCollapsed"
        :icon="props.icon"
        :color-class="getDrawerIconClass(isGroupActive)"
        :label-text="labelText"
        :highlighted="isGroupActive"
        :has-margin="!props.isCollapsed"
      />
      <template #content>
        <ul class="flex min-w-48 flex-col gap-0.5 p-1.5" data-testid="drawer-group-menu">
          <DrawerItem
            :icon="props.icon"
            :locale-key="props.localeKey"
            :to="props.to"
            :is-collapsed="false"
          />
          <DrawerItem
            v-for="child in props.items"
            :key="child.to"
            :class="child.class"
            :icon="child.icon"
            :locale-key="child.localeKey"
            :to="child.to"
            :badge="child.badge"
            :is-collapsed="false"
            nested
          />
        </ul>
      </template>
    </UPopover>
    <DrawerItemContent
      v-else
      :to="props.to"
      :is-collapsed="props.isCollapsed"
      :icon="props.icon"
      :color-class="getDrawerIconClass(isParentActive)"
      :label-text="labelText"
      :has-margin="!props.isCollapsed"
    />
    <UButton
      v-if="!props.isCollapsed"
      variant="ghost"
      color="neutral"
      size="xs"
      class="text-surface-400 absolute top-1/2 right-1 -translate-y-1/2 hover:text-white"
      :icon="isPinned ? 'i-mdi-chevron-up' : 'i-mdi-chevron-down'"
      :aria-expanded="isPinned"
      :aria-label="t(toggleLabelKey, { name: labelText })"
      data-testid="drawer-group-toggle"
      @click="appStore.toggleDrawerGroupPin(props.to)"
    />
  </li>
  <template v-if="isPinned">
    <DrawerItem
      v-for="child in props.items"
      :key="child.to"
      :class="child.class"
      :icon="child.icon"
      :locale-key="child.localeKey"
      :to="child.to"
      :badge="child.badge"
      :is-collapsed="props.isCollapsed"
      nested
    />
  </template>
</template>
<script setup lang="ts">
  import DrawerItem from '@/features/drawer/DrawerItem.vue';
  import { getDrawerIconClass, isNavigationRouteActive } from '@/features/drawer/navigation';
  import { useAppStore } from '@/stores/useApp';
  export type DrawerGroupChild = {
    icon: string;
    localeKey: string;
    to: string;
    badge?: string | null;
    class?: string;
  };
  const props = defineProps<{
    icon: string;
    localeKey: string;
    to: string;
    items: DrawerGroupChild[];
    isCollapsed: boolean;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const appStore = useAppStore();
  const labelText = computed(() => t(props.localeKey));
  const isParentActive = computed(() => isNavigationRouteActive(props.to, route.path));
  // A compact group stands in for its hidden sub-pages, so it lights up on any of them.
  const isGroupActive = computed(
    () =>
      isParentActive.value ||
      props.items.some((child) => isNavigationRouteActive(child.to, route.path))
  );
  // Compact until pinned open; the pin is a per-device convenience, not a saved view.
  const isPinned = computed(() => appStore.drawerPinnedGroups.includes(props.to));
  const toggleLabelKey = computed(() =>
    isPinned.value ? 'navigation_drawer.unpin_subpages' : 'navigation_drawer.pin_subpages'
  );
</script>
