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
  <template v-if="showProfileImport">
    <GenericCard
      icon="mdi-account-arrow-up"
      icon-color="info"
      highlight-color="info"
      :fill-height="false"
      :title="$t('settings.tarkov_dev_import.title')"
      title-classes="text-lg font-semibold"
    >
      <template #title-right>
        <UBadge color="info" variant="subtle" size="sm">
          {{ $t('settings.data_management.recommended_badge') }}
        </UBadge>
      </template>
      <template #content>
        <div class="space-y-3 px-4 py-4">
          <p class="text-surface-500 text-sm">
            {{ $t('settings.data_management.tarkov_dev_section_description') }}
          </p>
          <template v-if="!isTarkovDevImportPreviewActive && tarkovDevImportState !== 'success'">
            <TarkovDevLinkedRefresh
              v-if="isLinked"
              :tarkov-uid="tarkovUid"
              :selected-modes="tarkovDevRefetchModes"
              :mode-options="tarkovDevRefetchModeOptions"
              :mode-supported="isTarkovDevRefetchModeSupported"
              :profile-url="tarkovDevProfileUrl"
              :ready-to-fetch="tarkovDevLinkedReadyToFetch"
              :any-import-active="isAnyImportActive"
              :fetch-disabled="isTarkovDevRefetchDisabled"
              :loading="isTarkovDevProfileUrlLoading"
              :cooldown-minutes="tarkovDevRefetchCooldownMinutes"
              @toggle-mode="toggleTarkovDevRefetchMode"
              @select-all="selectAllTarkovDevRefetchModes"
              @begin-refresh="beginLinkedRefresh"
              @cancel-refresh="cancelLinkedRefresh"
              @refetch="handleTarkovDevRefetch"
              @unlink="handleTarkovDevUnlink"
            />
            <div v-else class="space-y-3">
              <TarkovDevLookupHelper
                :initial-mode="currentTarkovDevMode()"
                :disabled="isAnyImportActive"
                @opened-lookup="handleTarkovDevLookupOpened"
              />
              <TarkovDevUrlForm
                ref="tarkovDevUrlFormRef"
                v-model:profile-url="tarkovDevProfileUrlInput"
                :selected-modes="tarkovDevUrlModes"
                :any-import-active="isAnyImportActive"
                :submit-disabled="isTarkovDevUrlSubmitDisabled"
                :loading="isTarkovDevProfileUrlLoading"
                @toggle-mode="toggleTarkovDevUrlMode"
                @select-all="selectAllTarkovDevUrlModes"
                @submit="handleTarkovDevProfileUrlSubmit"
              />
            </div>
          </template>
          <TarkovDevModeMultiPreview
            v-if="tarkovDevImportState === 'preview' && tarkovDevMultiPreview"
            :preview="tarkovDevMultiPreview"
            :now="cooldownNow"
            :player-levels="metadataStore.playerLevels"
            :editions="metadataStore.editions"
            :is-importing="tarkovDevIsImporting"
            :import-blocked="progressImportBlocked"
            :refresh-disabled="
              isTarkovDevProfileUrlLoading || !isTurnstileReady || !isTurnstileSolved
            "
            :refreshing-mode="tarkovDevRefreshingMode"
            :format-date="formatDate"
            :format-relative-time="formatRelativeTime"
            @confirm="handleTarkovDevMultiConfirm"
            @cancel="resetTarkovDevImport()"
            @refetch-mode="handleTarkovDevPreviewModeAction($event, false)"
            @allow-stale-mode="handleTarkovDevPreviewModeAction($event, true)"
          />
          <template v-else-if="tarkovDevImportState === 'preview' && tarkovDevPreview">
            <div class="bg-surface-900/80 space-y-3 rounded-md border border-white/10 p-3">
              <div class="border-surface-800 flex items-center justify-between gap-2 border-b pb-2">
                <span class="text-surface-100 min-w-0 truncate text-sm font-semibold">
                  {{ tarkovDevPreview.displayName }}
                </span>
                <span
                  class="text-surface-100 inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold"
                >
                  <FactionBadge :faction="tarkovDevPreview.pmcFaction" :size="18" />
                  <span>{{ tarkovDevPreview.pmcFaction }}</span>
                </span>
              </div>
              <dl class="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
                <div>
                  <dt class="text-surface-400 text-xs">{{ $t('common.level') }}</dt>
                  <dd class="text-surface-100 text-sm font-semibold tabular-nums">
                    {{ previewLevel }}
                  </dd>
                </div>
                <div>
                  <dt class="text-surface-400 text-xs">{{ $t('common.prestige') }}</dt>
                  <dd class="text-surface-100 text-sm font-semibold tabular-nums">
                    {{ tarkovDevPreview.prestigeLevel }}
                  </dd>
                </div>
                <div>
                  <dt class="text-surface-400 text-xs">
                    {{ $t('settings.tarkov_dev_import.last_refreshed') }}
                  </dt>
                  <dd class="mt-0.5">
                    <UTooltip
                      v-if="tarkovDevPreviewUpdatedTooltip"
                      :text="tarkovDevPreviewUpdatedTooltip"
                    >
                      <time
                        :datetime="tarkovDevPreviewUpdatedIso"
                        tabindex="0"
                        class="cursor-help text-sm font-semibold underline decoration-dotted underline-offset-4"
                        :class="
                          isTarkovDevPreviewDataAging ? 'text-warning-400' : 'text-surface-100'
                        "
                      >
                        {{ tarkovDevPreviewUpdatedLabel }}
                      </time>
                    </UTooltip>
                    <span
                      v-else
                      class="text-sm font-semibold"
                      :class="isTarkovDevPreviewDataAging ? 'text-warning-400' : 'text-surface-100'"
                    >
                      {{ tarkovDevPreviewUpdatedLabel }}
                    </span>
                  </dd>
                </div>
                <div v-if="tarkovDevPreview.gameEditionGuess !== null">
                  <dt class="text-surface-400 text-xs">
                    {{ $t('settings.tarkov_dev_import.edition_guess') }}
                  </dt>
                  <dd class="text-surface-100 truncate text-sm font-semibold">
                    {{ editionLabel }}
                  </dd>
                </div>
              </dl>
              <TarkovDevSkillsList
                :skills="tarkovDevSkillDetails"
                :columns="2"
                :summary-label="`${$t('settings.tarkov_dev_import.skills_count', { count: skillCount })} · ${$t('settings.tarkov_dev_import.skills_details_toggle')}`"
              />
            </div>
            <div
              v-if="isTarkovDevPreviewDataAging"
              class="bg-surface-900/80 rounded-md border border-white/10 px-3 py-2"
            >
              <div class="flex items-start gap-2">
                <UIcon
                  name="i-mdi-clock-alert-outline"
                  class="text-warning-400 mt-0.5 h-4 w-4 shrink-0"
                />
                <div class="space-y-2">
                  <p class="text-surface-200 text-sm">
                    {{
                      $t('settings.tarkov_dev_import.data_age_warning', {
                        days: tarkovDevPreviewUpdatedAgeDays ?? 0,
                      })
                    }}
                  </p>
                  <div class="flex flex-wrap items-center gap-2">
                    <UButton
                      v-if="tarkovDevStaleRecoveryUrl"
                      icon="i-mdi-open-in-new"
                      color="info"
                      variant="soft"
                      size="xs"
                      :href="tarkovDevStaleRecoveryUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {{ $t('settings.tarkov_dev_import.open_profile_again') }}
                    </UButton>
                    <UButton
                      icon="i-mdi-refresh"
                      color="warning"
                      variant="soft"
                      size="xs"
                      :disabled="
                        isTarkovDevProfileUrlLoading ||
                        !isTurnstileReady ||
                        !isTurnstileSolved ||
                        tarkovDevRefetchCooldownMinutes > 0
                      "
                      :loading="isTarkovDevProfileUrlLoading"
                      @click="handleTarkovDevPreviewRefetch"
                    >
                      {{ $t('settings.tarkov_dev_import.refetch_profile') }}
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
            <div
              v-if="tarkovDevFixedTargetMode"
              class="bg-surface-900/80 rounded-md border border-white/10 px-3 py-2"
            >
              <div class="flex items-center gap-2.5">
                <GameModeBadge :mode="tarkovDevFixedTargetMode" class="-my-1.5" />
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
                variant="soft"
                color="neutral"
                class="flex-1"
                :disabled="tarkovDevIsImporting"
                @click="resetTarkovDevImport()"
              >
                {{ $t('common.cancel') }}
              </UButton>
              <UButton
                icon="i-mdi-check"
                color="primary"
                variant="solid"
                class="flex-1"
                :loading="tarkovDevIsImporting"
                :disabled="progressImportBlocked"
                @click="handleTarkovDevConfirm"
              >
                {{ $t('common.confirm_import') }}
              </UButton>
            </div>
          </template>
          <div v-if="showTurnstileWidget" class="space-y-1">
            <p class="text-surface-500 text-xs">
              {{ $t('settings.tarkov_dev_import.turnstile_hint') }}
            </p>
            <div ref="turnstileContainerRef"></div>
          </div>
          <div
            v-if="tarkovDevImportState === 'success'"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            class="space-y-3"
          >
            <UAlert
              icon="i-mdi-check-circle"
              color="success"
              variant="soft"
              :title="$t('settings.tarkov_dev_import.success_title')"
              :description="$t('settings.tarkov_dev_import.success_description')"
            />
            <div class="flex justify-start">
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-mdi-refresh"
                @click="resetTarkovDevImport()"
              >
                {{ $t('settings.tarkov_dev_import.import_another_mode') }}
              </UButton>
            </div>
          </div>
          <TarkovDevStaleAlert
            v-if="isTarkovDevStaleError"
            :age-days="tarkovDevImportErrorMeta?.days ?? 0"
            :profile-url="tarkovDevStaleRecoveryUrl"
            :loading="isTarkovDevProfileUrlLoading"
            :disabled="isAnyImportActive || !isTurnstileReady || !isTurnstileSolved"
            @retry-fresh="handleTarkovDevStaleRetry"
            @allow-stale="handleTarkovDevAllowStale"
          />
          <div
            v-else-if="tarkovDevImportState === 'error' && tarkovDevErrorMessage"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
          >
            <UAlert
              icon="i-mdi-alert-circle"
              color="error"
              variant="soft"
              :title="$t('common.import_failed')"
              :description="tarkovDevErrorMessage"
            />
          </div>
        </div>
      </template>
    </GenericCard>
  </template>
  <template v-if="showLogImport">
    <GenericCard
      icon="mdi-folder-upload-outline"
      icon-color="info"
      highlight-color="info"
      :fill-height="false"
      :title="$t('settings.data_management.eft_logs_section_title')"
      title-classes="text-lg font-semibold"
    >
      <template #content>
        <div class="space-y-3 px-4 py-4">
          <p class="text-surface-500 text-sm">
            {{ $t('settings.data_management.eft_logs_section_description') }}
          </p>
          <template v-if="!isAnyImportPreviewActive && !eftLogsIsParsing">
            <EftLogDropzone
              ref="eftLogsDropzoneRef"
              :disabled="isAnyImportActive"
              @select-files="handleEftLogsFiles"
            />
            <div class="bg-surface-900/80 rounded-md border border-white/10 p-3">
              <p class="text-surface-300 text-xs font-semibold">
                {{ $t('settings.log_import.upload_hint') }}
                {{ $t('settings.log_import.large_folder_hint') }}
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
          <div class="space-y-2">
            <output class="block">
              <span v-if="eftLogsIsParsing" class="text-sm">
                {{ $t('settings.log_import.reading_logs') }}
              </span>
            </output>
            <template v-if="eftLogsIsParsing">
              <progress
                :value="eftLogsParseProgress.bytesRead"
                :max="eftLogsParseProgress.totalBytes || 1"
                :aria-label="$t('settings.log_import.reading_logs')"
                class="w-full"
              />
              <UButton color="neutral" variant="soft" @click="cancelEftLogsParsing()">
                {{ $t('common.cancel') }}
              </UButton>
            </template>
          </div>
          <template v-if="eftLogsImportState === 'preview' && eftLogsPreview">
            <UAlert
              v-if="eftLogsPreview.hasMultipleAccounts"
              icon="i-mdi-account-multiple"
              color="warning"
              variant="soft"
              :title="$t('settings.log_import.multiple_accounts_title')"
              :description="$t('settings.log_import.multiple_accounts_description')"
            />
            <div v-if="eftLogsAccountItems.length > 1" class="space-y-1">
              <div class="flex items-center gap-1">
                <span class="text-surface-200 text-sm font-semibold" aria-hidden="true">
                  {{ $t('settings.log_import.account_filter_label') }}
                </span>
                <UTooltip :text="$t('settings.log_import.account_filter_tooltip')">
                  <UIcon name="i-mdi-information" class="text-surface-500 h-3.5 w-3.5" />
                </UTooltip>
              </div>
              <URadioGroup
                :model-value="eftLogsPreview.selectedAccount ?? undefined"
                :items="eftLogsAccountItems"
                :legend="$t('settings.log_import.account_filter_label')"
                :ui="{ legend: 'sr-only' }"
                value-key="value"
                :disabled="eftLogsIsImporting"
                @update:model-value="(account) => handleEftLogsAccountChange(String(account))"
              />
            </div>
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
                    eftLogsIsImporting ||
                    (eftLogsIncludedVersions.length === 1 &&
                      eftLogsIncludedVersions.includes(version))
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
            <EftLogImportControls
              :model-value="eftLogsSelection"
              :events="eftLogsPreview.events ?? []"
              :target-mode="eftLogsTargetMode"
              :disabled="eftLogsIsImporting"
              @update:model-value="setEftLogsSelection"
            />
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
            <div v-if="eftLogsUnknownFailedTaskIds.length" class="space-y-1">
              <p class="text-surface-400 text-xs">
                {{ $t('settings.log_import.unknown_failed_events') }}
              </p>
              <ul class="text-surface-100 space-y-1 text-xs">
                <li v-for="taskId in eftLogsUnknownFailedTaskIds" :key="`unknown-failed-${taskId}`">
                  {{ formatEftLogsUnknownTask(taskId) }}
                </li>
              </ul>
            </div>
            <p class="text-surface-300 text-sm">
              {{ $t('settings.log_import.failed_tasks', { count: eftLogsFailedCount }) }}
            </p>
            <UAlert
              v-if="eftLogsPreview.parseErrorCount || eftLogsPreview.skippedSeasonalEventCount"
              color="warning"
              :description="eftLogsSkippedEventsMessage"
            />
            <UAlert v-if="eftLogsPreviewError" color="error" :description="eftLogsPreviewError" />
            <div v-if="eftLogsRequiresManualModeSelection" class="space-y-1">
              <label class="text-surface-200 text-sm font-semibold">
                {{ $t('settings.log_import.import_unknown_to_mode') }}
              </label>
              <GameModeToggle
                v-model="eftLogsTargetMode"
                :disabled-modes="eftLogsDisabledTargetModes"
              />
              <p class="text-surface-400 text-xs">
                {{ $t('settings.log_import.import_unknown_to_mode_hint') }}
              </p>
            </div>
            <p v-else class="text-surface-400 text-xs">
              {{ $t('settings.log_import.auto_mode_hint') }}
            </p>
            <p class="text-surface-200 text-sm" role="status">
              {{
                $t('settings.log_import.selection_summary', {
                  count: eftLogsEffectiveEvents.length,
                  modes: eftLogsSelectedModeLabel,
                })
              }}
            </p>
            <div class="flex gap-2">
              <UButton
                variant="soft"
                color="neutral"
                class="flex-1"
                :disabled="eftLogsIsImporting"
                @click="resetEftLogsImport()"
              >
                {{ $t('common.cancel') }}
              </UButton>
              <UButton
                icon="i-mdi-check"
                color="primary"
                variant="solid"
                class="flex-1"
                :loading="eftLogsIsImporting"
                :disabled="
                  progressImportBlocked ||
                  eftLogsHasOutsideSeasonEvents ||
                  !eftLogsEffectiveEvents.length ||
                  eftLogsInvalidDate
                "
                @click="handleEftLogsConfirm"
              >
                {{ $t('common.confirm_import') }}
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
                  failed_count: eftLogsFailedCount,
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
      icon="mdi-backup-restore"
      icon-color="primary"
      highlight-color="primary"
      :fill-height="false"
      :title="$t('common.backup_restore')"
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
          <template v-if="!isAnyImportPreviewActive && !eftLogsIsParsing">
            <div class="grid gap-3" :class="{ 'md:grid-cols-2': !props.restoreOnly }">
              <div
                v-if="!props.restoreOnly"
                class="bg-surface-900/80 space-y-4 rounded-md border border-white/10 p-4"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="bg-primary-900/70 light:bg-primary-100 text-primary-200 border-primary-700/60 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border"
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
                    base: 'bg-primary-900 light:bg-primary-50 hover:bg-primary-800 light:hover:bg-primary-100 active:bg-primary-700 light:active:bg-primary-100 text-primary-200 focus-visible:ring focus-visible:ring-primary-500',
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
                    class="bg-primary-900/70 light:bg-primary-100 text-primary-200 border-primary-700/60 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border"
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
                  ref="backupImportButtonRef"
                  icon="i-mdi-file-upload-outline"
                  block
                  :ui="{
                    base: 'bg-primary-900 light:bg-primary-50 hover:bg-primary-800 light:hover:bg-primary-100 active:bg-primary-700 light:active:bg-primary-100 text-primary-200 focus-visible:ring focus-visible:ring-primary-500',
                  }"
                  :disabled="isAnyImportActive"
                  @click="backupFileInputRef?.click()"
                >
                  {{ $t('settings.data_management.import_backup_button') }}
                </UButton>
              </div>
            </div>
          </template>
          <RecoveryCopiesPanel
            v-if="!props.restoreOnly || recoveryCopiesImport"
            :backup="dataManagementSession.backup"
            :parsing="backupImportState === 'parsing'"
            :locked="isAnyImportActive"
          />
          <div class="flex items-center gap-3">
            <output data-testid="backup-reading-status" class="text-surface-300 text-sm">
              {{ backupReadingLabel }}
            </output>
            <template v-if="backupImportState === 'parsing'">
              <UIcon name="i-mdi-loading" class="h-5 w-5 animate-spin" aria-hidden="true" />
              <UButton variant="soft" color="neutral" @click="cancelBackupParsing">
                {{ $t('common.cancel') }}
              </UButton>
            </template>
          </div>
          <div v-if="recoveryArchiveEntries.length" class="space-y-2">
            <p class="text-surface-400 text-sm">
              {{ $t('settings.data_management.recovery_archive_select_entry') }}
            </p>
            <UButton
              v-for="(entry, index) in recoveryArchiveEntries"
              :key="index"
              color="neutral"
              :variant="selectedRecoveryArchiveEntry === index ? 'solid' : 'soft'"
              :data-testid="`recovery-archive-entry-${index}`"
              :disabled="backupImportState === 'parsing'"
              @click="reviewRecoveryArchiveEntry(index)"
            >
              {{
                $t(`settings.data_management.recovery_archive_${entry.kind}`, {
                  index: entry.index + 1,
                })
              }}
            </UButton>
          </div>
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
                  {{ $t('common.game_edition') }}
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
              <template v-if="backupPreview.seasonal">
                <div class="flex items-center justify-between px-3 py-2">
                  <span class="text-surface-400 text-xs">
                    {{ $t('settings.data_management.import_preview_seasonal_level') }}
                  </span>
                  <span class="text-surface-100 text-sm font-semibold">
                    {{ backupPreview.seasonal.level }} ({{ backupPreview.seasonal.faction }})
                  </span>
                </div>
                <div class="flex items-center justify-between px-3 py-2">
                  <span class="text-surface-400 text-xs">
                    {{ $t('settings.data_management.import_preview_seasonal_tasks') }}
                  </span>
                  <span class="text-surface-100 text-sm font-semibold">
                    {{ backupPreview.seasonal.taskCount }}
                  </span>
                </div>
              </template>
            </div>
            <div class="space-y-1">
              <label class="text-surface-200 text-sm font-semibold">
                {{ $t('settings.data_management.import_target_label') }}
              </label>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <UButton
                  :variant="importTarget === 'pvp' ? 'solid' : 'soft'"
                  color="primary"
                  size="sm"
                  block
                  @click="importTarget = 'pvp'"
                >
                  <GameModeBadge :mode="GAME_MODES.PVP" class="-my-1" />
                  <span class="min-w-0 wrap-anywhere">
                    {{ $t('settings.data_management.import_target_pvp') }}
                  </span>
                </UButton>
                <UButton
                  :variant="importTarget === 'pve' ? 'solid' : 'soft'"
                  color="primary"
                  size="sm"
                  block
                  @click="importTarget = 'pve'"
                >
                  <GameModeBadge :mode="GAME_MODES.PVE" class="-my-1" />
                  <span class="min-w-0 wrap-anywhere">
                    {{ $t('settings.data_management.import_target_pve') }}
                  </span>
                </UButton>
                <UButton
                  :variant="importTarget === GAME_MODES.SEASONAL ? 'solid' : 'soft'"
                  color="primary"
                  size="sm"
                  block
                  :disabled="!backupPreview.seasonal"
                  @click="importTarget = GAME_MODES.SEASONAL"
                >
                  <GameModeBadge :mode="GAME_MODES.SEASONAL" class="-my-1" />
                  <span class="min-w-0 wrap-anywhere">
                    {{ $t('common.seasonal_pvp', 'Seasonal PvP') }}
                  </span>
                </UButton>
                <UButton
                  :variant="importTarget === 'all' ? 'solid' : 'soft'"
                  color="primary"
                  size="sm"
                  block
                  @click="importTarget = 'all'"
                >
                  {{ $t('settings.data_management.import_target_all', 'All Available') }}
                </UButton>
              </div>
            </div>
            <div class="flex gap-2">
              <UButton variant="soft" color="neutral" class="flex-1" @click="resetBackupPreview">
                {{ $t('common.cancel') }}
              </UButton>
              <UButton
                icon="i-mdi-check"
                color="primary"
                variant="solid"
                class="flex-1"
                @click="handleBackupConfirm"
              >
                {{ $t('common.confirm_import') }}
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
              :title="$t('common.import_failed')"
              :description="backupImportError"
            />
          </div>
        </div>
      </template>
    </GenericCard>
    <BugReportCard
      v-if="!props.restoreOnly && !isBlockedByOtherDataFlow"
      :backup="dataManagementSession.backup"
      :disabled="isAnyImportActive"
    />
  </template>
