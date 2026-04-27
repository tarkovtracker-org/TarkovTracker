<template>
  <UAlert
    v-if="isBlockedByOtherDataFlow"
    icon="i-mdi-progress-clock"
    color="warning"
    variant="soft"
    :title="$t('settings.data_management.active_flow_blocked_title')"
    :description="activeDataFlowBlockedDescription"
    class="mb-4"
  />
  <template v-if="showImportTools">
    <GenericCard
      v-if="!isBlockedByOtherDataFlow && !isBackupOrEftLogsImportPreviewActive"
      icon="mdi-account-arrow-up"
      icon-color="info"
      highlight-color="info"
      :fill-height="false"
      :title="$t('settings.tarkov_dev_import.title')"
      title-classes="text-lg font-semibold"
    >
      <template #title-right>
        <UBadge color="info" variant="subtle" size="xs">
          {{ $t('settings.data_management.recommended_badge') }}
        </UBadge>
      </template>
      <template #content>
        <div class="space-y-3 px-4 py-4">
          <p class="text-surface-500 text-sm">
            {{ $t('settings.data_management.tarkov_dev_section_description') }}
          </p>
          <template v-if="!isTarkovDevImportPreviewActive">
            <template v-if="isLinked">
              <div class="bg-surface-900/80 space-y-3 rounded-md border border-white/10 p-3">
                <div class="flex items-center justify-between gap-3">
                  <span class="text-surface-400 text-sm">
                    {{ $t('settings.tarkov_dev_import.linked_uid') }}
                  </span>
                  <span class="text-surface-100 font-mono text-sm font-semibold">
                    {{ tarkovUid }}
                  </span>
                </div>
                <p class="text-surface-500 text-xs">
                  {{ $t('settings.tarkov_dev_import.refetch_hint') }}
                </p>
                <div class="space-y-2">
                  <span class="text-surface-300 text-xs font-semibold">
                    {{ $t('settings.tarkov_dev_import.refetch_mode_label') }}
                  </span>
                  <div class="grid grid-cols-3 gap-2">
                    <UButton
                      v-for="option in tarkovDevRefetchModeOptions"
                      :key="option.value"
                      :variant="tarkovDevRefetchMode === option.value ? 'solid' : 'soft'"
                      :color="option.value === TARKOV_DEV_ARENA_MODE ? 'neutral' : 'info'"
                      size="xs"
                      class="justify-center"
                      :disabled="isAnyImportActive || option.disabled"
                      @click="selectTarkovDevRefetchMode(option.value)"
                    >
                      {{ option.label }}
                    </UButton>
                  </div>
                  <p class="text-surface-500 text-xs">
                    {{ $t('settings.tarkov_dev_import.refetch_mode_arena_unavailable') }}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <UButton
                    icon="i-mdi-refresh"
                    color="info"
                    size="xs"
                    :disabled="isAnyImportActive || !isTarkovDevRefetchModeSupported"
                    :loading="isTarkovDevProfileUrlLoading"
                    @click="handleTarkovDevRefetch"
                  >
                    {{ $t('settings.tarkov_dev_import.refetch_profile') }}
                  </UButton>
                  <UButton
                    icon="i-mdi-open-in-new"
                    variant="soft"
                    color="info"
                    size="xs"
                    :href="tarkovDevProfileUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    :disabled="!tarkovDevProfileUrl"
                  >
                    {{ $t('settings.tarkov_dev_import.view_profile') }}
                  </UButton>
                  <UButton
                    icon="i-mdi-link-off"
                    variant="soft"
                    color="neutral"
                    size="xs"
                    :disabled="isAnyImportActive"
                    @click="handleTarkovDevUnlink"
                  >
                    {{ $t('settings.tarkov_dev_import.unlink_profile') }}
                  </UButton>
                </div>
              </div>
            </template>
            <form
              v-else
              class="bg-surface-900/80 space-y-3 rounded-md border border-white/10 p-3"
              @submit.prevent="handleTarkovDevProfileUrlSubmit"
            >
              <i18n-t
                keypath="settings.tarkov_dev_import.profile_url_hint"
                tag="p"
                class="text-surface-400 text-sm"
              >
                <template #link>
                  <a
                    href="https://tarkov.dev/players"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-info-300 hover:text-info-200 underline"
                  >
                    {{ $t('settings.tarkov_dev_import.profile_url_hint_link') }}
                  </a>
                </template>
              </i18n-t>
              <p class="text-surface-500 text-xs">
                {{ $t('settings.tarkov_dev_import.profile_url_refresh_hint') }}
              </p>
              <div class="flex flex-col gap-2 sm:flex-row">
                <UInput
                  v-model="tarkovDevProfileUrlInput"
                  type="url"
                  icon="i-mdi-link-variant"
                  class="min-w-0 flex-1"
                  :aria-label="$t('settings.tarkov_dev_import.profile_url_label')"
                  :disabled="isAnyImportActive"
                  :placeholder="$t('settings.tarkov_dev_import.profile_url_placeholder')"
                />
                <UButton
                  type="submit"
                  icon="i-mdi-account-search"
                  color="info"
                  class="justify-center"
                  :disabled="isTarkovDevProfileUrlBlank || isAnyImportActive"
                  :loading="isTarkovDevProfileUrlLoading"
                >
                  {{ $t('settings.tarkov_dev_import.fetch_profile') }}
                </UButton>
              </div>
            </form>
          </template>
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
              <details class="group px-3 py-2">
                <summary
                  class="text-info-300 hover:text-info-200 flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold select-none"
                >
                  <span>{{ $t('settings.tarkov_dev_import.skills_details_toggle') }}</span>
                  <UIcon
                    name="i-mdi-chevron-down"
                    class="h-4 w-4 transition-transform group-open:rotate-180"
                  />
                </summary>
                <div class="border-surface-700 mt-2 max-h-60 overflow-y-auto border-t pt-2">
                  <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
                    <div class="text-surface-500 text-xs font-semibold">
                      {{ $t('settings.tarkov_dev_import.skills_details_skill') }}
                    </div>
                    <div class="text-surface-500 text-right text-xs font-semibold">
                      {{ $t('settings.tarkov_dev_import.skills_details_value') }}
                    </div>
                    <template v-for="skill in tarkovDevSkillDetails" :key="skill.id">
                      <div class="text-surface-200 truncate font-mono text-xs">
                        {{ skill.id }}
                      </div>
                      <div class="text-surface-100 text-right font-mono text-xs font-semibold">
                        {{ skill.value }}
                      </div>
                    </template>
                  </div>
                </div>
              </details>
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
            <div
              v-if="tarkovDevFixedTargetMode"
              class="bg-surface-900/80 rounded-md border border-white/10 px-3 py-2"
            >
              <div class="flex items-start gap-2">
                <UIcon name="i-mdi-target-account" class="text-info-300 mt-0.5 h-4 w-4 shrink-0" />
                <p class="text-surface-200 text-sm">
                  {{ tarkovDevImportTargetNotice }}
                </p>
              </div>
            </div>
            <div v-else class="space-y-1">
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
        </div>
      </template>
    </GenericCard>
    <GenericCard
      v-if="!isBlockedByOtherDataFlow && !isTarkovDevImportPreviewActive"
      icon="mdi-folder-upload-outline"
      icon-color="info"
      highlight-color="info"
      :fill-height="false"
      :title="$t('settings.data_management.eft_logs_section_title')"
      title-classes="text-lg font-semibold"
    >
      <template #content>
        <div class="space-y-3 px-4 py-4">
          <input
            ref="eftLogsFolderInputRef"
            type="file"
            webkitdirectory
            directory
            multiple
            class="hidden"
            @change="handleEftLogsFolderChange"
          />
          <p class="text-surface-500 text-sm">
            {{ $t('settings.data_management.eft_logs_section_description') }}
          </p>
          <template v-if="!isAnyImportPreviewActive">
            <UButton
              icon="i-mdi-folder-upload-outline"
              block
              :ui="{
                base: 'bg-info-900 hover:bg-info-800 active:bg-info-700 text-info-200 focus-visible:ring focus-visible:ring-info-500',
              }"
              :disabled="isAnyImportActive"
              @click="showEftLogsFolderInput"
            >
              {{ $t('settings.data_management.import_eft_logs_folder_button') }}
            </UButton>
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
                <li>
                  <span class="inline-flex items-center gap-1">
                    {{ $t('settings.log_import.deleted_logs_hint') }}
                    <UTooltip :text="$t('settings.log_import.deleted_logs_hint_tooltip')">
                      <UIcon name="i-mdi-information" class="text-surface-500 h-3.5 w-3.5" />
                    </UTooltip>
                  </span>
                </li>
              </ul>
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
      </template>
    </GenericCard>
  </template>
  <template v-if="showBackupTools">
    <GenericCard
      v-if="!isBlockedByOtherDataFlow && !isTarkovDevImportPreviewActive && !isEftLogsPreviewActive"
      icon="mdi-backup-restore"
      icon-color="primary"
      highlight-color="primary"
      :fill-height="false"
      :title="$t('settings.data_management.backup_restore_section_title')"
      title-classes="text-lg font-semibold"
    >
      <template #content>
        <div class="space-y-3 px-4 py-4">
          <input
            ref="backupFileInputRef"
            type="file"
            accept=".json"
            class="hidden"
            @change="handleBackupFileChange"
          />
          <p class="text-surface-500 text-sm">
            {{ $t('settings.data_management.backup_restore_section_description') }}
          </p>
          <template v-if="!isAnyImportPreviewActive">
            <div class="grid gap-3 md:grid-cols-2">
              <div class="bg-surface-900/80 space-y-4 rounded-md border border-white/10 p-4">
                <div class="flex items-start gap-3">
                  <div
                    class="bg-primary-900/70 text-primary-200 border-primary-700/60 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border"
                  >
                    <UIcon name="i-mdi-download" class="h-5 w-5" />
                  </div>
                  <div class="min-w-0 space-y-1">
                    <p class="text-surface-100 text-sm font-semibold">
                      {{ $t('settings.data_management.export_button') }}
                    </p>
                    <p class="text-surface-400 text-sm">
                      {{ $t('settings.data_management.export_description') }}
                    </p>
                  </div>
                </div>
                <UButton
                  icon="i-mdi-download"
                  block
                  :ui="{
                    base: 'bg-primary-900 hover:bg-primary-800 active:bg-primary-700 text-primary-200 focus-visible:ring focus-visible:ring-primary-500',
                  }"
                  :disabled="isAnyImportActive"
                  @click="handleExportProgress"
                >
                  {{ $t('settings.data_management.export_button') }}
                </UButton>
              </div>
              <div class="bg-surface-900/80 space-y-4 rounded-md border border-white/10 p-4">
                <div class="flex items-start gap-3">
                  <div
                    class="bg-primary-900/70 text-primary-200 border-primary-700/60 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border"
                  >
                    <UIcon name="i-mdi-file-upload-outline" class="h-5 w-5" />
                  </div>
                  <div class="min-w-0 space-y-1">
                    <p class="text-surface-100 text-sm font-semibold">
                      {{ $t('settings.data_management.import_backup_title') }}
                    </p>
                    <p class="text-surface-400 text-sm">
                      {{ $t('settings.data_management.import_backup_description') }}
                    </p>
                  </div>
                </div>
                <UButton
                  icon="i-mdi-file-upload-outline"
                  block
                  :ui="{
                    base: 'bg-primary-900 hover:bg-primary-800 active:bg-primary-700 text-primary-200 focus-visible:ring focus-visible:ring-primary-500',
                  }"
                  :disabled="isAnyImportActive"
                  @click="backupFileInputRef?.click()"
                >
                  {{ $t('settings.data_management.import_backup_button') }}
                </UButton>
              </div>
            </div>
          </template>
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
        </div>
      </template>
    </GenericCard>
    <GenericCard
      v-if="!isBlockedByOtherDataFlow"
      icon="mdi-bug-outline"
      icon-color="warning"
      highlight-color="warning"
      :fill-height="false"
      :title="$t('settings.data_management.debug_section_title')"
      title-classes="text-lg font-semibold"
    >
      <template #content>
        <div class="space-y-3 px-4 py-4">
          <p class="text-surface-400 text-sm">
            {{ $t('settings.data_management.debug_export_description') }}
          </p>
          <UButton
            icon="i-mdi-bug-outline"
            block
            :ui="{
              base: 'bg-warning-900 hover:bg-warning-800 active:bg-warning-700 text-warning-200 focus-visible:ring focus-visible:ring-warning-500',
            }"
            :disabled="isAnyImportActive"
            @click="handleExportDebugSnapshot"
          >
            {{ $t('settings.data_management.debug_export_button') }}
          </UButton>
        </div>
      </template>
    </GenericCard>
  </template>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import GameModeToggle from '@/features/settings/GameModeToggle.vue';
  import {
    useDataManagementSession,
    type DataManagementSession,
  } from '@/features/settings/useDataManagementSession';
  import {
    useMetadataStore,
    type MetadataStore,
    type MetadataStoreTaskLookup,
  } from '@/stores/useMetadata';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { GAME_MODES, sortSkillsByGameOrder, type GameMode } from '@/utils/constants';
  import { logger } from '@/utils/logger';
  import { buildTarkovDevProfileUrl } from '@/utils/tarkovDevProfileUrl';
  const TARKOV_DEV_ARENA_MODE = 'arena' as const;
  type DataManagementView = 'all' | 'imports' | 'backup';
  type TarkovDevRefetchMode = GameMode | typeof TARKOV_DEV_ARENA_MODE;
  type TarkovDevRefetchModeOption = {
    disabled: boolean;
    label: string;
    value: TarkovDevRefetchMode;
  };
  const { t } = useI18n({ useScope: 'global' });
  const props = withDefaults(
    defineProps<{
      session?: DataManagementSession;
      view?: DataManagementView;
    }>(),
    {
      session: undefined,
      view: 'all',
    }
  );
  const toast = useToast();
  const tarkovStore = useTarkovStore();
  const metadataStore: MetadataStore = useMetadataStore();
  const dataManagementSession = props.session ?? useDataManagementSession();
  const {
    exportProgress,
    exportError: backupExportError,
    exportDebugSnapshot,
    debugExportError,
    importState: backupImportState,
    importPreview: backupPreview,
    importError: backupImportError,
    parseBackupFile,
    confirmBackupImport,
    resetImport: resetBackupImport,
  } = dataManagementSession.backup;
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
  async function handleExportDebugSnapshot() {
    try {
      await exportDebugSnapshot();
    } catch (err) {
      logger.error('DataManagementCard: exportDebugSnapshot failed', err, debugExportError.value);
      if (!debugExportError.value) return;
      toast.add({
        title: t('settings.data_management.debug_export_error_title'),
        description: debugExportError.value,
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
  const {
    importState: tarkovDevImportState,
    previewData: tarkovDevPreview,
    importError: tarkovDevImportError,
    parseProfileUrl: parseTarkovDevProfileUrl,
    confirmImport: confirmTarkovDevImport,
    setError: setTarkovDevImportError,
    reset: resetTarkovDevImportState,
  } = dataManagementSession.tarkovDev;
  const tarkovDevProfileUrlInput = ref('');
  const tarkovDevFixedTargetMode = ref<GameMode | null>(null);
  const tarkovDevTargetMode = ref<GameMode>(tarkovStore.getCurrentGameMode());
  const tarkovDevRefetchMode = ref<TarkovDevRefetchMode>(tarkovStore.getCurrentGameMode());
  const isTarkovDevProfileUrlBlank = computed(
    () => tarkovDevProfileUrlInput.value.trim().length === 0
  );
  const isTarkovDevProfileUrlLoading = computed(() => tarkovDevImportState.value === 'loading');
  const {
    importState: eftLogsImportState,
    previewData: eftLogsPreview,
    importError: eftLogsImportError,
    parseFiles: parseEftLogsFiles,
    setIncludedVersions: setEftLogsIncludedVersions,
    confirmImport: confirmEftLogsImport,
    reset: resetEftLogsImport,
  } = dataManagementSession.eftLogs;
  const eftDefaultLogsPath = computed(() => t('settings.log_import.default_path_value'));
  const eftSessionFolderExamplePath = computed(() =>
    t('settings.log_import.session_folder_example_path')
  );
  const eftLogsFolderInputRef = ref<HTMLInputElement | null>(null);
  const eftLogsTargetMode = ref<GameMode>(tarkovStore.getCurrentGameMode());
  const eftLogsNoQuestEventsError = computed(() =>
    t('settings.log_import.errors.no_quest_events_found')
  );
  const eftLogsNoNotificationLogsError = computed(() =>
    t('settings.log_import.errors.no_notification_logs_found')
  );
  const shouldShowEftLogsCleanupHelpToast = computed(
    () =>
      eftLogsImportState.value === 'error' &&
      (eftLogsImportError.value === eftLogsNoQuestEventsError.value ||
        eftLogsImportError.value === eftLogsNoNotificationLogsError.value)
  );
  const tarkovUid = computed(() => tarkovStore.getTarkovUid());
  const isLinked = computed(() => tarkovUid.value !== null);
  const tarkovDevRefetchModeOptions = computed<TarkovDevRefetchModeOption[]>(() => [
    {
      disabled: false,
      label: t('settings.tarkov_dev_import.refetch_mode_pvp'),
      value: GAME_MODES.PVP,
    },
    {
      disabled: false,
      label: t('settings.tarkov_dev_import.refetch_mode_pve'),
      value: GAME_MODES.PVE,
    },
    {
      disabled: true,
      label: t('settings.tarkov_dev_import.refetch_mode_arena'),
      value: TARKOV_DEV_ARENA_MODE,
    },
  ]);
  function isTarkovDevImportableMode(mode: TarkovDevRefetchMode): mode is GameMode {
    return mode !== TARKOV_DEV_ARENA_MODE;
  }
  const isTarkovDevRefetchModeSupported = computed(() =>
    isTarkovDevImportableMode(tarkovDevRefetchMode.value)
  );
  const tarkovDevProfileUrl = computed(() => {
    if (!isTarkovDevImportableMode(tarkovDevRefetchMode.value)) return undefined;
    return buildTarkovDevProfileUrl(tarkovUid.value, tarkovDevRefetchMode.value);
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
  const tarkovDevSkillDetails = computed(() => {
    if (!tarkovDevPreview.value) return [];
    return sortSkillsByGameOrder(
      Object.entries(tarkovDevPreview.value.skills).map(([id, value]) => ({
        id,
        name: id,
        value,
      }))
    );
  });
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
  const tarkovDevFixedTargetModeLabel = computed(() =>
    tarkovDevFixedTargetMode.value === GAME_MODES.PVE
      ? t('settings.game_settings.pve')
      : t('settings.game_settings.pvp')
  );
  const tarkovDevImportTargetNotice = computed(() =>
    t('settings.tarkov_dev_import.import_target_notice', {
      mode: tarkovDevFixedTargetModeLabel.value,
    })
  );
  function showEftLogsFolderInput() {
    eftLogsFolderInputRef.value?.click();
  }
  function updateTarkovDevImportTarget(
    sourceMode: GameMode | null | undefined,
    fallbackMode?: GameMode
  ) {
    const targetMode = sourceMode ?? fallbackMode ?? null;
    tarkovDevFixedTargetMode.value = targetMode;
    if (!targetMode) return;
    tarkovDevRefetchMode.value = targetMode;
    tarkovDevTargetMode.value = targetMode;
  }
  function selectTarkovDevRefetchMode(mode: TarkovDevRefetchMode) {
    if (!isTarkovDevImportableMode(mode)) return;
    tarkovDevRefetchMode.value = mode;
    tarkovDevTargetMode.value = mode;
  }
  async function handleTarkovDevProfileUrlSubmit() {
    try {
      const source = await parseTarkovDevProfileUrl(tarkovDevProfileUrlInput.value);
      updateTarkovDevImportTarget(source?.mode);
    } catch (err) {
      handleTarkovDevUnexpectedError('profile_url_submit', err);
    }
  }
  async function handleTarkovDevRefetch() {
    try {
      const refetchMode = tarkovDevRefetchMode.value;
      if (!isTarkovDevImportableMode(refetchMode)) return;
      const linkedProfileUrl = tarkovDevProfileUrl.value;
      if (!linkedProfileUrl) return;
      const source = await parseTarkovDevProfileUrl(linkedProfileUrl);
      updateTarkovDevImportTarget(source?.mode, source ? refetchMode : undefined);
    } catch (err) {
      handleTarkovDevUnexpectedError('profile_refetch', err);
    }
  }
  function handleTarkovDevUnexpectedError(action: string, err: unknown) {
    tarkovDevFixedTargetMode.value = null;
    setTarkovDevImportError(t('settings.tarkov_dev_import.errors.unexpected_profile_flow'));
    logger.error('DataManagementCard: Tarkov.dev profile flow failed', {
      action,
      error: err,
      feature: 'settings.data_management',
    });
  }
  function handleTarkovDevUnlink() {
    tarkovDevFixedTargetMode.value = null;
    tarkovDevRefetchMode.value = tarkovStore.getCurrentGameMode();
    tarkovStore.setTarkovUid(null);
  }
  async function handleTarkovDevConfirm() {
    await confirmTarkovDevImport(tarkovDevFixedTargetMode.value ?? tarkovDevTargetMode.value);
  }
  function resetTarkovDevImport() {
    tarkovDevFixedTargetMode.value = null;
    resetTarkovDevImportState();
  }
  async function handleEftLogsFolderChange(event: Event) {
    const input = event.target as HTMLInputElement;
    try {
      const files = input.files ? Array.from(input.files) : [];
      if (files.length === 0) return;
      await parseEftLogsFiles(files);
      if (shouldShowEftLogsCleanupHelpToast.value) {
        toast.add({
          title: t('settings.log_import.cleared_logs_toast_title'),
          description: t('settings.log_import.cleared_logs_toast_description'),
          color: 'info',
        });
      }
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
  const showImportTools = computed(() => props.view === 'all' || props.view === 'imports');
  const showBackupTools = computed(() => props.view === 'all' || props.view === 'backup');
  const isTarkovDevImportPreviewActive = computed(() => tarkovDevImportState.value === 'preview');
  const isEftLogsPreviewActive = computed(() => eftLogsImportState.value === 'preview');
  type ActiveDataFlow = 'backup' | 'eft-logs' | 'tarkov-dev';
  const activeDataFlow = computed<ActiveDataFlow | null>(() => {
    if (tarkovDevImportState.value === 'loading' || isTarkovDevImportPreviewActive.value) {
      return 'tarkov-dev';
    }
    if (isEftLogsPreviewActive.value) {
      return 'eft-logs';
    }
    if (backupImportState.value === 'preview') {
      return 'backup';
    }
    return null;
  });
  const visibleDataFlows = computed<ActiveDataFlow[]>(() => {
    if (props.view === 'imports') return ['eft-logs', 'tarkov-dev'];
    if (props.view === 'backup') return ['backup'];
    return ['backup', 'eft-logs', 'tarkov-dev'];
  });
  const isBlockedByOtherDataFlow = computed(
    () => activeDataFlow.value !== null && !visibleDataFlows.value.includes(activeDataFlow.value)
  );
  const activeDataFlowLabel = computed(() => {
    if (activeDataFlow.value === 'backup') return t('settings.data_management.flow_backup');
    if (activeDataFlow.value === 'eft-logs') return t('settings.data_management.flow_eft_logs');
    if (activeDataFlow.value === 'tarkov-dev') {
      return t('settings.data_management.flow_tarkov_dev');
    }
    return t('settings.data_management.flow_data');
  });
  const activeDataFlowBlockedDescription = computed(() =>
    t('settings.data_management.active_flow_blocked_description', {
      flow: activeDataFlowLabel.value,
    })
  );
  const isBackupOrEftLogsImportPreviewActive = computed(
    () => backupImportState.value === 'preview' || isEftLogsPreviewActive.value
  );
  const isAnyImportPreviewActive = computed(
    () => isBackupOrEftLogsImportPreviewActive.value || isTarkovDevImportPreviewActive.value
  );
  const isAnyImportActive = computed(
    () => isAnyImportPreviewActive.value || tarkovDevImportState.value === 'loading'
  );
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
