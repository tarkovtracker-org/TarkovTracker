<template>
  <li v-if="props.isCollapsed">
    <UPopover
      mode="hover"
      :open-delay="100"
      :close-delay="150"
      :content="{ side: 'right', align: 'start', sideOffset: 8 }"
    >
      <DrawerItemContent
        :to="props.to"
        :is-collapsed="true"
        :icon="props.icon"
        :color-class="getDrawerIconClass(isParentActive)"
        :label-text="labelText"
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
  </li>
  <li v-else class="relative">
    <DrawerItemContent
      :to="props.to"
      :is-collapsed="false"
      :icon="props.icon"
      :color-class="getDrawerIconClass(isParentActive)"
      :label-text="labelText"
      has-margin
    />
    <UButton
      variant="ghost"
      color="neutral"
      size="xs"
      class="text-surface-400 absolute top-1/2 right-1 -translate-y-1/2 hover:text-white"
      :icon="isOpen ? 'i-mdi-chevron-up' : 'i-mdi-chevron-down'"
      :aria-expanded="isOpen"
      :aria-label="t(toggleLabelKey, { name: labelText })"
      data-testid="drawer-group-toggle"
      @click="isOpen = !isOpen"
    />
  </li>
  <template v-if="showChildren">
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
  const labelText = computed(() => t(props.localeKey));
  const isParentActive = computed(() => isNavigationRouteActive(props.to, route.path));
  const isChildActive = computed(() =>
    props.items.some((child) => isNavigationRouteActive(child.to, route.path))
  );
  // Session-only: the route already says which view is open, so nothing is saved.
  const isOpen = useState(`drawer-group-open:${props.to}`, () => true);
  const toggleLabelKey = computed(() =>
    isOpen.value ? 'navigation_drawer.hide_subpages' : 'navigation_drawer.show_subpages'
  );
  // The collapsed rail shows sub-items only inside the group; hover opens the menu elsewhere.
  const showChildren = computed(() =>
    props.isCollapsed ? isParentActive.value || isChildActive.value : isOpen.value
  );
  watch(isChildActive, (active) => {
    if (active) isOpen.value = true;
  });
</script>
