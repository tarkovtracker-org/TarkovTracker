import {
  genericProgressionLabel,
  poolContributorGroups,
  poolProgressLabel,
  poolRequirementLabel,
  poolTrackedValue,
  type PoolTaskContext,
} from '@/features/tasks/task-pool';
import { useMetadataStore } from '@/stores/useMetadata';
import { useProgressStore } from '@/stores/useProgress';
import { useTarkovStore } from '@/stores/useTarkov';
import { isAvailabilityConfirmed } from '@/utils/taskAvailabilityConfirmation';
import { otherRequirementsSignature } from '@/utils/taskOtherRequirements';
import type { TaskRequirementRow } from '@/features/tasks/composables/useTaskRequirements';
import type { TaskBlocker } from '@/stores/taskAvailability';
import type { Task, TaskCounterDerivation, TaskOtherRequirement } from '@/types/tarkov';
type VariableRequirement = Extract<TaskOtherRequirement, { type: 'globalVariable' }>;
export const useTaskPoolRequirements = (task: () => Task) => {
  const { t } = useI18n({ useScope: 'global' });
  const metadata = useMetadataStore();
  const progress = useProgressStore();
  const tarkov = useTarkovStore();
  const data = computed(() => tarkov.getCurrentProgressData());
  const evaluation = (id: string) => progress.taskEvaluations?.[id]?.self;
  const unavailable = (id: string): boolean => {
    const blockers = evaluation(id)?.blockers ?? [];
    return [
      progress.invalidTasks?.[id]?.self === true,
      blockers.some((blocker) => ['faction', 'disabled', 'failed_branch'].includes(blocker.type)),
    ].some(Boolean);
  };
  const context: PoolTaskContext = {
    get currentTaskId() {
      return task().id;
    },
    taskById: (id) => metadata.getTaskById(id),
    completion: (id) => data.value.taskCompletions?.[id],
    available: (id) => evaluation(id)?.available ?? progress.unlockedTasks?.[id]?.self === true,
    unavailable,
  };
  const confirmed = () =>
    isAvailabilityConfirmed(
      data.value.taskAvailability?.[task().id],
      data.value.taskCompletions?.[task().id],
      otherRequirementsSignature(task())
    );
  const traderName = (requirement: VariableRequirement) =>
    metadata.traders?.find((trader) => trader.id === requirement.taskPool?.traderId)?.name;
  const trackedValue = (requirement: VariableRequirement) =>
    requirement.counter ? poolTrackedValue(requirement.counter, context) : undefined;
  const currentValue = (requirement: VariableRequirement, blocker?: TaskBlocker) => {
    switch (blocker?.type) {
      case 'global_variable_unknown':
        return undefined;
      case 'global_variable':
        return blocker.current;
      default:
        return trackedValue(requirement);
    }
  };
  const rowProgress = (requirement: VariableRequirement, blocker?: TaskBlocker) =>
    poolProgressLabel(
      t,
      currentValue(requirement, blocker),
      requirement.value,
      requirement.compareMethod,
      blocker?.type === 'global_variable' ? 'account' : 'tracked'
    );
  const poolDetails = (
    requirement: VariableRequirement,
    counter: TaskCounterDerivation,
    met: boolean
  ) => ({
    id: requirement.id,
    candidate: !requirement.counter,
    confirmed: met && confirmed(),
    groups: poolContributorGroups(counter, context),
  });
  const counterFor = (requirement: VariableRequirement) =>
    requirement.taskPool?.derivation ?? requirement.counter;
  return (
    requirement: VariableRequirement,
    met: boolean,
    blocker?: TaskBlocker
  ): TaskRequirementRow => {
    const counter = counterFor(requirement);
    if (!counter) return { kind: 'other', met, label: genericProgressionLabel(t) };
    return {
      kind: 'task_pool',
      met,
      label: poolRequirementLabel(
        t,
        requirement.taskPool,
        traderName(requirement),
        requirement.compareMethod,
        requirement.value
      ),
      progress: rowProgress(requirement, blocker),
      hint:
        blocker?.type === 'global_variable_unknown'
          ? t('page.tasks.requirements.pool_confirmation_hint')
          : undefined,
      pool: poolDetails(requirement, counter, met),
    };
  };
};
