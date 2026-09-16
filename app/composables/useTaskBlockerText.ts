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
  const numericParams = (blocker: TaskBlocker) => ({
    current: blocker.current ?? 0,
    required: blocker.required ?? 0,
    comparison: blocker.compareMethod ?? '>=',
  });
  const namedParams = (blocker: TaskBlocker) => ({
    trader: blocker.trader?.name ?? '',
    task: taskName(blocker.taskId),
    faction: blocker.reason ?? '',
  });
  return (blocker: TaskBlocker): string =>
    blocker.type === 'prerequisite'
      ? prerequisiteText(blocker)
      : t(`page.tasks.blockers.${blocker.type}`, {
          ...numericParams(blocker),
          ...namedParams(blocker),
        });
};
