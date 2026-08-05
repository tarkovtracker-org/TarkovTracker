<template>
  <div class="flex flex-col gap-1.5 px-3 py-1">
    <SelectMenuFixed
      :model-value="currentGameMode"
      :items="modeOptions"
      value-key="value"
      label-key="label"
      :disabled="dataLoading"
      :aria-label="t('game_settings.select_game_mode_label', 'Select game mode')"
      class="w-full"
      :ui="{ base: 'min-h-9 w-full' }"
      @update:model-value="switchMode($event as GameMode)"
    >
      <template #leading>
        <UIcon :name="currentModeOption.icon" class="h-4 w-4" />
      </template>
    </SelectMenuFixed>
    <div v-if="switchModeError" class="text-error-400 text-xs" role="alert">
      {{ switchModeError }}
    </div>
    <time
      v-if="currentGameMode === GAME_MODES.SEASONAL"
      :datetime="ACTIVE_SEASON.endsAt"
      class="text-warning-300 text-xs"
      :title="seasonEndDate"
    >
      {{ seasonCountdownLabel }}
    </time>
    <div
      class="flex w-full overflow-hidden rounded-md border border-white/10"
      role="group"
      :aria-label="t('game_settings.select_faction_label')"
    >
      <button
        v-for="faction in factions"
        :key="faction"
        class="flex min-h-8 flex-1 items-center justify-center px-2 py-1.5 text-xs font-semibold uppercase transition-colors focus:z-10 focus:ring-2 focus:ring-white/40 focus:outline-none"
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
        <span class="leading-none">{{ faction }}</span>
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { storeToRefs } from 'pinia';
  import SelectMenuFixed from '@/components/SelectMenuFixed.vue';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { useTarkovStore } from '@/stores/useTarkov';
  import {
    ACTIVE_SEASON,
    GAME_MODES,
    getActiveSeasonTimeRemaining,
    PMC_FACTIONS,
    type GameMode,
    type PMCFaction,
  } from '@/utils/constants';
  import { logger } from '@/utils/logger';
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();
  const { t } = useI18n({ useScope: 'global' });
  const switchModeError = ref('');
  const seasonCountdownNow = ref(Date.now());
  const factions = PMC_FACTIONS;
  const currentFaction = computed<PMCFaction>(() => tarkovStore.getPMCFaction());
  function setFaction(faction: PMCFaction) {
    if (faction !== currentFaction.value) {
      tarkovStore.setPMCFaction(faction);
    }
  }
  const currentGameMode = computed(() => tarkovStore.getCurrentGameMode());
  const seasonEndDate = computed(() => new Date(ACTIVE_SEASON.endsAt).toLocaleString());
  const seasonCountdownLabel = computed(() => {
    const remaining = getActiveSeasonTimeRemaining(seasonCountdownNow.value);
    if (remaining.expired) {
      return t(
        'game_settings.season_ended',
        { season: ACTIVE_SEASON.number },
        'Season {season} has ended'
      );
    }
    return t(
      'game_settings.season_ends_in',
      {
        days: remaining.days,
        hours: remaining.hours,
        minutes: remaining.minutes,
        season: ACTIVE_SEASON.number,
      },
      'Season {season} ends in {days}d {hours}h {minutes}m'
    );
  });
  watch(
    currentGameMode,
    (mode, _, onCleanup) => {
      if (mode !== GAME_MODES.SEASONAL) return;
      seasonCountdownNow.value = Date.now();
      const timer = setInterval(() => {
        seasonCountdownNow.value = Date.now();
      }, 60_000);
      onCleanup(() => clearInterval(timer));
    },
    { immediate: true }
  );
  const modeOptions = computed(() => [
    { icon: 'i-mdi-sword-cross', label: t('common.pvp', 'PvP'), value: GAME_MODES.PVP },
    { icon: 'i-mdi-account-group', label: t('common.pve', 'PvE'), value: GAME_MODES.PVE },
    {
      icon: 'i-mdi-calendar-star',
      label: t('common.seasonal_pvp', 'Seasonal PvP'),
      value: GAME_MODES.SEASONAL,
    },
  ]);
  const currentModeOption = computed(
    () =>
      modeOptions.value.find((option) => option.value === currentGameMode.value) ?? {
        icon: 'i-mdi-sword-cross',
        label: t('common.pvp', 'PvP'),
        value: GAME_MODES.PVP,
      }
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
