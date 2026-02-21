<template>
  <UCard
    :id="`task-${task.id}`"
    class="card relative divide-none overflow-hidden shadow-md ring-0"
    :class="[taskClasses, accentClasses, 'rounded-md']"
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
      <div
        class="hover:bg-surface-700/20 flex flex-col"
        :class="[
          compactClasses.header,
          onMapView
            ? 'focus-visible:ring-primary-500/40 focus-visible:ring-offset-surface-900 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2'
            : '',
        ]"
        :aria-expanded="taskExpanded"
        :aria-controls="`task-content-${task.id}`"
        :role="onMapView ? 'button' : undefined"
        :tabindex="onMapView ? 0 : undefined"
        @click="onTaskHeaderClick"
        @keydown="onTaskHeaderKeydown"
      >
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div class="flex min-w-0 items-center justify-between gap-2 sm:flex-1">
            <TaskCardHeader
              :task="task"
              :meets-level-requirement="meetsLevelRequirement"
              class="min-w-0"
            />
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
          <div class="flex items-center justify-between gap-2 sm:ml-auto sm:justify-end">
            <TaskCardBadges
              :task="task"
              :is-pinned="isPinned"
              :is-our-faction="isOurFaction"
              :fence-rep-requirement="fenceRepRequirement"
              :meets-fence-rep-requirement="meetsFenceRepRequirement"
              :trader-level-reqs="traderLevelReqs"
              :location-tooltip="locationTooltip"
              :is-failed="isFailed"
              :is-invalid="isInvalid"
              :show-required-labels="preferencesStore.getShowRequiredLabels"
              :exclusive-edition-badge="exclusiveEditionBadge"
              :progress-completed="taskProgressCompleted"
              :progress-total="taskProgressTotal"
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
            <UIcon
              v-if="onMapView"
              name="i-mdi-chevron-down"
              aria-hidden="true"
              class="pointer-events-none h-4 w-4 shrink-0 self-center transition-transform duration-200"
              :class="{ 'rotate-180': taskExpanded }"
            />
          </div>
        </div>
        <!-- Extra Info Strips (padded area) -->
        <div v-if="lockedBefore > 0" class="text-surface-400 text-xs">
          <span class="text-surface-500">{{ t('page.tasks.questcard.requires') }}:</span>
          <template v-if="useCompactRequires">
            <AppTooltip :text="compactRequiresTooltip">
              <span class="text-surface-300 ml-2">
                {{
                  t(
                    'page.tasks.questcard.requires_progress',
                    { completed: completedParentCount, total: totalParentCount },
                    `${completedParentCount} of ${totalParentCount} prerequisites completed`
                  )
                }}
              </span>
            </AppTooltip>
          </template>
          <template v-else-if="pendingParentTasks.length">
            <span class="ml-2 inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              <AppTooltip
                v-for="parent in displayedPendingParents"
                :key="parent.id"
                :text="getPendingParentTooltipText(parent)"
              >
                <span class="inline-flex items-center gap-1.5">
                  <router-link
                    :to="`/tasks?task=${parent.id}`"
                    class="text-surface-200 text-[11px] underline decoration-white/30 underline-offset-2 hover:decoration-white/60"
                  >
                    <span class="truncate">{{ parent.name }}</span>
                  </router-link>
                  <span class="text-surface-500 text-[11px]">
                    {{
                      t(
                        'page.tasks.questcard.requires_must_be',
                        {
                          status: formatRequirementExpectedStatuses(parent.expectedStatuses),
                        },
                        `must be ${formatRequirementExpectedStatuses(parent.expectedStatuses)}`
                      )
                    }}
                  </span>
                  <span class="inline-flex items-center gap-0.5 text-[10px] text-amber-400/80">
                    <UIcon name="i-mdi-information-outline" class="h-3 w-3 shrink-0" />
                    {{
                      t(
                        'page.tasks.questcard.requires_currently',
                        {
                          status: formatRequirementCurrentStatus(parent.currentStatus),
                        },
                        `currently ${formatRequirementCurrentStatus(parent.currentStatus)}`
                      )
                    }}
                  </span>
                </span>
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
                            'page.tasks.questcard.failed_because_was',
                            {
                              status: formatRequirementExpectedStatuses(source.triggerStatuses),
                            },
                            `was ${formatRequirementExpectedStatuses(source.triggerStatuses)}`
                          )
                        : t(
                            'page.tasks.questcard.blocked_because_was',
                            {
                              status: formatRequirementExpectedStatuses(source.triggerStatuses),
                            },
                            `was ${formatRequirementExpectedStatuses(source.triggerStatuses)}`
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
            <div class="flex items-center gap-2">
              <AppTooltip
                v-if="taskItemObjectives.length > 0"
                :text="resetItemCountsDisabledReason"
                :disabled="!resetItemCountsDisabledReason"
              >
                <span class="inline-flex" @click.stop>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="soft"
                    class="text-surface-300 hover:text-surface-100 cursor-pointer text-[10px] tracking-normal normal-case"
                    :disabled="!canResetTaskItemCounts"
                    :aria-label="t('page.tasks.questcard.reset_item_counts', 'Reset item counts')"
                    @click.stop="confirmResetTaskItemCounts"
                    @keydown.enter.stop
                    @keydown.space.stop
                  >
                    <UIcon name="i-mdi-restore" aria-hidden="true" class="h-3.5 w-3.5" />
                    <span class="hidden sm:inline">
                      {{ t('page.tasks.questcard.reset_item_counts', 'Reset item counts') }}
                    </span>
                  </UButton>
                </span>
              </AppTooltip>
              <UIcon
                name="i-mdi-chevron-down"
                aria-hidden="true"
                class="pointer-events-none h-4 w-4 transition-transform duration-200"
                :class="{ 'rotate-180': objectivesVisible }"
              />
            </div>
          </div>
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
      </Transition>
    </div>
    <!-- 3) Rewards Summary Section (Fixed to bottom, Full Width) -->
    <template #footer>
      <TaskCardRewards
        v-if="taskExpanded"
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
  import {
    getCurrentTaskStatusForRequirement,
    getRequiredTaskStatuses,
    isTaskRequirementSatisfied,
    type RequirementCurrentStatus,
    type RequirementExpectedStatus,
  } from '@/features/tasks/task-requirement-helpers';
  import TaskCardActions from '@/features/tasks/TaskCardActions.vue';
  import TaskCardBackground from '@/features/tasks/TaskCardBackground.vue';
  import TaskCardBadges from '@/features/tasks/TaskCardBadges.vue';
  import TaskCardHeader from '@/features/tasks/TaskCardHeader.vue';
  import TaskCardRewards from '@/features/tasks/TaskCardRewards.vue';
  import { isMapObjectiveType } from '@/features/tasks/taskObjectiveTypes';
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
  type FailureSource = {
    id: string;
    name: string;
    triggerStatuses: RequirementExpectedStatus[];
  };
  type PendingParentTask = {
    currentStatus: RequirementCurrentStatus;
    expectedStatuses: RequirementExpectedStatus[];
    id: string;
    name: string;
  };
  // Module-level constants (moved from reactive scope)
  const MAX_DISPLAYED_NAMES = 3;
  const COMPACT_REQUIRES_THRESHOLD = 3;
  const COMPACT_TOOLTIP_PREVIEW = 3;
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
    delay: 150,
  });
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
  const injectedImpactEligibleTaskIds = inject<{ value: Set<string> | undefined } | undefined>(
    'impactEligibleTaskIds',
    undefined
  );
  const { isGlobalTask: isGlobalTaskFn } = useTaskFiltering();
  const isGlobalTask = computed(() => isGlobalTaskFn(props.task));
  const taskContextMenu = ref<ContextMenuRef | null>(null);
  const itemContextMenu = ref<ContextMenuRef | null>(null);
  const { copyTaskLink, openTaskDataIssue, setSelectedItem, openItemOnTarkovDev, openItemOnWiki } =
    useTaskCardLinks({
      task: () => props.task,
      objectives: () => taskObjectives.value,
    });
  const { isComplete, isFailed, isLocked, isInvalid } = useTaskState(() => props.task.id);
  const objectivesExpanded = ref(true);
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
  const taskToggle = ref(true);
  const taskExpanded = computed(() => {
    return !onMapView.value || taskToggle.value;
  });
  const shouldIgnoreTaskHeaderToggle = (event: MouseEvent): boolean => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;
    const interactiveAncestor = target.closest('a,button,input,select,textarea,[role="button"]');
    return Boolean(interactiveAncestor && interactiveAncestor !== event.currentTarget);
  };
  const toggleTaskVisibility = () => {
    if (!onMapView.value) return;
    taskToggle.value = !taskToggle.value;
  };
  const onTaskHeaderClick = (event: MouseEvent) => {
    if (shouldIgnoreTaskHeaderToggle(event)) return;
    toggleTaskVisibility();
  };
  const onTaskHeaderKeydown = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggleTaskVisibility();
  };
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
  const formatRequirementExpectedStatuses = (statuses: RequirementExpectedStatus[]): string => {
    const uniqueStatuses = Array.from(new Set(statuses));
    const labels = uniqueStatuses.map((status) => {
      if (status === 'active') {
        return t('page.tasks.questcard.requirement_status_active', 'active/accepted');
      }
      if (status === 'failed') {
        return t('page.tasks.questcard.requirement_status_failed', 'failed');
      }
      return t('page.tasks.questcard.requirement_status_completed', 'completed');
    });
    return labels.join(` ${t('page.tasks.questcard.keys_or', 'or')} `);
  };
  const formatRequirementCurrentStatus = (status: RequirementCurrentStatus): string => {
    if (status === 'active') {
      return t('page.tasks.questcard.requirement_status_active', 'active/accepted');
    }
    if (status === 'available') {
      return t('page.tasks.questcard.requirement_status_available', 'available');
    }
    if (status === 'failed') {
      return t('page.tasks.questcard.requirement_status_failed', 'failed');
    }
    if (status === 'not_started') {
      return t('page.tasks.questcard.requirement_status_not_started', 'not started');
    }
    return t('page.tasks.questcard.requirement_status_completed', 'completed');
  };
  const formatRequirementActionVerbs = (statuses: RequirementExpectedStatus[]): string => {
    const unique = Array.from(new Set(statuses));
    const verbs = unique.map((s) => {
      if (s === 'active') return t('page.tasks.questcard.requires_action_accept', 'Accept');
      if (s === 'failed') return t('page.tasks.questcard.requires_action_fail', 'Fail');
      return t('page.tasks.questcard.requires_action_complete', 'Complete');
    });
    return verbs.join(` ${t('page.tasks.questcard.keys_or', 'or')} `);
  };
  const getPendingParentTooltipText = (parent: PendingParentTask): string => {
    const expected = formatRequirementExpectedStatuses(parent.expectedStatuses);
    const current = formatRequirementCurrentStatus(parent.currentStatus);
    const needsOnlyFailed = parent.expectedStatuses.every((s) => s === 'failed');
    const needsOnlyCompleted = parent.expectedStatuses.every((s) => s === 'completed');
    const isConflict =
      (needsOnlyFailed && parent.currentStatus === 'completed') ||
      (needsOnlyCompleted && parent.currentStatus === 'failed');
    if (isConflict) {
      return t(
        'page.tasks.questcard.requires_tooltip_conflict',
        { name: parent.name, expected, current },
        `"${parent.name}" is ${current} but needs ${expected} — this task may be permanently locked`
      );
    }
    const action = formatRequirementActionVerbs(parent.expectedStatuses);
    return t(
      'page.tasks.questcard.requires_tooltip_action',
      { action, name: parent.name },
      `${action} "${parent.name}" to unlock this task`
    );
  };
  const getStatusSourceTooltipText = (source: FailureSource): string => {
    const status = formatRequirementExpectedStatuses(source.triggerStatuses);
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
      const expectedStatuses = getRequiredTaskStatuses(requirement.status);
      const isFailedOnlyRequirement =
        expectedStatuses.includes('failed') &&
        !expectedStatuses.includes('completed') &&
        !expectedStatuses.includes('active');
      if (!isFailedOnlyRequirement) return;
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
  const pendingParentTasks = computed<PendingParentTask[]>(() => {
    return parentTasks.value
      .map((parent) => {
        const completion = taskCompletions.value[parent.id];
        const isUnlockable = progressStore.unlockedTasks[parent.id]?.self === true;
        const requirementStatuses = requirementStatusesByTaskId.value.get(parent.id);
        const statusesToCheck = requirementStatuses?.length ? requirementStatuses : [undefined];
        const unmetStatuses = statusesToCheck.filter(
          (statuses) => !isTaskRequirementSatisfied(statuses, completion, isUnlockable)
        );
        if (!unmetStatuses.length) return null;
        const expectedStatuses = Array.from(
          new Set(unmetStatuses.flatMap((statuses) => getRequiredTaskStatuses(statuses)))
        );
        return {
          currentStatus: getCurrentTaskStatusForRequirement(completion, isUnlockable),
          expectedStatuses,
          id: parent.id,
          name: parent.name ?? parent.id,
        };
      })
      .filter((parent): parent is PendingParentTask => parent !== null);
  });
  const lockedBefore = computed(() => pendingParentTasks.value.length);
  const useCompactRequires = computed(
    () => pendingParentTasks.value.length > COMPACT_REQUIRES_THRESHOLD
  );
  const totalParentCount = computed(() => parentTasks.value.length);
  const completedParentCount = computed(
    () => totalParentCount.value - pendingParentTasks.value.length
  );
  const compactRequiresTooltip = computed(() => {
    const preview = pendingParentTasks.value.slice(0, COMPACT_TOOLTIP_PREVIEW).map((p) => p.name);
    const remaining = pendingParentTasks.value.length - preview.length;
    if (remaining > 0) {
      return t(
        'page.tasks.questcard.requires_progress_tooltip_overflow',
        { tasks: preview.join(', '), count: remaining },
        `Next: ${preview.join(', ')}, and ${remaining} more`
      );
    }
    return t(
      'page.tasks.questcard.requires_progress_tooltip',
      { tasks: preview.join(', ') },
      `Next: ${preview.join(', ')}`
    );
  });
  const displayedPendingParents = computed(() =>
    pendingParentTasks.value.slice(0, COMPACT_REQUIRES_THRESHOLD)
  );
  const extraPendingParentsCount = computed(() =>
    Math.max(0, pendingParentTasks.value.length - displayedPendingParents.value.length)
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
      const isMapType = isMapObjectiveType(objective.type);
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
