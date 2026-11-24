<template>
  <div class="mx-auto w-full max-w-4xl min-w-0 space-y-5 px-4 py-6 sm:px-6 sm:py-8">
    <header class="space-y-2">
      <h1 class="text-surface-50 text-2xl font-bold sm:text-3xl">{{ $t('setup.title') }}</h1>
      <p class="text-surface-400 text-sm">{{ $t('setup.entry_description') }}</p>
      <p v-if="step !== 'start'" class="text-surface-400 flex items-center gap-2 text-sm">
        <GameModeBadge :mode="mode" />
        {{ $t('setup.working_mode', { mode: $t(getGameModeLabel(mode)) }) }}
      </p>
    </header>
    <section class="space-y-4" aria-labelledby="setup-step-heading">
      <h2
        id="setup-step-heading"
        ref="stepHeading"
        tabindex="-1"
        class="text-surface-100 text-lg font-semibold"
      >
        {{ $t(`setup.steps.${step.replaceAll('-', '_')}`) }}
      </h2>
      <SetupStart v-if="step === 'start'" :mode="mode" @select="go" />
      <template v-else-if="importStep">
        <p class="text-surface-400 text-sm">
          {{ $t(`setup.source_help.${importStep.replaceAll('-', '_')}`) }}
        </p>
        <DataManagementCard
          :key="importStep"
          :session="session"
          :view="importStep"
          :restore-only="true"
        />
        <div class="flex flex-wrap items-center gap-2">
          <UButton color="neutral" variant="ghost" :disabled="importBusy" @click="go(previousStep)">
            {{ $t('setup.back') }}
          </UButton>
          <UButton :disabled="importBusy" @click="advanceImport">
            {{
              $t(
                sourceImported ? 'setup.continue' : `setup.skip.${importStep.replaceAll('-', '_')}`
              )
            }}
          </UButton>
        </div>
      </template>
      <template v-else-if="step === 'review'">
        <SetupManualReview
          :key="mode"
          @busy="manualBusy = $event"
          @dirty="manualDirty = $event"
          @saved="manualSaved = true"
          @finish-after-failure="go('done')"
        />
        <p v-if="manualDirty" class="text-surface-400 text-sm">{{ $t('setup.draft_pending') }}</p>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="manualBlocked"
            @click="go('tarkov-dev')"
          >
            {{ $t('setup.back') }}
          </UButton>
          <UButton variant="soft" :disabled="manualBlocked" @click="go('done')">
            {{ $t(manualSaved ? 'setup.finish' : 'setup.finish_later') }}
          </UButton>
        </div>
      </template>
      <template v-else>
        <dl class="border-surface-700 divide-surface-700 divide-y rounded-lg border px-4">
          <div
            v-for="source in setupImportSteps"
            :key="source"
            class="flex flex-wrap justify-between gap-2 py-3 text-sm"
          >
            <dt>{{ $t(`setup.steps.${source.replaceAll('-', '_')}`) }}</dt>
            <dd class="text-surface-400">
              {{ $t(`setup.outcome.${outcomes[source] ?? 'skipped'}`) }}
            </dd>
          </div>
        </dl>
        <p class="text-surface-400 text-sm">{{ $t('setup.summary_help') }}</p>
        <div class="flex flex-wrap gap-2">
          <UButton to="/" icon="i-mdi-view-dashboard-outline">
            {{ $t('setup.open_dashboard') }}
          </UButton>
          <UButton to="/tasks" variant="soft">{{ $t('common.tasks') }}</UButton>
          <UButton to="/hideout" variant="soft">{{ $t('setup.hideout_title') }}</UButton>
          <UButton to="/storyline" variant="soft">{{ $t('setup.review_storyline') }}</UButton>
          <UButton to="/needed-items" variant="soft">{{ $t('setup.review_items') }}</UButton>
          <UButton to="/resources/tarkovmonitor" variant="soft">
            {{ $t('setup.connect_monitor') }}
          </UButton>
          <UButton color="neutral" variant="ghost" @click="restartSetup">
            {{ $t('setup.restart') }}
          </UButton>
        </div>
      </template>
    </section>
  </div>
</template>
<script setup lang="ts">
  import GameModeBadge from '@/components/GameModeBadge.vue';
  import { useGameModeSwitchLock } from '@/composables/useGameModeSwitch';
  import DataManagementCard from '@/features/settings/DataManagementCard.vue';
  import { useDataManagementSession } from '@/features/settings/useDataManagementSession';
  import SetupManualReview from '@/features/setup/SetupManualReview.vue';
  import SetupStart from '@/features/setup/SetupStart.vue';
  import {
    isSetupImportStep,
    setupImportSteps,
    setupSteps,
    useSetupCheckpoint,
  } from '@/features/setup/useSetupCheckpoint';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { getGameModeLabel } from '@/utils/constants';
  const tarkov = useTarkovStore();
  const mode = computed(() => tarkov.getCurrentGameMode());
  const manualBusy = ref(false);
  const manualDirty = ref(false);
  const manualSaved = ref(false);
  const manualBlocked = computed(() => manualBusy.value || manualDirty.value);
  const { step, outcomes, go, remember, restart } = useSetupCheckpoint();
  const session = useDataManagementSession();
  const stepHeading = useTemplateRef<HTMLElement>('stepHeading');
  const importStep = computed(() => (isSetupImportStep(step.value) ? step.value : null));
  const importStates = {
    backup: session.backup.importState,
    'eft-logs': session.eftLogs.importState,
    'tarkov-dev': session.tarkovDev.importState,
  };
  const importState = computed(() =>
    importStep.value ? importStates[importStep.value].value : 'idle'
  );
  const sourceImported = computed(() =>
    Boolean(importStep.value && outcomes.value[importStep.value] === 'imported')
  );
  const isApplying = computed(
    () => session.eftLogs.isImporting.value || session.tarkovDev.isImporting.value
  );
  const modeSwitchLocked = useGameModeSwitchLock();
  watchEffect(
    () => {
      modeSwitchLocked.value = manualBlocked.value || isApplying.value;
    },
    { flush: 'sync' }
  );
  onScopeDispose(() => {
    modeSwitchLocked.value = false;
  });
  const importBusy = computed(
    () =>
      isApplying.value ||
      session.eftLogs.isParsing.value ||
      ['loading', 'parsing', 'preview'].includes(importState.value)
  );
  const stepIndex = computed(() => setupSteps.indexOf(step.value));
  const previousStep = computed(() => setupSteps[stepIndex.value - 1] ?? 'start');
  const importOutcomes = {
    success: 'imported',
    error: 'failed',
    idle: 'skipped',
  } as const;
  const canAdvanceImport = computed(() => importStep.value && !importBusy.value);
  function advanceImport() {
    if (!canAdvanceImport.value) return;
    const outcome = importOutcomes[importState.value as keyof typeof importOutcomes] ?? 'skipped';
    go(setupSteps[stepIndex.value + 1] ?? 'review', outcome);
  }
  function restartSetup() {
    session.backup.resetImport();
    session.eftLogs.reset();
    session.tarkovDev.reset();
    manualSaved.value = false;
    restart();
  }
  watch(importState, (state) => {
    if (state === 'success') remember('imported');
  });
  watch(
    step,
    () => {
      manualDirty.value = false;
      stepHeading.value?.focus();
    },
    { flush: 'post' }
  );
  watch(mode, () => {
    manualSaved.value = false;
  });
  onBeforeRouteLeave(
    () =>
      !isApplying.value && !manualBlocked.value && session.backup.importState.value !== 'parsing'
  );
</script>