</template>
<script setup lang="ts">
  import FactionBadge from '@/components/FactionBadge.vue';
  import GameModeBadge from '@/components/GameModeBadge.vue';
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { useProgressImportBlocked } from '@/composables/useGameModeSwitch';
  import { useTurnstileWidget } from '@/composables/useTurnstile';
  import BugReportCard from '@/features/settings/BugReportCard.vue';
  import EftLogDropzone from '@/features/settings/EftLogDropzone.vue';
  import EftLogImportControls from '@/features/settings/EftLogImportControls.vue';
  import GameModeToggle from '@/features/settings/GameModeToggle.vue';
  import RecoveryCopiesPanel from '@/features/settings/RecoveryCopiesPanel.vue';
  import TarkovDevLinkedRefresh from '@/features/settings/TarkovDevLinkedRefresh.vue';
  import TarkovDevLookupHelper from '@/features/settings/TarkovDevLookupHelper.vue';
  import TarkovDevModeMultiPreview from '@/features/settings/TarkovDevModeMultiPreview.vue';
  import TarkovDevSkillsList from '@/features/settings/TarkovDevSkillsList.vue';
  import TarkovDevStaleAlert from '@/features/settings/TarkovDevStaleAlert.vue';
  import TarkovDevUrlForm from '@/features/settings/TarkovDevUrlForm.vue';
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
  import {
    GAME_MODES,
    GAME_MODE_VALUES,
    getGameModeLabel,
    sortSkillsByGameOrder,
    type GameMode,
  } from '@/utils/constants';
  import { hasInvalidEftLogCutoff, selectEftImportEvents } from '@/utils/eftLogImportSelection';
  import {
    hasOutsideSeasonEvents,
    isCurrentSeasonLogEvent,
    isEligibleImportEvent,
    UNIDENTIFIED_LOG_ACCOUNT,
    type EftLogAccountSummary,
  } from '@/utils/eftLogQuestParser';
  import { logger } from '@/utils/logger';
  import { getImportCooldownRemainingMs } from '@/utils/tarkovDevImportCooldown';
  import { resolveTarkovDevProfileSource } from '@/utils/tarkovDevProfileSource';
  import { buildTarkovDevProfileUrl } from '@/utils/tarkovDevProfileUrl';
  import type { BackupImportTargetModes } from '@/composables/useDataBackup';
  const TARKOV_DEV_ARENA_MODE = 'arena' as const;
  type DataManagementView = 'all' | 'imports' | 'backup' | 'eft-logs' | 'tarkov-dev';
  type TarkovDevRefetchMode = GameMode | typeof TARKOV_DEV_ARENA_MODE;
  type TarkovDevRefetchModeOption = {
    color: 'info' | 'neutral';
    disabled: boolean;
    label: string;
    value: TarkovDevRefetchMode;
  };
  const { locale, t } = useI18n({ useScope: 'global' });
  const runtimeConfig = useRuntimeConfig();
  const props = withDefaults(
    defineProps<{
      session?: DataManagementSession;
      restoreOnly?: boolean;
      view?: DataManagementView;
    }>(),
    {
      session: undefined,
      view: 'all',
    }
  );
  const emit = defineEmits<{
    tarkovDevImported: [payload: { mode: GameMode; modes?: GameMode[]; editionResolved: boolean }];
  }>();
  const toast = useToast();
  const tarkovStore = useTarkovStore();
  const metadataStore: MetadataStore = useMetadataStore();
  const progressImportBlocked = useProgressImportBlocked();
  const dataManagementSession = props.session ?? useDataManagementSession();
  const {
    exportProgress,
    recoveryArchiveEntries,
    selectedRecoveryArchiveEntry,
    reviewRecoveryArchiveEntry,
    recoveryCopiesImport,
    exportError: backupExportError,
    importState: backupImportState,
    importPreview: backupPreview,
    importError: backupImportError,
    parseBackupFile,
    confirmBackupImport,
    resetImport: resetBackupImport,
  } = dataManagementSession.backup;
  const backupReadingLabel = computed(() =>
    backupImportState.value === 'parsing' ? t('settings.data_management.reading_backup') : ''
  );
  const backupFileInputRef = ref<HTMLInputElement | null>(null);
  const backupImportButtonRef = ref<{ $el?: HTMLElement } | null>(null);
  const importTarget = ref<GameMode | 'all'>('all');
  function resetBackupPreview() {
    importTarget.value = 'all';
    resetBackupImport();
  }
  function cancelBackupParsing() {
    resetBackupPreview();
    // Cancellation unmounts the focused control; return to the file picker.
    void nextTick(() => backupImportButtonRef.value?.$el?.focus());
  }
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
  /** A superseded-progress file adds copies to Recovery copies instead of opening a preview. */
  function announceRecoveryCopiesImport() {
    const result = recoveryCopiesImport.value;
    if (!result) return;
    toast.add(
      result.added > 0
        ? {
            title: t(
              'settings.data_management.recovery_copies_added',
              { count: result.added },
              result.added
            ),
            color: 'success',
          }
        : { title: t('settings.data_management.recovery_copies_already_present'), color: 'info' }
    );
  }
  async function handleBackupFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    importTarget.value = 'all';
    await parseBackupFile(file);
    input.value = '';
    announceRecoveryCopiesImport();
  }
  const buildBackupImportSelection = (
    target: GameMode | 'all',
    hasSeasonalData: boolean
  ): BackupImportTargetModes => {
    const targetIncludes = (mode: GameMode): boolean => target === 'all' || target === mode;
    return {
      pvp: targetIncludes(GAME_MODES.PVP),
      pve: targetIncludes(GAME_MODES.PVE),
      seasonal: hasSeasonalData && targetIncludes(GAME_MODES.SEASONAL),
    };
  };
  async function handleBackupConfirm() {
    const selection = buildBackupImportSelection(
      importTarget.value,
      backupPreview.value?.seasonal !== null
    );
    try {
      await confirmBackupImport(selection);
      if (backupImportState.value === 'success') {
        toast.add({
          title: t('settings.data_management.import_success_title', 'Backup Imported'),
          description: t(
            'settings.data_management.import_success_description',
            'Your progress data has been restored successfully.'
          ),
          color: 'success',
        });
      }
    } catch (error) {
      logger.error('[DataManagementCard] Backup import failed:', error);
      toast.add({
        title: t('settings.data_management.import_error_title', 'Backup Import Failed'),
        description: t(
          'settings.data_management.import_error_description',
          'Your backup could not be imported. Please try again.'
        ),
        color: 'error',
      });
    }
  }
  const {
    importState: tarkovDevImportState,
    isImporting: tarkovDevIsImporting,
    previewData: tarkovDevPreview,
    multiPreview: tarkovDevMultiPreview,
    importError: tarkovDevImportError,
    importErrorCode: tarkovDevImportErrorCode,
    importErrorMeta: tarkovDevImportErrorMeta,
    parseProfileUrl: parseTarkovDevProfileUrl,
    parseProfileModes: parseTarkovDevProfileModes,
    refetchPreviewMode: refetchTarkovDevPreviewMode,
    confirmImport: confirmTarkovDevImport,
    confirmMultiImport: confirmTarkovDevMultiImport,
    setError: setTarkovDevImportError,
    reset: resetTarkovDevImportState,
  } = dataManagementSession.tarkovDev;
  const turnstileContainerRef = ref<HTMLElement | null>(null);
  const {
    enabled: isTurnstileEnabled,
    getToken: getTurnstileToken,
    ready: isTurnstileReady,
    reset: resetTurnstile,
    solved: isTurnstileSolved,
  } = useTurnstileWidget(turnstileContainerRef);
  const tarkovDevProfileUrlInput = ref('');
  const lastTarkovDevSingleUrl = ref<string>();
  const tarkovDevRequestGeneration = ref(0);
  const currentTarkovDevMode = (): GameMode => tarkovStore.getCurrentGameMode();
  const currentImportableMode = (): GameMode => tarkovStore.getCurrentGameMode();
  const tarkovDevFixedTargetMode = ref<GameMode | null>(null);
  const tarkovDevTargetMode = ref<GameMode>(currentTarkovDevMode());
  const tarkovDevUrlModes = ref<GameMode[]>([...GAME_MODE_VALUES]);
  const tarkovDevRefetchModes = ref<GameMode[]>([currentTarkovDevMode()]);
  const tarkovDevRefreshingMode = ref<GameMode | null>(null);
  const tarkovDevRefetchMode = computed<TarkovDevRefetchMode>({
    get: () => tarkovDevRefetchModes.value[0] ?? currentTarkovDevMode(),
    set: (mode) => {
      if (isTarkovDevProfileMode(mode)) tarkovDevRefetchModes.value = [mode];
    },
  });
  const isTarkovDevUrlSubmitDisabled = computed(
    () =>
      isTarkovDevProfileUrlBlank.value ||
      isAnyImportActive.value ||
      !isTurnstileReady.value ||
      !isTurnstileSolved.value
  );
  function toggleTarkovDevUrlMode(mode: GameMode) {
    if (tarkovDevUrlModes.value.includes(mode)) {
      if (tarkovDevUrlModes.value.length <= 1) return;
      tarkovDevUrlModes.value = tarkovDevUrlModes.value.filter((entry) => entry !== mode);
      return;
    }
    tarkovDevUrlModes.value = GAME_MODE_VALUES.filter(
      (entry) => entry === mode || tarkovDevUrlModes.value.includes(entry)
    );
  }
  function selectAllTarkovDevUrlModes() {
    tarkovDevUrlModes.value = [...GAME_MODE_VALUES];
  }
  const isTarkovDevProfileUrlBlank = computed(
    () => tarkovDevProfileUrlInput.value.trim().length === 0
  );
  const isTarkovDevProfileUrlLoading = computed(() => tarkovDevImportState.value === 'loading');
  const {
    isImporting: eftLogsIsImporting,
    importState: eftLogsImportState,
    previewData: eftLogsPreview,
    importError: eftLogsImportError,
    isParsing: eftLogsIsParsing,
    parseProgress: eftLogsParseProgress,
    parseFiles: parseEftLogsFiles,
    setIncludedVersions: setEftLogsIncludedVersions,
    setAccount: setEftLogsAccount,
    selection: eftLogsSelection,
    setSelection: setEftLogsSelection,
    confirmImport: confirmEftLogsImport,
    reset: resetEftLogsImport,
  } = dataManagementSession.eftLogs;
  const eftDefaultLogsPath = computed(() => t('settings.log_import.default_path_value'));
  const eftSessionFolderExamplePath = computed(() =>
    t('settings.log_import.session_folder_example_path')
  );
  const eftLogsDropzoneRef = ref<{ focusFolderButton?: () => void } | null>(null);
  const eftLogsTargetMode = ref<GameMode>();
  watch([eftLogsImportState, () => eftLogsPreview.value?.selectedAccount], () => {
    eftLogsTargetMode.value = undefined;
  });
  const eftLogsDisabledTargetModes = computed(() =>
    GAME_MODE_VALUES.filter(
      (mode) => eftLogsIsImporting.value || !eftLogsSelection.value.modes.includes(mode)
    )
  );
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
  const tarkovDevUrlFormRef = ref<{ focusInput?: () => void } | null>(null);
  const tarkovDevTurnstileEngaged = ref(false);
  const tarkovDevLinkedReadyToFetch = ref(false);
  const tarkovDevRefetchModeOptions = computed<TarkovDevRefetchModeOption[]>(() => [
    {
      color: 'info',
      disabled: false,
      label: t('common.pvp'),
      value: GAME_MODES.PVP,
    },
    {
      color: 'info',
      disabled: false,
      label: t('common.pve'),
      value: GAME_MODES.PVE,
    },
    {
      color: 'info',
      disabled: false,
      label: t('common.seasonal_pvp'),
      value: GAME_MODES.SEASONAL,
    },
    {
      color: 'neutral',
      disabled: true,
      label: t('settings.tarkov_dev_import.refetch_mode_arena'),
      value: TARKOV_DEV_ARENA_MODE,
    },
  ]);
  function isTarkovDevProfileMode(mode: unknown): mode is GameMode {
    return mode === GAME_MODES.PVP || mode === GAME_MODES.PVE || mode === GAME_MODES.SEASONAL;
  }
  const isTarkovDevRefetchModeSupported = computed(
    () =>
      tarkovDevRefetchModes.value.length > 0 &&
      tarkovDevRefetchModes.value.every((mode) => isTarkovDevProfileMode(mode))
  );
  const tarkovDevProfileUrl = computed(() => {
    const primary = tarkovDevRefetchModes.value[0];
    if (!isTarkovDevProfileMode(primary)) return undefined;
    return buildTarkovDevProfileUrl(tarkovUid.value, primary);
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
  const DAY_MS = 86_400_000;
  const TARKOV_DEV_AGE_WARNING_DAYS = 2;
  const tarkovDevImportCooldownMs = computed(() => {
    const minutes = Number(runtimeConfig.public.tarkovDevImportCooldownMinutes);
    return (Number.isFinite(minutes) && minutes >= 0 ? minutes : 60) * 60_000;
  });
  const cooldownNow = ref(Date.now());
  const tarkovDevErrorMessage = computed(() => {
    const code = tarkovDevImportErrorCode.value;
    if (code) {
      return t(`settings.tarkov_dev_import.errors.${code}`, tarkovDevImportErrorMeta.value ?? {}, {
        default: t('settings.tarkov_dev_import.errors.unexpected_profile_flow'),
      });
    }
    return tarkovDevImportError.value ?? '';
  });
  const tarkovDevPreviewUpdatedAgeDays = computed(() => {
    const updatedAt = tarkovDevPreview.value?.updatedAt;
    if (!updatedAt) return null;
    return Math.max(0, Math.floor((cooldownNow.value - updatedAt) / DAY_MS));
  });
  const tarkovDevPreviewUpdatedTooltip = computed(() => {
    const updatedAt = tarkovDevPreview.value?.updatedAt;
    return updatedAt ? formatDate(updatedAt) : null;
  });
  const tarkovDevPreviewUpdatedIso = computed(() => {
    const updatedAt = tarkovDevPreview.value?.updatedAt;
    return updatedAt ? new Date(updatedAt).toISOString() : undefined;
  });
  const tarkovDevPreviewUpdatedLabel = computed(() => {
    const updatedAt = tarkovDevPreview.value?.updatedAt;
    if (!updatedAt) return t('settings.tarkov_dev_import.last_refreshed_unknown');
    return formatRelativeTime(updatedAt, cooldownNow.value);
  });
  const isTarkovDevPreviewDataAging = computed(
    () => (tarkovDevPreviewUpdatedAgeDays.value ?? 0) >= TARKOV_DEV_AGE_WARNING_DAYS
  );
  let cooldownTimer: ReturnType<typeof setInterval> | null = null;
  onMounted(() => {
    cooldownTimer = setInterval(() => {
      cooldownNow.value = Date.now();
    }, 30_000);
  });
  onUnmounted(() => {
    if (cooldownTimer) clearInterval(cooldownTimer);
  });
  watch(tarkovDevImportState, (state) => {
    if (state === 'preview' || state === 'success') cooldownNow.value = Date.now();
  });
  const tarkovDevRefetchCooldownMinutes = computed(() => {
    const uid = tarkovUid.value;
    if (uid === null || tarkovDevRefetchModes.value.length === 0) return 0;
    const remainingPerMode = tarkovDevRefetchModes.value.map((mode) =>
      getImportCooldownRemainingMs(uid, mode, tarkovDevImportCooldownMs.value, cooldownNow.value)
    );
    if (remainingPerMode.some((ms) => ms <= 0)) return 0;
    const minRemaining = Math.min(...remainingPerMode);
    return Math.ceil(minRemaining / 60_000);
  });
  const tarkovDevFixedTargetModeLabel = computed(() => {
    const mode = tarkovDevFixedTargetMode.value;
    return mode ? t(getGameModeLabel(mode)) : t('common.pvp');
  });
  const tarkovDevImportTargetNotice = computed(() =>
    t('settings.tarkov_dev_import.import_target_notice', {
      mode: tarkovDevFixedTargetModeLabel.value,
    })
  );
  /** Cancelling unmounts the Cancel button, so return focus to the picker it replaced. */
  function cancelEftLogsParsing() {
    resetEftLogsImport();
    void nextTick(() => eftLogsDropzoneRef.value?.focusFolderButton?.());
  }
  function updateTarkovDevImportTarget(
    sourceMode: GameMode | null | undefined,
    fallbackMode?: GameMode
  ) {
    const targetMode = isTarkovDevProfileMode(sourceMode) ? sourceMode : (fallbackMode ?? null);
    tarkovDevFixedTargetMode.value = targetMode;
    if (!targetMode) return;
    tarkovDevRefetchMode.value = targetMode;
    tarkovDevTargetMode.value = targetMode;
  }
  function selectTarkovDevRefetchMode(mode: TarkovDevRefetchMode) {
    if (!isTarkovDevProfileMode(mode)) return;
    tarkovDevRefetchModes.value = [mode];
    tarkovDevTargetMode.value = mode;
    tarkovDevLinkedReadyToFetch.value = false;
  }
  function toggleTarkovDevRefetchMode(mode: TarkovDevRefetchMode) {
    if (!isTarkovDevProfileMode(mode)) return;
    if (tarkovDevRefetchModes.value.includes(mode)) {
      if (tarkovDevRefetchModes.value.length <= 1) return;
      tarkovDevRefetchModes.value = tarkovDevRefetchModes.value.filter((entry) => entry !== mode);
    } else {
      tarkovDevRefetchModes.value = GAME_MODE_VALUES.filter(
        (entry) => entry === mode || tarkovDevRefetchModes.value.includes(entry)
      );
    }
    tarkovDevTargetMode.value = tarkovDevRefetchModes.value[0] ?? currentTarkovDevMode();
    tarkovDevLinkedReadyToFetch.value = false;
  }
  function selectAllTarkovDevRefetchModes() {
    tarkovDevRefetchModes.value = [...GAME_MODE_VALUES];
    tarkovDevTargetMode.value = tarkovDevRefetchModes.value[0] ?? currentTarkovDevMode();
    tarkovDevLinkedReadyToFetch.value = false;
  }
  function handleTarkovDevLookupOpened() {
    tarkovDevTurnstileEngaged.value = true;
    void nextTick(() => tarkovDevUrlFormRef.value?.focusInput?.());
  }
  function beginLinkedRefresh() {
    tarkovDevLinkedReadyToFetch.value = true;
    tarkovDevTurnstileEngaged.value = true;
  }
  function cancelLinkedRefresh() {
    tarkovDevLinkedReadyToFetch.value = false;
  }
  const isTarkovDevStaleError = computed(
    () =>
      tarkovDevImportState.value === 'error' && tarkovDevImportErrorCode.value === 'profile_stale'
  );
  const tarkovDevStaleRecoveryUrl = computed(
    () =>
      lastTarkovDevSingleUrl.value ??
      (isLinked.value
        ? tarkovDevProfileUrl.value
        : tarkovDevProfileUrlInput.value.trim() || undefined)
  );
  const isTarkovDevRefetchDisabled = computed(
    () =>
      isAnyImportActive.value ||
      !isTurnstileReady.value ||
      !isTurnstileSolved.value ||
      !isTarkovDevRefetchModeSupported.value ||
      tarkovDevRefetchCooldownMinutes.value > 0
  );
  const doesMultiPreviewNeedTurnstile = computed(() => {
    const preview = tarkovDevMultiPreview.value;
    if (!preview) return false;
    return preview.requestedModes.some((mode) => {
      const entry = preview.modes[mode];
      if (!entry) return false;
      if (entry.status === 'stale' || entry.status === 'not_found' || entry.status === 'error') {
        return true;
      }
      if (entry.status === 'ok' && entry.data.updatedAt !== null) {
        return (
          Math.floor((cooldownNow.value - entry.data.updatedAt) / DAY_MS) >=
          TARKOV_DEV_AGE_WARNING_DAYS
        );
      }
      return false;
    });
  });
  const isTurnstileNeededForForm = computed(
    () =>
      tarkovDevTurnstileEngaged.value ||
      !isTarkovDevProfileUrlBlank.value ||
      tarkovDevLinkedReadyToFetch.value ||
      tarkovDevImportState.value === 'error'
  );
  const showTurnstileWidget = computed(() => {
    if (!isTurnstileEnabled || tarkovDevImportState.value === 'success') return false;
    if (isTarkovDevImportPreviewActive.value) {
      return tarkovDevMultiPreview.value
        ? doesMultiPreviewNeedTurnstile.value
        : isTarkovDevPreviewDataAging.value;
    }
    return isTurnstileNeededForForm.value;
  });
  type TurnstileVerification = { status: 'failed' } | { status: 'ok'; token: string | null };
  function turnstileVerificationPending(): boolean {
    return isTurnstileEnabled && !isTurnstileSolved.value;
  }
  function turnstileTokenMissing(token: string | null): boolean {
    return isTurnstileEnabled && token === null;
  }
  async function verifyTurnstileToken(): Promise<TurnstileVerification> {
    if (turnstileVerificationPending()) return { status: 'failed' };
    const token = await getTurnstileToken();
    if (turnstileTokenMissing(token)) return { status: 'failed' };
    return { status: 'ok', token };
  }
  async function fetchTarkovDevProfile(profileUrl: string, fresh = false, allowStale = false) {
    const requestGeneration = ++tarkovDevRequestGeneration.value;
    lastTarkovDevSingleUrl.value = profileUrl;
    try {
      const verification = await verifyTurnstileToken();
      if (verification.status === 'failed') {
        setTarkovDevImportError(t('settings.tarkov_dev_import.errors.verification_failed'));
        return null;
      }
      if (requestGeneration !== tarkovDevRequestGeneration.value) return null;
      return await parseTarkovDevProfileUrl(profileUrl, {
        fresh,
        ...(allowStale ? { allowStale: true } : {}),
        turnstileToken: verification.token,
      });
    } finally {
      resetTurnstile();
    }
  }
  async function fetchTarkovDevModes(
    profileUrl: string,
    modes: GameMode[],
    fresh = false,
    allowStale = false
  ) {
    const requestGeneration = ++tarkovDevRequestGeneration.value;
    lastTarkovDevSingleUrl.value = undefined;
    try {
      const verification = await verifyTurnstileToken();
      if (verification.status === 'failed') {
        setTarkovDevImportError(t('settings.tarkov_dev_import.errors.verification_failed'));
        return null;
      }
      if (requestGeneration !== tarkovDevRequestGeneration.value) return null;
      return await parseTarkovDevProfileModes(profileUrl, modes, {
        fresh,
        ...(allowStale ? { allowStale: true } : {}),
        turnstileToken: verification.token,
      });
    } finally {
      resetTurnstile();
    }
  }
  function resolveSingleSubmittedProfileUrl(rawInput: string, selectedMode: GameMode): string {
    const parsed = resolveTarkovDevProfileSource(rawInput);
    if (!parsed.ok || parsed.data.mode === selectedMode) return rawInput;
    return buildTarkovDevProfileUrl(parsed.data.tarkovUid, selectedMode) ?? rawInput;
  }
  async function handleTarkovDevProfileUrlSubmit() {
    try {
      if (tarkovDevUrlModes.value.length > 1) {
        const preview = await fetchTarkovDevModes(
          tarkovDevProfileUrlInput.value,
          tarkovDevUrlModes.value
        );
        const firstReady = preview?.requestedModes.find(
          (mode) => preview.modes[mode]?.status === 'ok'
        );
        updateTarkovDevImportTarget(firstReady);
        return;
      }
      const selectedMode = tarkovDevUrlModes.value[0];
      const targetUrl = selectedMode
        ? resolveSingleSubmittedProfileUrl(tarkovDevProfileUrlInput.value, selectedMode)
        : tarkovDevProfileUrlInput.value;
      const source = await fetchTarkovDevProfile(targetUrl);
      updateTarkovDevImportTarget(source?.mode);
    } catch (err) {
      handleTarkovDevUnexpectedError('profile_url_submit', err);
    }
  }
  async function handleTarkovDevRefetch() {
    try {
      const modes = tarkovDevRefetchModes.value;
      if (modes.length === 0) return;
      const linkedProfileUrl = tarkovDevProfileUrl.value;
      if (!linkedProfileUrl) return;
      if (modes.length > 1) {
        const preview = await fetchTarkovDevModes(linkedProfileUrl, modes, true);
        const firstReady = preview?.requestedModes.find(
          (mode) => preview.modes[mode]?.status === 'ok'
        );
        updateTarkovDevImportTarget(firstReady, firstReady ? undefined : modes[0]);
        return;
      }
      const refetchMode = modes[0]!;
      const source = await fetchTarkovDevProfile(linkedProfileUrl, true);
      updateTarkovDevImportTarget(source?.mode, source ? refetchMode : undefined);
    } catch (err) {
      handleTarkovDevUnexpectedError('profile_refetch', err);
    }
  }
  async function handleTarkovDevPreviewModeAction(mode: GameMode, allowStale: boolean) {
    if (tarkovDevRefreshingMode.value !== null) return;
    tarkovDevRefreshingMode.value = mode;
    try {
      const verification = await verifyTurnstileToken();
      if (verification.status === 'failed') {
        setTarkovDevImportError(t('settings.tarkov_dev_import.errors.verification_failed'));
        return;
      }
      await refetchTarkovDevPreviewMode(mode, {
        fresh: !allowStale,
        allowStale,
        turnstileToken: verification.token,
      });
    } catch (err) {
      handleTarkovDevUnexpectedError('profile_preview_mode_refetch', err);
    } finally {
      tarkovDevRefreshingMode.value = null;
      resetTurnstile();
    }
  }
  async function handleTarkovDevPreviewRefetch() {
    try {
      const profileUrl = tarkovDevStaleRecoveryUrl.value;
      if (!profileUrl) return;
      const source = await fetchTarkovDevProfile(profileUrl, true);
      updateTarkovDevImportTarget(source?.mode);
    } catch (err) {
      handleTarkovDevUnexpectedError('profile_preview_refetch', err);
    }
  }
  async function handleTarkovDevStaleRetry() {
    const profileUrl = tarkovDevStaleRecoveryUrl.value;
    if (!profileUrl) return;
    try {
      const source = await fetchTarkovDevProfile(profileUrl, true);
      updateTarkovDevImportTarget(source?.mode);
    } catch (err) {
      handleTarkovDevUnexpectedError('profile_stale_retry', err);
    }
  }
  async function handleTarkovDevAllowStale() {
    const profileUrl = tarkovDevStaleRecoveryUrl.value;
    if (!profileUrl) return;
    try {
      const source = await fetchTarkovDevProfile(profileUrl, false, true);
      updateTarkovDevImportTarget(source?.mode);
    } catch (err) {
      handleTarkovDevUnexpectedError('profile_allow_stale', err);
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
    tarkovDevLinkedReadyToFetch.value = false;
    tarkovDevTurnstileEngaged.value = false;
    tarkovDevRefetchModes.value = [currentTarkovDevMode()];
    tarkovStore.setTarkovUid(null);
  }
  async function handleTarkovDevConfirm() {
    const targetMode = tarkovDevFixedTargetMode.value ?? tarkovDevTargetMode.value;
    const editionResolved =
      tarkovDevPreview.value?.gameEditionGuess !== null &&
      tarkovDevPreview.value?.gameEditionGuess !== undefined;
    await confirmTarkovDevImport(targetMode);
    if (tarkovDevImportState.value === 'success') {
      tarkovDevLinkedReadyToFetch.value = false;
      tarkovDevTurnstileEngaged.value = false;
      emit('tarkovDevImported', { mode: targetMode, modes: [targetMode], editionResolved });
    }
  }
  async function handleTarkovDevMultiConfirm(selectedModes: GameMode[]) {
    const preview = tarkovDevMultiPreview.value;
    if (!preview || selectedModes.length === 0) return;
    const importedModes = await confirmTarkovDevMultiImport(selectedModes);
    if (importedModes.length === 0) return;
    const editionResolved = importedModes.some((mode) => {
      const entry = preview.modes[mode];
      return entry?.status === 'ok' && entry.data.gameEditionGuess !== null;
    });
    if (tarkovDevImportState.value === 'success') {
      tarkovDevLinkedReadyToFetch.value = false;
      tarkovDevTurnstileEngaged.value = false;
    }
    emit('tarkovDevImported', { mode: importedModes[0]!, modes: importedModes, editionResolved });
  }
  function resetTarkovDevImport() {
    tarkovDevRequestGeneration.value += 1;
    lastTarkovDevSingleUrl.value = undefined;
    tarkovDevFixedTargetMode.value = null;
    tarkovDevLinkedReadyToFetch.value = false;
    tarkovDevTurnstileEngaged.value = false;
    tarkovDevRefreshingMode.value = null;
    resetTurnstile();
    resetTarkovDevImportState();
  }
  async function handleEftLogsFiles(files: File[]) {
    try {
      if (files.length === 0 || isAnyImportActive.value) return;
      await parseEftLogsFiles(files);
      if (shouldShowEftLogsCleanupHelpToast.value) {
        toast.add({
          title: t('settings.log_import.cleared_logs_toast_title'),
          description: t('settings.log_import.cleared_logs_toast_description'),
          color: 'info',
        });
      }
    } catch (err) {
      logger.error('DataManagementCard: parseEftLogsFiles failed', err, eftLogsImportError.value);
    }
  }
  async function handleEftLogsFolderChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    await handleEftLogsFiles(files);
    input.value = '';
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
  function handleEftLogsAccountChange(accountId: string) {
    try {
      setEftLogsAccount(accountId);
    } catch (err) {
      logger.error('DataManagementCard: setEftLogsAccount failed', err, eftLogsImportError.value);
    }
  }
  async function handleEftLogsConfirm() {
    if (eftLogsDestinationError.value) return;
    try {
      await confirmEftLogsImport(eftLogsTargetMode.value ?? currentImportableMode());
    } catch (err) {
      logger.error(
        'DataManagementCard: confirmEftLogsImport failed',
        err,
        eftLogsImportError.value
      );
      return;
    }
  }
  /** Labels accounts by a short ID suffix only, so full account identifiers never reach the UI. */
  function formatEftLogsAccountLabel(account: EftLogAccountSummary): string {
    const name =
      account.id === UNIDENTIFIED_LOG_ACCOUNT
        ? t('settings.log_import.account_unidentified')
        : t('settings.log_import.account_label', { suffix: account.id.slice(-4) });
    const lastSeen = account.lastSeen === null ? '' : ` · ${formatDate(account.lastSeen)}`;
    return `${name} (${account.sessionCount})${lastSeen}`;
  }
  const eftLogsAccountItems = computed(() =>
    (eftLogsPreview.value?.availableAccounts ?? []).map((account) => ({
      value: account.id,
      label: formatEftLogsAccountLabel(account),
    }))
  );
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
  /** Uses only eligible, in-season latest states for the selected destination's preview totals. */
  const eftLogsSelectedEvents = computed(() =>
    selectEftImportEvents(
      eftLogsPreview.value?.events ?? [],
      eftLogsSelection.value,
      eftLogsTargetMode.value
    )
  );
  const eftLogsEffectiveEvents = computed(() =>
    eftLogsSelectedEvents.value
      .filter(isEligibleImportEvent)
      .filter((event) => event.mode !== GAME_MODES.SEASONAL || isCurrentSeasonLogEvent(event))
  );
  /** Applies the confirmation guard before enabling a Seasonal import. */
  const eftLogsHasOutsideSeasonEvents = computed(() =>
    hasOutsideSeasonEvents(
      eftLogsSelectedEvents.value,
      eftLogsTargetMode.value ?? currentImportableMode()
    )
  );
  const eftLogsInvalidDate = computed(() =>
    hasInvalidEftLogCutoff(eftLogsSelection.value, eftLogsTargetMode.value)
  );
  /** Shows selection errors immediately while preserving application errors. */
  function eftLogsSelectionError(): string | null {
    if (eftLogsInvalidDate.value) return t('settings.log_import.errors.invalid_date');
    if (eftLogsHasOutsideSeasonEvents.value)
      return t('settings.log_import.errors.outside_active_season');
    if (!eftLogsEffectiveEvents.value.length)
      return t('settings.log_import.errors.empty_selection');
    return null;
  }
  const eftLogsDestinationError = computed(() => {
    if (!eftLogsRequiresManualModeSelection.value) return null;
    const target = eftLogsTargetMode.value;
    if (target && eftLogsSelection.value.modes.includes(target)) return null;
    return t('settings.log_import.errors.choose_unknown_mode');
  });
  const eftLogsPreviewError = computed(
    () => eftLogsImportError.value ?? eftLogsDestinationError.value ?? eftLogsSelectionError()
  );
  const eftLogsSelectedModeLabel = computed(
    () =>
      GAME_MODE_VALUES.filter((mode) =>
        eftLogsEffectiveEvents.value.some((event) => event.mode === mode)
      )
        .map((mode) => t(getGameModeLabel(mode)))
        .join(' + ') || t('settings.log_import.no_modes')
  );
  const eftLogsCompletedCount = computed(
    () => eftLogsEffectiveEvents.value.filter((event) => event.status === 'completed').length
  );
  const eftLogsActiveCount = computed(
    () => eftLogsEffectiveEvents.value.filter((event) => event.status === 'started').length
  );
  const eftLogsFailedCount = computed(
    () => eftLogsEffectiveEvents.value.filter((event) => event.status === 'failed').length
  );
  const eftLogsAvailableVersions = computed(() => eftLogsPreview.value?.availableVersions ?? []);
  const eftLogsIncludedVersions = computed(() => eftLogsPreview.value?.includedVersions ?? []);
  const eftLogsVersionSessionCounts = computed(
    () => eftLogsPreview.value?.versionSessionCounts ?? {}
  );
  /** Formats a nonzero skipped-event count using the appropriate singular or plural message. */
  const eftLogsSkippedClause = (kind: 'malformed' | 'seasonal', count: number) => {
    if (count <= 0) return '';
    return t(`settings.log_import.skipped_${kind}.${count === 1 ? 'single' : 'plural'}`, { count });
  };
  /** Combines only the applicable malformed-record and out-of-season warnings. */
  const eftLogsSkippedEventsMessage = computed(() => {
    const preview = eftLogsPreview.value;
    if (!preview) return '';
    const malformed = preview.parseErrorCount ?? 0;
    const seasonal = preview.skippedSeasonalEventCount ?? 0;
    return [
      eftLogsSkippedClause('malformed', malformed),
      eftLogsSkippedClause('seasonal', seasonal),
    ]
      .filter(Boolean)
      .join(' ');
  });
  /** Counts eligible raw mode buckets before the user routes unresolved events. */
  const eftLogsModeCount = (mode: GameMode | 'unknown') => {
    const preview = eftLogsPreview.value;
    if (!preview) return 0;
    return [
      preview.matchedTaskIdsByMode,
      preview.matchedStartedTaskIdsByMode,
      preview.matchedFailedTaskIdsByMode,
    ].reduce((count, buckets) => count + (buckets?.[mode]?.length ?? 0), 0);
  };
  const eftLogsUnknownCount = computed(() => eftLogsModeCount('unknown'));
  const eftLogsUnknownCompletedTaskIds = computed(
    () => eftLogsPreview.value?.matchedTaskIdsByMode.unknown ?? []
  );
  const eftLogsUnknownStartedTaskIds = computed(
    () => eftLogsPreview.value?.matchedStartedTaskIdsByMode.unknown ?? []
  );
  const eftLogsUnknownFailedTaskIds = computed(
    () => eftLogsPreview.value?.matchedFailedTaskIdsByMode?.unknown ?? []
  );
  const eftLogsRequiresManualModeSelection = computed(
    () => eftLogsUnknownCount.value > 0 && eftLogsSelection.value.modes.includes('unknown')
  );
  const eftLogsModeSummaryLabel = computed(() => {
    const labels = [GAME_MODES.PVP, GAME_MODES.PVE, GAME_MODES.SEASONAL]
      .filter((mode) => eftLogsModeCount(mode) > 0)
      .map((mode) => t(getGameModeLabel(mode)));
    return labels.length ? labels.join(' + ') : t('common.unknown');
  });
  const editionLabelFromBackup = computed(() => getEditionLabel(backupPreview.value?.gameEdition));
  const isTarkovDevImportPreviewActive = computed(() => tarkovDevImportState.value === 'preview');
  const isEftLogsPreviewActive = computed(() => eftLogsImportState.value === 'preview');
  type ActiveDataFlow = 'backup' | 'eft-logs' | 'tarkov-dev';
  const activeDataFlow = computed<ActiveDataFlow | null>(() => {
    if (tarkovDevImportState.value === 'loading' || isTarkovDevImportPreviewActive.value) {
      return 'tarkov-dev';
    }
    if (isEftLogsPreviewActive.value || eftLogsIsParsing.value) {
      return 'eft-logs';
    }
    if (backupImportState.value === 'preview' || backupImportState.value === 'parsing') {
      return 'backup';
    }
    return null;
  });
  const visibleDataFlows = computed<ActiveDataFlow[]>(() => {
    if (props.view === 'imports') return ['eft-logs', 'tarkov-dev'];
    if (props.view !== 'all') return [props.view];
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
  const showProfileImport = computed(
    () =>
      visibleDataFlows.value.includes('tarkov-dev') &&
      !isBlockedByOtherDataFlow.value &&
      !isBackupOrEftLogsImportPreviewActive.value &&
      !eftLogsIsParsing.value
  );
  const showLogImport = computed(
    () =>
      visibleDataFlows.value.includes('eft-logs') &&
      !isBlockedByOtherDataFlow.value &&
      !isTarkovDevImportPreviewActive.value
  );
  const canShowBackup = computed(
    () => visibleDataFlows.value.includes('backup') && !isBlockedByOtherDataFlow.value
  );
  const showBackupTools = computed(
    () =>
      canShowBackup.value &&
      !isTarkovDevImportPreviewActive.value &&
      !isEftLogsPreviewActive.value &&
      !eftLogsIsParsing.value
  );
  const isAnyImportPreviewActive = computed(
    () => isBackupOrEftLogsImportPreviewActive.value || isTarkovDevImportPreviewActive.value
  );
  const isAnyImportActive = computed(
    () =>
      isAnyImportPreviewActive.value ||
      backupImportState.value === 'parsing' ||
      tarkovDevImportState.value === 'loading' ||
      eftLogsIsParsing.value
  );
  function formatRelativeTime(ts: number, now: number): string {
    const diffSeconds = Math.max(0, Math.floor((now - ts) / 1000));
    const rtf = new Intl.RelativeTimeFormat(locale?.value || undefined, {
      numeric: 'auto',
      style: 'long',
    });
    if (diffSeconds < 60) return rtf.format(0, 'second');
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return rtf.format(-diffMinutes, 'minute');
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return rtf.format(-diffHours, 'hour');
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return rtf.format(-diffDays, 'day');
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return rtf.format(-diffMonths, 'month');
    return rtf.format(-Math.floor(diffDays / 365), 'year');
  }
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
