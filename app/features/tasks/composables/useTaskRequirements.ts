import { useTaskBlockerText } from '@/composables/useTaskBlockerText';
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
import { useMetadataStore } from '@/stores/useMetadata';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import { compareRequirement, getTaskTraderRequirements } from '@/utils/taskRequirements';
import type {
  NormalizedTraderRequirement,
  RequirementComparison,
  Task,
  TaskRequirement,
} from '@/types/tarkov';
export type TaskRequirementKind =
  'player_level' | 'trader_level' | 'trader_reputation' | 'task' | 'other';
export type TaskRequirementRow = {
  kind: TaskRequirementKind;
  met: boolean;
  label: string;
  progress?: string;
  hint?: string;
  to?: string;
};
type TraderKind = 'trader_level' | 'trader_reputation';
type KnownTraderRequirement = Exclude<NormalizedTraderRequirement, { requirementType: 'unknown' }>;
type StatusLists = Array<string[] | undefined>;
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
const formatTraderValue = (kind: TraderKind, value: number | undefined): string =>
  kind === 'trader_reputation' ? formatReputation(value) : String(value ?? 0);
export const useTaskRequirements = (task: () => Task) => {
  const { t } = useI18n({ useScope: 'global' });
  const tarkovStore = useTarkovStore();
  const progressStore = useProgressStore();
  const metadataStore = useMetadataStore();
  const blockerText = useTaskBlockerText();
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
  const otherRows = (blocker: TaskBlocker): TaskRequirementRow[] => [
    { kind: 'other', met: false, label: blockerText(blocker) },
  ];
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
  const storyBypass = computed(() =>
    (task().storyUnlocks ?? []).some((chapter) =>
      hasStoryUnlockProgress(chapter.id, progressData.value)
    )
  );
  const taskSummary = (): TaskRequirementRow[] =>
    [...groupStatusesByTask(task().taskRequirements ?? [])].map(([id, lists]) =>
      taskRow(id, lists, storyBypass.value || unmetStatusLists(id, lists).length === 0)
    );
  const otherSummary = (): TaskRequirementRow[] =>
    blockers.value
      .filter((blocker) => !SUMMARY_FROM_TASK_DATA.has(blocker.type))
      .flatMap(otherRows);
  const summary = computed(() => [
    ...levelSummary(),
    ...traderSummary(),
    ...taskSummary(),
    ...otherSummary(),
  ]);
  return { blocking, summary };
};
