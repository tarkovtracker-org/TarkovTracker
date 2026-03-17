<template>
  <div class="flex flex-col gap-1.5 px-3 py-1">
    <div
      class="border-border flex w-full overflow-hidden rounded-md border"
      role="group"
      aria-label="Toggle game mode"
    >
      <button
        type="button"
        class="focus:ring-pvp-400 flex min-h-8 flex-1 items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold uppercase transition-colors focus:z-10 focus:ring-2 focus:outline-none"
        :class="pvpClasses"
        :disabled="dataLoading"
        :aria-pressed="currentGameMode === GAME_MODES.PVP"
        @click="switchMode(GAME_MODES.PVP)"
      >
        <UIcon name="i-mdi-sword-cross" class="h-3.5 w-3.5 shrink-0" />
        <span class="leading-none">{{ t('game_settings.pvp') }}</span>
      </button>
      <button
        type="button"
        class="focus:ring-pve-400 flex min-h-8 flex-1 items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold uppercase transition-colors focus:z-10 focus:ring-2 focus:outline-none"
        :class="pveClasses"
        :disabled="dataLoading"
        :aria-pressed="currentGameMode === GAME_MODES.PVE"
        @click="switchMode(GAME_MODES.PVE)"
      >
        <UIcon name="i-mdi-account-group" class="h-3.5 w-3.5 shrink-0" />
        <span class="leading-none">{{ t('game_settings.pve') }}</span>
      </button>
    </div>
    <div v-if="switchModeError" class="text-error-500 text-xs" role="alert">
      {{ switchModeError }}
    </div>
    <div
      class="border-border flex w-full overflow-hidden rounded-md border"
      role="group"
      aria-label="Select faction"
    >
      <button
        v-for="faction in factions"
        :key="faction"
        class="focus:ring-border-strong/50 flex min-h-8 flex-1 items-center justify-center px-2 py-1.5 text-xs font-semibold uppercase transition-colors focus:z-10 focus:ring-2 focus:outline-none"
        :class="[
          faction === currentFaction
            ? 'bg-interactive text-foreground'
            : dataLoading
              ? 'text-foreground-disabled bg-transparent'
              : 'text-foreground-subtle hover:bg-interactive hover:text-foreground',
          dataLoading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        ]"
        :disabled="dataLoading"
        :aria-pressed="faction === currentFaction"
        @click="setFaction(faction)"
      >
        <span class="leading-none">{{ faction }}</span>
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { storeToRefs } from 'pinia';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { GAME_MODES, PMC_FACTIONS, type GameMode, type PMCFaction } from '@/utils/constants';
  import { logger } from '@/utils/logger';
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  const { t } = useI18n({ useScope: 'global' });
  const switchModeError = ref('');
  const factions = PMC_FACTIONS;
  const currentFaction = computed<PMCFaction>(() => tarkovStore.getPMCFaction());
  function setFaction(faction: PMCFaction) {
    if (faction !== currentFaction.value) {
      tarkovStore.setPMCFaction(faction);
    }
  }
  const currentGameMode = computed(() => tarkovStore.getCurrentGameMode());
  const pveClasses = computed(() =>
    currentGameMode.value === GAME_MODES.PVE
      ? 'bg-pve-500/16 text-pve-700 ring-pve-500/25 ring-inset ring-1'
      : 'bg-transparent text-pve-700 hover:bg-pve-500/8 hover:text-pve-800'
  );
  const pvpClasses = computed(() =>
    currentGameMode.value === GAME_MODES.PVP
      ? 'bg-pvp-500/16 text-pvp-700 ring-pvp-500/25 ring-inset ring-1'
      : 'bg-transparent text-pvp-700 hover:bg-pvp-500/8 hover:text-pvp-800'
  );
  const { loading: dataLoading } = storeToRefs(metadataStore);
  async function switchMode(mode: GameMode) {
    if (mode !== currentGameMode.value && !dataLoading.value) {
      metadataStore.setLoading(true);
      const previousMode = currentGameMode.value;
      try {
        switchModeError.value = '';
        await tarkovStore.switchGameMode(mode);
      } catch (err) {
        switchModeError.value = t(
          'settings.game_settings.switch_mode_failed',
          'Failed to switch game mode, please retry'
        );
        logger.error('[DrawerGameSettings] Error switching mode:', err);
        metadataStore.setLoading(false);
        return;
      }
      try {
        metadataStore.updateLanguageAndGameMode();
        await metadataStore.fetchAllData();
      } catch (err) {
        try {
          await tarkovStore.switchGameMode(previousMode);
          metadataStore.updateLanguageAndGameMode();
          await metadataStore.fetchAllData();
        } catch (rollbackErr) {
          logger.error('[DrawerGameSettings] rollback failed:', rollbackErr);
        }
        switchModeError.value = t(
          'settings.game_settings.switch_mode_fetch_failed',
          'Game mode switched but failed to refresh data, please retry'
        );
        logger.error('[DrawerGameSettings] Error fetching data after mode switch:', err);
      } finally {
        metadataStore.setLoading(false);
      }
    }
  }
</script>
