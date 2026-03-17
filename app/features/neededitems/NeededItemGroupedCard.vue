<template>
  <div
    role="button"
    tabindex="0"
    :aria-label="$t('needed_items.view_details_for', { name: groupedItem.item.name })"
    class="focus-visible:ring-primary-500 focus-visible:ring-offset-panel bg-panel hover:bg-raised border-border shadow-card flex h-full cursor-pointer flex-col rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    @click="handleCardClick"
    @keydown.enter="handleCardClick"
    @keydown.space.prevent="handleCardClick"
  >
    <!-- Top section: Image + Name side by side -->
    <div class="flex items-center gap-3 p-3">
      <!-- Item image -->
      <div class="bg-field relative h-16 w-16 shrink-0 overflow-hidden rounded">
        <GameItem
          :src="groupedItem.item.image512pxLink || groupedItem.item.iconLink"
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
      <!-- Item name + Total -->
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
          <span class="text-foreground-subtle text-xs">{{ $t('needed_items.total') }}</span>
          <span
            class="text-lg font-bold"
            :class="isComplete ? 'text-success-400' : 'text-primary-400'"
          >
            {{ formatCompactNumber(groupedItem.currentCount) }}/{{
              formatCompactNumber(groupedItem.total)
            }}
          </span>
        </div>
      </div>
    </div>
    <!-- Breakdown grid -->
    <div
      class="bg-border-muted border-border gap-px border-t text-xs"
      :class="activeFilter === 'tasks' || activeFilter === 'hideout' ? '' : 'grid grid-cols-2'"
    >
      <!-- Tasks section -->
      <div v-if="activeFilter !== 'hideout'" class="bg-raised p-2">
        <div
          v-if="activeFilter === 'all' || activeFilter === 'completed'"
          class="text-foreground-subtle mb-1.5 flex items-center gap-1"
        >
          <UIcon name="i-mdi-clipboard-list" class="h-3.5 w-3.5" />
          <span class="font-medium">{{ $t('needed_items.tasks') }}</span>
        </div>
        <div class="flex gap-3">
          <div v-if="groupedItem.taskFir > 0" class="flex items-center gap-1">
            <AppTooltip :text="$t('needed_items.fir_required')">
              <UIcon
                name="i-mdi-checkbox-marked-circle-outline"
                class="h-3 w-3"
                :class="
                  groupedItem.taskFirCurrent >= groupedItem.taskFir
                    ? 'text-success-400'
                    : 'text-foreground'
                "
              />
            </AppTooltip>
            <span
              class="font-semibold"
              :class="
                groupedItem.taskFirCurrent >= groupedItem.taskFir
                  ? 'text-success-400'
                  : 'text-foreground'
              "
            >
              {{ groupedItem.taskFirCurrent }}/{{ groupedItem.taskFir }}
            </span>
          </div>
          <div v-if="groupedItem.taskNonFir > 0" class="flex items-center gap-1">
            <UIcon
              name="i-mdi-checkbox-blank-circle-outline"
              class="h-3 w-3"
              :class="
                groupedItem.taskNonFirCurrent >= groupedItem.taskNonFir
                  ? 'text-success-400'
                  : 'text-foreground-subtle'
              "
            />
            <span
              class="font-semibold"
              :class="
                groupedItem.taskNonFirCurrent >= groupedItem.taskNonFir
                  ? 'text-success-400'
                  : 'text-foreground'
              "
            >
              {{ groupedItem.taskNonFirCurrent }}/{{ groupedItem.taskNonFir }}
            </span>
          </div>
          <span
            v-if="groupedItem.taskFir === 0 && groupedItem.taskNonFir === 0"
            class="text-foreground-disabled"
          >
            -
          </span>
        </div>
      </div>
      <!-- Hideout section -->
      <div v-if="activeFilter !== 'tasks'" class="bg-raised p-2">
        <div
          v-if="activeFilter === 'all' || activeFilter === 'completed'"
          class="text-foreground-subtle mb-1.5 flex items-center gap-1"
        >
          <UIcon name="i-mdi-home" class="h-3.5 w-3.5" />
          <span class="font-medium">{{ $t('needed_items.hideout_label') }}</span>
        </div>
        <div class="flex gap-3">
          <div v-if="groupedItem.hideoutFir > 0" class="flex items-center gap-1">
            <AppTooltip :text="$t('needed_items.fir_required')">
              <UIcon
                name="i-mdi-checkbox-marked-circle-outline"
                class="h-3 w-3"
                :class="
                  groupedItem.hideoutFirCurrent >= groupedItem.hideoutFir
                    ? 'text-success-400'
                    : 'text-foreground'
                "
              />
            </AppTooltip>
            <span
              class="font-semibold"
              :class="
                groupedItem.hideoutFirCurrent >= groupedItem.hideoutFir
                  ? 'text-success-400'
                  : 'text-foreground'
              "
            >
              {{ groupedItem.hideoutFirCurrent }}/{{ groupedItem.hideoutFir }}
            </span>
          </div>
          <div v-if="groupedItem.hideoutNonFir > 0" class="flex items-center gap-1">
            <UIcon
              name="i-mdi-checkbox-blank-circle-outline"
              class="h-3 w-3"
              :class="
                groupedItem.hideoutNonFirCurrent >= groupedItem.hideoutNonFir
                  ? 'text-success-400'
                  : 'text-foreground-subtle'
              "
            />
            <span
              class="font-semibold"
              :class="
                groupedItem.hideoutNonFirCurrent >= groupedItem.hideoutNonFir
                  ? 'text-success-400'
                  : 'text-foreground'
              "
            >
              {{ groupedItem.hideoutNonFirCurrent }}/{{ groupedItem.hideoutNonFir }}
            </span>
          </div>
          <span
            v-if="groupedItem.hideoutFir === 0 && groupedItem.hideoutNonFir === 0"
            class="text-foreground-disabled"
          >
            -
          </span>
        </div>
      </div>
    </div>
    <NeededItemGroupedModal
      v-model:open="showModal"
      :item-info="groupedItem.item"
      :task-objectives="taskObjectives"
      :hideout-modules="hideoutModules"
    />
  </div>
</template>
<script setup lang="ts">
  import { useCraftableItem } from '@/composables/useCraftableItem';
  import type {
    GroupedNeededItem,
    NeededItemHideoutModule,
    NeededItemTaskObjective,
  } from '@/types/tarkov';
  const props = defineProps<{
    groupedItem: GroupedNeededItem;
    taskObjectives: NeededItemTaskObjective[];
    hideoutModules: NeededItemHideoutModule[];
    activeFilter?: 'all' | 'tasks' | 'hideout' | 'completed';
  }>();
  const showModal = ref(false);
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
    showModal.value = true;
  };
  const itemId = computed(() => props.groupedItem.item.id);
  const isComplete = computed(() => {
    return props.groupedItem.currentCount >= props.groupedItem.total;
  });
  const { isCraftable, craftableIconClass, craftableTitle, goToCraftStation } =
    useCraftableItem(itemId);
</script>
