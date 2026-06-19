<template>
  <div id="settings-prestige" class="scroll-mt-16">
    <GenericCard
      icon="mdi-trophy-outline"
      icon-color="warning"
      highlight-color="warning"
      :fill-height="false"
      :title="$t('settings.prestige.title')"
      title-classes="text-lg font-semibold"
    >
      <template #content>
        <div v-if="!isPvpMode" class="space-y-4 px-4 py-4">
          <UAlert
            icon="i-mdi-sword-cross"
            color="info"
            variant="soft"
            :title="$t('settings.prestige.pvp_only_title')"
            :description="$t('settings.prestige.pvp_only')"
          />
        </div>
        <div v-else class="space-y-6 px-4 py-4">
          <section class="space-y-3">
            <div class="space-y-1">
              <p class="text-surface-100 text-sm font-semibold">
                {{ $t('settings.prestige.current_level') }}
              </p>
              <p class="text-surface-400 text-xs">
                {{ $t('settings.prestige.set_current_hint') }}
              </p>
            </div>
            <div class="flex flex-col gap-3 md:flex-row md:items-end">
              <div class="w-full max-w-xs space-y-2">
                <label
                  :for="currentPrestigeInputId"
                  class="text-surface-200 block cursor-pointer text-sm font-semibold"
                >
                  {{ $t('settings.prestige.current_level') }}
                </label>
                <SelectMenuFixed
                  :id="currentPrestigeInputId"
                  v-model="selectedPrestigeLevel"
                  :items="prestigeOptions"
                  value-key="value"
                >
                  <template #leading>
                    <UIcon name="i-mdi-trophy" class="text-warning-400 h-4 w-4" />
                  </template>
                </SelectMenuFixed>
              </div>
              <UButton
                color="warning"
                variant="soft"
                icon="i-mdi-check"
                class="min-w-40 justify-center"
                :loading="syncingCurrentPrestige"
                :disabled="!hasSelectedPrestigeChange"
                @click="syncCurrentPrestige"
              >
                {{ $t('settings.prestige.set_current') }}
              </UButton>
            </div>
            <UAlert
              v-if="isLoweringPrestige"
              color="warning"
              variant="soft"
              icon="i-mdi-alert"
              :title="
                $t('settings.prestige.lowering_warning', {
                  current: getPrestigeLabel(currentPrestigeLevel),
                  next: getPrestigeLabel(selectedPrestigeLevel),
                })
              "
            />
          </section>
          <div class="h-px bg-white/6" />
          <section class="space-y-3">
            <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div class="space-y-1">
                <p class="text-surface-100 text-sm font-semibold">
                  {{ $t('settings.prestige.requirements_title') }}
                </p>
                <p class="text-surface-400 text-xs">
                  {{
                    nextPrestigeLevel === null
                      ? $t('settings.prestige.max_reached')
                      : $t('settings.prestige.requirements_description', {
                          level: nextPrestigeLevel,
                        })
                  }}
                </p>
              </div>
              <span
                class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold"
                :class="requirementSummaryClasses"
              >
                {{ requirementSummaryLabel }}
              </span>
            </div>
            <UAlert
              v-if="requirementSummaryDescription"
              icon="i-mdi-information"
              variant="soft"
              :color="requirementSummaryColor"
              :title="requirementSummaryDescription"
            />
            <div v-if="requirementRows.length > 0" class="grid gap-2 lg:grid-cols-2">
              <div
                v-for="row in requirementRows"
                :key="row.id"
                class="bg-surface-900/80 flex items-start gap-3 rounded-xl border border-white/8 p-3"
              >
                <div
                  class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
                  :class="getRequirementIconClasses(row)"
                >
                  <UIcon :name="getRequirementIcon(row)" class="h-4 w-4" />
                </div>
                <div class="min-w-0 flex-1 space-y-1">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="flex items-center gap-1.5">
                        <a
                          v-if="row.href"
                          :href="toWikiUrl(row.href)"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-surface-100 hover:text-warning-300 text-sm font-semibold transition-colors"
                        >
                          {{ row.name }}
                        </a>
                        <p v-else class="text-surface-100 text-sm font-semibold">
                          {{ row.name }}
                        </p>
                        <UTooltip :text="getRequirementSourceTooltip(row.source)">
                          <span
                            tabindex="0"
                            class="text-surface-500 hover:text-surface-300 inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center transition-colors focus-visible:outline-none"
                            :aria-label="getRequirementSourceTooltip(row.source)"
                          >
                            <UIcon name="i-mdi-information-outline" class="h-3.5 w-3.5" />
                          </span>
                        </UTooltip>
                      </div>
                    </div>
                    <span
                      class="inline-flex shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold"
                      :class="getRequirementStatusClasses(row.status)"
                    >
                      {{ getRequirementValueLabel(row) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <p v-else class="text-surface-400 text-sm">
              {{ $t('settings.prestige.requirements_empty') }}
            </p>
            <div class="bg-surface-900/80 space-y-3 rounded-xl border border-white/8 p-4">
              <div class="space-y-1">
                <p class="text-surface-100 text-sm font-semibold">
                  {{ $t('settings.prestige.archive_title') }}
                </p>
                <p class="text-surface-400 text-xs">
                  {{ $t('settings.prestige.archive_description') }}
                </p>
              </div>
              <p v-if="archiveDisabledDescription" class="text-surface-500 text-xs">
                {{ archiveDisabledDescription }}
              </p>
              <UButton
                color="warning"
                variant="solid"
                icon="i-mdi-trophy-variant"
                class="min-w-56 justify-center"
                :disabled="!canArchiveRun"
                @click="showArchiveDialog = true"
              >
                {{ archiveButtonLabel }}
              </UButton>
            </div>
          </section>
          <div class="h-px bg-white/6" />
          <section class="space-y-3">
            <div class="space-y-1">
              <p class="text-surface-100 text-sm font-semibold">
                {{ $t('settings.data_management.prestige_history_title') }}
              </p>
              <p class="text-surface-400 text-xs">
                {{ $t('settings.prestige.archived_runs_description') }}
              </p>
            </div>
            <div class="bg-surface-900/80 space-y-3 rounded-xl border border-white/8 p-4">
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
              <p v-else-if="prestigeRuns.length === 0" class="text-surface-500 text-sm">
                {{ prestigeHistoryEmptyDescription }}
              </p>
              <template v-else>
                <div class="flex flex-col gap-3 md:flex-row md:items-end">
                  <div class="flex-1 space-y-1">
                    <p class="text-surface-300 text-xs font-semibold uppercase">
                      {{ $t('settings.data_management.prestige_history_select') }}
                    </p>
                    <SelectMenuFixed
                      v-model="selectedPrestigeRunId"
                      :items="prestigeRunOptions"
                      value-key="value"
                    >
                      <template #leading>
                        <UIcon name="i-mdi-history" class="text-surface-300 h-4 w-4" />
                      </template>
                    </SelectMenuFixed>
                  </div>
                  <UButton
                    color="error"
                    variant="soft"
                    icon="i-mdi-delete-outline"
                    class="min-w-44 justify-center"
                    :disabled="!selectedPrestigeRun"
                    :loading="deletingPrestigeRun"
                    @click="showDeleteHistoryDialog = true"
                  >
                    {{ $t('settings.prestige.delete_history_cta') }}
                  </UButton>
                </div>
                <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <div
                    v-for="row in selectedRunSummaryRows"
                    :key="row.id"
                    class="bg-surface-900 rounded-md border border-white/10 p-2.5"
                  >
                    <p class="text-surface-400 text-[11px] font-semibold uppercase">
                      {{ row.label }}
                    </p>
                    <p class="text-surface-100 mt-0.5 text-sm font-semibold">
                      {{ row.value }}
                    </p>
                  </div>
                </div>
                <div
                  v-if="comparisonRows.length > 0"
                  class="bg-surface-900 space-y-2 rounded-md border border-white/10 p-3"
                >
                  <p class="text-surface-300 text-xs font-semibold uppercase">
                    {{ $t('settings.data_management.prestige_history_compare_title') }}
                  </p>
                  <p class="text-surface-400 text-xs">
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
                      class="bg-surface-900 flex items-center justify-between rounded-md border border-white/10 px-2.5 py-2"
                    >
                      <span class="text-surface-300 text-xs">{{ row.label }}</span>
                      <span
                        class="text-xs font-semibold"
                        :class="row.delta >= 0 ? 'text-success-300' : 'text-warning-300'"
                      >
                        {{ formatSignedDelta(row.delta) }}
                      </span>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </section>
        </div>
      </template>
    </GenericCard>
  </div>
  <UModal v-model:open="showArchiveDialog" @close="archiveConfirmText = ''">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-mdi-trophy" class="text-warning-400 h-5 w-5" />
        <h3 class="text-lg font-semibold">
          {{ $t('settings.prestige.archive_dialog_title') }}
        </h3>
      </div>
    </template>
    <template #body>
      <div class="space-y-4">
        <UAlert
          icon="i-mdi-alert"
          color="warning"
          variant="subtle"
          :title="$t('settings.data_management.prestige_pvp_warning')"
        />
        <UAlert
          v-if="requirementSummary.unmetTrackedCount > 0"
          icon="i-mdi-alert-circle"
          color="warning"
          variant="soft"
          :title="
            $t('settings.prestige.archive_soft_gate_unmet', {
              count: requirementSummary.unmetTrackedCount,
            })
          "
        />
        <UAlert
          v-if="requirementSummary.manualCount > 0"
          icon="i-mdi-information"
          color="info"
          variant="soft"
          :title="
            $t('settings.prestige.archive_soft_gate_manual', {
              count: requirementSummary.manualCount,
            })
          "
        />
        <p class="text-surface-200 text-sm">
          {{ $t('settings.prestige.archive_sync_hint') }}
        </p>
        <div class="space-y-2">
          <p class="text-surface-100 text-sm font-medium">
            <i18n-t keypath="settings.prestige.confirm_instruction" tag="span">
              <template #word>
                <strong class="text-warning-300">
                  {{ $t('settings.prestige.confirm_word') }}
                </strong>
              </template>
            </i18n-t>
          </p>
          <UInput
            v-model="archiveConfirmText"
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
          class="ml-auto min-w-40 justify-center text-center"
          :loading="archivingPrestige"
          :disabled="!canArchiveRun || archiveConfirmText !== $t('settings.prestige.confirm_word')"
          @click="archivePrestigeRun"
        >
          {{ archiveButtonLabel }}
        </UButton>
      </div>
    </template>
  </UModal>
  <UModal v-model:open="showDeleteHistoryDialog">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-mdi-delete-outline" class="text-error-400 h-5 w-5" />
        <h3 class="text-lg font-semibold">
          {{ $t('settings.prestige.delete_history_dialog_title') }}
        </h3>
      </div>
    </template>
    <template #body>
      <div class="space-y-4">
        <UAlert
          icon="i-mdi-information"
          color="warning"
          variant="soft"
          :title="$t('settings.prestige.delete_history_warning')"
        />
        <div
          v-if="selectedPrestigeRun"
          class="bg-surface-900 rounded-md border border-white/10 p-3"
        >
          <p class="text-surface-300 text-xs font-semibold uppercase">
            {{ $t('settings.prestige.delete_history_selected_label') }}
          </p>
          <p class="text-surface-100 mt-1 text-sm font-semibold">
            {{ selectedPrestigeRunOptionLabel }}
          </p>
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
          class="ml-auto min-w-44 justify-center text-center"
          :loading="deletingPrestigeRun"
          :disabled="!selectedPrestigeRun"
          @click="deleteSelectedPrestigeRun"
        >
          {{ $t('settings.prestige.delete_history_confirm') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { useWikiLink } from '@/composables/useWikiLink';
  import {
    buildPrestigeRequirementRows,
    getNextPrestigeLevel,
    summarizePrestigeRequirementRows,
    type PrestigeRequirementRow,
    type PrestigeRequirementStatus,
  } from '@/stores/tarkov/prestige';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { type PrestigeRunRecord, useTarkovStore } from '@/stores/useTarkov';
  import { GAME_MODES } from '@/utils/constants';
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
  const currentPrestigeInputId = 'settings-pvp-prestige-input';
  const { locale, t } = useI18n({ useScope: 'global' });
  const { toWikiUrl } = useWikiLink();
  const toast = useToast();
  const { $supabase } = useNuxtApp();
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  const syncingCurrentPrestige = ref(false);
  const archivingPrestige = ref(false);
  const deletingPrestigeRun = ref(false);
  const historyLoading = ref(false);
  const historyError = ref('');
  const prestigeRuns = ref<PrestigeRunRecord[]>([]);
  const selectedPrestigeRunId = ref<string | null>(null);
  const selectedPrestigeLevel = ref(0);
  const showArchiveDialog = ref(false);
  const showDeleteHistoryDialog = ref(false);
  const archiveConfirmText = ref('');
  const isLoggedIn = computed(() => Boolean($supabase?.user?.loggedIn && $supabase?.user?.id));
  const isPvpMode = computed(() => tarkovStore.currentGameMode === GAME_MODES.PVP);
  const currentPrestigeLevel = computed(() => tarkovStore.getPvPProgressData().prestigeLevel ?? 0);
  const currentEdition = computed(() =>
    metadataStore.getEditionByValue(tarkovStore.getGameEdition())
  );
  const nextPrestigeLevel = computed(() => getNextPrestigeLevel(currentPrestigeLevel.value));
  watch(
    currentPrestigeLevel,
    (value) => {
      selectedPrestigeLevel.value = value;
    },
    { immediate: true }
  );
  const prestigeOptions = computed(() =>
    Array.from({ length: 7 }, (_, index) => ({
      label: getPrestigeLabel(index),
      value: index,
    }))
  );
  const hasSelectedPrestigeChange = computed(
    () => selectedPrestigeLevel.value !== currentPrestigeLevel.value
  );
  const isLoweringPrestige = computed(
    () => selectedPrestigeLevel.value < currentPrestigeLevel.value
  );
  const requirementRows = computed(() =>
    buildPrestigeRequirementRows({
      currentPrestigeLevel: currentPrestigeLevel.value,
      edition: currentEdition.value,
      hideoutStations: metadataStore.hideoutStations,
      prestigeLevels: metadataStore.prestigeLevels,
      pvpProgress: tarkovStore.getPvPProgressData(),
      storyChapters: metadataStore.storyChapters,
      tasks: metadataStore.tasks,
    })
  );
  const requirementSummary = computed(() =>
    summarizePrestigeRequirementRows(requirementRows.value)
  );
  const requirementSummaryColor = computed(() => {
    if (nextPrestigeLevel.value === null) return 'neutral';
    if (requirementSummary.value.unmetTrackedCount > 0) return 'warning';
    if (requirementSummary.value.manualCount > 0) return 'info';
    return 'success';
  });
  const requirementSummaryLabel = computed(() => {
    if (nextPrestigeLevel.value === null) {
      return t('settings.prestige.summary.max');
    }
    if (requirementSummary.value.unmetTrackedCount > 0) {
      return t('settings.prestige.summary.not_ready');
    }
    if (requirementSummary.value.manualCount > 0) {
      return t('settings.prestige.summary.manual_check');
    }
    return t('settings.prestige.summary.ready');
  });
  const requirementSummaryClasses = computed(() => {
    if (requirementSummaryColor.value === 'success') {
      return 'border-success-500/30 bg-success-950/40 text-success-200';
    }
    if (requirementSummaryColor.value === 'warning') {
      return 'border-warning-500/30 bg-warning-950/40 text-warning-200';
    }
    if (requirementSummaryColor.value === 'info') {
      return 'border-info-500/30 bg-info-950/40 text-info-200';
    }
    return 'border-white/10 bg-surface-900 text-surface-300';
  });
  const requirementSummaryDescription = computed(() => {
    if (nextPrestigeLevel.value === null) {
      return '';
    }
    if (requirementSummary.value.unmetTrackedCount > 0) {
      return t('settings.prestige.summary_description_unmet', {
        count: requirementSummary.value.unmetTrackedCount,
      });
    }
    if (requirementSummary.value.manualCount > 0) {
      return t('settings.prestige.summary_description_manual', {
        count: requirementSummary.value.manualCount,
      });
    }
    return t('settings.prestige.summary_description_ready');
  });
  const canArchiveRun = computed(() => isLoggedIn.value && nextPrestigeLevel.value !== null);
  const archiveDisabledDescription = computed(() => {
    if (!isLoggedIn.value) {
      return t('settings.prestige.login_required');
    }
    if (nextPrestigeLevel.value === null) {
      return t('settings.prestige.max_reached');
    }
    return '';
  });
  const archiveButtonLabel = computed(() => {
    if (nextPrestigeLevel.value === null) {
      return t('settings.prestige.archive_cta_disabled');
    }
    return t('settings.prestige.archive_cta', { level: nextPrestigeLevel.value });
  });
  const numberFormatter = computed(() => new Intl.NumberFormat('en-US'));
  const historyDateFormatter = computed(
    () =>
      new Intl.DateTimeFormat(locale.value || undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
  );
  const prestigeHistoryEmptyDescription = computed(() => {
    if (!isLoggedIn.value) {
      return t('settings.prestige.login_required');
    }
    return t('settings.data_management.prestige_history_empty');
  });
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
  const selectedPrestigeRunOptionLabel = computed(() => {
    if (!selectedPrestigeRun.value) return '';
    return t('settings.data_management.prestige_history_option', {
      from: selectedPrestigeRun.value.prestigeFrom,
      to: selectedPrestigeRun.value.prestigeTo,
      when: formatHistoryDate(selectedPrestigeRun.value.createdAt),
    });
  });
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
  const getPrestigeLabel = (level: number): string => {
    return level === 0 ? t('prestige.no_prestige') : t('prestige.prestige_n', { n: level });
  };
  const getRequirementSourceLabel = (source: PrestigeRequirementRow['source']) => {
    const sourceKey = source === 'tarkov.dev' ? 'tarkov_dev' : source;
    return t(`settings.prestige.requirement_source.${sourceKey}`);
  };
  const getRequirementSourceTooltip = (source: PrestigeRequirementRow['source']) => {
    return t('settings.prestige.requirement_source_tooltip', {
      source: getRequirementSourceLabel(source),
    });
  };
  const getRequirementValueLabel = (row: PrestigeRequirementRow) => {
    if (row.status === 'manual') {
      return t('settings.prestige.requirement_state.manual');
    }
    if (typeof row.currentValue === 'number' && typeof row.requiredValue === 'number') {
      return t('settings.prestige.requirement_progress', {
        current: numberFormatter.value.format(row.currentValue),
        required: numberFormatter.value.format(row.requiredValue),
      });
    }
    if (row.currentValue === 'complete') {
      return t('settings.prestige.requirement_state.complete');
    }
    if (row.currentValue === 'incomplete') {
      return t('settings.prestige.requirement_state.incomplete');
    }
    return row.status === 'met'
      ? t('settings.prestige.requirement_state.complete')
      : t('settings.prestige.requirement_state.incomplete');
  };
  const getRequirementStatusClasses = (status: PrestigeRequirementStatus) => {
    if (status === 'met') {
      return 'border-success-500/25 bg-success-950/40 text-success-200';
    }
    if (status === 'manual') {
      return 'border-info-500/25 bg-info-950/40 text-info-200';
    }
    return 'border-warning-500/25 bg-warning-950/40 text-warning-200';
  };
  const getRequirementIcon = (row: PrestigeRequirementRow) => {
    switch (row.kind) {
      case 'playerLevel':
        return 'i-mdi-account-arrow-up';
      case 'task':
        return 'i-mdi-clipboard-check-outline';
      case 'storyChapter':
        return 'i-mdi-book-open-page-variant-outline';
      case 'skill':
        return 'i-mdi-arm-flex';
      case 'hideoutStation':
        return 'i-mdi-home-city-outline';
      case 'item':
        return 'i-mdi-cash-multiple';
      default:
        return 'i-mdi-checkbox-blank-circle-outline';
    }
  };
  const getRequirementIconClasses = (row: PrestigeRequirementRow) => {
    if (row.status === 'met') {
      return 'border-success-500/25 bg-success-950/40 text-success-200';
    }
    if (row.status === 'manual') {
      return 'border-info-500/25 bg-info-950/40 text-info-200';
    }
    return 'border-warning-500/25 bg-warning-950/40 text-warning-200';
  };
  let prestigeHistoryRequestId = 0;
  const clearPrestigeHistory = () => {
    historyError.value = '';
    historyLoading.value = false;
    prestigeRuns.value = [];
    selectedPrestigeRunId.value = null;
  };
  const loadPrestigeHistory = async () => {
    const userId = $supabase?.user?.id;
    if (!isPvpMode.value || !$supabase?.user?.loggedIn || !userId) {
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
      logger.error('[PrestigeCard] Failed to load prestige history:', error);
      historyError.value = t('settings.data_management.prestige_history_load_error');
    } finally {
      if (requestId === prestigeHistoryRequestId) {
        historyLoading.value = false;
      }
    }
  };
  const syncCurrentPrestige = async () => {
    if (!isPvpMode.value || !hasSelectedPrestigeChange.value) {
      return;
    }
    syncingCurrentPrestige.value = true;
    try {
      const targetPrestigeLevel = selectedPrestigeLevel.value;
      await tarkovStore.syncPvpPrestigeLevel(targetPrestigeLevel);
      toast.add({
        title: t('settings.prestige.sync_success_title'),
        description: t('settings.prestige.sync_success_description', {
          level: getPrestigeLabel(targetPrestigeLevel),
        }),
        color: 'success',
      });
    } catch (error) {
      logger.error('[PrestigeCard] Failed to sync PvP prestige level:', error);
      toast.add({
        title: t('settings.reset.error_title'),
        description: t('settings.prestige.sync_error_description'),
        color: 'error',
      });
    } finally {
      syncingCurrentPrestige.value = false;
    }
  };
  const deleteSelectedPrestigeRun = async () => {
    if (!isPvpMode.value) {
      return;
    }
    const run = selectedPrestigeRun.value;
    if (!run) {
      return;
    }
    deletingPrestigeRun.value = true;
    try {
      await tarkovStore.deletePrestigeRun(run.id, run.mode);
      const removedIndex = selectedPrestigeRunIndex.value;
      const nextRuns = prestigeRuns.value.filter((entry) => entry.id !== run.id);
      prestigeRuns.value = nextRuns;
      if (nextRuns.length === 0) {
        selectedPrestigeRunId.value = null;
      } else {
        selectedPrestigeRunId.value = nextRuns[Math.min(removedIndex, nextRuns.length - 1)]!.id;
      }
      showDeleteHistoryDialog.value = false;
      toast.add({
        title: t('settings.prestige.delete_history_success_title'),
        description: t('settings.prestige.delete_history_success_description'),
        color: 'success',
      });
    } catch (error) {
      logger.error('[PrestigeCard] Failed to delete prestige history entry:', error);
      toast.add({
        title: t('settings.reset.error_title'),
        description: t('settings.prestige.delete_history_error_description'),
        color: 'error',
      });
    } finally {
      deletingPrestigeRun.value = false;
    }
  };
  const archivePrestigeRun = async () => {
    if (!isPvpMode.value || !canArchiveRun.value) {
      return;
    }
    if (archiveConfirmText.value !== t('settings.prestige.confirm_word')) {
      return;
    }
    const targetPrestigeLevel = nextPrestigeLevel.value;
    if (targetPrestigeLevel === null) {
      return;
    }
    archivingPrestige.value = true;
    try {
      await tarkovStore.prestigePvP();
      toast.add({
        title: t('settings.prestige_pvp.success_title'),
        description: t('settings.prestige_pvp.success_description', {
          level: targetPrestigeLevel,
        }),
        color: 'success',
      });
      showArchiveDialog.value = false;
      archiveConfirmText.value = '';
      await loadPrestigeHistory();
    } catch (error) {
      logger.error('[PrestigeCard] Failed to prestige PvP data:', error);
      toast.add({
        title: t('settings.reset.error_title'),
        description: t('settings.prestige_pvp.error_description'),
        color: 'error',
      });
    } finally {
      archivingPrestige.value = false;
    }
  };
  watch(
    () => [$supabase.user.loggedIn, $supabase.user.id, isPvpMode.value] as const,
    ([loggedIn, userId, pvpMode], previous) => {
      const [prevLoggedIn, prevUserId, prevPvpMode] = previous ?? [false, null, true];
      if (!loggedIn || !userId || !pvpMode) {
        showArchiveDialog.value = false;
        showDeleteHistoryDialog.value = false;
        archiveConfirmText.value = '';
        clearPrestigeHistory();
        return;
      }
      if (!prevLoggedIn || prevUserId !== userId || prevPvpMode !== pvpMode) {
        clearPrestigeHistory();
        void loadPrestigeHistory();
      }
    },
    { immediate: true }
  );
</script>
