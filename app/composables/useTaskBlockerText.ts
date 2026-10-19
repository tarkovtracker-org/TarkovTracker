import { formatComparison, formatReputation } from '@/features/tasks/requirement-format';
import { poolBlockerLabel, poolProgressLabel } from '@/features/tasks/task-pool';
import { useMetadataStore } from '@/stores/useMetadata';
import type { TaskBlocker } from '@/stores/taskAvailability';
export const useTaskBlockerText = () => {
  const { t } = useI18n({ useScope: 'global' });
  const metadata = useMetadataStore();
  const tasks = computed(
    () => new Map(metadata.tasks.map((task) => [task.id, task.name ?? task.id]))
  );
  const chapters = computed(
    () => new Map((metadata.storyChapters ?? []).map((chapter) => [chapter.id, chapter.name]))
  );
  const statusLabels: Record<string, string> = {
    complete: 'complete',
    completed: 'complete',
    failed: 'failed',
    active: 'active',
    accept: 'active',
    accepted: 'active',
  };
  const requirementStatus = (statuses: string[] = ['complete']) => {
    const values = statuses.length ? statuses : ['complete'];
    return [...new Set(values.map((status) => statusLabels[status.toLowerCase()] ?? 'unknown'))]
      .map((status) => t(`page.tasks.blockers.status_${status}`))
      .join(t('page.tasks.blockers.status_or'));
  };
  const requirementName = (req: import('@/types/tarkov').TaskRequirement) =>
    req.task.name ?? tasks.value.get(req.task.id) ?? req.task.id;
  const prerequisiteText = (blocker: TaskBlocker): string => {
    const names = (blocker.requirements ?? [])
      .map((req) =>
        t('page.tasks.blockers.task_status', {
          task: requirementName(req),
          status: requirementStatus(req.status),
        })
      )
      .join(', ');
    const chapterNames = (blocker.chapterIds ?? [])
      .map((id) => chapters.value.get(id) ?? id)
      .join(', ');
    return t(`page.tasks.blockers.${chapterNames ? 'story_route' : 'prerequisite'}`, {
      tasks: names,
      chapters: chapterNames,
    });
  };
  const taskName = (id = '') => tasks.value.get(id) ?? id;
  const formatValue = (blocker: TaskBlocker, value = 0) =>
    blocker.type === 'trader_reputation' ? formatReputation(value) : value;
  const numericParams = (blocker: TaskBlocker) => ({
    current: formatValue(blocker, blocker.current),
    required: blocker.required ?? 0,
    requirement: formatComparison(t, blocker.compareMethod, formatValue(blocker, blocker.required)),
  });
  const namedParams = (blocker: TaskBlocker) => ({
    trader: blocker.trader?.name ?? '',
    task: taskName(blocker.taskId),
    faction: blocker.reason ?? '',
    objective: blocker.objective?.name ?? '',
    chapter: (blocker.chapterIds ?? []).map((id) => chapters.value.get(id) ?? id).join(', '),
  });
  const renamedKeys: Partial<Record<TaskBlocker['type'], string>> = {
    player_level: 'player_level_required',
    trader_level: 'trader_level_required',
    trader_reputation: 'trader_reputation_required',
    global_variable: 'global_variable_required',
    global_variable_unknown: 'global_variable_unknown_required',
  };
  const blockerKey = (blocker: TaskBlocker) =>
    blocker.type === 'trader_unlock' && blocker.objective
      ? 'trader_story_unlock'
      : (renamedKeys[blocker.type] ?? blocker.type);
  const poolText = (blocker: TaskBlocker): string => {
    const trader = metadata.traders?.find(
      (trader) => trader.id === blocker.taskPool?.traderId
    )?.name;
    const label = poolBlockerLabel(t, blocker, trader);
    const current = poolProgressLabel(
      t,
      blocker.current,
      blocker.required ?? 0,
      blocker.compareMethod,
      blocker.type === 'global_variable' ? 'account' : 'tracked'
    );
    const hint =
      blocker.type === 'global_variable_unknown'
        ? t('page.tasks.requirements.pool_confirmation_hint')
        : undefined;
    return [label, current, hint].filter(Boolean).join(' · ');
  };
  const hasPool = (blocker: TaskBlocker) => blocker.type === 'task_counter' || !!blocker.taskPool;
  return (blocker: TaskBlocker): string =>
    hasPool(blocker)
      ? poolText(blocker)
      : blocker.type === 'prerequisite'
        ? prerequisiteText(blocker)
        : t(`page.tasks.blockers.${blockerKey(blocker)}`, {
            ...numericParams(blocker),
            ...namedParams(blocker),
          });
};
