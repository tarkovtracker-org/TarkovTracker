import { useStorage } from '@vueuse/core';
import { isGameMode, type GameMode } from '@/utils/constants';
const setupImportSteps = ['backup', 'tarkov-dev', 'eft-logs'] as const;
type SetupImportStep = (typeof setupImportSteps)[number];
export type SetupPath = 'import' | 'manual' | 'backup';
export type SetupStep =
  'start' | 'tarkov-dev' | 'profile' | 'eft-logs' | 'catch-up' | 'backup' | 'done';
export type SetupOutcome = 'imported' | 'skipped' | 'failed';
const ALL_SETUP_STEPS: readonly SetupStep[] = [
  'start',
  'tarkov-dev',
  'profile',
  'eft-logs',
  'catch-up',
  'backup',
  'done',
];
const ALL_SETUP_PATHS: readonly SetupPath[] = ['import', 'manual', 'backup'];
type Checkpoint = {
  path: SetupPath;
  step: SetupStep;
  outcomes: Partial<Record<SetupImportStep, SetupOutcome>>;
  tarkovDevImportedModes: GameMode[];
  editionResolvedByImport?: boolean;
  importProfileVisited?: boolean;
  completedAt?: number;
  dismissed?: boolean;
};
const DEFAULT_CHECKPOINT: Checkpoint = {
  path: 'import',
  step: 'start',
  outcomes: {},
  tarkovDevImportedModes: [],
};
export const isSetupImportStep = (step: SetupStep): step is SetupImportStep =>
  setupImportSteps.some((source) => source === step);
