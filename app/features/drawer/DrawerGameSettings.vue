<template>
  <div class="flex flex-col gap-1.5 px-3 py-1">
    <div
      class="flex w-full overflow-hidden rounded-md border border-white/10"
      role="group"
      aria-label="Toggle game mode"
    >
      <button
        type="button"
        class="focus:ring-pvp-400 flex flex-1 items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold uppercase transition-colors focus:z-10 focus:ring-2 focus:outline-none"
        :class="pvpClasses"
        :disabled="dataLoading"
        :aria-pressed="currentGameMode === GAME_MODES.PVP"
        @click="switchMode(GAME_MODES.PVP)"
      >
        <UIcon name="i-mdi-sword-cross" class="h-3.5 w-3.5" />
        {{ t('game_settings.pvp') }}
      </button>
      <button
        type="button"
        class="focus:ring-pve-400 flex flex-1 items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold uppercase transition-colors focus:z-10 focus:ring-2 focus:outline-none"
        :class="pveClasses"
        :disabled="dataLoading"
        :aria-pressed="currentGameMode === GAME_MODES.PVE"
        @click="switchMode(GAME_MODES.PVE)"
      >
        <UIcon name="i-mdi-account-group" class="h-3.5 w-3.5" />
        {{ t('game_settings.pve') }}
      </button>
    </div>
    <div v-if="switchModeError" class="text-error-400 text-xs" role="alert">
      {{ switchModeError }}
    </div>
    <div
      class="flex w-full overflow-hidden rounded-md border border-white/10"
      role="group"
      aria-label="Select faction"
    >
      <button
        v-for="faction in factions"
        :key="faction"
        class="flex-1 px-2 py-1.5 text-xs font-semibold uppercase transition-colors focus:z-10 focus:ring-2 focus:ring-white/40 focus:outline-none"
        :class="[
          faction === currentFaction
            ? 'bg-white/15 text-white'
            : dataLoading
              ? 'bg-transparent text-white/50'
              : 'bg-transparent text-white/50 hover:bg-white/5 hover:text-white/80',
          dataLoading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        ]"
        :disabled="dataLoading"
        :aria-pressed="faction === currentFaction"
        @click="setFaction(faction)"
      >
        {{ faction }}
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { storeToRefs } from 'pinia';
  import { useI18n } from 'vue-i18n';
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
      ? 'bg-pve-500 hover:bg-pve-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]'
      : 'bg-transparent text-pve-600 hover:bg-pve-950/50 hover:text-pve-400'
  );
  const pvpClasses = computed(() =>
    currentGameMode.value === GAME_MODES.PVP
      ? 'bg-pvp-800 hover:bg-pvp-700 text-pvp-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]'
      : 'bg-transparent text-pvp-600 hover:bg-pvp-950/50 hover:text-pvp-400'
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
