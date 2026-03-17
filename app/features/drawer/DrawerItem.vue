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
  const isActive = computed(() => {
    if (props.to) {
      return route.path === props.to;
    }
    return false;
  });
  const iconClasses = computed(() =>
    isActive.value ? 'text-foreground' : 'text-foreground-muted group-hover:text-foreground'
  );
  const labelText = computed(() => {
    if (props.localeKey) return t(`navigation_drawer.${props.localeKey}`);
    return props.text ?? '';
  });
</script>
