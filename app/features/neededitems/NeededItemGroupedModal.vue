<template>
  <UModal
    :open="open"
    :title="itemInfo.name"
    :description="$t('needed_items.progress_format', { current: currentTotal, total: totalNeeded })"
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
                {{ currentTotal }}/{{ totalNeeded }}
              </span>
            </div>
          </div>
          <button
            class="text-surface-400 hover:text-white"
            :aria-label="$t('generic.close_button')"
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
              :fir-needed="totalFirNeeded"
              :fir-current="firInput"
              :non-fir-needed="totalNonFirNeeded"
              :non-fir-current="nonFirInput"
              @update:fir="firInput = $event"
              @update:non-fir="nonFirInput = $event"
            />
            <div class="mt-4 flex gap-2">
              <UButton color="primary" :disabled="!canSmartFill" @click="handleSmartFill">
                <UIcon name="i-mdi-auto-fix" class="mr-1 h-4 w-4" />
                {{ $t('needed_items.smart_fill') }}
              </UButton>
              <UButton variant="soft" @click="handleReset">
                <UIcon name="i-mdi-refresh" class="mr-1 h-4 w-4" />
                {{ $t('needed_items.reset') }}
              </UButton>
            </div>
          </div>
          <div v-if="sortedTaskObjectives.length > 0">
            <h4
              class="text-surface-300 mb-3 flex items-center gap-2 text-sm font-medium tracking-wide uppercase"
            >
              <UIcon name="i-mdi-clipboard-list" class="h-4 w-4" />
              {{ $t('needed_items.tasks') }} ({{ taskObjectivesList.length }})
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
                    {{ $t('needed_items.kappa') }}
                  </UBadge>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <span
                    class="text-xs"
                    :class="obj.foundInRaid ? 'text-warning-400' : 'text-surface-400'"
                  >
                    {{ obj.foundInRaid ? $t('needed_items.fir') : $t('needed_items.non') }}
                  </span>
                  <div class="bg-surface-700 flex items-center rounded border border-white/20">
                    <button
                      class="text-surface-200 hover:bg-surface-600 flex h-6 w-6 items-center justify-center rounded-l transition-colors hover:text-white"
                      :aria-label="
                        t('needed_items.aria.decrease_objective_count', {
                          task_name: getTaskName(obj.taskId),
                        })
                      "
                      @click="decreaseObjective(obj)"
                    >
                      <UIcon name="i-mdi-minus" class="h-3 w-3" />
                    </button>
                    <span
                      class="bg-surface-800 flex h-6 min-w-10 items-center justify-center border-x border-white/20 px-1 text-xs font-semibold"
                      :class="
                        getObjectiveCount(obj) >= obj.count ? 'text-success-400' : 'text-white'
                      "
                    >
                      {{ getObjectiveCount(obj) }}/{{ obj.count }}
                    </span>
                    <button
                      class="text-surface-200 hover:bg-surface-600 flex h-6 w-6 items-center justify-center rounded-r transition-colors hover:text-white"
                      :aria-label="
                        t('needed_items.aria.increase_objective_count', {
                          task_name: getTaskName(obj.taskId),
                        })
                      "
                      @click="increaseObjective(obj)"
                    >
                      <UIcon name="i-mdi-plus" class="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-if="sortedHideoutModules.length > 0">
            <h4
              class="text-surface-300 mb-3 flex items-center gap-2 text-sm font-medium tracking-wide uppercase"
            >
              <UIcon name="i-mdi-home" class="h-4 w-4" />
              {{ $t('needed_items.hideout_label') }} ({{ hideoutModulesList.length }})
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
                    {{ $t('needed_items.lvl') }} {{ mod.hideoutModule.level }}
                  </span>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <span
                    class="text-xs"
                    :class="mod.foundInRaid ? 'text-warning-400' : 'text-surface-400'"
                  >
                    {{ mod.foundInRaid ? $t('needed_items.fir') : $t('needed_items.non') }}
                  </span>
                  <div class="bg-surface-700 flex items-center rounded border border-white/20">
                    <button
                      class="text-surface-200 hover:bg-surface-600 flex h-6 w-6 items-center justify-center rounded-l transition-colors hover:text-white"
                      :aria-label="
                        t('needed_items.aria.decrease_hideout_count', {
                          station_name: getStationName(mod),
                        })
                      "
                      @click="decreaseHideout(mod)"
                    >
                      <UIcon name="i-mdi-minus" class="h-3 w-3" />
                    </button>
                    <span
                      class="bg-surface-800 flex h-6 min-w-10 items-center justify-center border-x border-white/20 px-1 text-xs font-semibold"
                      :class="getHideoutCount(mod) >= mod.count ? 'text-success-400' : 'text-white'"
                    >
                      {{ getHideoutCount(mod) }}/{{ mod.count }}
                    </span>
                    <button
                      class="text-surface-200 hover:bg-surface-600 flex h-6 w-6 items-center justify-center rounded-r transition-colors hover:text-white"
                      :aria-label="
                        t('needed_items.aria.increase_hideout_count', {
                          station_name: getStationName(mod),
                        })
                      "
                      @click="increaseHideout(mod)"
                    >
                      <UIcon name="i-mdi-plus" class="h-3 w-3" />
                    </button>
                  </div>
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
  import NeededItemGroupedInputControls from '@/features/neededitems/NeededItemGroupedInputControls.vue';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { logger } from '@/utils/logger';
  import type {
    GroupedItemInfo,
    NeededItemHideoutModule,
    NeededItemTaskObjective,
  } from '@/types/tarkov';
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
  defineEmits<{
    'update:open': [value: boolean];
  }>();
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  const {
    distributeItems,
    applyDistribution,
    resetObjectives,
    sortTaskObjectives,
    sortHideoutModules,
  } = useItemDistribution();
  const taskObjectivesList = computed(() => props.taskObjectives ?? []);
  const hideoutModulesList = computed(() => props.hideoutModules ?? []);
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
  const getObjectiveCount = (obj: NeededItemTaskObjective) =>
    tarkovStore.getObjectiveCount(obj.id) ?? 0;
  const getHideoutCount = (mod: NeededItemHideoutModule) =>
    tarkovStore.getHideoutPartCount(mod.id) ?? 0;
  const totalFirNeeded = computed(() => {
    let total = 0;
    for (const obj of taskObjectivesList.value) {
      if (obj.foundInRaid) total += obj.count;
    }
    for (const mod of hideoutModulesList.value) {
      if (mod.foundInRaid) total += mod.count;
    }
    return total;
  });
  const totalNonFirNeeded = computed(() => {
    let total = 0;
    for (const obj of taskObjectivesList.value) {
      if (!obj.foundInRaid) total += obj.count;
    }
    for (const mod of hideoutModulesList.value) {
      if (!mod.foundInRaid) total += mod.count;
    }
    return total;
  });
  const currentFirTotal = computed(() => {
    let total = 0;
    for (const obj of taskObjectivesList.value) {
      if (obj.foundInRaid) total += Math.min(getObjectiveCount(obj), obj.count);
    }
    for (const mod of hideoutModulesList.value) {
      if (mod.foundInRaid) total += Math.min(getHideoutCount(mod), mod.count);
    }
    return total;
  });
  const currentNonFirTotal = computed(() => {
    let total = 0;
    for (const obj of taskObjectivesList.value) {
      if (!obj.foundInRaid) total += Math.min(getObjectiveCount(obj), obj.count);
    }
    for (const mod of hideoutModulesList.value) {
      if (!mod.foundInRaid) total += Math.min(getHideoutCount(mod), mod.count);
    }
    return total;
  });
  const firInput = ref(0);
  const nonFirInput = ref(0);
  watch(
    () => props.open,
    (isOpen) => {
      if (isOpen) {
        firInput.value = currentFirTotal.value;
        nonFirInput.value = currentNonFirTotal.value;
      }
    },
    { immediate: true }
  );
  const totalNeeded = computed(() => {
    let total = 0;
    for (const obj of taskObjectivesList.value) total += obj.count;
    for (const mod of hideoutModulesList.value) total += mod.count;
    return total;
  });
  const currentTotal = computed(() => {
    let total = 0;
    for (const obj of taskObjectivesList.value)
      total += Math.min(getObjectiveCount(obj), obj.count);
    for (const mod of hideoutModulesList.value) total += Math.min(getHideoutCount(mod), mod.count);
    return total;
  });
  const canSmartFill = computed(() => firInput.value > 0 || nonFirInput.value > 0);
  const isComplete = computed(() => currentTotal.value >= totalNeeded.value);
  const handleSmartFill = () => {
    try {
      const result = distributeItems(
        firInput.value,
        nonFirInput.value,
        taskObjectivesList.value,
        hideoutModulesList.value
      );
      applyDistribution(result);
      firInput.value = 0;
      nonFirInput.value = 0;
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
  const increaseObjective = (obj: NeededItemTaskObjective) => {
    const current = getObjectiveCount(obj);
    const newCount = Math.min(current + 1, obj.count);
    const isComplete = newCount >= obj.count;
    tarkovStore.setTaskObjectiveCountWithStatus(obj.id, newCount, isComplete);
  };
  const decreaseObjective = (obj: NeededItemTaskObjective) => {
    const current = getObjectiveCount(obj);
    if (current <= 0) return;
    const newCount = Math.max(current - 1, 0);
    const isComplete = newCount >= obj.count;
    tarkovStore.setTaskObjectiveCountWithStatus(obj.id, newCount, isComplete);
  };
  const increaseHideout = (mod: NeededItemHideoutModule) => {
    const current = getHideoutCount(mod);
    if (current >= mod.count) return;
    const newCount = current + 1;
    tarkovStore.setHideoutPartCount(mod.id, newCount);
    if (newCount >= mod.count) {
      tarkovStore.setHideoutPartComplete(mod.id);
    }
  };
  const decreaseHideout = (mod: NeededItemHideoutModule) => {
    const current = getHideoutCount(mod);
    if (current <= 0) return;
    const newCount = current - 1;
    tarkovStore.setHideoutPartCount(mod.id, newCount);
    if (current >= mod.count && newCount < mod.count) {
      tarkovStore.setHideoutPartUncomplete(mod.id);
    }
  };
</script>
