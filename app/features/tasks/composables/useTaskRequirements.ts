import { useTaskBlockerText } from '@/composables/useTaskBlockerText';
import { useTaskPoolRequirements } from '@/features/tasks/composables/useTaskPoolRequirements';
import {
  formatActionVerbs,
  formatComparison,
  formatCurrentStatus,
  formatExpectedStatuses,
  formatReputation,
  isRequirementConflict,
} from '@/features/tasks/requirement-format';
import {
  getCurrentTaskStatusForRequirement,
  getRequiredTaskStatuses,
  isTaskRequirementSatisfied,
  type RequirementCurrentStatus,
  type RequirementExpectedStatus,
} from '@/features/tasks/task-requirement-helpers';
import { hasStoryUnlockProgress, type TaskBlocker } from '@/stores/taskAvailability';
import { taskServerGateBlockers } from '@/stores/taskServerGates';
import { useMetadataStore } from '@/stores/useMetadata';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import { effectiveStoryProgress, storyCatalogForMode } from '@/utils/storylineCompletion';
import { normalizeOtherRequirements } from '@/utils/taskOtherRequirements';
import { compareRequirement, getTaskTraderRequirements } from '@/utils/taskRequirements';
import type { TaskRequirementPool } from '@/features/tasks/task-pool';
import type {
  NormalizedTraderRequirement,
  RequirementComparison,
  Task,
  TaskOtherRequirement,
  TaskRequirement,
} from '@/types/tarkov';
export type TaskRequirementKind =
  'player_level' | 'trader_level' | 'trader_reputation' | 'task' | 'task_pool' | 'other';
export type TaskRequirementRow = {
  kind: TaskRequirementKind;
  met: boolean;
  label: string;
  progress?: string;
  hint?: string;
  to?: string;
  pool?: TaskRequirementPool;
};
type TraderKind = 'trader_level' | 'trader_reputation';
type KnownTraderRequirement = Exclude<NormalizedTraderRequirement, { requirementType: 'unknown' }>;
type StatusLists = Array<string[] | undefined>;
type KnownOtherRequirement = Exclude<TaskOtherRequirement, { type: 'unknown' }>;
const TERMINAL_BLOCKERS = new Set<TaskBlocker['type']>(['complete', 'failed']);
const SUMMARY_FROM_TASK_DATA = new Set<TaskBlocker['type']>([
  'complete',
  'failed',
  'player_level',
  'trader_level',
  'trader_reputation',
  'prerequisite',
]);
const groupStatusesByTask = (requirements: TaskRequirement[]): Map<string, StatusLists> => {
  const groups = new Map<string, StatusLists>();
  requirements
    .filter((requirement) => requirement?.task?.id)
    .forEach((requirement) => {
      const lists = groups.get(requirement.task.id) ?? [];
      groups.set(requirement.task.id, [...lists, requirement.status]);
    });
  return groups;
};
const storyObjectiveLink = (chapterId: string, objectiveId: string) =>
  `/storyline?chapter=${encodeURIComponent(chapterId)}&objective=${encodeURIComponent(objectiveId)}`;
const formatTraderValue = (kind: TraderKind, value: number | undefined): string =>
  kind === 'trader_reputation' ? formatReputation(value) : String(value ?? 0);
