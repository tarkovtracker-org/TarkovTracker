<template>
  <div class="space-y-2">
    <p class="text-foreground-muted text-xs font-semibold tracking-wider uppercase">
      {{ $t('settings.data_management.reset_title') }}
    </p>
    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <UButton
        icon="i-mdi-trophy-variant"
        block
        :disabled="!canPrestige"
        :ui="{
          base: 'bg-warning-900 hover:bg-warning-800 active:bg-warning-700 text-warning-200 focus-visible:ring focus-visible:ring-warning-500 disabled:bg-field disabled:text-foreground-disabled disabled:hover:bg-field',
        }"
        @click="showPrestigePvPDialog = true"
      >
        {{ $t('settings.data_management.prestige_pvp_data') }}
      </UButton>
      <UButton
        icon="i-mdi-shield-sword"
        block
        :ui="{
          base: 'bg-pvp-900 hover:bg-pvp-800 active:bg-pvp-700 text-pvp-200 focus-visible:ring focus-visible:ring-pvp-500',
        }"
        @click="showResetPvPDialog = true"
      >
        {{ $t('settings.data_management.reset_pvp_data') }}
      </UButton>
      <UButton
        icon="i-mdi-account-group"
        block
        :ui="{
          base: 'bg-pve-900 hover:bg-pve-800 active:bg-pve-700 text-pve-200 focus-visible:ring focus-visible:ring-pve-500',
        }"
        @click="showResetPvEDialog = true"
      >
        {{ $t('settings.data_management.reset_pve_data') }}
      </UButton>
      <UButton
        color="error"
        variant="soft"
        icon="i-mdi-delete-sweep"
        block
        @click="showResetAllDialog = true"
      >
        {{ $t('settings.data_management.reset_all_data') }}
      </UButton>
    </div>
    <p v-if="!canPrestige" class="text-foreground-muted text-xs">
      {{ prestigeDisabledDescription }}
    </p>
  </div>
  <div class="space-y-2">
    <p class="text-foreground-muted text-xs font-semibold tracking-wider uppercase">
      {{ $t('settings.data_management.prestige_history_title') }}
    </p>
    <div class="bg-panel border-border space-y-3 rounded-md border p-3">
      <p class="text-foreground-muted text-xs">
        {{ $t('settings.data_management.prestige_history_description') }}
      </p>
      <UAlert
        v-if="historyError"
        icon="i-mdi-alert-circle"
        color="error"
        variant="soft"
        :title="historyError"
      />
      <UAlert
        v-else-if="historyLoading"
        icon="i-mdi-loading"
        color="info"
        variant="soft"
        :title="$t('settings.data_management.prestige_history_loading')"
      />
      <p v-else-if="prestigeRuns.length === 0" class="text-foreground-muted text-sm">
        {{ prestigeHistoryEmptyDescription }}
      </p>
      <template v-else>
        <div class="space-y-1">
          <p class="text-foreground text-xs font-semibold uppercase">
            {{ $t('settings.data_management.prestige_history_select') }}
          </p>
          <SelectMenuFixed
            v-model="selectedPrestigeRunId"
            :items="prestigeRunOptions"
            value-key="value"
          >
            <template #leading>
              <UIcon name="i-mdi-history" class="text-foreground-muted h-4 w-4" />
            </template>
          </SelectMenuFixed>
        </div>
        <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="row in selectedRunSummaryRows"
            :key="row.id"
            class="bg-shell border-border-muted rounded-md border p-2.5"
          >
            <p class="text-foreground-muted text-[11px] font-semibold uppercase">
              {{ row.label }}
            </p>
            <p class="text-foreground mt-0.5 text-sm font-semibold">
              {{ row.value }}
            </p>
          </div>
        </div>
        <div
          v-if="comparisonRows.length > 0"
          class="bg-shell border-border-muted space-y-2 rounded-md border p-3"
        >
          <p class="text-foreground text-xs font-semibold uppercase">
            {{ $t('settings.data_management.prestige_history_compare_title') }}
          </p>
          <p class="text-foreground-muted text-xs">
            {{
              $t('settings.data_management.prestige_history_compare_subtitle', {
                from: selectedPrestigeRun?.prestigeTo ?? 0,
                to: previousPrestigeRun?.prestigeTo ?? 0,
              })
            }}
          </p>
          <div class="grid gap-2 sm:grid-cols-2">
            <div
              v-for="row in comparisonRows"
              :key="row.id"
              class="bg-panel border-border flex items-center justify-between rounded-md border px-2.5 py-2"
            >
              <span class="text-foreground text-xs">{{ row.label }}</span>
              <span
                class="text-xs font-semibold"
                :class="row.delta >= 0 ? 'text-success-600' : 'text-warning-700'"
              >
                {{ formatSignedDelta(row.delta) }}
              </span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
  <UModal v-model:open="showPrestigePvPDialog" @close="prestigeConfirmText = ''">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-mdi-trophy" class="text-warning-400 h-5 w-5" />
        <h3 class="text-lg font-semibold">
          {{ $t('settings.data_management.prestige_pvp_title') }}
        </h3>
      </div>
    </template>
    <template #body>
      <div class="space-y-4">
        <UAlert
          icon="i-mdi-alert"
          color="warning"
          variant="subtle"
          class="text-warning-800 [&_[data-slot=description]]:text-warning-700 [&_[data-slot=icon]]:text-warning-600 [&_[data-slot=title]]:text-warning-800"
          :title="$t('settings.data_management.prestige_pvp_confirmation')"
        />
        <p class="text-foreground text-sm">
          {{ $t('settings.data_management.prestige_pvp_warning') }}
        </p>
        <div class="space-y-2">
          <p class="text-foreground text-sm font-medium">
            <i18n-t keypath="settings.prestige.confirm_instruction" tag="span">
              <template #word>
                <strong class="text-warning-700">
                  {{ $t('settings.prestige.confirm_word') }}
                </strong>
              </template>
            </i18n-t>
          </p>
          <UInput
            v-model="prestigeConfirmText"
            :placeholder="$t('settings.prestige.confirm_word')"
            class="font-mono"
          />
        </div>
      </div>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full items-center gap-3">
        <UButton
          color="neutral"
          variant="soft"
          class="min-w-26 justify-center text-center"
          @click="close"
        >
          {{ $t('settings.data_management.reset_cancel') }}
        </UButton>
        <UButton
          color="warning"
          variant="solid"
          class="ml-auto min-w-30 justify-center text-center"
          :loading="resetting"
          :disabled="!canPrestige || prestigeConfirmText !== $t('settings.prestige.confirm_word')"
          @click="prestigePvPData"
        >
          {{ $t('settings.data_management.prestige_pvp_data') }}
        </UButton>
      </div>
    </template>
  </UModal>
  <!-- PvP Reset Modal -->
  <UModal v-model:open="showResetPvPDialog">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-mdi-alert" class="text-pvp-400 h-5 w-5" />
        <h3 class="text-lg font-semibold">
          {{ $t('settings.data_management.reset_pvp_title') }}
        </h3>
      </div>
    </template>
    <template #body>
      <div class="space-y-3">
        <UAlert
          icon="i-mdi-alert"
          color="pvp"
          variant="subtle"
          class="text-pvp-800 [&_[data-slot=description]]:text-pvp-700 [&_[data-slot=icon]]:text-pvp-600 [&_[data-slot=title]]:text-pvp-800"
          :title="$t('settings.data_management.reset_pvp_confirmation')"
        />
        <p class="text-foreground text-sm">
          {{ $t('settings.data_management.reset_pvp_warning') }}
        </p>
      </div>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full items-center gap-3">
        <UButton
          color="neutral"
          variant="soft"
          class="min-w-26 justify-center text-center"
          @click="close"
        >
          {{ $t('settings.data_management.reset_cancel') }}
        </UButton>
        <UButton
          color="error"
          variant="solid"
          class="ml-auto min-w-30 justify-center text-center"
          :loading="resetting"
          @click="resetPvPData"
        >
          {{ $t('settings.data_management.reset_confirm') }}
        </UButton>
      </div>
    </template>
  </UModal>
  <!-- PvE Reset Modal -->
  <UModal v-model:open="showResetPvEDialog">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-mdi-alert" class="text-pve-400 h-5 w-5" />
        <h3 class="text-lg font-semibold">
          {{ $t('settings.data_management.reset_pve_title') }}
        </h3>
      </div>
    </template>
    <template #body>
      <div class="space-y-3">
        <UAlert
          icon="i-mdi-alert"
          color="pve"
          variant="subtle"
          class="text-pve-800 [&_[data-slot=description]]:text-pve-700 [&_[data-slot=icon]]:text-pve-600 [&_[data-slot=title]]:text-pve-800"
          :title="$t('settings.data_management.reset_pve_confirmation')"
        />
        <p class="text-foreground text-sm">
          {{ $t('settings.data_management.reset_pve_warning') }}
        </p>
      </div>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full items-center gap-3">
        <UButton
          color="neutral"
          variant="soft"
          class="min-w-26 justify-center text-center"
          @click="close"
        >
          {{ $t('settings.data_management.reset_cancel') }}
        </UButton>
        <UButton
          color="error"
          variant="solid"
          class="ml-auto min-w-30 justify-center text-center"
          :loading="resetting"
          @click="resetPvEData"
        >
          {{ $t('settings.data_management.reset_confirm') }}
        </UButton>
      </div>
    </template>
  </UModal>
  <!-- Reset All Modal -->
  <UModal v-model:open="showResetAllDialog" @close="resetAllConfirmText = ''">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-mdi-alert-octagon" class="text-error-400 h-5 w-5" />
        <h3 class="text-lg font-semibold">
          {{ $t('settings.data_management.reset_all_title') }}
        </h3>
      </div>
    </template>
    <template #body>
      <div class="space-y-4">
        <UAlert
          icon="i-mdi-alert-octagon"
          color="error"
          variant="subtle"
          class="text-error-800 [&_[data-slot=description]]:text-error-700 [&_[data-slot=icon]]:text-error-600 [&_[data-slot=title]]:text-error-800"
          :title="$t('settings.data_management.reset_all_confirmation')"
        />
        <p class="text-foreground text-sm">
          {{ $t('settings.data_management.reset_all_warning') }}
        </p>
        <div class="space-y-2">
          <p class="text-foreground text-sm font-medium">
            <i18n-t keypath="settings.danger_zone.confirm_delete_instruction" tag="span">
              <template #word>
                <strong class="text-error-700">
                  {{ $t('settings.danger_zone.confirm_word') }}
                </strong>
              </template>
            </i18n-t>
          </p>
          <UInput
            v-model="resetAllConfirmText"
            :placeholder="$t('settings.danger_zone.confirm_word')"
            class="font-mono"
          />
        </div>
      </div>
    </template>
    <template #footer="{ close }">
      <div class="flex w-full items-center gap-3">
        <UButton
          color="neutral"
          variant="soft"
          class="min-w-26 justify-center text-center"
          @click="close"
        >
          {{ $t('settings.data_management.reset_cancel') }}
        </UButton>
        <UButton
          color="error"
          variant="solid"
          class="ml-auto min-w-30 justify-center text-center"
          :loading="resetting"
          :disabled="resetAllConfirmText !== $t('settings.danger_zone.confirm_word')"
          @click="resetAllData"
        >
          {{ $t('settings.data_management.reset_confirm') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
<script setup lang="ts">
  import { type PrestigeRunRecord, useTarkovStore } from '@/stores/useTarkov';
  import { logger } from '@/utils/logger';
  type HistoryComparisonRow = {
    delta: number;
    id: string;
    label: string;
  };
  type HistorySummaryRow = {
    id: string;
    label: string;
    value: string;
  };
  const DAY_MS = 24 * 60 * 60 * 1000;
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const { $supabase } = useNuxtApp();
  const tarkovStore = useTarkovStore();
  const resetting = ref(false);
  const historyLoading = ref(false);
  const historyError = ref('');
  const prestigeRuns = ref<PrestigeRunRecord[]>([]);
  const selectedPrestigeRunId = ref<string | null>(null);
  const showPrestigePvPDialog = ref(false);
  const showResetPvPDialog = ref(false);
  const showResetPvEDialog = ref(false);
  const showResetAllDialog = ref(false);
  const prestigeConfirmText = ref('');
  const resetAllConfirmText = ref('');
  const isLoggedIn = computed(() => Boolean($supabase?.user?.loggedIn && $supabase?.user?.id));
  const isPveMode = computed(() => tarkovStore.getCurrentGameMode() === 'pve');
  const currentPrestigeLevel = computed(() => tarkovStore.getPvPProgressData().prestigeLevel ?? 0);
  const canPrestige = computed(
    () => isLoggedIn.value && !isPveMode.value && currentPrestigeLevel.value < 6
  );
  const prestigeDisabledDescription = computed(() => {
    if (!isLoggedIn.value) {
      return t('settings.prestige.login_required');
    }
    if (isPveMode.value) {
      return t('settings.prestige.pvp_only');
    }
    if (currentPrestigeLevel.value >= 6) {
      return t('settings.prestige.max_reached');
    }
    return '';
  });
  const prestigeHistoryEmptyDescription = computed(() => {
    if (!isLoggedIn.value) {
      return t('settings.prestige.login_required');
    }
    return t('settings.data_management.prestige_history_empty');
  });
  const historyDateFormatter = computed(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
  );
  const formatHistoryDate = (iso: string): string => {
    const parsed = Date.parse(iso);
    if (Number.isNaN(parsed)) {
      return t('settings.data_management.prestige_history_unknown_date');
    }
    return historyDateFormatter.value.format(parsed);
  };
  const formatSignedDelta = (value: number): string => {
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${value}`;
  };
  const formatDurationDays = (
    firstActionAt: number | null,
    lastActionAt: number | null
  ): string => {
    if (
      typeof firstActionAt !== 'number' ||
      typeof lastActionAt !== 'number' ||
      !Number.isFinite(firstActionAt) ||
      !Number.isFinite(lastActionAt) ||
      lastActionAt < firstActionAt
    ) {
      return t('settings.data_management.prestige_history_unknown_duration');
    }
    const days = Math.max(1, Math.ceil((lastActionAt - firstActionAt) / DAY_MS));
    return t('settings.data_management.prestige_history_days_value', { days });
  };
  const prestigeRunOptions = computed(() =>
    prestigeRuns.value.map((run) => ({
      label: t('settings.data_management.prestige_history_option', {
        from: run.prestigeFrom,
        to: run.prestigeTo,
        when: formatHistoryDate(run.createdAt),
      }),
      value: run.id,
    }))
  );
  const selectedPrestigeRun = computed<PrestigeRunRecord | null>(() => {
    if (!prestigeRuns.value.length) {
      return null;
    }
    if (!selectedPrestigeRunId.value) {
      return prestigeRuns.value[0] ?? null;
    }
    return (
      prestigeRuns.value.find((run) => run.id === selectedPrestigeRunId.value) ??
      prestigeRuns.value[0] ??
      null
    );
  });
  const selectedPrestigeRunIndex = computed(() => {
    if (!selectedPrestigeRun.value) return -1;
    return prestigeRuns.value.findIndex((run) => run.id === selectedPrestigeRun.value?.id);
  });
  const previousPrestigeRun = computed<PrestigeRunRecord | null>(() => {
    if (selectedPrestigeRunIndex.value < 0) return null;
    return prestigeRuns.value[selectedPrestigeRunIndex.value + 1] ?? null;
  });
  const selectedRunSummaryRows = computed<HistorySummaryRow[]>(() => {
    if (!selectedPrestigeRun.value) return [];
    const { summary } = selectedPrestigeRun.value;
    return [
      {
        id: 'level',
        label: t('settings.data_management.prestige_history_level'),
        value: String(summary.level),
      },
      {
        id: 'tasks',
        label: t('settings.data_management.prestige_history_completed_tasks'),
        value: String(summary.completedTasks),
      },
      {
        id: 'objectives',
        label: t('settings.data_management.prestige_history_completed_objectives'),
        value: String(summary.completedObjectives),
      },
      {
        id: 'hideout_modules',
        label: t('settings.data_management.prestige_history_completed_hideout_modules'),
        value: String(summary.completedHideoutModules),
      },
      {
        id: 'story_chapters',
        label: t('settings.data_management.prestige_history_completed_story_chapters'),
        value: String(summary.completedStoryChapters),
      },
      {
        id: 'duration',
        label: t('settings.data_management.prestige_history_duration'),
        value: formatDurationDays(summary.firstActionAt, summary.lastActionAt),
      },
    ];
  });
  const comparisonRows = computed<HistoryComparisonRow[]>(() => {
    if (!selectedPrestigeRun.value || !previousPrestigeRun.value) {
      return [];
    }
    const currentSummary = selectedPrestigeRun.value.summary;
    const previousSummary = previousPrestigeRun.value.summary;
    return [
      {
        id: 'tasks',
        label: t('settings.data_management.prestige_history_completed_tasks'),
        delta: currentSummary.completedTasks - previousSummary.completedTasks,
      },
      {
        id: 'objectives',
        label: t('settings.data_management.prestige_history_completed_objectives'),
        delta: currentSummary.completedObjectives - previousSummary.completedObjectives,
      },
      {
        id: 'hideout_modules',
        label: t('settings.data_management.prestige_history_completed_hideout_modules'),
        delta: currentSummary.completedHideoutModules - previousSummary.completedHideoutModules,
      },
      {
        id: 'story_chapters',
        label: t('settings.data_management.prestige_history_completed_story_chapters'),
        delta: currentSummary.completedStoryChapters - previousSummary.completedStoryChapters,
      },
      {
        id: 'failed_tasks',
        label: t('settings.data_management.prestige_history_failed_tasks'),
        delta: currentSummary.failedTasks - previousSummary.failedTasks,
      },
      {
        id: 'level',
        label: t('settings.data_management.prestige_history_level'),
        delta: currentSummary.level - previousSummary.level,
      },
    ];
  });
  let prestigeHistoryRequestId = 0;
  const clearPrestigeHistory = () => {
    historyError.value = '';
    historyLoading.value = false;
    prestigeRuns.value = [];
    selectedPrestigeRunId.value = null;
  };
  const loadPrestigeHistory = async () => {
    const userId = $supabase?.user?.id;
    if (!$supabase?.user?.loggedIn || !userId) {
      clearPrestigeHistory();
      return;
    }
    const requestId = ++prestigeHistoryRequestId;
    historyError.value = '';
    historyLoading.value = true;
    try {
      const runs = await tarkovStore.fetchPrestigeRuns('pvp', 20);
      if (
        requestId !== prestigeHistoryRequestId ||
        !$supabase?.user?.loggedIn ||
        $supabase.user.id !== userId
      ) {
        return;
      }
      prestigeRuns.value = runs;
      if (runs.length === 0) {
        selectedPrestigeRunId.value = null;
      } else if (
        !selectedPrestigeRunId.value ||
        !runs.some((run) => run.id === selectedPrestigeRunId.value)
      ) {
        selectedPrestigeRunId.value = runs[0]!.id;
      }
    } catch (error) {
      if (
        requestId !== prestigeHistoryRequestId ||
        !$supabase?.user?.loggedIn ||
        $supabase.user.id !== userId
      ) {
        return;
      }
      logger.error('[DataManagement] Failed to load prestige history:', error);
      historyError.value = t('settings.data_management.prestige_history_load_error');
    } finally {
      if (requestId === prestigeHistoryRequestId) {
        historyLoading.value = false;
      }
    }
  };
  interface ResetConfig {
    resetFn: () => Promise<void>;
    successTitle: string;
    successDescription: string;
    errorLogContext: string;
    errorDescription: string;
    dialogRef: Ref<boolean>;
  }
  const createResetHandler = (config: ResetConfig) => async () => {
    resetting.value = true;
    try {
      await config.resetFn();
      toast.add({
        title: config.successTitle,
        description: config.successDescription,
        color: 'success',
      });
      config.dialogRef.value = false;
    } catch (error) {
      logger.error(`[DataManagement] Error resetting ${config.errorLogContext}:`, error);
      toast.add({
        title: t('settings.reset.error_title'),
        description: config.errorDescription,
        color: 'error',
      });
    } finally {
      resetting.value = false;
    }
  };
  const resetPvPData = createResetHandler({
    resetFn: () => tarkovStore.resetPvPData(),
    successTitle: t('settings.reset_pvp.success_title'),
    successDescription: t('settings.reset_pvp.success_description'),
    errorLogContext: 'PvP data',
    errorDescription: t('settings.reset_pvp.error_description'),
    dialogRef: showResetPvPDialog,
  });
  const resetPvEData = createResetHandler({
    resetFn: () => tarkovStore.resetPvEData(),
    successTitle: t('settings.reset_pve.success_title'),
    successDescription: t('settings.reset_pve.success_description'),
    errorLogContext: 'PvE data',
    errorDescription: t('settings.reset_pve.error_description'),
    dialogRef: showResetPvEDialog,
  });
  const resetAllData = createResetHandler({
    resetFn: () => tarkovStore.resetAllData(),
    successTitle: t('settings.reset_all.success_title'),
    successDescription: t('settings.reset_all.success_description'),
    errorLogContext: 'all data',
    errorDescription: t('settings.reset_all.error_description'),
    dialogRef: showResetAllDialog,
  });
  const prestigePvPData = async () => {
    if (!canPrestige.value) {
      return;
    }
    if (prestigeConfirmText.value !== t('settings.prestige.confirm_word')) {
      return;
    }
    resetting.value = true;
    try {
      await tarkovStore.prestigePvP();
      toast.add({
        title: t('settings.prestige_pvp.success_title'),
        description: t('settings.prestige_pvp.success_description', {
          level: currentPrestigeLevel.value,
        }),
        color: 'success',
      });
      showPrestigePvPDialog.value = false;
      prestigeConfirmText.value = '';
      await loadPrestigeHistory();
    } catch (error) {
      logger.error('[DataManagement] Error prestiging PvP data:', error);
      toast.add({
        title: t('settings.reset.error_title'),
        description: t('settings.prestige_pvp.error_description'),
        color: 'error',
      });
    } finally {
      resetting.value = false;
    }
  };
  watch(
    () => [$supabase.user.loggedIn, $supabase.user.id] as const,
    ([loggedIn, userId], previous) => {
      const [prevLoggedIn, prevUserId] = previous ?? [false, null];
      if (!loggedIn || !userId) {
        showPrestigePvPDialog.value = false;
        prestigeConfirmText.value = '';
        clearPrestigeHistory();
        return;
      }
      if (!prevLoggedIn || prevUserId !== userId) {
        clearPrestigeHistory();
        void loadPrestigeHistory();
      }
    },
    { immediate: true }
  );
</script>
