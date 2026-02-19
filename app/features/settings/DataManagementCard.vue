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
          <!-- Import buttons (shown when no import flow is active) -->
          <template v-if="!isAnyImportActive">
            <div class="grid gap-3 md:grid-cols-2">
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
  import { useTarkovDevImport } from '@/composables/useTarkovDevImport';
  import GameModeToggle from '@/features/settings/GameModeToggle.vue';
  import ResetProgressSection from '@/features/settings/ResetProgressSection.vue';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { GAME_MODES, type GameMode } from '@/utils/constants';
  import { logger } from '@/utils/logger';
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
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
  const editionLabelFromBackup = computed(() => getEditionLabel(backupPreview.value?.gameEdition));
  // --- Any import active? ---
  const isAnyImportActive = computed(
    () => backupImportState.value === 'preview' || tarkovDevImportState.value === 'preview'
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
