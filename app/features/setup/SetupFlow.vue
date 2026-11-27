<template>
  <div class="mx-auto w-full max-w-4xl min-w-0 space-y-5 px-4 py-6 sm:px-6 sm:py-8">
    <PageHeader :title="$t('setup.title')" :description="$t('setup.entry_description')">
      <template v-if="showHeaderModeBadge" #actions>
        <div
          class="bg-surface-900/90 inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs"
        >
          <GameModeBadge :mode="mode" class="-my-1.5" />
          <span class="text-surface-200 font-medium">
            {{ $t('setup.working_mode', { mode: $t(getGameModeLabel(mode)) }) }}
          </span>
        </div>
      </template>
    </PageHeader>
    <SetupStepper
      v-if="step !== 'start'"
      :steps="visibleSteps"
      :current-step="step"
      :disabled="stepperDisabled"
      @select="go"
    />
    <section class="space-y-4" aria-labelledby="setup-step-heading">
      <div class="space-y-1">
        <h2
          id="setup-step-heading"
          ref="stepHeading"
          tabindex="-1"
          class="text-surface-50 text-lg font-semibold focus:outline-none"
        >
          {{ $t(`setup.steps.${step.replaceAll('-', '_')}`) }}
        </h2>
        <p v-if="stepSubtitle" class="text-surface-400 text-sm">{{ stepSubtitle }}</p>
      </div>
      <SetupStart v-if="step === 'start'" @select="selectPath" />
      <SetupProfileStep
        v-else-if="step === 'profile'"
        @back="goBack"
        @continue="go('eft-logs')"
        @finish="go('done')"
      />
      <SetupImportStep
        v-else-if="importStep"
        :view="importStep"
        :session="session"
        :mode="mode"
        :tarkov-dev-imported-count="tarkovDevImportedModes.length"
        :edition-resolved-by-import="editionResolvedByImport"
        :source-imported="sourceImported"
        :preview-visible="isImportPreviewVisible"
        :busy="importBusy"
        :primary-label="importPrimaryLabel"
        @back="goBack"
        @advance="advanceImport"
        @finish-from-logs="finishFromLogs"
        @edit-profile="go('profile')"
        @tarkov-dev-imported="handleTarkovDevImported"
      />
      <template v-else-if="step === 'catch-up'">
        <SetupManualReview
          :key="mode"
          @busy="manualBusy = $event"
          @dirty="manualDirty = $event"
          @saved="manualSaved = true"
          @finish-after-failure="go('done')"
        />
        <p v-if="manualDirty" class="text-surface-400 text-xs">{{ $t('setup.draft_pending') }}</p>
        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-4">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-mdi-arrow-left"
            :disabled="manualBlocked"
            @click="goBack"
          >
            {{ $t('setup.back') }}
          </UButton>
          <UButton
            color="primary"
            variant="solid"
            trailing-icon="i-mdi-arrow-right"
            :disabled="manualBlocked"
            @click="go('done')"
          >
            {{ catchUpFinishLabel }}
          </UButton>
        </div>
      </template>
      <SetupReadySummary v-else @jump-to="go" @restart="restartSetup" />
    </section>
    <UModal
      v-model:open="leaveConfirmOpen"
      :title="$t('setup.leave_unsaved_title')"
      :description="$t('setup.leave_unsaved_description')"
    >
      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="cancelPendingLeave">
            {{ $t('setup.stay_on_setup') }}
          </UButton>
          <UButton color="warning" variant="solid" @click="confirmPendingLeave">
            {{ $t('setup.discard_and_leave') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
<script setup lang="ts">
  import GameModeBadge from '@/components/GameModeBadge.vue';
  import PageHeader from '@/components/ui/PageHeader.vue';
  import { useGameModeSwitch, useGameModeSwitchLock } from '@/composables/useGameModeSwitch';
  import { useDataManagementSession } from '@/features/settings/useDataManagementSession';
  import SetupImportStep from '@/features/setup/SetupImportStep.vue';
  import SetupManualReview from '@/features/setup/SetupManualReview.vue';
  import SetupProfileStep from '@/features/setup/SetupProfileStep.vue';
  import SetupReadySummary from '@/features/setup/SetupReadySummary.vue';
  import SetupStart from '@/features/setup/SetupStart.vue';
  import SetupStepper from '@/features/setup/SetupStepper.vue';
  import { isSetupImportStep, useSetupCheckpoint } from '@/features/setup/useSetupCheckpoint';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { getGameModeLabel, type GameMode } from '@/utils/constants';
  const { t } = useI18n({ useScope: 'global' });
  const router = useRouter();
  const toast = useToast();
  const tarkov = useTarkovStore();
  const { switchMode } = useGameModeSwitch();
  const mode = computed(() => tarkov.getCurrentGameMode());
  const manualBusy = ref(false);
  const manualDirty = ref(false);
  const manualSaved = ref(false);
  const leaveConfirmOpen = ref(false);
  const pendingLeavePath = ref<string | null>(null);
  const allowRouteLeave = ref(false);
  const manualBlocked = computed(() => manualBusy.value || manualDirty.value);
  const {
    step,
    visibleSteps,
    outcomes,
    tarkovDevImportedModes,
    editionResolvedByImport,
    selectPath,
    go,
    goNext,
    goBack,
    remember,
    recordTarkovDevImport,
    restart,
  } = useSetupCheckpoint();
  const session = useDataManagementSession();
  const stepHeading = useTemplateRef<HTMLElement>('stepHeading');
  const importStep = computed(() => (isSetupImportStep(step.value) ? step.value : null));
  const showHeaderModeBadge = computed(
    () => step.value === 'eft-logs' || step.value === 'catch-up'
  );
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
  const isImportPreviewVisible = computed(
    () =>
      importState.value === 'preview' ||
      importState.value === 'parsing' ||
      session.eftLogs.isParsing.value
  );
  const importBusy = computed(
    () =>
      isApplying.value ||
      session.eftLogs.isParsing.value ||
      ['loading', 'parsing', 'preview'].includes(importState.value)
  );
  const hasBusyWork = computed(
    () =>
      isApplying.value ||
      manualBusy.value ||
      session.backup.importState.value === 'parsing' ||
      session.eftLogs.isParsing.value
  );
  const stepperDisabled = computed(() => importBusy.value || manualBlocked.value);
  const stepSubtitle = computed(() => {
    if (importStep.value) return t(`setup.source_help.${importStep.value.replaceAll('-', '_')}`);
    if (step.value === 'profile') return t('setup.profile.subtitle');
    if (step.value === 'catch-up') return t('setup.catch_up_subtitle');
    return '';
  });
  const importPrimaryLabel = computed(() => {
    if (!importStep.value || sourceImported.value) return t('setup.continue');
    return t(`setup.skip.${importStep.value.replaceAll('-', '_')}`);
  });
  const catchUpFinishLabel = computed(() =>
    t(manualSaved.value ? 'setup.finish' : 'setup.finish_later')
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
  const importOutcomes = {
    success: 'imported',
    error: 'failed',
    idle: 'skipped',
  } as const;
  function currentImportOutcome() {
    if (sourceImported.value) return 'imported' as const;
    return importOutcomes[importState.value as keyof typeof importOutcomes] ?? 'skipped';
  }
  function advanceImport() {
    if (!importStep.value || importBusy.value) return;
    goNext(currentImportOutcome());
  }
  function finishFromLogs() {
    if (importBusy.value) return;
    go('done', currentImportOutcome());
  }
  function handleTarkovDevImported(payload: {
    mode: GameMode;
    modes?: GameMode[];
    editionResolved: boolean;
  }) {
    const isFirstImport = tarkovDevImportedModes.value.length === 0;
    recordTarkovDevImport(payload.modes ?? payload.mode, payload.editionResolved);
    if (isFirstImport && tarkov.getCurrentGameMode() !== payload.mode) {
      void switchMode(payload.mode);
    }
  }
  function restartSetup() {
    session.backup.resetImport();
    session.eftLogs.reset();
    session.tarkovDev.reset();
    manualSaved.value = false;
    restart();
  }
  function cancelPendingLeave() {
    leaveConfirmOpen.value = false;
    pendingLeavePath.value = null;
  }
  function confirmPendingLeave() {
    const target = pendingLeavePath.value;
    leaveConfirmOpen.value = false;
    pendingLeavePath.value = null;
    manualDirty.value = false;
    if (!target) return;
    allowRouteLeave.value = true;
    void router.push(target);
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
  function guardRouteLeave(targetPath: string) {
    if (allowRouteLeave.value) {
      allowRouteLeave.value = false;
      return true;
    }
    if (hasBusyWork.value) {
      toast.add({ title: t('setup.leave_busy_notice'), color: 'warning' });
      return false;
    }
    if (manualDirty.value) {
      pendingLeavePath.value = targetPath;
      leaveConfirmOpen.value = true;
      return false;
    }
    return true;
  }
  onBeforeRouteLeave((to) => guardRouteLeave(to.fullPath));
</script>
