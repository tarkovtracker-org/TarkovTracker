<template>
  <GenericCard
    icon="i-mdi-account-arrow-up"
    icon-color="info"
    highlight-color="info"
    :fill-height="false"
    :title="$t('settings.tarkov_dev_import.title')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-4 px-4 py-4">
        <input
          ref="fileInputRef"
          type="file"
          accept=".json"
          class="hidden"
          @change="handleFileChange"
        />
        <template v-if="isLinked && importState !== 'preview'">
          <div class="space-y-3">
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
              block
              :href="tarkovDevProfileUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ $t('settings.tarkov_dev_import.view_profile') }}
            </UButton>
            <UButton
              icon="i-mdi-refresh"
              variant="soft"
              color="neutral"
              block
              @click="showFileInput"
            >
              {{ $t('settings.tarkov_dev_import.reimport') }}
            </UButton>
          </div>
        </template>
        <template v-if="importState === 'idle' && !isLinked">
          <p class="text-surface-400 text-sm">
            {{ $t('settings.tarkov_dev_import.upload_hint_before_link') }}
            <NuxtLink
              to="https://tarkov.dev/players"
              external
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary-400 hover:text-primary-300 underline"
            >
              {{ $t('settings.tarkov_dev_import.upload_hint_link') }}
            </NuxtLink>
            {{ $t('settings.tarkov_dev_import.upload_hint_after_link') }}
          </p>
          <img
            src="/img/tarkov-dev-save-profile.png"
            alt="Save Profile button on Tarkov.dev"
            class="w-full rounded-md border border-white/10"
          />
          <div class="space-y-3">
            <div class="space-y-1">
              <label class="text-surface-200 text-sm font-semibold">
                {{ $t('settings.tarkov_dev_import.game_mode_label') }}
              </label>
              <GameModeToggle v-model="targetMode" />
            </div>
            <UButton
              icon="i-mdi-file-upload-outline"
              block
              variant="soft"
              color="info"
              @click="showFileInput"
            >
              {{ $t('settings.tarkov_dev_import.select_file') }}
            </UButton>
          </div>
        </template>
        <template v-if="importState === 'preview' && previewData">
          <div class="space-y-3">
            <div
              class="bg-surface-900/80 divide-surface-700 divide-y rounded-md border border-white/10"
            >
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.tarkov_dev_import.nickname') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ previewData.displayName }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.tarkov_dev_import.faction') }}
                </span>
                <span class="text-surface-100 text-sm font-semibold">
                  {{ previewData.pmcFaction }}
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
                  {{ previewData.prestigeLevel }}
                </span>
              </div>
              <div class="flex items-center justify-between px-3 py-2">
                <span class="text-surface-400 text-xs">
                  {{ $t('settings.tarkov_dev_import.skills_count', { count: skillCount }) }}
                </span>
              </div>
              <div v-if="previewData.gameEditionGuess !== null" class="px-3 py-2">
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
              <GameModeToggle v-model="targetMode" />
            </div>
            <div class="flex gap-2">
              <UButton icon="i-mdi-check" color="primary" class="flex-1" @click="handleConfirm">
                {{ $t('settings.tarkov_dev_import.confirm') }}
              </UButton>
              <UButton variant="soft" color="neutral" class="flex-1" @click="reset()">
                {{ $t('settings.tarkov_dev_import.cancel') }}
              </UButton>
            </div>
          </div>
        </template>
        <div v-if="importState === 'success'" role="status" aria-live="polite" aria-atomic="true">
          <UAlert
            icon="i-mdi-check-circle"
            color="success"
            variant="soft"
            :title="$t('settings.tarkov_dev_import.success_title')"
            :description="$t('settings.tarkov_dev_import.success_description')"
          />
        </div>
        <div
          v-if="importState === 'error' && importError"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          <UAlert
            icon="i-mdi-alert-circle"
            color="error"
            variant="soft"
            :title="$t('settings.tarkov_dev_import.error_title')"
            :description="importError"
          />
        </div>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { useTarkovDevImport } from '@/composables/useTarkovDevImport';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { GAME_MODES, type GameMode } from '@/utils/constants';
  import GameModeToggle from './GameModeToggle.vue';
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const { importState, previewData, importError, parseFile, confirmImport, reset } =
    useTarkovDevImport();
  const fileInputRef = ref<HTMLInputElement | null>(null);
  const targetMode = ref<GameMode>(tarkovStore.getCurrentGameMode());
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
    if (hasPvpImport) {
      return GAME_MODES.PVP;
    }
    if (hasPveImport) {
      return GAME_MODES.PVE;
    }
    return null;
  });
  const tarkovDevProfileUrl = computed(() => {
    const mode = linkedProfileMode.value ?? tarkovStore.getCurrentGameMode() ?? targetMode.value;
    const modeSlug = mode === GAME_MODES.PVE ? 'pve' : 'regular';
    return `https://tarkov.dev/players/${modeSlug}/${tarkovUid.value}`;
  });
  const previewLevel = computed(() => {
    if (!previewData.value) return 1;
    const levels = metadataStore.playerLevels;
    if (!levels || levels.length === 0) return 1;
    const xp = previewData.value.totalXP;
    for (let i = levels.length - 1; i >= 0; i--) {
      const level = levels[i];
      if (level && xp >= level.exp) return level.level;
    }
    return 1;
  });
  const skillCount = computed(() =>
    previewData.value ? Object.keys(previewData.value.skills).length : 0
  );
  const editionLabel = computed(() => {
    if (!previewData.value?.gameEditionGuess) return '';
    const edition = metadataStore.editions.find(
      (e) => e.value === previewData.value!.gameEditionGuess
    );
    return edition?.title ?? `Edition ${previewData.value.gameEditionGuess}`;
  });
  function showFileInput() {
    fileInputRef.value?.click();
  }
  async function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await parseFile(file);
    input.value = '';
  }
  function handleConfirm() {
    confirmImport(targetMode.value);
  }
</script>
