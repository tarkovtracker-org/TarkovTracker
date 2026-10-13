<template>
  <li
    data-testid="drawer-group"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @focusin="isFocused = true"
    @focusout="onFocusOut"
  >
    <div class="relative" @click="closeTransient">
      <DrawerItemContent
        :to="props.to"
        :is-collapsed="props.isCollapsed"
        :icon="props.icon"
        :color-class="getDrawerIconClass(isHighlighted)"
        :label-text="labelText"
        :highlighted="isHighlighted"
        :has-margin="!props.isCollapsed"
      />
      <UButton
        v-if="!props.isCollapsed"
        variant="ghost"
        color="neutral"
        size="xs"
        class="text-surface-400 absolute top-1/2 right-1 -translate-y-1/2 hover:text-white"
        :icon="isExpanded ? 'i-mdi-chevron-up' : 'i-mdi-chevron-down'"
        :aria-expanded="isExpanded"
        :aria-controls="menuId"
        :aria-pressed="isPinned"
        :aria-label="t(toggleLabelKey, { name: labelText })"
        data-testid="drawer-group-toggle"
        @click.stop="appStore.toggleDrawerGroupPin(props.to)"
      />
    </div>
    <div
      class="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
      :class="isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
    >
      <ul
        :id="menuId"
        class="flex min-h-0 flex-col gap-0.5 overflow-hidden"
        :aria-hidden="!isExpanded"
        :inert="!isExpanded"
        data-testid="drawer-group-menu"
        @click="closeTransient"
      >
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
      </ul>
    </div>
  </li>
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
  // The pin persists per device; hover and keyboard focus only expand temporarily.
  const isPinned = computed(() => appStore.drawerPinnedGroups.includes(props.to));
  const isHovered = ref(false);
  const isFocused = ref(false);
  const isExpanded = computed(() => isPinned.value || isHovered.value || isFocused.value);
  const isHighlighted = computed(() =>
    isExpanded.value ? isParentActive.value : isGroupActive.value
  );
  const menuId = useId();
  const closeTransient = () => {
    isHovered.value = false;
    isFocused.value = false;
  };
  const onFocusOut = (event: FocusEvent) => {
    if ((event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) return;
    isFocused.value = false;
  };
  watch(() => route.path, closeTransient);
  const toggleLabelKey = computed(() =>
    isPinned.value ? 'navigation_drawer.unpin_subpages' : 'navigation_drawer.pin_subpages'
  );
</script>