export const useTaskRequirements = (task: () => Task) => {
  const { t } = useI18n({ useScope: 'global' });
  const tarkovStore = useTarkovStore();
  const progressStore = useProgressStore();
  const metadataStore = useMetadataStore();
  const blockerText = useTaskBlockerText();
  const poolRow = useTaskPoolRequirements(task);
  const progressData = computed(() => tarkovStore.getCurrentProgressData());
  const completions = computed(() => progressData.value.taskCompletions ?? {});
  const you = (value: number | string) => t('page.tasks.requirements.you', { value });
  const levelRow = (blocker: TaskBlocker, met: boolean): TaskRequirementRow => ({
    kind: 'player_level',
    met,
    label: t('page.tasks.requirements.player_level', {
      requirement: formatComparison(t, blocker.compareMethod, blocker.required ?? 0),
    }),
    progress: you(blocker.current ?? 0),
  });
  const traderRow = (kind: TraderKind, blocker: TaskBlocker, met: boolean): TaskRequirementRow => ({
    kind,
    met,
    label: t(`page.tasks.requirements.${kind}`, {
      trader: blocker.trader?.name ?? '',
      requirement: formatComparison(
        t,
        blocker.compareMethod,
        formatTraderValue(kind, blocker.required)
      ),
    }),
    progress: you(formatTraderValue(kind, blocker.current)),
  });
  const otherRows = (blocker: TaskBlocker): TaskRequirementRow[] => {
    const requirement = normalizeOtherRequirements(task().otherRequirements).find(
      (requirement) =>
        requirement.type === 'globalVariable' &&
        requirement.id === blocker.requirementId &&
        (requirement.counter || requirement.taskPool)
    );
    if (requirement?.type === 'globalVariable') return [poolRow(requirement, false, blocker)];
    const chapterId = blocker.chapterIds?.[0];
    return [
      {
        kind: 'other',
        met: false,
        label: blockerText(blocker),
        to:
          chapterId && blocker.objective
            ? storyObjectiveLink(chapterId, blocker.objective.id)
            : undefined,
      },
    ];
  };
  const taskName = (id: string) => metadataStore.getTaskById(id)?.name ?? id;
  const taskState = (id: string) => ({
    completion: completions.value[id],
    unlockable: progressStore.unlockedTasks?.[id]?.self === true,
  });
  const unmetStatusLists = (id: string, lists: StatusLists): StatusLists => {
    const { completion, unlockable } = taskState(id);
    return lists.filter(
      (statuses) => !isTaskRequirementSatisfied(statuses, completion, unlockable)
    );
  };
  const conflictHint = (
    name: string,
    expected: RequirementExpectedStatus[],
    current: RequirementCurrentStatus
  ): string | undefined => {
    if (!isRequirementConflict(expected, current)) return undefined;
    return t('page.tasks.questcard.requires_tooltip_conflict', {
      name,
      expected: formatExpectedStatuses(t, expected),
      current: formatCurrentStatus(t, current),
    });
  };
  const taskRow = (id: string, lists: StatusLists, met: boolean): TaskRequirementRow => {
    const { completion, unlockable } = taskState(id);
    const unmet = unmetStatusLists(id, lists);
    const expected = [...new Set((unmet.length ? unmet : lists).flatMap(getRequiredTaskStatuses))];
    const current = getCurrentTaskStatusForRequirement(completion, unlockable);
    const name = taskName(id);
    return {
      kind: 'task',
      met,
      label: t('page.tasks.requirements.task', {
        action: formatActionVerbs(t, expected),
        task: name,
      }),
      progress: t('page.tasks.questcard.requires_currently', {
        status: formatCurrentStatus(t, current),
      }),
      hint: conflictHint(name, expected, current),
      to: `/tasks?task=${id}`,
    };
  };
  const chapterNames = (ids: string[]) =>
    ids
      .map((id) => task().storyUnlocks?.find((chapter) => chapter.id === id)?.name ?? id)
      .join(', ');
  const storyAlternativeRows = (blocker: TaskBlocker): TaskRequirementRow[] =>
    blocker.chapterIds?.length
      ? [
          {
            kind: 'other',
            met: false,
            label: t('page.tasks.requirements.story_alternative', {
              chapters: chapterNames(blocker.chapterIds),
            }),
          },
        ]
      : [];
  const prerequisiteRows = (blocker: TaskBlocker): TaskRequirementRow[] => {
    if (!blocker.requirements?.length) return otherRows(blocker);
    const rows = [...groupStatusesByTask(blocker.requirements)].map(([id, lists]) =>
      taskRow(id, lists, false)
    );
    return [...rows, ...storyAlternativeRows(blocker)];
  };
  const traderBlockerRows = (kind: TraderKind) => (blocker: TaskBlocker) =>
    blocker.trader ? [traderRow(kind, blocker, false)] : otherRows(blocker);
  const blockerRowBuilders: Partial<
    Record<TaskBlocker['type'], (blocker: TaskBlocker) => TaskRequirementRow[]>
  > = {
    player_level: (blocker) => [levelRow(blocker, false)],
    trader_level: traderBlockerRows('trader_level'),
    trader_reputation: traderBlockerRows('trader_reputation'),
    prerequisite: prerequisiteRows,
  };
  const rowsForBlocker = (blocker: TaskBlocker) =>
    (blockerRowBuilders[blocker.type] ?? otherRows)(blocker);
  const blockers = computed<TaskBlocker[]>(
    () => progressStore.taskEvaluations?.[task().id]?.self?.blockers ?? []
  );
  const blocking = computed(() =>
    blockers.value.filter((blocker) => !TERMINAL_BLOCKERS.has(blocker.type)).flatMap(rowsForBlocker)
  );
  const levelSummary = (): TaskRequirementRow[] => {
    const required = task().minPlayerLevel ?? 0;
    if (required <= 0) return [];
    const current = tarkovStore.playerLevel();
    return [
      levelRow(
        { type: 'player_level', current, required, compareMethod: '>=' },
        current >= required
      ),
    ];
  };
  const traderValue: Record<TraderKind, (traderId: string) => number> = {
    trader_level: (traderId) => tarkovStore.getTraderLevel(traderId),
    trader_reputation: (traderId) => tarkovStore.getTraderReputation(traderId),
  };
  const traderSummaryRow = (requirement: KnownTraderRequirement): TaskRequirementRow => {
    const kind: TraderKind =
      requirement.requirementType === 'level' ? 'trader_level' : 'trader_reputation';
    const current = traderValue[kind](requirement.trader.id);
    const compareMethod: RequirementComparison = requirement.compareMethod;
    const met = compareRequirement(current, compareMethod, requirement.value);
    return traderRow(
      kind,
      {
        type: kind,
        trader: requirement.trader,
        current,
        required: requirement.value,
        compareMethod,
      },
      met
    );
  };
  const traderSummary = (): TaskRequirementRow[] =>
    getTaskTraderRequirements(task())
      .filter(
        (requirement): requirement is KnownTraderRequirement =>
          requirement.requirementType !== 'unknown'
      )
      .map(traderSummaryRow);
  const storyProgress = computed(() =>
    effectiveStoryProgress(
      progressData.value.storyChapters,
      storyCatalogForMode(
        metadataStore.storyChapters ?? [],
        metadataStore.storyChaptersGameMode,
        tarkovStore.$state.currentGameMode
      )
    )
  );
  const storyBypass = computed(() =>
    (task().storyUnlocks ?? []).some((chapter) =>
      hasStoryUnlockProgress(chapter.id, { storyChapters: storyProgress.value })
    )
  );
  const taskSummary = (): TaskRequirementRow[] =>
    [...groupStatusesByTask(task().taskRequirements ?? [])].map(([id, lists]) =>
      taskRow(id, lists, unmetStatusLists(id, lists).length === 0)
    );
  const storySummary = (): TaskRequirementRow[] => {
    const chapters = task().storyUnlocks ?? [];
    if (!chapters.length) return [];
    return [
      {
        kind: 'other',
        met: storyBypass.value,
        label: t('page.tasks.requirements.story_alternative', {
          chapters: chapterNames(chapters.map((chapter) => chapter.id)),
        }),
      },
    ];
  };
  const summaryBlockers = computed(() => {
    const evaluation = progressStore.taskEvaluations?.[task().id]?.self;
    if (evaluation && !evaluation.blockers.some((blocker) => TERMINAL_BLOCKERS.has(blocker.type)))
      return evaluation.blockers;
    return taskServerGateBlockers(task(), {
      completions: completions.value,
      confirmations: progressData.value.taskAvailability,
      storyChapters: storyProgress.value,
    });
  });
  const otherSummary = (): TaskRequirementRow[] =>
    summaryBlockers.value
      .filter((blocker) => !SUMMARY_FROM_TASK_DATA.has(blocker.type))
      .flatMap(otherRows);
  const otherRequirementLabels: {
    [K in KnownOtherRequirement['type']]: (
      requirement: Extract<KnownOtherRequirement, { type: K }>
    ) => string;
  } = {
    dialogue: () => t('page.tasks.requirements.dialogue'),
    storyObjective: (requirement) =>
      t('page.tasks.requirements.story_objective', {
        objective: requirement.objective.name ?? requirement.objective.id,
        chapter: requirement.storyChapter.name ?? requirement.storyChapter.id,
      }),
    globalVariable: () => t('page.tasks.requirements.global_variable'),
  };
  const otherRequirementLabel = (requirement: KnownOtherRequirement): string =>
    (otherRequirementLabels[requirement.type] as (value: KnownOtherRequirement) => string)(
      requirement
    );
  const metOtherSummary = (): TaskRequirementRow[] => {
    const blocked = new Set(summaryBlockers.value.map((blocker) => blocker.requirementId));
    return normalizeOtherRequirements(task().otherRequirements)
      .filter(
        (requirement): requirement is KnownOtherRequirement =>
          requirement.type !== 'unknown' && !blocked.has(requirement.id)
      )
      .map((requirement): TaskRequirementRow => {
        if (requirement.type === 'globalVariable') return poolRow(requirement, true);
        return {
          kind: 'other',
          met: true,
          label: otherRequirementLabel(requirement),
          to:
            requirement.type === 'storyObjective'
              ? storyObjectiveLink(requirement.storyChapter.id, requirement.objective.id)
              : undefined,
        };
      });
  };
  const summary = computed(() => [
    ...levelSummary(),
    ...traderSummary(),
    ...taskSummary(),
    ...storySummary(),
    ...metOtherSummary(),
    ...otherSummary(),
  ]);
  return { blocking, summary };
};
