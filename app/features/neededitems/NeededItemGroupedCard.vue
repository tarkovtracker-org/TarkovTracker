<template>
  <div
    role="button"
    tabindex="0"
    :aria-label="$t('needed_items.view_details_for', { name: groupedItem.item.name })"
    class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 bg-surface-800 hover:bg-surface-700 flex h-full cursor-pointer flex-col rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    @click="handleCardClick"
    @keydown.enter="handleCardClick"
    @keydown.space.prevent="handleCardClick"
  >
    <div class="flex items-center gap-3 p-3">
      <div class="bg-surface-900 relative h-16 w-16 shrink-0 overflow-hidden rounded">
        <GameItem
          :src="groupedItem.item.image512pxLink || groupedItem.item.iconLink"
          :item-id="groupedItem.item.id"
          :item-name="groupedItem.item.name"
          :wiki-link="groupedItem.item.wikiLink"
          :dev-link="groupedItem.item.link"
          :is-visible="true"
          background-color="grey"
          size="small"
          simple-mode
          fill
          class="h-full w-full"
        />
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-start gap-1">
          <div class="line-clamp-2 min-w-0 text-sm leading-tight font-semibold">
            {{ groupedItem.item.name }}
          </div>
          <AppTooltip v-if="isCraftable" :text="craftableTitle">
            <button type="button" class="inline-flex" @click="goToCraftStation">
              <UIcon name="i-mdi-hammer-wrench" class="h-4 w-4" :class="craftableIconClass" />
            </button>
          </AppTooltip>
        </div>
        <div class="mt-1 flex items-center gap-1">
          <span class="text-surface-400 text-xs">{{ $t('needed_items.total') }}</span>
          <span
            class="text-lg font-bold"
            :class="isComplete ? 'text-success-400' : 'text-primary-400'"
          >
            {{ formatNumber(groupedItem.currentCount) }}/{{ formatNumber(groupedItem.total) }}
          </span>
        </div>
      </div>
    </div>
    <div
      class="gap-px border-t border-white/10 bg-white/5 text-xs"
      :class="sections.length > 1 ? 'grid grid-cols-2' : ''"
    >
      <div v-for="section in sections" :key="section.key" class="bg-surface-800 p-2">
        <div v-if="sections.length > 1" class="text-surface-400 mb-1.5 flex items-center gap-1">
          <UIcon :name="section.icon" class="h-3.5 w-3.5" />
          <span class="font-medium">{{ $t(section.label) }}</span>
        </div>
        <div class="flex gap-3">
          <div v-for="count in section.counts" :key="count.key" class="flex items-center gap-1">
            <AppTooltip :text="$t(count.tooltip)">
              <UIcon
                :name="count.icon"
                class="h-3 w-3"
                :class="countClass(count.current, count.needed)"
              />
            </AppTooltip>
            <span class="font-semibold" :class="countClass(count.current, count.needed)">
              {{ formatNumber(count.current) }}/{{ formatNumber(count.needed) }}
            </span>
          </div>
          <span v-if="section.counts.length === 0" class="text-surface-500">-</span>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useCraftableItem } from '@/composables/useCraftableItem';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import type { NeededItemsFilterType } from '@/features/neededitems/neededitems-constants';
  import type { GroupedNeededItem } from '@/types/tarkov';
  const props = withDefaults(
    defineProps<{
      groupedItem: GroupedNeededItem;
      activeFilter?: NeededItemsFilterType;
    }>(),
    { activeFilter: 'all' }
  );
  const emit = defineEmits<{ open: [itemId: string] }>();
  const formatNumber = useLocaleNumberFormatter();
  const handleCardClick = (event: MouseEvent | KeyboardEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    const currentTarget = event.currentTarget instanceof Element ? event.currentTarget : null;
    const interactiveTarget = target?.closest(
      'button, a, [role="button"], [tabindex]:not([tabindex="-1"])'
    );
    if (interactiveTarget && interactiveTarget !== currentTarget) {
      return;
    }
    if ('key' in event && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
    }
    emit('open', props.groupedItem.item.id);
  };
  const itemId = computed(() => props.groupedItem.item.id);
  const isComplete = computed(() => {
    return props.groupedItem.currentCount >= props.groupedItem.total;
  });
  const { isCraftable, craftableIconClass, craftableTitle, goToCraftStation } =
    useCraftableItem(itemId);
  const countClass = (current: number, needed: number) =>
    current >= needed ? 'text-success-400' : 'light:text-surface-50 text-white';
  const sourceCounts = (fir: number, firCurrent: number, nonFir: number, nonFirCurrent: number) =>
    [
      {
        key: 'fir',
        icon: 'i-mdi-checkbox-marked-circle-outline',
        tooltip: 'common.found_in_raid_required',
        needed: fir,
        current: firCurrent,
      },
      {
        key: 'nonFir',
        icon: 'i-mdi-checkbox-blank-circle-outline',
        tooltip: 'needed_items.non_fir',
        needed: nonFir,
        current: nonFirCurrent,
      },
    ].filter((count) => count.needed > 0);
  const sections = computed(() => {
    const item = props.groupedItem;
    const all = [
      {
        key: 'tasks',
        icon: 'i-mdi-clipboard-list',
        label: 'common.tasks',
        counts: sourceCounts(
          item.taskFir,
          item.taskFirCurrent,
          item.taskNonFir,
          item.taskNonFirCurrent
        ),
      },
      {
        key: 'hideout',
        icon: 'i-mdi-home',
        label: 'common.hideout',
        counts: sourceCounts(
          item.hideoutFir,
          item.hideoutFirCurrent,
          item.hideoutNonFir,
          item.hideoutNonFirCurrent
        ),
      },
    ];
    return all.filter((section) => [section.key, 'all', 'completed'].includes(props.activeFilter));
  });
</script>
