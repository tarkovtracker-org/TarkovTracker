<template>
  <UCard
    :id="`task-${task.id}`"
    class="card relative divide-none overflow-hidden shadow-md ring-0"
    :class="[taskClasses, 'rounded-md']"
    :ui="{ body: 'p-0 sm:p-0 flex flex-col h-full', footer: 'p-0 sm:p-0 border-t-0' }"
    @contextmenu.prevent="openOverflowMenu"
  >
    <TaskCardBackground
      :is-complete="isComplete"
      :is-failed="isFailed"
      :is-locked="isLocked"
      :is-invalid="isInvalid"
    />
    <div
      class="relative z-10 flex h-full flex-col"
      :class="{ 'opacity-80': isComplete && !isFailed }"
    >
      <!-- 1) Identity + Header (Padded) -->
      <div class="flex flex-col" :class="compactClasses.header">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div class="flex min-w-0 items-start justify-between gap-2">
            <TaskCardHeader :task="task" class="min-w-0" />
            <UButton
              v-if="isOurFaction"
              size="xs"
              color="neutral"
              variant="ghost"
              class="shrink-0 sm:hidden"
              :aria-label="t('page.tasks.questcard.more')"
              @click.stop="openOverflowMenu"
            >
              <UIcon name="i-mdi-dots-horizontal" aria-hidden="true" class="h-5 w-5" />
            </UButton>
          </div>
          <TaskCardBadges
            :task="task"
            :is-pinned="isPinned"
            :is-our-faction="isOurFaction"
            :meets-level-requirement="meetsLevelRequirement"
            :fence-rep-requirement="fenceRepRequirement"
            :meets-fence-rep-requirement="meetsFenceRepRequirement"
            :trader-level-reqs="traderLevelReqs"
            :location-tooltip="locationTooltip"
            :is-failed="isFailed"
            :is-invalid="isInvalid"
            :show-required-labels="preferencesStore.getShowRequiredLabels"
            :exclusive-edition-badge="exclusiveEditionBadge"
            @toggle-pin="togglePin"
            @open-menu="openOverflowMenu"
          >
            <template #actions>
              <TaskCardActions
                :state="actionButtonState"
                :size="actionButtonSize"
                :is-failed="isFailed"
                @complete="markTaskComplete"
                @uncomplete="markTaskUncomplete"
                @available="markTaskAvailable"
                @failed="markTaskFailed"
              />
            </template>
          </TaskCardBadges>
        </div>
        <!-- Extra Info Strips (padded area) -->
        <div v-if="lockedBefore > 0" class="text-surface-400 text-xs">
          <span class="text-surface-500">{{ t('page.tasks.questcard.requires') }}:</span>
          <template v-if="pendingParentTasks.length">
            <span class="ml-2 inline-flex flex-wrap items-center gap-1.5">
              <AppTooltip
                v-for="parent in displayedPendingParents"
                :key="parent.id"
                :text="parent.name"
              >
                <router-link
                  :to="`/tasks?task=${parent.id}`"
                  class="text-surface-200 inline-flex max-w-[16rem] items-center rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] hover:bg-white/10"
                >
                  <span class="truncate">{{ parent.name }}</span>
                </router-link>
              </AppTooltip>
              <span v-if="extraPendingParentsCount > 0" class="text-surface-500">
                +{{ extraPendingParentsCount }}
              </span>
            </span>
          </template>
          <template v-else>
            <span class="text-surface-300 ml-2">{{ lockedBefore }}</span>
          </template>
        </div>
        <div v-if="isFailed" class="text-error-300 text-xs">
          <span class="text-error-200/70">{{ t('page.tasks.questcard.failed_because') }}:</span>
          <template v-if="failureSources.length > 0">
            <span class="ml-2 inline-flex flex-wrap items-center gap-1.5">
              <router-link
                v-for="source in failureSources"
                :key="source.id"
                :to="`/tasks?task=${source.id}`"
                class="border-error-500/30 bg-error-500/10 text-error-200 hover:bg-error-500/20 inline-flex max-w-[16rem] items-center rounded-md border px-2 py-0.5 text-[11px]"
              >
                {{ source.name }}
              </router-link>
            </span>
          </template>
          <span v-else class="text-error-200/80 ml-2">
            {{ t('page.tasks.questcard.failed_because_unknown') }}
          </span>
        </div>
        <div v-if="showNeededBy" class="text-surface-400 text-xs">
          <span class="text-surface-500">
            <UIcon name="i-mdi-account-multiple-outline" class="mr-1 inline h-4 w-4" />
            {{
              t(
                'page.tasks.questcard.needed_by',
                { names: neededByDisplayText },
                `Needed by: ${neededByDisplayText}`
              )
            }}
          </span>
        </div>
      </div>
      <!-- 2) Body: objectives (Full Width) -->
      <div class="border-surface-700/50 border-t">
        <div
          class="hover:bg-surface-700/20 focus-visible:ring-primary-500/40 focus-visible:ring-offset-surface-900 flex cursor-pointer items-center justify-between rounded-sm transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          :class="compactClasses.objectivesToggle"
          role="button"
          tabindex="0"
          :aria-expanded="objectivesVisible"
          :aria-controls="`objectives-content-${task.id}`"
          @click="toggleObjectivesVisibility"
          @keydown.enter.prevent="toggleObjectivesVisibility"
          @keydown.space.prevent="toggleObjectivesVisibility"
        >
          <div class="text-surface-400 text-[10px] font-bold tracking-wider uppercase">
            {{ t('page.tasks.questcard.objectives') }}
          </div>
          <UButton
            icon="i-mdi-chevron-down"
            variant="ghost"
            color="neutral"
            size="xs"
            :class="{ 'rotate-180': objectivesVisible }"
            class="pointer-events-none transition-transform duration-200"
          />
        </div>
        <Transition
          enter-active-class="transition duration-150 ease-out"
          enter-from-class="opacity-0 -translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition duration-100 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-1"
        >
          <div
            v-if="objectivesVisible"
            :id="`objectives-content-${task.id}`"
            :class="[isCompact ? 'space-y-1.5' : 'space-y-3', compactClasses.objectivesBody]"
          >
            <QuestObjectivesSkeleton
              v-if="showObjectivesSkeleton"
              :objectives="relevantViewObjectives"
              :irrelevant-count="irrelevantObjectives.length"
              :uncompleted-irrelevant="uncompletedIrrelevantObjectives.length"
            />
            <QuestObjectives
              v-else
              :objectives="relevantViewObjectives"
              :irrelevant-count="irrelevantObjectives.length"
              :uncompleted-irrelevant="uncompletedIrrelevantObjectives.length"
            />
          </div>
        </Transition>
      </div>
    </div>
    <!-- 3) Rewards Summary Section (Fixed to bottom, Full Width) -->
    <template #footer>
      <TaskCardRewards
        :is-compact="isCompact"
        :task-id="task.id"
        :trader-standing-rewards="traderStandingRewards"
        :skill-rewards="skillRewards"
        :trader-unlock-reward="traderUnlockReward"
        :item-rewards="itemRewards"
        :offer-unlock-rewards="offerUnlockRewards"
        :parent-tasks="parentTasks"
        :child-tasks="childTasks"
        :experience="task.experience"
        :unlocks-next-count="unlocksNextCount"
        :impact-count="impactCount"
        @item-context-menu="openItemContextMenu"
      />
    </template>
    <!-- Overflow / Context Menu -->
    <ContextMenu ref="taskContextMenu">
      <template #default="{ close }">
        <ContextMenuItem
          icon="i-mdi-link-variant"
          :label="t('page.tasks.questcard.copy_task_link')"
          @click="
            copyTaskLink();
            close();
          "
        />
        <ContextMenuItem
          icon="i-mdi-alert-circle-outline"
          :label="t('page.tasks.questcard.report_data_issue')"
          @click="
            openTaskDataIssue();
            close();
          "
        />
        <ContextMenuItem
          v-if="preferencesStore.getEnableManualTaskFail && isOurFaction && !isFailed"
          icon="i-mdi-close-circle"
          :label="t('page.tasks.questcard.mark_failed')"
          @click="
            confirmMarkFailed();
            close();
          "
        />
      </template>
    </ContextMenu>
    <!-- Item Context Menu -->
    <ContextMenu ref="itemContextMenu">
      <template #default="{ close }">
        <ContextMenuItem
          icon="/img/logos/tarkovdevlogo.webp"
          :label="t('page.tasks.questcard.view_on_tarkov_dev')"
          @click="
            openItemOnTarkovDev();
            close();
          "
        />
        <ContextMenuItem
          icon="/img/logos/wikilogo.webp"
          :label="t('page.tasks.questcard.view_on_wiki')"
          @click="
            openItemOnWiki();
            close();
          "
        />
      </template>
    </ContextMenu>
  </UCard>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import ContextMenu from '@/components/ui/ContextMenu.vue';
  import ContextMenuItem from '@/components/ui/ContextMenuItem.vue';
  import { useSharedBreakpoints } from '@/composables/useSharedBreakpoints';
  import { useTaskActions, type TaskActionPayload } from '@/composables/useTaskActions';
  import { useTaskCardLinks } from '@/composables/useTaskCardLinks';
  import { useTaskFiltering } from '@/composables/useTaskFiltering';
  import { isTaskSuccessful, useTaskState } from '@/composables/useTaskState';
  import QuestObjectivesSkeleton from '@/features/tasks/QuestObjectivesSkeleton.vue';
  import { isTaskRequirementSatisfied } from '@/features/tasks/task-requirement-helpers';
  import TaskCardActions from '@/features/tasks/TaskCardActions.vue';
  import TaskCardBackground from '@/features/tasks/TaskCardBackground.vue';
  import TaskCardBadges from '@/features/tasks/TaskCardBadges.vue';
  import TaskCardHeader from '@/features/tasks/TaskCardHeader.vue';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useProgressStore } from '@/stores/useProgress';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { HOT_WHEELS_TASK_ID } from '@/utils/constants';
  import { getExclusiveEditionsForTask } from '@/utils/editionHelpers';
  import { countIncompleteSuccessors, resolveImpactTeamIds } from '@/utils/taskImpact';
  import { buildTaskTypeFilterOptions, filterTasksByTypeSettings } from '@/utils/taskTypeFilters';
  import type { ActionButtonState } from '@/features/tasks/types';
  import type { GameEdition, Task, TaskObjective } from '@/types/tarkov';
  type ContextMenuRef = { open: (event: MouseEvent) => void };
  // Module-level constants (moved from reactive scope)
  const MAX_DISPLAYED_NAMES = 3;
  const MAP_OBJECTIVE_TYPES = new Set([
    'mark',
    'zone',
    'extract',
    'visit',
    'findItem',
    'findQuestItem',
    'plantItem',
    'plantQuestItem',
    'shoot',
  ]);
  const EDITION_SHORT_NAMES: Record<string, string> = {
    'Edge of Darkness': 'EOD',
    'Unheard Edition': 'Unheard',
    Standard: 'Standard',
    'Left Behind': 'Left Behind',
    'Prepare for Escape': 'PFE',
  };
  const QuestObjectives = defineAsyncComponent({
    loader: () => import('@/features/tasks/QuestObjectives.vue'),
    loadingComponent: QuestObjectivesSkeleton,
    delay: 150, // Prevents skeleton flash on fast loads
  });
  const TaskCardRewards = defineAsyncComponent(
    () => import('@/features/tasks/TaskCardRewards.vue')
  );
  const props = defineProps<{
    task: Task;
  }>();
  const emit = defineEmits<{
    'on-task-action': [payload: TaskActionPayload];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const { xs } = useSharedBreakpoints();
  const tarkovStore = useTarkovStore();
  const preferencesStore = usePreferencesStore();
  const progressStore = useProgressStore();
  const metadataStore = useMetadataStore();
  const injectedImpactEligibleTaskIds = inject<{ value: Set<string> | undefined } | undefined>(
    'impactEligibleTaskIds',
    undefined
  );
  const { isGlobalTask: isGlobalTaskFn } = useTaskFiltering();
  const isGlobalTask = computed(() => isGlobalTaskFn(props.task));
  const taskContextMenu = ref<ContextMenuRef | null>(null);
  const itemContextMenu = ref<ContextMenuRef | null>(null);
  const {
    copyTaskLink,
    openTaskWiki,
    openTaskOnTarkovDev,
    openTaskDataIssue,
    setSelectedItem,
    openItemOnTarkovDev,
    openItemOnWiki,
  } = useTaskCardLinks({
    task: () => props.task,
    objectives: () => taskObjectives.value,
  });
  const { isComplete, isFailed, isLocked, isInvalid } = useTaskState(() => props.task.id);
  const objectivesExpanded = ref(true);
  const objectivesVisible = computed(() => {
    return (
      objectivesExpanded.value &&
      !(isComplete.value && preferencesStore.getHideCompletedTaskObjectives)
    );
  });
  const toggleObjectivesVisibility = () => {
    objectivesExpanded.value = !objectivesExpanded.value;
  };
  // Use extracted task actions composable
  const { markTaskComplete, markTaskUncomplete, markTaskAvailable, markTaskFailed } =
    useTaskActions(
      () => props.task,
      (payload) => emit('on-task-action', payload)
    );
  // Helper for status array checks
  const hasStatus = (status: string[] | undefined, statuses: string[]) => {
    const normalized = (status ?? []).map((entry) => entry.toLowerCase());
    return statuses.some((value) => normalized.includes(value));
  };
  const isOurFaction = computed(() => {
    const taskFaction = props.task.factionName;
    return taskFaction === 'Any' || taskFaction === tarkovStore.getPMCFaction();
  });
  const meetsLevelRequirement = computed(() => {
    const minLevel = props.task.minPlayerLevel ?? 0;
    return minLevel <= 0 || tarkovStore.playerLevel() >= minLevel;
  });
  const fenceTrader = computed(() =>
    metadataStore.traders.find((t) => t.normalizedName === 'fence')
  );
  const fenceRepRequirement = computed(() => {
    if (!props.task.traderRequirements?.length || !fenceTrader.value) return null;
    const fenceReq = props.task.traderRequirements.find(
      (req) => req.trader.id === fenceTrader.value!.id
    );
    return fenceReq ?? null;
  });
  const meetsFenceRepRequirement = computed(() => {
    if (!fenceRepRequirement.value || !fenceTrader.value) return true;
    const userRep = tarkovStore.getTraderReputation(fenceTrader.value.id);
    const reqValue = fenceRepRequirement.value.value;
    if (reqValue >= 0) {
      return userRep >= reqValue;
    } else {
      return userRep <= reqValue;
    }
  });
  const traderLevelReqs = computed(() => {
    if (!props.task.traderLevelRequirements?.length) return [];
    return props.task.traderLevelRequirements.map((req) => {
      const userLevel = tarkovStore.getTraderLevel(req.trader.id);
      return {
        ...req,
        met: userLevel >= req.level,
      };
    });
  });
  const locationTooltip = computed(() => {
    if (isGlobalTask.value) {
      return t('page.tasks.questcard.global_task_tooltip');
    }
    const mapName = props.task?.map?.name;
    if (mapName) {
      return t('page.tasks.questcard.location_tooltip', { map: mapName });
    }
    return t('page.tasks.questcard.any_location_tooltip');
  });
  const exclusiveEditions = computed<GameEdition[]>(() =>
    getExclusiveEditionsForTask(props.task.id, metadataStore.editions)
  );
  // Get the minimum required edition (lowest value = base requirement)
  const minExclusiveEdition = computed(() => {
    if (!exclusiveEditions.value.length) return null;
    return exclusiveEditions.value.reduce((min, e) => (e.value < min.value ? e : min));
  });
  const exclusiveEditionBadge = computed(() => {
    if (!minExclusiveEdition.value) return '';
    return EDITION_SHORT_NAMES[minExclusiveEdition.value.title] || minExclusiveEdition.value.title;
  });
  const taskClasses = computed(() => {
    if (isComplete.value && !isFailed.value) return 'border-completed-600/25 bg-surface-900';
    if (isFailed.value) return 'border-error-600/50 bg-error-950';
    if (isInvalid.value) return 'border-surface-700/40 bg-surface-900 opacity-60';
    if (isLocked.value) return 'border-surface-700/40 bg-surface-900';
    return 'border-surface-700/40 bg-surface-900';
  });
  const isCompact = computed(() => preferencesStore.getTaskCardDensity === 'compact');
  const compactClasses = computed(() => ({
    header: isCompact.value ? 'gap-2 px-3 py-2' : 'gap-3 px-4 py-3',
    objectivesToggle: isCompact.value ? 'px-3 py-1.5' : 'px-4 py-3',
    objectivesBody: isCompact.value ? 'px-3 pt-1 pb-2' : 'px-4 py-4',
  }));
  const neededBy = computed(() => props.task.neededBy ?? []);
  const showNeededBy = computed(
    () => preferencesStore.getTaskUserView === 'all' && neededBy.value.length > 0
  );
  const displayedNeededByNames = computed(() => neededBy.value.slice(0, MAX_DISPLAYED_NAMES));
  const extraNeededByCount = computed(() =>
    Math.max(0, neededBy.value.length - MAX_DISPLAYED_NAMES)
  );
  const neededByDisplayText = computed(() => {
    const names = displayedNeededByNames.value.join(', ');
    return extraNeededByCount.value > 0 ? `${names} +${extraNeededByCount.value} more` : names;
  });
  const impactEligibleTaskIds = computed<Set<string> | undefined>(() => {
    if (injectedImpactEligibleTaskIds) return injectedImpactEligibleTaskIds.value;
    if (!preferencesStore.getRespectTaskFiltersForImpact) return undefined;
    const options = buildTaskTypeFilterOptions(preferencesStore, tarkovStore, metadataStore);
    return new Set(filterTasksByTypeSettings(metadataStore.tasks, options).map((task) => task.id));
  });
  const lockedBehind = computed(() => {
    const successors = props.task.successors ?? [];
    const teamIds = resolveImpactTeamIds(
      preferencesStore.getTaskUserView,
      progressStore.visibleTeamStores
    );
    return countIncompleteSuccessors(
      successors,
      teamIds,
      {
        tasksCompletions: progressStore.tasksCompletions,
        tasksFailed: progressStore.tasksFailed,
      },
      impactEligibleTaskIds.value
    );
  });
  const taskCompletions = computed(
    () => tarkovStore.getCurrentProgressData().taskCompletions ?? {}
  );
  const requirementStatusesByTaskId = computed(() => {
    const map = new Map<string, Array<string[] | undefined>>();
    (props.task.taskRequirements ?? []).forEach((requirement) => {
      const requiredTaskId = requirement?.task?.id;
      if (!requiredTaskId) return;
      if (!map.has(requiredTaskId)) {
        map.set(requiredTaskId, []);
      }
      map.get(requiredTaskId)!.push(requirement.status);
    });
    return map;
  });
  const parentTasks = computed(() => {
    if (!props.task.parents?.length) return [];
    return props.task.parents
      .map((id) => metadataStore.getTaskById(id))
      .filter((task): task is Task => task !== undefined);
  });
  const failureSources = computed(() => {
    if (!isFailed.value) return [];
    const sources = new Map<string, { id: string; name: string }>();
    (props.task.failConditions ?? [])
      .filter(
        (objective) => objective?.task?.id && hasStatus(objective.status, ['complete', 'completed'])
      )
      .filter((objective) => isTaskSuccessful(objective.task!.id))
      .forEach((objective) => {
        const id = objective.task!.id;
        sources.set(id, { id, name: objective.task!.name ?? id });
      });
    const alternativeSourceIds = metadataStore.alternativeTaskSources[props.task.id] ?? [];
    alternativeSourceIds.forEach((taskId) => {
      if (!isTaskSuccessful(taskId)) return;
      const task = metadataStore.getTaskById(taskId);
      if (!task?.name) return;
      sources.set(taskId, { id: taskId, name: task.name });
    });
    return Array.from(sources.values());
  });
  const pendingParentTasks = computed(() => {
    return parentTasks.value.filter((parent) => {
      const requirementStatuses = requirementStatusesByTaskId.value.get(parent.id);
      if (!requirementStatuses?.length) {
        return !isTaskSuccessful(parent.id);
      }
      const completion = taskCompletions.value[parent.id];
      const isUnlockable = progressStore.unlockedTasks[parent.id]?.self === true;
      return requirementStatuses.some(
        (statuses) => !isTaskRequirementSatisfied(statuses, completion, isUnlockable)
      );
    });
  });
  const lockedBefore = computed(() => pendingParentTasks.value.length);
  const displayedPendingParents = computed(() => pendingParentTasks.value.slice(0, 2));
  const extraPendingParentsCount = computed(() => {
    return Math.max(0, pendingParentTasks.value.length - displayedPendingParents.value.length);
  });
  const childTasks = computed(() => {
    if (!props.task.children?.length) return [];
    return props.task.children
      .map((id) => metadataStore.getTaskById(id))
      .filter((task): task is Task => task !== undefined);
  });
  const unlocksNextCount = computed(() => childTasks.value.length);
  const impactCount = computed(() => lockedBehind.value);
  const traderStandingRewards = computed(() => props.task.finishRewards?.traderStanding ?? []);
  const skillRewards = computed(() => props.task.finishRewards?.skillLevelReward ?? []);
  const traderUnlockReward = computed(() => props.task.finishRewards?.traderUnlock);
  const itemRewards = computed(() => props.task.finishRewards?.items ?? []);
  const offerUnlockRewards = computed(() => props.task.finishRewards?.offerUnlock ?? []);
  const actionButtonSize = computed(() => (xs.value ? 'xs' : 'sm'));
  const isHotWheelsTask = computed(() => props.task.id === HOT_WHEELS_TASK_ID);
  const showHotWheelsFail = computed(
    () => isHotWheelsTask.value && !isComplete.value && !isLocked.value
  );
  const isPinned = computed(() => preferencesStore.getPinnedTaskIds.includes(props.task.id));
  const togglePin = () => preferencesStore.togglePinnedTask(props.task.id);
  /**
   * Action button state for cleaner template logic.
   * Returns which action button(s) should be shown.
   */
  const actionButtonState = computed((): ActionButtonState => {
    if (!isOurFaction.value) return 'none';
    if (isLocked.value) return 'locked';
    if (isComplete.value) return 'complete';
    if (showHotWheelsFail.value) return 'hotwheels';
    return 'available';
  });
  const onMapView = computed(() => preferencesStore.getTaskPrimaryView === 'maps');
  // Get objectives from props or fall back to store when props are stale
  // This handles the case where visibleTasks holds old task objects after objectives merge
  const taskObjectives = computed(() => {
    if ((props.task.objectives?.length ?? 0) > 0) {
      return props.task.objectives!;
    }
    // Props empty - check store for latest data
    const storeTask = metadataStore.getTaskById(props.task.id);
    return storeTask?.objectives ?? [];
  });
  /**
   * Consolidated objective categorization - single pass through objectives array.
   * Categorizes objectives into relevant, irrelevant, and uncompleted irrelevant.
   */
  const categorizedObjectives = computed(() => {
    const objectives = taskObjectives.value;
    const selectedMapId = preferencesStore.getTaskMapView;
    const isMapView = onMapView.value;
    // If not in map view, all objectives are relevant
    if (!isMapView) {
      return {
        relevant: objectives,
        irrelevant: [] as TaskObjective[],
        uncompletedIrrelevant: [] as TaskObjective[],
      };
    }
    const relevant: TaskObjective[] = [];
    const irrelevant: TaskObjective[] = [];
    const uncompletedIrrelevant: TaskObjective[] = [];
    for (const objective of objectives) {
      const hasMaps = Array.isArray(objective.maps) && objective.maps.length > 0;
      const onSelectedMap = hasMaps && objective.maps!.some((map) => map.id === selectedMapId);
      const isMapType = MAP_OBJECTIVE_TYPES.has(objective.type ?? '');
      // Objective is relevant if it has no maps, or is on selected map AND is a map type
      const isRelevant = !hasMaps || (onSelectedMap && isMapType);
      if (isRelevant) {
        relevant.push(objective);
      } else {
        irrelevant.push(objective);
        // Check if this irrelevant objective is also uncompleted
        if (!tarkovStore.isTaskObjectiveComplete(objective.id)) {
          uncompletedIrrelevant.push(objective);
        }
      }
    }
    return { relevant, irrelevant, uncompletedIrrelevant };
  });
  // Derived values from consolidated categorization
  const relevantViewObjectives = computed(() => categorizedObjectives.value.relevant);
  const irrelevantObjectives = computed(() => categorizedObjectives.value.irrelevant);
  const uncompletedIrrelevantObjectives = computed(
    () => categorizedObjectives.value.uncompletedIrrelevant
  );
  const showObjectivesSkeleton = computed(() => {
    // If we have objectives (from props or store fallback), no skeleton needed
    if (taskObjectives.value.length > 0) return false;
    // No objectives yet - show skeleton while loading or not yet hydrated
    return metadataStore.tasksObjectivesPending || !metadataStore.tasksObjectivesHydrated;
  });
  const openOverflowMenu = (event: MouseEvent) => {
    taskContextMenu.value?.open(event);
  };
  const openItemContextMenu = (
    event: MouseEvent,
    item: { id: string; wikiLink?: string } | undefined
  ) => {
    if (!item) return;
    setSelectedItem(item);
    itemContextMenu.value?.open(event);
  };
  const confirmMarkFailed = () => {
    const confirmed = window.confirm(
      t(
        'page.tasks.questcard.mark_failed_confirm',
        "Mark this task as failed? This is only for data issues, isn't recommended, and may block questlines."
      )
    );
    if (!confirmed) return;
    markTaskFailed();
  };
</script>
