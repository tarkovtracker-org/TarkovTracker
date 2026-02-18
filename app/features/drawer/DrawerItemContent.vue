<template>
  <NuxtLink
    v-if="isNuxtLink"
    :to="props.to ?? undefined"
    :aria-label="props.labelText ?? ''"
    class="group flex min-h-10 items-center rounded-sm border-l-2 px-3 py-2 text-sm font-medium transition-colors duration-150"
    :class="[
      props.isCollapsed ? 'justify-center' : '',
      isActive
        ? 'border-primary-500 bg-surface-800/50 text-white'
        : 'text-surface-300 hover:bg-surface-800/30 border-transparent hover:text-white',
    ]"
  >
    <DrawerItemIcon
      :icon="props.icon"
      :avatar="props.avatar"
      :color-class="props.colorClass"
      :has-margin="props.hasMargin"
    />
    <span v-if="!props.isCollapsed" class="flex min-w-0 items-center gap-2">
      <span class="truncate">{{ props.labelText }}</span>
      <span
        v-if="props.badge"
        class="bg-warning-500/20 text-warning-400 shrink-0 rounded px-1.5 py-0.5 text-[10px] leading-none font-bold uppercase"
      >
        {{ props.badge }}
      </span>
    </span>
  </NuxtLink>
  <a
    v-else-if="isAnchor"
    :href="props.href ?? undefined"
    :aria-label="props.labelText ?? ''"
    target="_blank"
    rel="noopener noreferrer"
    class="group text-surface-300 hover:bg-surface-800/30 flex min-h-10 items-center rounded-sm border-l-2 border-transparent px-3 py-2 text-sm font-medium transition-colors duration-150 hover:text-white"
    :class="[props.isCollapsed ? 'justify-center' : '']"
  >
    <DrawerItemIcon
      :icon="props.icon"
      :avatar="props.avatar"
      :color-class="props.colorClass"
      :has-margin="props.hasMargin"
    />
    <span v-if="!props.isCollapsed" class="flex items-center gap-1 truncate">
      {{ props.labelText }}
      <UIcon name="i-mdi-open-in-new" class="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
      <span class="sr-only">({{ $t('common.opens_in_new_tab') }})</span>
    </span>
  </a>
  <span
    v-else
    :aria-label="props.labelText ?? ''"
    class="group flex min-h-12 cursor-not-allowed items-center rounded-sm border-l-2 border-transparent px-3 py-3 text-base font-medium text-white/50 opacity-60 transition-colors duration-200"
    :class="[props.isCollapsed ? 'justify-center' : '']"
    aria-disabled="true"
  >
    <DrawerItemIcon
      :icon="props.icon"
      :avatar="props.avatar"
      :color-class="props.colorClass"
      :has-margin="props.hasMargin"
    />
    <span v-if="!props.isCollapsed" class="truncate">{{ props.labelText }}</span>
  </span>
</template>
<script setup lang="ts">
  import { logger } from '@/utils/logger';
  const props = defineProps<{
    to?: string | null;
    href?: string | null;
    disabled?: boolean;
    isCollapsed: boolean;
    icon?: string;
    avatar?: string | null;
    colorClass?: string;
    labelText?: string;
    hasMargin?: boolean;
    badge?: string | null;
  }>();
  const route = useRoute();
  if (import.meta.env.DEV) {
    watchEffect(() => {
      if (props.to && props.href) {
        logger.warn(
          '[DrawerItemContent] Both props.to and props.href provided. isAnchor will render with props.href, isNuxtLink will be false, and props.to will be ignored.'
        );
      }
    });
  }
  const isDisabled = computed(() => props.disabled ?? (!props.to && !props.href));
  const isNuxtLink = computed(() => !isDisabled.value && !!props.to && !props.href);
  const isAnchor = computed(() => !isDisabled.value && !isNuxtLink.value && !!props.href);
  const isActive = computed(() => (props.to ? route.path === props.to : false));
</script>
