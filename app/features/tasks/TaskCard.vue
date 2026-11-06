<template>
  <UCard
    :id="`task-${task.id}`"
    :data-task-id="task.id"
    class="card relative divide-none overflow-hidden shadow-md ring-0"
    :class="[taskClasses, accentClasses, 'rounded-md']"
    :ui="{ body: 'p-0 sm:p-0 flex flex-col h-full', footer: 'p-0 sm:p-0 border-t-0' }"
    @contextmenu.prevent="openTaskContextMenu"
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
      <div data-testid="task-card-header" class="flex flex-col" :class="compactClasses.header">
        <div class="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
          <TaskCardHeader :task="task" class="min-w-0 sm:flex-1" />
          <div class="flex items-center justify-between gap-2 sm:ml-auto sm:justify-end">
            <TaskCardBadges
              :task="task"
              :is-pinned="isPinned"
              :is-hidden="isHidden"
              :location-tooltip="locationTooltip"
              :is-failed="isFailed"
              :is-invalid="isInvalid"
              :show-required-labels="preferencesStore.getShowRequiredLabels"
              :exclusive-edition-badge="exclusiveEditionBadge"
              :progress-completed="taskProgressCompleted"
              :progress-total="taskProgressTotal"
              :show-progress="!taskExpanded"
              @toggle-pin="togglePin"
              @toggle-hide="toggleHidden"
              @copy-link="copyTaskLink"
            >
              <template #actions>
                <TaskCardActions
                  :state="actionButtonState"
                  :size="actionButtonSize"
                  :is-failed="isFailed"
                  :show-fail="canMarkFailed"
                  @complete="markTaskComplete"
                  @uncomplete="markTaskUncomplete"
                  @available="markTaskAvailable"
                  @failed="markTaskFailed"
                  @mark-failed="confirmMarkFailed"
                />
              </template>
            </TaskCardBadges>
            <button
              type="button"
              class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-900 flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              :aria-label="
                taskExpanded
                  ? t('page.tasks.questcard.collapse_task', 'Collapse task')
                  : t('page.tasks.questcard.expand_task', 'Expand task')
              "
              :aria-expanded="taskExpanded"
              :aria-controls="`task-content-${task.id}`"
              @click="toggleTaskVisibility"
            >
              <UIcon
                name="i-mdi-chevron-down"
                aria-hidden="true"
                class="pointer-events-none h-4 w-4 transition-transform duration-200"
                :class="{ 'rotate-180': taskExpanded }"
              />
            </button>
          </div>
        </div>
        <!-- Extra Info Strips (padded area) -->
        <TaskRequirementChips
          v-if="isLocked"
          :rows="blockingRequirements"
          @show-pool="showRequirementPool"
        />
        <div
          v-if="isFailed || isInvalid"
          class="text-xs"
          :class="isFailed ? 'text-error-300' : 'text-surface-300'"
        >
          <span :class="isFailed ? 'text-error-200/70' : 'text-surface-500'">
            {{
              isFailed
                ? t('page.tasks.questcard.failed_because')
                : t('page.tasks.questcard.blocked_because', 'Blocked because')
            }}:
          </span>
          <template v-if="statusSources.length > 0">
            <span class="ml-2 inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              <AppTooltip
                v-for="source in statusSources"
                :key="source.id"
                :text="getStatusSourceTooltipText(source)"
              >
                <span class="inline-flex items-center gap-1.5">
                  <router-link
                    :to="`/tasks?task=${source.id}`"
                    :class="
                      isFailed
                        ? 'text-error-200 decoration-error-400/40 hover:decoration-error-400/70'
                        : 'text-surface-200 decoration-white/30 hover:decoration-white/60'
                    "
                    class="text-[11px] underline underline-offset-2"
                  >
                    {{ source.name }}
                  </router-link>
                  <span
                    :class="isFailed ? 'text-error-300' : 'text-surface-400'"
                    class="text-[11px]"
                  >
                    {{
                      isFailed
                        ? t(
                            'common.was_status',
                            {
                              status: formatExpectedStatuses(t, source.triggerStatuses),
                            },
                            `was ${formatExpectedStatuses(t, source.triggerStatuses)}`
                          )
                        : t(
                            'common.was_status',
                            {
                              status: formatExpectedStatuses(t, source.triggerStatuses),
                            },
                            `was ${formatExpectedStatuses(t, source.triggerStatuses)}`
                          )
                    }}
                  </span>
                </span>
              </AppTooltip>
            </span>
          </template>
          <span v-else class="ml-2" :class="isFailed ? 'text-error-200/80' : 'text-surface-400'">
            {{
              isFailed
                ? t('page.tasks.questcard.failed_because_unknown')
                : t('page.tasks.questcard.blocked_because_unknown', 'Blocked by prerequisites')
            }}
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
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div
          v-if="taskExpanded"
          :id="`task-content-${task.id}`"
          class="border-surface-700/50 border-t"
        >
          <TaskRequirementSummary
            :id="task.id"
            :rows="requirementSummary"
            :requested-pool="requestedPool"
          >
            <template #actions>
              <AppTooltip
                v-if="hasAvailabilityConfirmation"
                :text="t('page.tasks.questcard.clear_availability_confirmation')"
              >
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-mdi-lock-reset"
                  data-testid="task-clear-availability"
                  :aria-label="t('page.tasks.questcard.clear_availability_confirmation')"
                  @click.stop="tarkovStore.clearTaskAvailability(task.id)"
                />
              </AppTooltip>
            </template>
          </TaskRequirementSummary>
          <TaskCardSectionHeader
            :label="t('common.objectives', 'Objectives')"
            :meta="objectivesMeta"
            :expanded="objectivesVisible"
            :controls="`objectives-content-${task.id}`"
            test-id="task-objectives-header"
            @toggle="toggleObjectivesVisibility"
          >
            <template #actions>
              <AppTooltip
                v-if="taskItemObjectives.length > 0"
                :text="resetItemCountsDisabledReason || resetItemCountsLabel"
              >
                <span class="inline-flex">
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-mdi-restore"
                    data-testid="task-reset-item-counts"
                    :disabled="!canResetTaskItemCounts"
                    :aria-label="resetItemCountsLabel"
                    @click.stop="confirmResetTaskItemCounts"
                  />
                </span>
              </AppTooltip>
            </template>
          </TaskCardSectionHeader>
          <Transition
            :css="false"
            @before-enter="onObjectivesBeforeEnter"
            @enter="onObjectivesEnter"
            @after-enter="onObjectivesAfterEnter"
            @before-leave="onObjectivesBeforeLeave"
            @leave="onObjectivesLeave"
          >
            <div
              v-if="objectivesVisible"
              :id="`objectives-content-${task.id}`"
              :class="compactClasses.objectivesBody"
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
      </Transition>
    </div>
    <!-- 3) Rewards Summary Section (Fixed to bottom, Full Width) -->
    <template #footer>
      <TaskCardRewards
        v-if="taskExpanded && !rewardsHidden"
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
    <!-- Context Menu -->
    <ContextMenu ref="taskContextMenu">
      <template #default="{ close }">
        <ContextMenuItem
          data-testid="task-hide-toggle"
          :icon="isHidden ? 'i-mdi-eye-outline' : 'i-mdi-eye-off-outline'"
          :label="
            isHidden ? t('page.tasks.questcard.unhide_task') : t('page.tasks.questcard.hide_task')
          "
          @click="
            toggleHidden();
            close();
          "
        />
        <ContextMenuItem
          icon="i-mdi-link-variant"
          :label="t('page.tasks.questcard.copy_task_link')"
          @click="
            copyTaskLink();
            close();
          "
        />
        <ContextMenuItem
          v-if="hasAvailabilityConfirmation"
          icon="i-mdi-lock-reset"
          :label="t('page.tasks.questcard.clear_availability_confirmation')"
          @click="
            tarkovStore.clearTaskAvailability(task.id);
            close();
          "
        />
        <ContextMenuItem
          v-if="canMarkFailed"
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
          :label="t('common.view_on_tarkov_dev', 'View on Tarkov.dev')"
          @click="
            openItemOnTarkovDev();
            close();
          "
        />
        <ContextMenuItem
          icon="/img/logos/wikilogo.webp"
          :label="t('common.view_on_wiki', 'View on Wiki')"
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
  import { isFailedOnlyRequirement } from '@tarkovtracker/progress-contracts/requirementStatus';
  import ContextMenu from '@/components/ui/ContextMenu.vue';
  import ContextMenuItem from '@/components/ui/ContextMenuItem.vue';
  import { useSharedBreakpoints } from '@/composables/useSharedBreakpoints';
  import { useTaskActions, type TaskActionPayload } from '@/composables/useTaskActions';
  import { useTaskCardLinks } from '@/composables/useTaskCardLinks';
  import { useTaskFiltering } from '@/composables/useTaskFiltering';
  import { isTaskSuccessful, useTaskState } from '@/composables/useTaskState';
  import { useTaskCardExpansion } from '@/features/tasks/composables/useTaskCardExpansion';
  import { useTaskHiding } from '@/features/tasks/composables/useTaskHiding';
  import { useTaskRequirements } from '@/features/tasks/composables/useTaskRequirements';
  import QuestObjectives from '@/features/tasks/QuestObjectives.vue';
  import QuestObjectivesSkeleton from '@/features/tasks/QuestObjectivesSkeleton.vue';
  import { formatExpectedStatuses } from '@/features/tasks/requirement-format';
  import { impactEligibleTaskIdsKey } from '@/features/tasks/task-context';
  import {
    getRequiredTaskStatuses,
    type RequirementExpectedStatus,
  } from '@/features/tasks/task-requirement-helpers';
  import TaskCardActions from '@/features/tasks/TaskCardActions.vue';
  import TaskCardBackground from '@/features/tasks/TaskCardBackground.vue';
  import TaskCardBadges from '@/features/tasks/TaskCardBadges.vue';
  import TaskCardHeader from '@/features/tasks/TaskCardHeader.vue';
  import {
    categorizeObjectivesForMapView,
    resolveSelectedMapIds,
    resolveTaskObjectives,
  } from '@/features/tasks/taskCardHelpers';
  import TaskCardRewards from '@/features/tasks/TaskCardRewards.vue';
  import TaskCardSectionHeader from '@/features/tasks/TaskCardSectionHeader.vue';
  import TaskRequirementChips from '@/features/tasks/TaskRequirementChips.vue';
  import TaskRequirementSummary from '@/features/tasks/TaskRequirementSummary.vue';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useProgressStore } from '@/stores/useProgress';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { HOT_WHEELS_TASK_ID } from '@/utils/constants';
  import { getExclusiveEditionsForTask } from '@/utils/editionHelpers';
  import { getQueryString } from '@/utils/routeHelpers';
  import { isAvailabilityConfirmed } from '@/utils/taskAvailabilityConfirmation';
  import { countIncompleteSuccessors, resolveImpactTeamIds } from '@/utils/taskImpact';
  import { otherRequirementsSignature } from '@/utils/taskOtherRequirements';
  import { buildTaskTypeFilterOptions, filterTasksByTypeSettings } from '@/utils/taskTypeFilters';
  import type { ActionButtonState } from '@/features/tasks/types';
  import type { GameEdition, Task } from '@/types/tarkov';
  type ContextMenuRef = { open: (event: MouseEvent) => void };
  type FailureSource = {
    id: string;
    name: string;
    triggerStatuses: RequirementExpectedStatus[];
  };
  // Module-level constants (moved from reactive scope)
  const MAX_DISPLAYED_NAMES = 3;
  const EDITION_SHORT_NAMES: Record<string, string> = {
    'Edge of Darkness': 'EOD',
    'Unheard Edition': 'Unheard',
    Standard: 'Standard',
    'Left Behind': 'Left Behind',
    'Prepare for Escape': 'PFE',
  };
  type TaskCardAccentVariant = 'default' | 'global';
  const props = withDefaults(
    defineProps<{
      task: Task;
      accentVariant?: TaskCardAccentVariant;
    }>(),
    {
      accentVariant: 'default',
    }
  );
  const emit = defineEmits<{
    'on-task-action': [payload: TaskActionPayload];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const { xs } = useSharedBreakpoints();
  const tarkovStore = useTarkovStore();
  const preferencesStore = usePreferencesStore();
  const progressStore = useProgressStore();
  const metadataStore = useMetadataStore();
  const injectedImpactEligibleTaskIds = inject(impactEligibleTaskIdsKey, undefined);
  const { isGlobalTask: isGlobalTaskFn } = useTaskFiltering();
  const isGlobalTask = computed(() => isGlobalTaskFn(props.task));
  const taskContextMenu = ref<ContextMenuRef | null>(null);
  const itemContextMenu = ref<ContextMenuRef | null>(null);
  const { copyTaskLink, setSelectedItem, openItemOnTarkovDev, openItemOnWiki } = useTaskCardLinks({
    task: () => props.task,
  });
  const { isComplete, isFailed, isLocked, isInvalid } = useTaskState(() => props.task.id);
  const objectivesExpanded = ref(true);
  const requestedPool = shallowRef<{ id: string }>();
  const showRequirementPool = (id: string) => {
    if (!taskExpanded.value) toggleTaskVisibility();
    const request = { id };
    requestedPool.value = request;
    nextTick(() => {
      if (requestedPool.value === request) requestedPool.value = undefined;
    });
  };
  const shouldAutoCollapseObjectives = computed(() => {
    return isComplete.value && preferencesStore.getHideCompletedTaskObjectives;
  });
  watch(
    shouldAutoCollapseObjectives,
    (shouldAutoCollapse) => {
      objectivesExpanded.value = !shouldAutoCollapse;
    },
    { immediate: true }
  );
  const objectivesVisible = computed(() => {
    return objectivesExpanded.value;
  });
  const toggleObjectivesVisibility = () => {
    objectivesExpanded.value = !objectivesExpanded.value;
  };
  const route = useRoute();
  const OBJECTIVES_ENTER_MS = 150;
  const OBJECTIVES_LEAVE_MS = 120;
  const onObjectivesBeforeEnter = (el: Element) => {
    const htmlEl = el as HTMLElement;
    htmlEl.style.maxHeight = '0';
    htmlEl.style.overflow = 'hidden';
    htmlEl.style.opacity = '0';
  };
  const onObjectivesEnter = (el: Element, done: () => void) => {
    const htmlEl = el as HTMLElement;
    const height = htmlEl.scrollHeight;
    htmlEl.style.transition = `max-height ${OBJECTIVES_ENTER_MS}ms ease-out, opacity ${OBJECTIVES_ENTER_MS}ms ease-out`;
    requestAnimationFrame(() => {
      htmlEl.style.maxHeight = `${height}px`;
      htmlEl.style.opacity = '1';
    });
    setTimeout(done, OBJECTIVES_ENTER_MS + 10);
  };
  const onObjectivesAfterEnter = (el: Element) => {
    const htmlEl = el as HTMLElement;
    htmlEl.style.maxHeight = '';
    htmlEl.style.overflow = '';
    htmlEl.style.transition = '';
  };
  const onObjectivesBeforeLeave = (el: Element) => {
    const htmlEl = el as HTMLElement;
    htmlEl.style.maxHeight = `${htmlEl.scrollHeight}px`;
    htmlEl.style.overflow = 'hidden';
  };
  const onObjectivesLeave = (el: Element, done: () => void) => {
    const htmlEl = el as HTMLElement;
    htmlEl.style.transition = `max-height ${OBJECTIVES_LEAVE_MS}ms ease-in, opacity ${OBJECTIVES_LEAVE_MS}ms ease-in`;
    requestAnimationFrame(() => {
      htmlEl.style.maxHeight = '0';
      htmlEl.style.opacity = '0';
    });
    setTimeout(done, OBJECTIVES_LEAVE_MS + 10);
  };
  // Use extracted task actions composable
  const {
    markTaskComplete,
    markTaskUncomplete,
    markTaskAvailable,
    markTaskFailed,
    canMarkTaskAvailable,
  } = useTaskActions(
    () => props.task,
    (payload) => emit('on-task-action', payload)
  );
  // Helper for status array checks
  const hasStatus = (status: string[] | undefined, statuses: string[]) => {
    const normalized = (status ?? []).map((entry) => entry.toLowerCase());
    return statuses.some((value) => normalized.includes(value));
  };
  const getStatusSourceTooltipText = (source: FailureSource): string => {
    const status = formatExpectedStatuses(t, source.triggerStatuses);
    if (isFailed.value) {
      return t(
        'page.tasks.questcard.failed_because_status_tooltip',
        { name: source.name, status },
        `Auto-failed when "${source.name}" was ${status}`
      );
    }
    return t(
      'page.tasks.questcard.blocked_because_status_tooltip',
      { name: source.name, status },
      `Permanently blocked — "${source.name}" was ${status}`
    );
  };
  const isOurFaction = computed(() => {
    const taskFaction = props.task.factionName;
    return taskFaction === 'Any' || taskFaction === tarkovStore.getPMCFaction();
  });
  const { blocking: blockingRequirements, summary: requirementSummary } = useTaskRequirements(
    () => props.task
  );
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
    // Light mode keeps the failure tint but on a pale surface: the shared ink tokens
    // flip to dark, so a dark error fill would leave the card text at ~1.5:1.
    if (isFailed.value)
      return 'border-error-600/50 bg-error-950 light:border-error-700 light:bg-error-100';
    if (isInvalid.value) return 'border-surface-700/40 bg-surface-900 opacity-60';
    if (isLocked.value) return 'border-surface-700/40 bg-surface-900';
    return 'border-surface-700/40 bg-surface-900';
  });
  const accentClasses = computed(() => {
    if (props.accentVariant === 'global') {
      const border = 'border-l-4 border-l-info-400';
      if (isComplete.value || isFailed.value || isInvalid.value || isLocked.value) {
        return border;
      }
      return `${border} bg-info-500/5`;
    }
    return '';
  });
  const compactClasses = computed(() => ({
    header: 'gap-1.5 px-3 py-2',
    objectivesBody: 'px-3 pb-1.5',
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
  const parentTasks = computed(() => {
    if (!props.task.parents?.length) return [];
    return props.task.parents
      .map((id) => metadataStore.getTaskById(id))
      .filter((task): task is Task => task !== undefined);
  });
  const failureSources = computed<FailureSource[]>(() => {
    if (!isFailed.value) return [];
    const sources = new Map<string, FailureSource>();
    (props.task.failConditions ?? [])
      .filter(
        (objective) => objective?.task?.id && hasStatus(objective.status, ['complete', 'completed'])
      )
      .filter((objective) => isTaskSuccessful(objective.task!.id))
      .forEach((objective) => {
        const id = objective.task!.id;
        const triggerStatuses = getRequiredTaskStatuses(objective.status).filter(
          (status): status is RequirementExpectedStatus => status !== 'active'
        );
        const existing = sources.get(id);
        if (existing) {
          const mergedStatuses: RequirementExpectedStatus[] = [
            ...existing.triggerStatuses,
            ...(triggerStatuses.length
              ? triggerStatuses
              : (['completed'] as RequirementExpectedStatus[])),
          ];
          existing.triggerStatuses = Array.from(new Set<RequirementExpectedStatus>(mergedStatuses));
          return;
        }
        sources.set(id, {
          id,
          name: objective.task!.name ?? id,
          triggerStatuses: triggerStatuses.length ? triggerStatuses : ['completed'],
        });
      });
    const alternativeSourceIds = metadataStore.alternativeTaskSources[props.task.id] ?? [];
    alternativeSourceIds.forEach((taskId) => {
      if (!isTaskSuccessful(taskId)) return;
      const task = metadataStore.getTaskById(taskId);
      if (!task?.name) return;
      const existing = sources.get(taskId);
      if (existing) {
        if (!existing.triggerStatuses.includes('completed')) {
          existing.triggerStatuses.push('completed');
        }
        return;
      }
      sources.set(taskId, { id: taskId, name: task.name, triggerStatuses: ['completed'] });
    });
    return Array.from(sources.values());
  });
  const blockedSources = computed<FailureSource[]>(() => {
    if (!isInvalid.value || isFailed.value) return [];
    const sources = new Map<string, FailureSource>();
    (props.task.taskRequirements ?? []).forEach((requirement) => {
      const sourceTaskId = requirement?.task?.id;
      if (!sourceTaskId) return;
      if (!isFailedOnlyRequirement(requirement.status)) return;
      if (!isTaskSuccessful(sourceTaskId)) return;
      const sourceTask = metadataStore.getTaskById(sourceTaskId);
      sources.set(sourceTaskId, {
        id: sourceTaskId,
        name: sourceTask?.name ?? sourceTaskId,
        triggerStatuses: ['completed'],
      });
    });
    const alternativeSourceIds = metadataStore.alternativeTaskSources[props.task.id] ?? [];
    alternativeSourceIds.forEach((taskId) => {
      if (!isTaskSuccessful(taskId)) return;
      const task = metadataStore.getTaskById(taskId);
      if (!task?.name) return;
      sources.set(taskId, { id: taskId, name: task.name, triggerStatuses: ['completed'] });
    });
    return Array.from(sources.values());
  });
  const statusSources = computed<FailureSource[]>(() =>
    isFailed.value ? failureSources.value : blockedSources.value
  );
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
  const { isHidden, toggleHidden } = useTaskHiding(() => props.task);
  const canMarkFailed = computed(
    () => preferencesStore.getEnableManualTaskFail && isOurFaction.value && !isFailed.value
  );
  /**
   * Action button state for cleaner template logic.
   * Returns which action button(s) should be shown.
   */
  const actionButtonState = computed((): ActionButtonState => {
    if (!isOurFaction.value) return 'none';
    if (isFailed.value) return 'complete';
    if (isLocked.value) return canMarkTaskAvailable() ? 'locked' : 'none';
    if (isComplete.value) return 'complete';
    if (showHotWheelsFail.value) return 'hotwheels';
    return 'available';
  });
  const onMapView = computed(() => preferencesStore.getTaskPrimaryView === 'maps');
  const { rewardsHidden, taskExpanded, toggleTaskVisibility } = useTaskCardExpansion({
    taskId: () => props.task.id,
    onMapView,
    collapseByDefault: () => preferencesStore.getTaskCollapseDefault,
    hideTaskRewards: () => preferencesStore.getHideTaskRewards,
    routeTaskId: () => getQueryString(route.query.task),
  });
  const selectedMapIds = computed(() => {
    return resolveSelectedMapIds(
      preferencesStore.getTaskMapView,
      metadataStore.mapsWithSvg as Array<{ id: string; mergedIds?: string[] }>
    );
  });
  // Get objectives from props or fall back to store when props are stale
  // This handles the case where visibleTasks holds old task objects after objectives merge
  const taskObjectives = computed(() => {
    return resolveTaskObjectives(props.task, metadataStore.getTaskById(props.task.id));
  });
  const taskItemObjectives = computed(() => {
    return taskObjectives.value.filter((objective) => {
      return Boolean(
        objective.item?.id ||
        objective.items?.[0]?.id ||
        objective.markerItem?.id ||
        objective.questItem?.id
      );
    });
  });
  const hasResettableItemObjectiveProgress = computed(() => {
    return taskItemObjectives.value.some((objective) => {
      return tarkovStore.getObjectiveCount(objective.id) > 0;
    });
  });
  const canResetTaskItemCounts = computed(() => {
    return hasResettableItemObjectiveProgress.value && !isComplete.value && !isFailed.value;
  });
  const resetItemCountsLabel = computed(() =>
    t('page.tasks.questcard.reset_item_counts', 'Reset item counts')
  );
  const resetItemCountsDisabledReason = computed(() => {
    if (isComplete.value && !isFailed.value) {
      return t(
        'page.tasks.questcard.reset_item_counts_disabled_complete',
        'Uncomplete this task to reset item counts'
      );
    }
    if (isFailed.value) {
      return t(
        'page.tasks.questcard.reset_item_counts_disabled_failed',
        'Mark this task as available to reset item counts'
      );
    }
    if (!hasResettableItemObjectiveProgress.value) {
      return t(
        'page.tasks.questcard.reset_item_counts_disabled_nothing_to_reset',
        'There are no item counts to reset'
      );
    }
    return '';
  });
  const nonOptionalTaskObjectives = computed(() =>
    taskObjectives.value.filter((objective) => !objective.optional)
  );
  const taskProgressCompleted = computed(
    () =>
      nonOptionalTaskObjectives.value.filter((objective) =>
        tarkovStore.isTaskObjectiveComplete(objective.id)
      ).length
  );
  const taskProgressTotal = computed(() => nonOptionalTaskObjectives.value.length);
  const objectivesMeta = computed(() =>
    taskProgressTotal.value > 0 ? `${taskProgressCompleted.value}/${taskProgressTotal.value}` : ''
  );
  /**
   * Consolidated objective categorization - single pass through objectives array.
   * Categorizes objectives into relevant, irrelevant, and uncompleted irrelevant.
   */
  const categorizedObjectives = computed(() => {
    return categorizeObjectivesForMapView({
      isMapView: onMapView.value,
      isObjectiveComplete: (objectiveId) => tarkovStore.isTaskObjectiveComplete(objectiveId),
      mapIds: selectedMapIds.value,
      objectives: taskObjectives.value,
    });
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
  const hasAvailabilityConfirmation = computed(() => {
    const progress = tarkovStore.getCurrentProgressData();
    return isAvailabilityConfirmed(
      progress.taskAvailability?.[props.task.id],
      progress.taskCompletions?.[props.task.id],
      otherRequirementsSignature(props.task)
    );
  });
  const openTaskContextMenu = (event: MouseEvent) => {
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
  const confirmResetTaskItemCounts = () => {
    if (!canResetTaskItemCounts.value) return;
    const confirmed = window.confirm(
      t('page.tasks.questcard.reset_item_counts_confirm', 'Reset all item counts for this task?')
    );
    if (!confirmed) return;
    taskItemObjectives.value.forEach((objective) => {
      if (tarkovStore.getObjectiveCount(objective.id) > 0) {
        tarkovStore.setObjectiveCount(objective.id, 0);
      }
    });
  };
</script>
