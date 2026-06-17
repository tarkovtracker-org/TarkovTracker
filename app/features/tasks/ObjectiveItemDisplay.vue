<template>
  <span
    class="contents"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @focusin="hovered = true"
    @focusout="hovered = false"
  >
    <AppTooltip
      v-if="displayIcon"
      :text="cyclingTooltip"
      :ui="{ content: 'h-auto overflow-hidden rounded-lg p-0' }"
    >
      <img
        :src="displayIcon"
        :alt="displayName"
        class="h-8 w-8 shrink-0 cursor-pointer rounded-sm object-contain transition-opacity hover:opacity-80"
      />
      <template #content>
        <img
          :src="displayPreview ?? displayIcon"
          :alt="displayName"
          class="bg-surface-900/90 block h-28 w-28 object-contain"
        />
      </template>
    </AppTooltip>
    <div class="flex min-w-0 flex-1 items-center gap-1">
      <AppTooltip :text="cyclingTooltip">
        <a
          v-if="displayPrimaryUrl"
          :href="displayPrimaryUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="text-link hover:text-link-hover focus-visible:ring-primary-500 flex min-w-0 items-center gap-0.5 rounded-sm text-xs font-bold no-underline focus:outline-none focus-visible:ring-2"
          @click.stop
        >
          <span class="truncate">{{ displayName }}</span>
          <UIcon name="i-mdi-open-in-new" class="text-surface-400 h-2.5 w-2.5 shrink-0" />
        </a>
        <span v-else class="text-surface-100 block truncate text-xs font-semibold">
          {{ displayName }}
        </span>
      </AppTooltip>
      <AcceptedItemsPopover
        v-if="hasAlternatives"
        v-model:open="acceptedItemsOpen"
        :items="acceptedItems"
        :cycling="isCycling"
        trigger-class="bg-surface-700/80 text-surface-200 px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ring-1 ring-white/5"
      />
      <AppTooltip
        v-if="displayDevUrl"
        :text="t('page.tasks.questcard.view_on_tarkov_dev', 'View on Tarkov.dev')"
      >
        <a
          :href="displayDevUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="text-surface-400 hover:text-surface-200 inline-flex items-center self-center rounded p-0.5 transition-colors"
          @click.stop
        >
          <img
            src="/img/logos/tarkovdevlogo.webp"
            :alt="t('page.tasks.questcard.view_on_tarkov_dev', 'View on Tarkov.dev')"
            class="h-4 w-4"
          />
        </a>
      </AppTooltip>
    </div>
  </span>
</template>
<script setup lang="ts">
  import { useCyclingItem } from '@/composables/useCyclingItem';
  import { resolveObjectiveItemIcon } from '@/features/tasks/task-objective-item-overrides';
  import { getKeyDevUrl, getKeyPrimaryUrl } from '@/utils/tarkovKeyHelpers';
  import type { TarkovItem } from '@/types/tarkov';
  const props = defineProps<{
    /** Primary/fallback item (canonical for the objective). */
    primaryItem?: TarkovItem;
    /** All accepted items when the objective allows alternatives. */
    acceptedItems?: TarkovItem[];
    /** Fallback display name when no item is resolved (e.g. objective description). */
    fallbackName: string;
    /** Pause cycling (e.g. when the parent task is completed/locked). */
    paused?: boolean;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const acceptedItems = computed(() =>
    (props.acceptedItems ?? []).filter((entry): entry is TarkovItem => Boolean(entry?.id))
  );
  const primary = computed(() => props.primaryItem ?? null);
  const hovered = ref(false);
  const acceptedItemsOpen = ref(false);
  const { currentItem, isCycling, hasAlternatives } = useCyclingItem(acceptedItems, primary, {
    enabled: () => !props.paused && !hovered.value && !acceptedItemsOpen.value,
  });
  // Prefer the defaultPreset image for weapons (full gun vs bare receiver).
  const imageItem = computed(() => {
    const item = currentItem.value;
    if (!item) return null;
    return item.properties?.defaultPreset ?? item;
  });
  const linkItem = computed(() => currentItem.value ?? imageItem.value ?? undefined);
  const displayName = computed(
    () => currentItem.value?.name || currentItem.value?.shortName || props.fallbackName
  );
  const displayIcon = computed(() => {
    const img = imageItem.value;
    const item = currentItem.value;
    return (
      resolveObjectiveItemIcon(img?.id || item?.id) ||
      img?.iconLink ||
      img?.image512pxLink ||
      img?.image8xLink ||
      item?.iconLink ||
      item?.image512pxLink ||
      undefined
    );
  });
  const displayPreview = computed(() => {
    const img = imageItem.value;
    const item = currentItem.value;
    return (
      img?.image512pxLink ||
      img?.image8xLink ||
      item?.image512pxLink ||
      img?.iconLink ||
      item?.iconLink ||
      undefined
    );
  });
  const displayDevUrl = computed(() => (linkItem.value ? getKeyDevUrl(linkItem.value) : undefined));
  const displayPrimaryUrl = computed(() =>
    linkItem.value ? getKeyPrimaryUrl(linkItem.value) : undefined
  );
  const cyclingTooltip = computed(() => {
    if (hasAlternatives.value) {
      return t(
        'needed_items.any_of_items',
        { count: acceptedItems.value.length },
        'Any one of these {count} items counts'
      );
    }
    return displayName.value;
  });
</script>
