<template>
  <li>
    <UTooltip v-if="props.isCollapsed" :text="labelText" :content="{ side: 'right' }">
      <DrawerItemContent
        :to="props.to"
        :href="props.href"
        :is-collapsed="props.isCollapsed"
        :icon="props.icon"
        :avatar="props.avatar"
        :color-class="iconClasses"
        :label-text="labelText"
        :badge="props.badge"
      />
    </UTooltip>
    <template v-else>
      <DrawerItemContent
        :to="props.to"
        :href="props.href"
        :is-collapsed="props.isCollapsed"
        :icon="props.icon"
        :avatar="props.avatar"
        :color-class="iconClasses"
        :label-text="labelText"
        :badge="props.badge"
        has-margin
      />
    </template>
  </li>
</template>
<script setup lang="ts">
  import { isNavigationRouteActive } from '@/features/drawer/navigation';
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const props = defineProps<{
    icon?: string;
    avatar?: string | null;
    localeKey?: string | null;
    text?: string | null;
    to?: string | null;
    href?: string | null;
    isCollapsed: boolean;
    badge?: string | null;
  }>();
  const isActive = computed(() => isNavigationRouteActive(props.to, route.path));
  const iconClasses = computed(() =>
    isActive.value
      ? 'text-white light:text-surface-50'
      : 'text-surface-300 group-hover:text-white light:group-hover:text-surface-50'
  );
  const labelText = computed(() => {
    if (props.localeKey) return t(props.localeKey);
    return props.text ?? '';
  });
</script>
