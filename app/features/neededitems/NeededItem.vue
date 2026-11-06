<template>
  <template v-if="props.itemStyle === 'card'">
    <div class="h-full">
      <LazyNeededItemSmallCard
        :need="props.need"
        :card-style="props.cardStyle"
        @decrease-count="decreaseCount()"
        @toggle-count="toggleCount()"
        @increase-count="increaseCount()"
        @set-count="setCount"
      />
    </div>
  </template>
  <template v-else-if="props.itemStyle === 'row'">
    <div class="w-full pt-1">
      <LazyNeededItemRow
        :need="props.need"
        :initially-visible="props.initiallyVisible"
        @decrease-count="decreaseCount()"
        @toggle-count="toggleCount()"
        @increase-count="increaseCount()"
        @set-count="setCount"
      />
    </div>
  </template>
</template>
<script setup lang="ts">
  import { useCraftableItem } from '@/composables/useCraftableItem';
  import { useCyclingItem } from '@/composables/useCyclingItem';
  import { neededItemKey, type NeededItemTeamNeed } from '@/features/neededitems/neededitem-keys';
  import { findAcceptedItemMatchIndex } from '@/features/neededitems/neededItemFilters';
  import {
    neededCountOf,
    useNeededItemProgress,
  } from '@/features/neededitems/useNeededItemProgress';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useProgressStore } from '@/stores/useProgress';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import type { NeededItemsCardStyle } from '@/features/neededitems/neededItemsFilterNormalization';
  import type { NeededItemHideoutModule, NeededItemTaskObjective } from '@/types/tarkov';
  const props = withDefaults(
    defineProps<{
      need: NeededItemTaskObjective | NeededItemHideoutModule;
      itemStyle?: 'card' | 'row';
      initiallyVisible?: boolean;
      cardStyle?: NeededItemsCardStyle;
      /** Active search term; pins pooled objectives to the matched accepted item. */
      search?: string;
    }>(),
    {
      itemStyle: 'card',
      initiallyVisible: false,
      cardStyle: 'expanded',
      search: '',
    }
  );
  const progressStore = useProgressStore();
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const tasks = computed(() => metadataStore.tasks);
  const hideoutStations = computed(() => metadataStore.hideoutStations);
  const alternativeTasks = computed(() => metadataStore.alternativeTasks);
  const progress = useNeededItemProgress();
  const decreaseCount = () => progress.decrease(props.need, currentCount.value);
  const increaseCount = () => progress.increase(props.need, currentCount.value);
  const toggleCount = () => progress.toggle(props.need, currentCount.value);
  const setCount = (count: number) => progress.setCount(props.need, count);
  const imageItem = computed(() => {
    if (!item.value) {
      return null;
    }
    if (item.value.properties?.defaultPreset) {
      return item.value.properties.defaultPreset;
    }
    return item.value;
  });
  const itemId = computed(() => item.value?.id);
  const { isCraftable, craftableIconClass, craftableTitle, goToCraftStation } =
    useCraftableItem(itemId);
  const neededCount = computed(() => neededCountOf(props.need));
  const currentCount = computed(() =>
    selfCompletedNeed.value ? neededCount.value : progress.storedCountOf(props.need)
  );
  const relatedTask = computed(() => {
    const need = props.need;
    if (need.needType === 'taskObjective') {
      return tasks.value.find((t) => t.id === need.taskId) ?? null;
    }
    return null;
  });
  const isKappaRequired = computed(() => {
    if (props.need.needType !== 'taskObjective') {
      return false;
    }
    return relatedTask.value?.kappaRequired === true;
  });
  const isLightkeeperRequired = computed(() => {
    if (props.need.needType !== 'taskObjective') {
      return false;
    }
    return relatedTask.value?.lightkeeperRequired === true;
  });
  const isTaskSuccessful = (taskId: string) =>
    tarkovStore.isTaskComplete(taskId) && !tarkovStore.isTaskFailed(taskId);
  const item = computed(() => {
    if (props.need.needType === 'hideoutModule') return props.need.item;
    return cyclingItem.value ?? props.need.item ?? props.need.markerItem ?? null;
  });
  const lockedBefore = computed(() => {
    if (props.need.needType === 'hideoutModule') {
      return props.need.hideoutModule.predecessors.filter(
        (s: string) => !tarkovStore.isHideoutModuleComplete(s)
      ).length;
    }
    return (relatedTask.value?.parents ?? []).filter((s) => !isTaskSuccessful(s)).length;
  });
  const isAlternativeTaskSuccessful = (taskId: string) =>
    alternativeTasks.value[taskId]?.some(isTaskSuccessful) ?? false;
  // A need is done once its parent task is turned in or its parent module is built.
  const selfCompletedNeed = computed(() => {
    const need = props.need;
    if (need.needType === 'hideoutModule') {
      return progressStore.moduleCompletions?.[need.hideoutModule.id]?.['self'] ?? false;
    }
    return isTaskSuccessful(need.taskId) || isAlternativeTaskSuccessful(need.taskId);
  });
  // "Any of these" objectives rotate the displayed item; progress stays on the primary item.
  const acceptedItems = computed(() => {
    if (props.need.needType !== 'taskObjective') return [];
    return props.need.acceptedItems ?? [];
  });
  const primaryItem = computed(() =>
    props.need.needType === 'taskObjective'
      ? (props.need.item ?? props.need.markerItem ?? null)
      : null
  );
  const cyclingPaused = ref(false);
  const setCyclingPaused = (paused: boolean) => {
    cyclingPaused.value = paused;
  };
  const hasAlternativeItems = computed(() => acceptedItems.value.length > 1);
  // When a search matches one of the accepted items, pin the display to that
  // item (instead of rotating) so users see exactly what matched, with the
  // "Any of N" badge making clear the pool accepts alternatives.
  const pinnedAcceptedIndex = computed(() =>
    findAcceptedItemMatchIndex(acceptedItems.value, props.search)
  );
  const { currentItem: cyclingItem, isCycling: isCyclingItems } = useCyclingItem(
    acceptedItems,
    primaryItem,
    {
      enabled: () => !selfCompletedNeed.value && !cyclingPaused.value,
      preferredIndex: pinnedAcceptedIndex,
    }
  );
  const relatedStation = computed(() => {
    const need = props.need;
    if (need.needType === 'hideoutModule') {
      return (
        Object.values(hideoutStations.value).find((s) => s.id === need.hideoutModule.stationId) ??
        null
      );
    }
    return null;
  });
  const levelRequired = computed(() =>
    props.need.needType === 'taskObjective' ? (relatedTask.value?.minPlayerLevel ?? 0) : 0
  );
  type TeammateCountStore = {
    getObjectiveCount?: (id: string) => number;
    getHideoutPartCount?: (id: string) => number;
  };
  const teamNeedsHiddenRules = [
    () => preferencesStore.itemsTeamAllHidden,
    () => preferencesStore.itemsTeamNonFIRHidden && !props.need.foundInRaid,
    () => preferencesStore.itemsTeamHideoutHidden && props.need.needType === 'hideoutModule',
  ];
  const pendingTeammates = (
    completions: Record<string, boolean>,
    isDone: (user: string) => boolean
  ) =>
    Object.entries(completions)
      .filter(([user, completed]) => user !== 'self' && !completed && !isDone(user))
      .map(([user]) => user);
  const collectTeamNeeds = (
    users: string[],
    countFor: (store: TeammateCountStore) => number | undefined
  ): NeededItemTeamNeed[] =>
    users.flatMap((user) => {
      const teammateStore = progressStore.teamStores?.[user] as TeammateCountStore | undefined;
      return teammateStore ? [{ user, count: countFor(teammateStore) ?? 0 }] : [];
    });
  const objectiveTeamNeeds = (need: NeededItemTaskObjective) => {
    const objectiveCompletions =
      progressStore.objectiveCompletions?.[need.sourceObjectiveId ?? need.id] ?? {};
    const taskCompletions = progressStore.tasksCompletions?.[need.taskId] ?? {};
    const users = pendingTeammates(objectiveCompletions, (user) => Boolean(taskCompletions[user]));
    return collectTeamNeeds(users, (store) => store.getObjectiveCount?.(need.id));
  };
  const hideoutTeamNeeds = (need: NeededItemHideoutModule) => {
    const users = pendingTeammates(
      progressStore.modulePartCompletions?.[need.id] ?? {},
      () => false
    );
    return collectTeamNeeds(users, (store) => store.getHideoutPartCount?.(need.id));
  };
  const hiddenForSelf = computed(
    () => props.need.needType === 'taskObjective' && props.need.hiddenForSelf === true
  );
  const teamNeeds = computed(() => {
    if (teamNeedsHiddenRules.some((isHidden) => isHidden())) return [];
    return props.need.needType === 'taskObjective'
      ? objectiveTeamNeeds(props.need)
      : hideoutTeamNeeds(props.need);
  });
  const { t } = useI18n({ useScope: 'global' });
  const formatNumber = useLocaleNumberFormatter();
  const formatTeamNeed = ({ user, count }: NeededItemTeamNeed) =>
    `${progressStore.getDisplayName(user)} (${formatNumber(count)}/${formatNumber(neededCount.value)})`;
  const hiddenForSelfHint = computed(() =>
    hiddenForSelf.value
      ? t('needed_items.hidden_for_you_hint', {
          teammates: teamNeeds.value.map(formatTeamNeed).join(', '),
        })
      : ''
  );
  provide(neededItemKey, {
    item,
    relatedTask,
    relatedStation,
    selfCompletedNeed,
    isKappaRequired,
    isLightkeeperRequired,
    lockedBefore,
    currentCount,
    neededCount,
    levelRequired,
    teamNeeds,
    hiddenForSelf,
    hiddenForSelfHint,
    imageItem,
    acceptedItems,
    hasAlternativeItems,
    isCyclingItems,
    setCyclingPaused,
    craftableIconClass,
    craftableTitle,
    isCraftable,
    goToCraftStation,
  });
</script>
