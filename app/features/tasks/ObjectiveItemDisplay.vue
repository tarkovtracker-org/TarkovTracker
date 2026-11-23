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
    <TaskItemLinks
      :item="currentItem ?? undefined"
      :label="displayName"
      :tooltip-text="cyclingTooltip"
    >
      <AcceptedItemsPopover
        v-if="hasAlternatives"
        v-model:open="acceptedItemsOpen"
        :items="acceptedItems"
        :cycling="isCycling"
        trigger-class="bg-surface-700/80 text-surface-200 px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ring-1 ring-white/5"
      />
    </TaskItemLinks>
  </span>
</template>
<script setup lang="ts">
  import { useCyclingItem } from '@/composables/useCyclingItem';
  import TaskItemLinks from '@/features/tasks/TaskItemLinks.vue';
  import { getItemDisplayIcon } from '@/utils/tarkovKeyHelpers';
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
  const displayName = computed(
    () => currentItem.value?.name || currentItem.value?.shortName || props.fallbackName
  );
  const displayIcon = computed(() => getItemDisplayIcon(currentItem.value));
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
