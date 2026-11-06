<template>
  <UModal
    :open="open"
    :title="itemInfo.name"
    :description="
      $t('needed_items.progress_format', { current: totals.current, total: totals.needed })
    "
    :ui="{ content: 'bg-transparent border-0 p-0 shadow-none ring-0 outline-none' }"
    scrollable
    @update:open="$emit('update:open', $event)"
  >
    <template #content>
      <div
        class="bg-surface-900 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg"
      >
        <div class="flex items-center gap-4 border-b border-white/10 p-4">
          <div class="bg-surface-800 relative h-16 w-16 shrink-0 overflow-hidden rounded">
            <GameItem
              :src="itemInfo.image512pxLink || itemInfo.iconLink"
              :item-id="itemInfo.id"
              :item-name="itemInfo.name"
              :wiki-link="itemInfo.wikiLink"
              :dev-link="itemInfo.link"
              :is-visible="true"
              background-color="grey"
              size="small"
              simple-mode
              fill
              class="h-full w-full"
            />
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="text-lg font-semibold">{{ itemInfo.name }}</h3>
            <div class="text-surface-400 text-sm">
              {{ $t('needed_items.total') }}
              <span :class="isComplete ? 'text-success-400' : 'text-primary-400'" class="font-bold">
                {{ formatNumber(totals.current) }}/{{ formatNumber(totals.needed) }}
              </span>
            </div>
          </div>
          <button
            type="button"
            class="text-surface-400 light:hover:text-surface-50 hover:text-white"
            :aria-label="$t('common.close')"
            @click="$emit('update:open', false)"
          >
            <UIcon name="i-mdi-close" class="h-6 w-6" />
          </button>
        </div>
        <div class="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          <div class="bg-surface-800 rounded-lg p-4">
            <h4 class="text-surface-300 mb-3 text-sm font-medium tracking-wide uppercase">
              {{ $t('needed_items.collected_items') }}
            </h4>
            <NeededItemGroupedInputControls
              :fir-needed="totals.firNeeded"
              :fir-current="firInput"
              :non-fir-needed="totals.nonFirNeeded"
              :non-fir-current="nonFirInput"
              @update:fir="firInput = $event"
              @update:non-fir="nonFirInput = $event"
            />
            <div class="mt-4 flex gap-2">
              <UButton color="primary" :disabled="!canSmartFill" @click="handleSmartFill">
                <UIcon name="i-mdi-auto-fix" class="mr-1 h-4 w-4" />
                {{ $t('needed_items.smart_fill') }}
              </UButton>
              <UButton variant="soft" :disabled="!isTargetGameModeActive" @click="handleReset">
                <UIcon name="i-mdi-refresh" class="mr-1 h-4 w-4" />
                {{ $t('common.reset') }}
              </UButton>
            </div>
          </div>
          <div v-if="sortedTaskObjectives.length > 0">
            <h4
              class="text-surface-300 mb-3 flex items-center gap-2 text-sm font-medium tracking-wide uppercase"
            >
              <UIcon name="i-mdi-clipboard-list" class="h-4 w-4" />
              {{ $t('common.tasks') }} ({{ taskObjectivesList.length }})
            </h4>
            <div class="space-y-2">
              <div
                v-for="obj in sortedTaskObjectives"
                :key="obj.id"
                class="bg-surface-800 flex items-center justify-between gap-3 rounded-lg p-3"
              >
                <div class="flex min-w-0 flex-1 items-center gap-2">
                  <router-link
                    :to="{ path: '/tasks', query: { task: obj.taskId } }"
                    class="flex min-w-0 items-center gap-2 no-underline"
                  >
                    <img
                      v-if="taskLookup[obj.taskId]?.trader?.imageLink"
                      :src="taskLookup[obj.taskId]?.trader?.imageLink"
                      :alt="taskLookup[obj.taskId]?.trader?.name"
                      class="h-6 w-6 shrink-0 rounded-full"
                    />
                    <span class="text-link hover:text-link-hover truncate text-sm font-medium">
                      {{ getTaskName(obj.taskId) }}
                    </span>
                  </router-link>
                  <UBadge v-if="isKappa(obj)" color="kappa" size="xs">
                    {{ $t('common.kappa') }}
                  </UBadge>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <AcceptedItemsPopover
                    v-if="acceptedItemsFor(obj).length > 1"
                    :items="acceptedItemsFor(obj)"
                    trigger-class="bg-surface-700/60 text-surface-200 px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-white/10"
                  />
                  <span
                    class="text-xs"
                    :class="obj.foundInRaid ? 'text-warning-400' : 'text-surface-400'"
                  >
                    {{ obj.foundInRaid ? $t('common.fir') : $t('needed_items.non') }}
                  </span>
                  <ItemCountControls
                    size="sm"
                    :current-count="progress.storedCountOf(obj)"
                    :needed-count="neededCountOf(obj)"
                    :disabled="!isTargetGameModeActive"
                    :decrease-label="
                      t('needed_items.aria.decrease_objective_count', {
                        task_name: getTaskName(obj.taskId),
                      })
                    "
                    :increase-label="
                      t('needed_items.aria.increase_objective_count', {
                        task_name: getTaskName(obj.taskId),
                      })
                    "
                    @decrease="mutate(() => progress.decrease(obj))"
                    @increase="mutate(() => progress.increase(obj))"
                    @toggle="mutate(() => progress.toggle(obj))"
                    @set-count="(count) => mutate(() => progress.setCount(obj, count))"
                  />
                </div>
              </div>
            </div>
          </div>
          <div v-if="sortedHideoutModules.length > 0">
            <h4
              class="text-surface-300 mb-3 flex items-center gap-2 text-sm font-medium tracking-wide uppercase"
            >
              <UIcon name="i-mdi-home" class="h-4 w-4" />
              {{ $t('common.hideout') }} ({{ hideoutModulesList.length }})
            </h4>
            <div class="space-y-2">
              <div
                v-for="mod in sortedHideoutModules"
                :key="mod.id"
                class="bg-surface-800 flex items-center justify-between gap-3 rounded-lg p-3"
              >
                <div class="flex min-w-0 flex-1 items-center gap-2">
                  <router-link
                    :to="{
                      path: '/hideout',
                      query: { station: mod.hideoutModule.stationId, module: mod.hideoutModule.id },
                    }"
                    class="flex min-w-0 items-center gap-2 no-underline"
                  >
                    <img
                      v-if="getStation(mod)?.imageLink"
                      :src="getStation(mod)?.imageLink"
                      :alt="getStationName(mod)"
                      class="h-6 w-6 shrink-0"
                    />
                    <span class="text-link hover:text-link-hover truncate text-sm font-medium">
                      {{ getStationName(mod) }}
                    </span>
                  </router-link>
                  <span class="text-surface-400 text-xs">
                    {{ $t('common.lvl_level', { level: mod.hideoutModule.level }) }}
                  </span>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <span
                    class="text-xs"
                    :class="mod.foundInRaid ? 'text-warning-400' : 'text-surface-400'"
                  >
                    {{ mod.foundInRaid ? $t('common.fir') : $t('needed_items.non') }}
                  </span>
                  <ItemCountControls
                    size="sm"
                    :current-count="progress.storedCountOf(mod)"
                    :needed-count="neededCountOf(mod)"
                    :disabled="!isTargetGameModeActive"
                    :decrease-label="
                      t('needed_items.aria.decrease_hideout_count', {
                        station_name: getStationName(mod),
                      })
                    "
                    :increase-label="
                      t('needed_items.aria.increase_hideout_count', {
                        station_name: getStationName(mod),
                      })
                    "
                    @decrease="mutate(() => progress.decrease(mod))"
                    @increase="mutate(() => progress.increase(mod))"
                    @toggle="mutate(() => progress.toggle(mod))"
                    @set-count="(count) => mutate(() => progress.setCount(mod, count))"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