const BACKUP_STEPS: readonly SetupStep[] = ['start', 'backup', 'done'];
function setupPathForStep(path: SetupPath, step: SetupStep): SetupPath {
  if (step === 'backup') return 'backup';
  if (step === 'tarkov-dev') return 'import';
  if (path === 'backup' && !BACKUP_STEPS.includes(step)) return 'manual';
  return path;
}
export function useSetupCheckpoint() {
  const { $supabase } = useNuxtApp();
  const key = computed(() => `tarkovtracker-setup-v2:${$supabase.user.id ?? 'guest'}`);
  const checkpoint = useStorage<Checkpoint>(key, { ...DEFAULT_CHECKPOINT }, undefined, {
    initOnMounted: true,
    listenToStorageChanges: false,
  });
  const step = computed<SetupStep>(() =>
    ALL_SETUP_STEPS.includes(checkpoint.value?.step) ? checkpoint.value.step : 'start'
  );
  const path = computed<SetupPath>(() => {
    const saved = checkpoint.value?.path;
    return setupPathForStep(ALL_SETUP_PATHS.includes(saved) ? saved : 'import', step.value);
  });
  const dismissed = computed(() => checkpoint.value?.dismissed === true);
  const isCompleted = computed(
    () => step.value === 'done' || typeof checkpoint.value?.completedAt === 'number'
  );
  const outcomes = computed(() => checkpoint.value?.outcomes ?? {});
  const tarkovDevImportedModes = computed<GameMode[]>(() =>
    Array.isArray(checkpoint.value?.tarkovDevImportedModes)
      ? checkpoint.value.tarkovDevImportedModes.filter(isGameMode)
      : []
  );
  const editionResolvedByImport = computed(
    () => checkpoint.value?.editionResolvedByImport === true
  );
  const importProfileVisited = computed(
    () =>
      checkpoint.value?.importProfileVisited === true ||
      (path.value === 'import' && step.value === 'profile')
  );
  const needsProfileFallback = computed(() => {
    if (path.value !== 'import') return false;
    if (importProfileVisited.value) return true;
    if (tarkovDevImportedModes.value.length > 0) return false;
    return outcomes.value['tarkov-dev'] === 'skipped' || outcomes.value['tarkov-dev'] === 'failed';
  });
  const visibleSteps = computed<readonly SetupStep[]>(() => {
    if (path.value === 'backup') return BACKUP_STEPS;
    if (path.value === 'manual') return ['start', 'profile', 'eft-logs', 'catch-up', 'done'];
    return [
      'start',
      'tarkov-dev',
      ...(needsProfileFallback.value ? (['profile'] as const) : []),
      'eft-logs',
      'catch-up',
      'done',
    ];
  });
  const stepIndex = computed(() => {
    const idx = visibleSteps.value.indexOf(step.value);
    return idx >= 0 ? idx : 0;
  });
  const previousStep = computed<SetupStep>(
    () => visibleSteps.value[stepIndex.value - 1] ?? 'start'
  );
  const nextStep = computed<SetupStep>(() => visibleSteps.value[stepIndex.value + 1] ?? 'done');
  function writeCheckpoint(patch: Partial<Checkpoint>) {
    checkpoint.value = {
      path: path.value,
      step: step.value,
      outcomes: { ...outcomes.value },
      tarkovDevImportedModes: [...tarkovDevImportedModes.value],
      editionResolvedByImport: editionResolvedByImport.value,
      importProfileVisited: importProfileVisited.value,
      completedAt: checkpoint.value?.completedAt,
      dismissed: dismissed.value,
      ...patch,
    };
  }
  function selectPath(nextPath: SetupPath) {
    const firstStep: Record<SetupPath, SetupStep> = {
      import: 'tarkov-dev',
      manual: 'profile',
      backup: 'backup',
    };
    writeCheckpoint({
      path: nextPath,
      step: firstStep[nextPath],
      dismissed: false,
    });
  }
  function mergeStepOutcome(source: SetupStep, outcome?: SetupOutcome) {
    const updated = { ...outcomes.value };
    if (outcome && isSetupImportStep(source) && updated[source] !== 'imported') {
      updated[source] = outcome;
    }
    return updated;
  }
  function shouldFallbackToProfile(source: SetupStep, outcome?: SetupOutcome) {
    const isSkippedProfile = outcome === 'skipped' || outcome === 'failed';
    return (
      path.value === 'import' &&
      source === 'tarkov-dev' &&
      tarkovDevImportedModes.value.length === 0 &&
      isSkippedProfile
    );
  }
  function go(next: SetupStep, outcome?: SetupOutcome) {
    const nextPath = setupPathForStep(path.value, next);
    writeCheckpoint({
      path: nextPath,
      step: next,
      importProfileVisited:
        importProfileVisited.value || (nextPath === 'import' && next === 'profile'),
      outcomes: mergeStepOutcome(step.value, outcome),
      completedAt: next === 'done' ? Date.now() : checkpoint.value?.completedAt,
    });
  }
  function goNext(outcome?: SetupOutcome) {
    const source = step.value;
    const target = shouldFallbackToProfile(source, outcome) ? 'profile' : nextStep.value;
    go(target, outcome);
  }
  function goBack() {
    go(previousStep.value);
  }
  function remember(outcome: SetupOutcome) {
    go(step.value, outcome);
  }
  function recordTarkovDevImport(modes: GameMode | GameMode[], editionResolved: boolean) {
    const incoming = Array.isArray(modes) ? modes : [modes];
    const nextModes = [...tarkovDevImportedModes.value];
    for (const mode of incoming) {
      if (!nextModes.includes(mode)) nextModes.push(mode);
    }
    const updated = { ...outcomes.value, 'tarkov-dev': 'imported' as const };
    writeCheckpoint({
      outcomes: updated,
      tarkovDevImportedModes: nextModes,
      editionResolvedByImport: editionResolvedByImport.value || editionResolved,
    });
  }
  function dismiss() {
    writeCheckpoint({ dismissed: true });
  }
  function restart() {
    checkpoint.value = { ...DEFAULT_CHECKPOINT, outcomes: {}, tarkovDevImportedModes: [] };
  }
  return {
    path,
    step,
    visibleSteps,
    stepIndex,
    previousStep,
    nextStep,
    outcomes,
    tarkovDevImportedModes,
    editionResolvedByImport,
    isCompleted,
    dismissed,
    selectPath,
    go,
    goNext,
    goBack,
    remember,
    recordTarkovDevImport,
    dismiss,
    restart,
  };
}
