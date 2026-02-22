<template>
  <GenericCard
    icon="mdi-database-cog"
    icon-color="warning"
    highlight-color="warning"
    :title="$t('settings.data_management_card.title')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-6 px-4 py-4">
        <!-- Export & Backup -->
        <div class="space-y-2">
          <p class="text-surface-400 text-xs font-semibold tracking-wider uppercase">
            {{ $t('settings.data_management.export_title') }}
          </p>
          <p class="text-surface-400 text-sm">
            {{ $t('settings.data_management.export_description') }}
          </p>
          <UButton
            icon="i-mdi-download"
            block
            :ui="{
              base: 'bg-primary-900 hover:bg-primary-800 active:bg-primary-700 text-primary-200 focus-visible:ring focus-visible:ring-primary-500',
            }"
            @click="handleExportProgress"
          >
            {{ $t('settings.data_management.export_button') }}
          </UButton>
        </div>
        <USeparator />
        <!-- Import -->
        <div class="space-y-3">
          <p class="text-surface-400 text-xs font-semibold tracking-wider uppercase">
            {{ $t('settings.data_management.import_title') }}
          </p>
          <input
            ref="backupFileInputRef"
            type="file"
            accept=".json"
            class="hidden"
            @change="handleBackupFileChange"
          />
          <input
            ref="tarkovDevFileInputRef"
            type="file"
            accept=".json"
            class="hidden"
            @change="handleTarkovDevFileChange"
          />
          <input
            ref="eftLogsFolderInputRef"
            type="file"
            webkitdirectory
            directory
            multiple
            class="hidden"
            @change="handleEftLogsFolderChange"
          />
          <!-- Import buttons (shown when no import flow is active) -->
          <template v-if="!isAnyImportActive">
            <div class="grid gap-3 md:grid-cols-3">
              <UButton
                icon="i-mdi-file-upload-outline"
                block
                :ui="{
                  base: 'bg-info-900 hover:bg-info-800 active:bg-info-700 text-info-200 focus-visible:ring focus-visible:ring-info-500',
                }"
                @click="backupFileInputRef?.click()"
              >
                {{ $t('settings.data_management.import_backup_button') }}
              </UButton>
              <UButton
                icon="i-mdi-account-arrow-up"
                block
                :ui="{
                  base: 'bg-info-900 hover:bg-info-800 active:bg-info-700 text-info-200 focus-visible:ring focus-visible:ring-info-500',
                }"
                @click="showTarkovDevFileInput"
              >
                {{ $t('settings.data_management.import_tarkovdev_button') }}
              </UButton>
              <UButton
                icon="i-mdi-folder-upload-outline"
                block
                :ui="{
                  base: 'bg-info-900 hover:bg-info-800 active:bg-info-700 text-info-200 focus-visible:ring focus-visible:ring-info-500',
                }"
                @click="showEftLogsFolderInput"
              >
                {{ $t('settings.data_management.import_eft_logs_folder_button') }}
              </UButton>
            </div>
            <div class="bg-surface-900/80 rounded-md border border-white/10 p-3">
              <p class="text-surface-300 text-xs font-semibold">
                {{ $t('settings.log_import.upload_hint') }}
              </p>
              <ul class="text-surface-400 mt-2 list-disc space-y-1 pl-4 text-xs">
                <li>{{ $t('settings.log_import.logs_folder_required') }}</li>
                <li>
                  <span>{{ $t('settings.log_import.default_path_label') }}</span>
                  <code class="text-surface-200 ml-1 font-mono">{{ eftDefaultLogsPath }}</code>
                </li>
                <li>{{ $t('settings.log_import.find_in_launcher_hint') }}</li>
                <li>
                  <span>{{ $t('settings.log_import.avoid_session_folder_label') }}</span>
                  <code class="text-surface-200 ml-1 font-mono break-all">
                    {{ eftSessionFolderExamplePath }}
                  </code>
                </li>
              </ul>
            </div>
            <!-- Tarkov.dev linked profile info -->
            <template v-if="isLinked">
              <div class="bg-surface-900/80 rounded-md border border-white/10 p-3">
                <div class="flex items-center justify-between">
                  <span class="text-surface-400 text-sm">
                    {{ $t('settings.tarkov_dev_import.linked_uid') }}
                  </span>
                  <span class="text-surface-100 font-mono text-sm font-semibold">
                    {{ tarkovUid }}
                  </span>
                </div>
                <UButton
                  icon="i-mdi-open-in-new"
                  variant="soft"
                  color="info"
                  size="xs"
                  class="mt-2"
                  :href="tarkovDevProfileUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {{ $t('settings.tarkov_dev_import.view_profile') }}
                </UButton>
              </div>
            </template>
          </template>
          <!-- TarkovTracker Backup Import Preview -->
          <template v-if="backupImportState === 'preview' && backupPreview">
            <div
              class="bg-surface-900/80 divide-surface-700 divide-y rounded-md border border-white/10"
            >
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.data_management.import_preview_exported_at') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ formatDate(backupPreview.exportedAt) }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.data_management.import_preview_game_edition') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ editionLabelFromBackup }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.data_management.import_preview_pvp_level') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ backupPreview.pvp.level }} ({{ backupPreview.pvp.faction }})
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.data_management.import_preview_pvp_tasks') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ backupPreview.pvp.taskCount }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.data_management.import_preview_pve_level') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ backupPreview.pve.level }} ({{ backupPreview.pve.faction }})
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.data_management.import_preview_pve_tasks') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ backupPreview.pve.taskCount }}
                </span>
              </div>
            </div>
            <div class="space-y-1">
              <label class="text-surface-200 text-sm font-semibold">
                {{ $t('settings.data_management.import_target_label') }}
              </label>
              <div class="grid grid-cols-3 gap-2">
                <UButton
                  :variant="importTarget === 'pvp' ? 'solid' : 'soft'"
                  color="primary"
                  size="sm"
                  block
                  @click="importTarget = 'pvp'"
                >
                  {{ $t('settings.data_management.import_target_pvp') }}
                </UButton>
                <UButton
                  :variant="importTarget === 'pve' ? 'solid' : 'soft'"
                  color="primary"
                  size="sm"
                  block
                  @click="importTarget = 'pve'"
                >
                  {{ $t('settings.data_management.import_target_pve') }}
                </UButton>
                <UButton
                  :variant="importTarget === 'both' ? 'solid' : 'soft'"
                  color="primary"
                  size="sm"
                  block
                  @click="importTarget = 'both'"
                >
                  {{ $t('settings.data_management.import_target_both') }}
                </UButton>
              </div>
            </div>
            <div class="flex gap-2">
              <UButton
                icon="i-mdi-check"
                color="primary"
                class="flex-1"
                @click="handleBackupConfirm"
              >
                {{ $t('settings.data_management.import_confirm') }}
              </UButton>
              <UButton variant="soft" color="neutral" class="flex-1" @click="resetBackupImport()">
                {{ $t('settings.data_management.import_cancel') }}
              </UButton>
            </div>
          </template>
          <!-- Tarkov.dev Import Preview -->
          <template v-if="tarkovDevImportState === 'preview' && tarkovDevPreview">
            <div
              class="bg-surface-900/80 divide-surface-700 divide-y rounded-md border border-white/10"
            >
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.tarkov_dev_import.nickname') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ tarkovDevPreview.displayName }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.tarkov_dev_import.faction') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ tarkovDevPreview.pmcFaction }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.tarkov_dev_import.level') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ previewLevel }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.tarkov_dev_import.prestige') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ tarkovDevPreview.prestigeLevel }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.tarkov_dev_import.skills_count', { count: skillCount }) }}
                </span>
              </div>
              <div v-if="tarkovDevPreview.gameEditionGuess !== null" class="px-3 py-2">
                <div class="flex items-center justify-between">
                  <span class="text-surface-400 text-xs">
                    {{ $t('settings.tarkov_dev_import.edition_guess') }}
                  </span>
                  <span class="text-surface-100 text-sm font-semibold">
                    {{ editionLabel }}
                  </span>
                </div>
              </div>
            </div>
            <div class="space-y-1">
              <label class="text-surface-200 text-sm font-semibold">
                {{ $t('settings.tarkov_dev_import.import_to_mode') }}
              </label>
              <GameModeToggle v-model="tarkovDevTargetMode" />
            </div>
            <div class="flex gap-2">
              <UButton
                icon="i-mdi-check"
                color="primary"
                class="flex-1"
                @click="handleTarkovDevConfirm"
              >
                {{ $t('settings.tarkov_dev_import.confirm') }}
              </UButton>
              <UButton
                variant="soft"
                color="neutral"
                class="flex-1"
                @click="resetTarkovDevImport()"
              >
                {{ $t('settings.tarkov_dev_import.cancel') }}
              </UButton>
            </div>
          </template>
          <template v-if="eftLogsImportState === 'preview' && eftLogsPreview">
            <div class="space-y-1">
              <div class="flex items-center gap-1">
                <label class="text-surface-200 text-sm font-semibold">
                  {{ $t('settings.log_import.version_filter_label') }}
                </label>
                <UTooltip :text="$t('settings.log_import.version_filter_tooltip')">
                  <UIcon name="i-mdi-information" class="text-surface-500 h-3.5 w-3.5" />
                </UTooltip>
              </div>
              <div class="grid gap-2 sm:grid-cols-2">
                <UCheckbox
                  v-for="version in eftLogsAvailableVersions"
                  :key="version"
                  :model-value="eftLogsIncludedVersions.includes(version)"
                  :disabled="
                    eftLogsIncludedVersions.length === 1 &&
                    eftLogsIncludedVersions.includes(version)
                  "
                  :label="formatEftLogsVersionLabel(version)"
                  @update:model-value="
                    (enabled) => handleEftLogsVersionToggle(version, Boolean(enabled))
                  "
                />
              </div>
              <p class="text-surface-400 text-xs">
                {{ $t('settings.log_import.version_filter_hint') }}
              </p>
            </div>
            <div
              class="bg-surface-900/80 divide-surface-700 divide-y rounded-md border border-white/10"
            >
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.log_import.source_file') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ eftLogsPreview.sourceFileName }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 inline-flex items-center gap-1 text-xs">
                  {{ $t('settings.log_import.logs_scanned') }}
                  <UTooltip :text="$t('settings.log_import.logs_scanned_tooltip')">
                    <UIcon name="i-mdi-information" class="text-surface-500 h-3.5 w-3.5" />
                  </UTooltip>
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ eftLogsPreview.filesParsed }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 inline-flex items-center gap-1 text-xs">
                  {{ $t('settings.log_import.entries_scanned') }}
                  <UTooltip :text="$t('settings.log_import.entries_scanned_tooltip')">
                    <UIcon name="i-mdi-information" class="text-surface-500 h-3.5 w-3.5" />
                  </UTooltip>
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ eftLogsPreview.scannedEntries }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 inline-flex items-center gap-1 text-xs">
                  {{ $t('settings.log_import.chat_messages') }}
                  <UTooltip :text="$t('settings.log_import.chat_messages_tooltip')">
                    <UIcon name="i-mdi-information" class="text-surface-500 h-3.5 w-3.5" />
                  </UTooltip>
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ eftLogsPreview.chatMessageCount }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 inline-flex items-center gap-1 text-xs">
                  {{ $t('settings.log_import.completion_events') }}
                  <UTooltip :text="$t('settings.log_import.completion_events_tooltip')">
                    <UIcon name="i-mdi-information" class="text-surface-500 h-3.5 w-3.5" />
                  </UTooltip>
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ eftLogsPreview.dedupedCompletionEventCount }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 inline-flex items-center gap-1 text-xs">
                  {{ $t('settings.log_import.started_events') }}
                  <UTooltip :text="$t('settings.log_import.started_events_tooltip')">
                    <UIcon name="i-mdi-information" class="text-surface-500 h-3.5 w-3.5" />
                  </UTooltip>
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ eftLogsPreview.dedupedStartedEventCount }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 inline-flex items-center gap-1 text-xs">
                  {{ $t('settings.log_import.matched_tasks') }}
                  <UTooltip :text="$t('settings.log_import.matched_tasks_tooltip')">
                    <UIcon name="i-mdi-information" class="text-surface-500 h-3.5 w-3.5" />
                  </UTooltip>
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ eftLogsCompletedCount }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 inline-flex items-center gap-1 text-xs">
                  {{ $t('settings.log_import.matched_started_tasks') }}
                  <UTooltip :text="$t('settings.log_import.matched_started_tasks_tooltip')">
                    <UIcon name="i-mdi-information" class="text-surface-500 h-3.5 w-3.5" />
                  </UTooltip>
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ eftLogsActiveCount }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 inline-flex items-center gap-1 text-xs">
                  {{ $t('settings.log_import.detected_mode') }}
                  <UTooltip :text="$t('settings.log_import.detected_mode_tooltip')">
                    <UIcon name="i-mdi-information" class="text-surface-500 h-3.5 w-3.5" />
                  </UTooltip>
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ eftLogsModeSummaryLabel }}
                </span>
              </div>
              <div
                v-if="eftLogsUnknownCount > 0"
                class="flex items-center justify-between px-3 py-2"
              >
                <span class="text-surface-400 inline-flex items-center gap-1 text-xs">
                  {{ $t('settings.log_import.unknown_mode_events') }}
                  <UTooltip :text="$t('settings.log_import.unknown_mode_events_tooltip')">
                    <UIcon name="i-mdi-information" class="text-surface-500 h-3.5 w-3.5" />
                  </UTooltip>
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ eftLogsUnknownCount }}
                </span>
              </div>
            </div>
            <div v-if="eftLogsUnknownCount > 0" class="space-y-1">
              <p class="text-surface-200 text-sm font-semibold">
                {{ $t('settings.log_import.unknown_mode_event_details') }}
              </p>
              <div class="bg-surface-900/80 rounded-md border border-white/10 px-3 py-2">
                <div v-if="eftLogsUnknownCompletedTaskIds.length > 0" class="mb-2 last:mb-0">
                  <p class="text-surface-400 mb-1 text-xs">
                    {{ $t('settings.log_import.unknown_completion_events') }}
                  </p>
                  <ul class="text-surface-100 space-y-1 text-xs">
                    <li
                      v-for="taskId in eftLogsUnknownCompletedTaskIds"
                      :key="`unknown-completed-${taskId}`"
                    >
                      {{ formatEftLogsUnknownTask(taskId) }}
                    </li>
                  </ul>
                </div>
                <div v-if="eftLogsUnknownStartedTaskIds.length > 0">
                  <p class="text-surface-400 mb-1 text-xs">
                    {{ $t('settings.log_import.unknown_started_events') }}
                  </p>
                  <ul class="text-surface-100 space-y-1 text-xs">
                    <li
                      v-for="taskId in eftLogsUnknownStartedTaskIds"
                      :key="`unknown-started-${taskId}`"
                    >
                      {{ formatEftLogsUnknownTask(taskId) }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            <div v-if="eftLogsRequiresManualModeSelection" class="space-y-1">
              <label class="text-surface-200 text-sm font-semibold">
                {{ $t('settings.log_import.import_unknown_to_mode') }}
              </label>
              <GameModeToggle v-model="eftLogsTargetMode" />
              <p class="text-surface-400 text-xs">
                {{ $t('settings.log_import.import_unknown_to_mode_hint') }}
              </p>
            </div>
            <p v-else class="text-surface-400 text-xs">
              {{ $t('settings.log_import.auto_mode_hint') }}
            </p>
            <div class="flex gap-2">
              <UButton
                icon="i-mdi-check"
                color="primary"
                class="flex-1"
                @click="handleEftLogsConfirm"
              >
                {{ $t('settings.log_import.confirm') }}
              </UButton>
              <UButton variant="soft" color="neutral" class="flex-1" @click="resetEftLogsImport()">
                {{ $t('settings.log_import.cancel') }}
              </UButton>
            </div>
          </template>
          <!-- Success/Error alerts for backup import -->
          <div
            v-if="backupImportState === 'success'"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <UAlert
              icon="i-mdi-check-circle"
              color="success"
              variant="soft"
              :title="$t('settings.data_management.import_success_title')"
              :description="$t('settings.data_management.import_success_description')"
            />
          </div>
          <div
            v-if="backupImportState === 'error' && backupImportError"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
          >
            <UAlert
              icon="i-mdi-alert-circle"
              color="error"
              variant="soft"
              :title="$t('settings.data_management.import_error_title')"
              :description="backupImportError"
            />
          </div>
          <!-- Success/Error alerts for tarkov.dev import -->
          <div
            v-if="tarkovDevImportState === 'success'"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <UAlert
              icon="i-mdi-check-circle"
              color="success"
              variant="soft"
              :title="$t('settings.tarkov_dev_import.success_title')"
              :description="$t('settings.tarkov_dev_import.success_description')"
            />
          </div>
          <div
            v-if="tarkovDevImportState === 'error' && tarkovDevImportError"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
          >
            <UAlert
              icon="i-mdi-alert-circle"
              color="error"
              variant="soft"
              :title="$t('settings.tarkov_dev_import.error_title')"
              :description="tarkovDevImportError"
            />
          </div>
          <div
            v-if="eftLogsImportState === 'success'"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <UAlert
              icon="i-mdi-check-circle"
              color="success"
              variant="soft"
              :title="$t('settings.log_import.success_title')"
              :description="
                $t('settings.log_import.success_description', {
                  active_count: eftLogsActiveCount,
                  complete_count: eftLogsCompletedCount,
                })
              "
            />
          </div>
          <div
            v-if="eftLogsImportState === 'error' && eftLogsImportError"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
          >
            <UAlert
              icon="i-mdi-alert-circle"
              color="error"
              variant="soft"
              :title="$t('settings.log_import.error_title')"
              :description="eftLogsImportError"
            />
          </div>
        </div>
        <USeparator />
        <ResetProgressSection />
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { useDataBackup } from '@/composables/useDataBackup';
  import { useEftLogsImport } from '@/composables/useEftLogsImport';
  import { useTarkovDevImport } from '@/composables/useTarkovDevImport';
  import GameModeToggle from '@/features/settings/GameModeToggle.vue';
  import ResetProgressSection from '@/features/settings/ResetProgressSection.vue';
  import {
    useMetadataStore,
    type MetadataStore,
    type MetadataStoreTaskLookup,
  } from '@/stores/useMetadata';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { GAME_MODES, type GameMode } from '@/utils/constants';
  import { logger } from '@/utils/logger';
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const tarkovStore = useTarkovStore();
  const metadataStore: MetadataStore = useMetadataStore();
  // --- Backup Export/Import ---
  const {
    exportProgress,
    exportError: backupExportError,
    importState: backupImportState,
    importPreview: backupPreview,
    importError: backupImportError,
    parseBackupFile,
    confirmBackupImport,
    resetImport: resetBackupImport,
  } = useDataBackup();
  const backupFileInputRef = ref<HTMLInputElement | null>(null);
  const importTarget = ref<'pvp' | 'pve' | 'both'>('both');
  async function handleExportProgress() {
    try {
      await exportProgress();
    } catch (err) {
      logger.error('DataManagementCard: exportProgress failed', err, backupExportError.value);
      if (!backupExportError.value) return;
      toast.add({
        title: t('settings.data_management.export_error_title'),
        description: backupExportError.value,
        color: 'error',
      });
    }
  }
  async function handleBackupFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await parseBackupFile(file);
    input.value = '';
  }
  async function handleBackupConfirm() {
    await confirmBackupImport({
      pvp: importTarget.value === 'pvp' || importTarget.value === 'both',
      pve: importTarget.value === 'pve' || importTarget.value === 'both',
    });
    if (backupImportState.value === 'success') {
      toast.add({
        title: t('settings.data_management.import_success_title'),
        description: t('settings.data_management.import_success_description'),
        color: 'success',
      });
    }
  }
  // --- Tarkov.dev Import ---
  const {
    importState: tarkovDevImportState,
    previewData: tarkovDevPreview,
    importError: tarkovDevImportError,
    parseFile: parseTarkovDevFile,
    confirmImport: confirmTarkovDevImport,
    reset: resetTarkovDevImport,
  } = useTarkovDevImport();
  const tarkovDevFileInputRef = ref<HTMLInputElement | null>(null);
  const tarkovDevTargetMode = ref<GameMode>(tarkovStore.getCurrentGameMode());
  const {
    importState: eftLogsImportState,
    previewData: eftLogsPreview,
    importError: eftLogsImportError,
    parseFiles: parseEftLogsFiles,
    setIncludedVersions: setEftLogsIncludedVersions,
    confirmImport: confirmEftLogsImport,
    reset: resetEftLogsImport,
  } = useEftLogsImport();
  const eftDefaultLogsPath = computed(() => t('settings.log_import.default_path_value'));
  const eftSessionFolderExamplePath = computed(() =>
    t('settings.log_import.session_folder_example_path')
  );
  const eftLogsFolderInputRef = ref<HTMLInputElement | null>(null);
  const eftLogsTargetMode = ref<GameMode>(tarkovStore.getCurrentGameMode());
  const tarkovUid = computed(() => tarkovStore.getTarkovUid());
  const isLinked = computed(() => tarkovUid.value !== null);
  const linkedProfileMode = computed<GameMode | null>(() => {
    const pvpImportedAt = tarkovStore.getPvPProgressData().tarkovDevProfile?.importedAt;
    const pveImportedAt = tarkovStore.getPvEProgressData().tarkovDevProfile?.importedAt;
    const hasPvpImport = typeof pvpImportedAt === 'number' && Number.isFinite(pvpImportedAt);
    const hasPveImport = typeof pveImportedAt === 'number' && Number.isFinite(pveImportedAt);
    if (hasPvpImport && hasPveImport) {
      return pveImportedAt > pvpImportedAt ? GAME_MODES.PVE : GAME_MODES.PVP;
    }
    if (hasPvpImport) return GAME_MODES.PVP;
    if (hasPveImport) return GAME_MODES.PVE;
    return null;
  });
  const tarkovDevProfileUrl = computed(() => {
    const mode =
      linkedProfileMode.value ?? tarkovStore.getCurrentGameMode() ?? tarkovDevTargetMode.value;
    const modeSlug = mode === GAME_MODES.PVE ? 'pve' : 'regular';
    return `https://tarkov.dev/players/${modeSlug}/${tarkovUid.value}`;
  });
  const previewLevel = computed(() => {
    if (!tarkovDevPreview.value) return 1;
    const levels = metadataStore.playerLevels;
    if (!levels || levels.length === 0) return 1;
    const xp = tarkovDevPreview.value.totalXP;
    for (let i = levels.length - 1; i >= 0; i--) {
      const level = levels[i];
      if (level && xp >= level.exp) return level.level;
    }
    return 1;
  });
  const skillCount = computed(() =>
    tarkovDevPreview.value ? Object.keys(tarkovDevPreview.value.skills).length : 0
  );
  function getEditionLabel(editionValue: number | null | undefined): string {
    if (editionValue === null || editionValue === undefined) return '';
    const edition = metadataStore.editions.find((e) => e.value === editionValue);
    return (
      edition?.title ??
      t('settings.game_profile.game_edition_with_value', {
        edition: editionValue,
      })
    );
  }
  const editionLabel = computed(() => getEditionLabel(tarkovDevPreview.value?.gameEditionGuess));
  function showTarkovDevFileInput() {
    tarkovDevFileInputRef.value?.click();
  }
  function showEftLogsFolderInput() {
    eftLogsFolderInputRef.value?.click();
  }
  async function handleTarkovDevFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await parseTarkovDevFile(file);
    input.value = '';
  }
  async function handleTarkovDevConfirm() {
    await confirmTarkovDevImport(tarkovDevTargetMode.value);
  }
  async function handleEftLogsFolderChange(event: Event) {
    const input = event.target as HTMLInputElement;
    try {
      const files = input.files ? Array.from(input.files) : [];
      if (files.length === 0) return;
      await parseEftLogsFiles(files);
      input.value = '';
    } catch (err) {
      logger.error('DataManagementCard: parseEftLogsFiles failed', err, eftLogsImportError.value);
      return;
    }
  }
  function handleEftLogsVersionToggle(version: string, enabled: boolean) {
    try {
      const nextVersions = new Set(eftLogsIncludedVersions.value);
      if (enabled) {
        nextVersions.add(version);
      } else {
        nextVersions.delete(version);
      }
      if (nextVersions.size === 0) return;
      setEftLogsIncludedVersions(Array.from(nextVersions));
    } catch (err) {
      logger.error(
        'DataManagementCard: setEftLogsIncludedVersions failed',
        err,
        eftLogsImportError.value
      );
    }
  }
  async function handleEftLogsConfirm() {
    try {
      await confirmEftLogsImport(eftLogsTargetMode.value);
    } catch (err) {
      logger.error(
        'DataManagementCard: confirmEftLogsImport failed',
        err,
        eftLogsImportError.value
      );
      return;
    }
  }
  const eftUnknownVersionKey = 'unknown';
  function formatEftLogsVersionLabel(version: string): string {
    const versionLabel =
      version === eftUnknownVersionKey ? t('settings.log_import.version_unknown') : version;
    const sessionCount = eftLogsVersionSessionCounts.value[version] ?? 0;
    return `${versionLabel} (${sessionCount})`;
  }
  function formatEftLogsUnknownTask(
    taskId: string,
    metadataSource: MetadataStoreTaskLookup = metadataStore
  ): string {
    const task =
      typeof metadataSource.getTaskById === 'function'
        ? metadataSource.getTaskById(taskId)
        : metadataSource.tasks?.find((candidate) => candidate.id === taskId);
    const taskName = typeof task?.name === 'string' ? task.name.trim() : '';
    if (!taskName) return taskId;
    return `${taskName} (${taskId})`;
  }
  const eftLogsCompletedCount = computed(() => eftLogsPreview.value?.matchedTaskIds.length ?? 0);
  const eftLogsActiveTaskIds = computed(() => {
    const matchedTaskIds = eftLogsPreview.value?.matchedTaskIds ?? [];
    const matchedStartedTaskIds = eftLogsPreview.value?.matchedStartedTaskIds ?? [];
    if (matchedStartedTaskIds.length === 0) return [];
    if (matchedTaskIds.length === 0) return matchedStartedTaskIds;
    const completedTaskIdSet = new Set(matchedTaskIds);
    return matchedStartedTaskIds.filter((taskId) => !completedTaskIdSet.has(taskId));
  });
  const eftLogsActiveCount = computed(() => eftLogsActiveTaskIds.value.length);
  const eftLogsAvailableVersions = computed(() => eftLogsPreview.value?.availableVersions ?? []);
  const eftLogsIncludedVersions = computed(() => eftLogsPreview.value?.includedVersions ?? []);
  const eftLogsVersionSessionCounts = computed(
    () => eftLogsPreview.value?.versionSessionCounts ?? {}
  );
  const eftLogsPvpCount = computed(() => {
    const matchedTaskIdsByMode = eftLogsPreview.value?.matchedTaskIdsByMode;
    const matchedStartedTaskIdsByMode = eftLogsPreview.value?.matchedStartedTaskIdsByMode;
    if (!matchedTaskIdsByMode || !matchedStartedTaskIdsByMode) return 0;
    return matchedTaskIdsByMode.pvp.length + matchedStartedTaskIdsByMode.pvp.length;
  });
  const eftLogsPveCount = computed(() => {
    const matchedTaskIdsByMode = eftLogsPreview.value?.matchedTaskIdsByMode;
    const matchedStartedTaskIdsByMode = eftLogsPreview.value?.matchedStartedTaskIdsByMode;
    if (!matchedTaskIdsByMode || !matchedStartedTaskIdsByMode) return 0;
    return matchedTaskIdsByMode.pve.length + matchedStartedTaskIdsByMode.pve.length;
  });
  const eftLogsUnknownCount = computed(() => {
    const matchedTaskIdsByMode = eftLogsPreview.value?.matchedTaskIdsByMode;
    const matchedStartedTaskIdsByMode = eftLogsPreview.value?.matchedStartedTaskIdsByMode;
    if (!matchedTaskIdsByMode || !matchedStartedTaskIdsByMode) return 0;
    return matchedTaskIdsByMode.unknown.length + matchedStartedTaskIdsByMode.unknown.length;
  });
  const eftLogsUnknownCompletedTaskIds = computed(
    () => eftLogsPreview.value?.matchedTaskIdsByMode.unknown ?? []
  );
  const eftLogsUnknownStartedTaskIds = computed(
    () => eftLogsPreview.value?.matchedStartedTaskIdsByMode.unknown ?? []
  );
  const eftLogsHasPvpMatches = computed(() => eftLogsPvpCount.value > 0);
  const eftLogsHasPveMatches = computed(() => eftLogsPveCount.value > 0);
  const eftLogsRequiresManualModeSelection = computed(
    () =>
      eftLogsUnknownCount.value > 0 || (!eftLogsHasPvpMatches.value && !eftLogsHasPveMatches.value)
  );
  const eftLogsModeSummaryLabel = computed(() => {
    if (eftLogsHasPvpMatches.value && eftLogsHasPveMatches.value) {
      return t('settings.log_import.mode_summary_both');
    }
    if (eftLogsHasPveMatches.value) {
      return t('settings.log_import.mode_summary_pve');
    }
    if (eftLogsHasPvpMatches.value) {
      return t('settings.log_import.mode_summary_pvp');
    }
    return t('settings.log_import.mode_summary_unknown');
  });
  const editionLabelFromBackup = computed(() => getEditionLabel(backupPreview.value?.gameEdition));
  // --- Any import active? ---
  const isAnyImportActive = computed(
    () =>
      backupImportState.value === 'preview' ||
      tarkovDevImportState.value === 'preview' ||
      eftLogsImportState.value === 'preview'
  );
  // --- Date formatting ---
  function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
</script>