<script setup lang="ts">
  import ItemCountControls from '@/features/neededitems/ItemCountControls.vue';
  import NeededItemGroupedInputControls from '@/features/neededitems/NeededItemGroupedInputControls.vue';
  import {
    neededCountOf,
    useNeededItemProgress,
  } from '@/features/neededitems/useNeededItemProgress';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import { logger } from '@/utils/logger';
  import type {
    GroupedItemInfo,
    NeededItemHideoutModule,
    NeededItemTaskObjective,
    TarkovItem,
  } from '@/types/tarkov';
  import type { GameMode } from '@/utils/constants';
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const props = withDefaults(
    defineProps<{
      open?: boolean;
      itemInfo: GroupedItemInfo;
      taskObjectives?: NeededItemTaskObjective[];
      hideoutModules?: NeededItemHideoutModule[];
    }>(),
    {
      open: false,
      taskObjectives: () => [],
      hideoutModules: () => [],
    }
  );
  const emit = defineEmits<{
    'update:open': [value: boolean];
  }>();
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  const progress = useNeededItemProgress();
  const formatNumber = useLocaleNumberFormatter();
  const {
    distributeItems,
    applyDistribution,
    resetObjectives,
    sortTaskObjectives,
    sortHideoutModules,
  } = useItemDistribution();
  const taskObjectivesList = shallowRef([...props.taskObjectives]);
  const hideoutModulesList = shallowRef([...props.hideoutModules]);
  const targetGameMode = ref<GameMode>(tarkovStore.getCurrentGameMode());
  const isTargetGameModeActive = computed(
    () => targetGameMode.value === tarkovStore.getCurrentGameMode()
  );
  const canMutateTargetGameMode = () => {
    if (targetGameMode.value === tarkovStore.getCurrentGameMode()) return true;
    emit('update:open', false);
    return false;
  };
  const sortedTaskObjectives = computed(() => sortTaskObjectives(taskObjectivesList.value));
  const sortedHideoutModules = computed(() => sortHideoutModules(hideoutModulesList.value));
  const getTask = (taskId: string) => metadataStore.getTaskById(taskId);
  const getStation = (mod: NeededItemHideoutModule) =>
    metadataStore.getStationById(mod.hideoutModule.stationId);
  const getTaskName = (taskId: string) =>
    taskLookup.value[taskId]?.name || t('needed_items.unknown_task');
  const getStationName = (mod: NeededItemHideoutModule) =>
    getStation(mod)?.name || t('needed_items.unknown_station');
  const taskLookup = computed(() => {
    const lookup: Record<string, ReturnType<typeof getTask>> = {};
    for (const obj of taskObjectivesList.value) {
      if (!(obj.taskId in lookup)) {
        lookup[obj.taskId] = getTask(obj.taskId);
      }
    }
    return lookup;
  });
  const isKappa = (obj: NeededItemTaskObjective) => {
    const task = taskLookup.value[obj.taskId];
    return task?.kappaRequired === true;
  };
  const acceptedItemsFor = (obj: NeededItemTaskObjective): TarkovItem[] =>
    obj.acceptedItems?.length ? obj.acceptedItems : [];
  type NeedTotals = {
    needed: number;
    current: number;
    firNeeded: number;
    nonFirNeeded: number;
    firCurrent: number;
    nonFirCurrent: number;
  };
  const addNeed = (totals: NeedTotals, need: NeededItemTaskObjective | NeededItemHideoutModule) => {
    const needed = neededCountOf(need);
    const current = Math.min(progress.storedCountOf(need), needed);
    const source = need.foundInRaid ? 'fir' : 'nonFir';
    totals.needed += needed;
    totals.current += current;
    totals[`${source}Needed`] += needed;
    totals[`${source}Current`] += current;
    return totals;
  };
  const totals = computed(() =>
    [...taskObjectivesList.value, ...hideoutModulesList.value].reduce(addNeed, {
      needed: 0,
      current: 0,
      firNeeded: 0,
      nonFirNeeded: 0,
      firCurrent: 0,
      nonFirCurrent: 0,
    })
  );
  const firInput = ref(0);
  const nonFirInput = ref(0);
  watch(
    () => tarkovStore.getCurrentGameMode(),
    (currentGameMode) => {
      if (props.open && targetGameMode.value !== currentGameMode) {
        emit('update:open', false);
      }
    }
  );
  watch(
    () => props.open,
    (isOpen) => {
      if (isOpen) {
        targetGameMode.value = tarkovStore.getCurrentGameMode();
        taskObjectivesList.value = [...props.taskObjectives];
        hideoutModulesList.value = [...props.hideoutModules];
        firInput.value = totals.value.firCurrent;
        nonFirInput.value = totals.value.nonFirCurrent;
      }
    },
    { immediate: true }
  );
  const canSmartFill = computed(
    () => isTargetGameModeActive.value && (firInput.value > 0 || nonFirInput.value > 0)
  );
  const isComplete = computed(() => totals.value.current >= totals.value.needed);
  const handleSmartFill = () => {
    if (!canMutateTargetGameMode()) return;
    try {
      const result = distributeItems(
        firInput.value,
        nonFirInput.value,
        taskObjectivesList.value,
        hideoutModulesList.value
      );
      applyDistribution(result);
    } catch (error) {
      logger.error('Failed to smart fill needed items.', error);
      toast.add({
        title: t('needed_items.modal.smart_fill_error'),
        description: error instanceof Error ? error.message : t('needed_items.modal.unknown_error'),
        color: 'error',
      });
    }
  };
  const handleReset = () => {
    if (!canMutateTargetGameMode()) return;
    try {
      resetObjectives(taskObjectivesList.value, hideoutModulesList.value);
      firInput.value = 0;
      nonFirInput.value = 0;
    } catch (error) {
      logger.error('Failed to reset needed items.', error);
      toast.add({
        title: t('needed_items.modal.reset_error'),
        description: error instanceof Error ? error.message : t('needed_items.modal.unknown_error'),
        color: 'error',
      });
    }
  };
  const mutate = (action: () => void) => {
    if (canMutateTargetGameMode()) action();
  };
</script>
