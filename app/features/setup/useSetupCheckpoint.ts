import { useStorage } from '@vueuse/core';
export const setupImportSteps = ['backup', 'eft-logs', 'tarkov-dev'] as const;
type SetupImportStep = (typeof setupImportSteps)[number];
export type SetupStep = 'start' | SetupImportStep | 'review' | 'done';
type Outcome = 'imported' | 'skipped' | 'failed';
export const setupSteps: readonly SetupStep[] = ['start', ...setupImportSteps, 'review', 'done'];
type Checkpoint = {
  step: SetupStep;
  outcomes: Partial<Record<SetupImportStep, Outcome>>;
  dismissed?: boolean;
};
export const isSetupImportStep = (step: SetupStep): step is SetupImportStep =>
  setupImportSteps.some((source) => source === step);
export function useSetupCheckpoint() {
  const { $supabase } = useNuxtApp();
  const key = computed(() => `tarkovtracker-setup-v1:${$supabase.user.id ?? 'guest'}`);
  const checkpoint = useStorage<Checkpoint>(key, { step: 'start', outcomes: {} }, undefined, {
    initOnMounted: true,
    listenToStorageChanges: false,
  });
  const step = computed(() =>
    setupSteps.includes(checkpoint.value?.step) ? checkpoint.value.step : 'start'
  );
  const dismissed = computed(() => checkpoint.value?.dismissed === true);
  const outcomes = computed(() => checkpoint.value?.outcomes ?? {});
  function go(next: SetupStep, outcome?: Outcome) {
    const source = step.value;
    const updated = { ...outcomes.value };
    if (outcome && isSetupImportStep(source) && updated[source] !== 'imported') {
      updated[source] = outcome;
    }
    checkpoint.value = { step: next, outcomes: updated, dismissed: dismissed.value };
  }
  function remember(outcome: Outcome) {
    go(step.value, outcome);
  }
  function dismiss() {
    checkpoint.value = { step: step.value, outcomes: outcomes.value, dismissed: true };
  }
  function restart() {
    checkpoint.value = { step: 'start', outcomes: {} };
  }
  return { step, outcomes, go, remember, restart, dismissed, dismiss };
}
