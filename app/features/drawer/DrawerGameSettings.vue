<template>
  <div class="flex flex-col gap-1.5 px-3 py-1">
    <div
      class="grid grid-cols-3 gap-1"
      role="group"
      :aria-label="t('game_settings.select_game_mode_label', 'Select game mode')"
      :aria-busy="dataLoading"
    >
      <button
        v-for="option in modeOptions"
        :key="option.value"
        type="button"
        class="flex flex-col items-center px-0.5 py-1.5 leading-tight"
        :class="choiceButtonClass"
        :aria-pressed="selectedMode === option.value"
        :disabled="dataLoading"
        @click="switchMode(option.value)"
      >
        <GameModeBadge :mode="option.value" :size="52" class="-my-1.5 size-13 max-w-full" />
        <span class="w-full wrap-anywhere">{{ option.label }}</span>
      </button>
    </div>
    <div v-if="switchModeError" class="text-error-400 text-xs" role="alert">
      {{ t(switchModeError) }}
    </div>
    <time
      v-if="currentGameMode === GAME_MODES.SEASONAL"
      :datetime="ACTIVE_SEASON.endsAt"
      class="text-warning-300 light:text-warning-700 text-xs"
      :title="seasonEndDate"
    >
      {{ seasonCountdownLabel }}
    </time>
    <div
      class="grid grid-cols-2 gap-1"
      role="group"
      :aria-label="t('game_settings.select_faction_label')"
    >
      <button
        v-for="faction in factions"
        :key="faction"
        type="button"
        class="flex min-h-8 items-center justify-center gap-1.5 px-2 py-1.5 leading-none uppercase"
        :class="choiceButtonClass"
        :disabled="dataLoading"
        :aria-pressed="faction === currentFaction"
        @click="setFaction(faction)"
      >
        <span
          aria-hidden="true"
          class="size-5 shrink-0 bg-current mask-contain mask-center mask-no-repeat"
          :style="{ maskImage: `url(${getFactionIconPath(faction)})` }"
        />
        <span class="leading-none">{{ faction }}</span>
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
  import GameModeBadge from '@/components/GameModeBadge.vue';
  import { useGameModeSwitch } from '@/composables/useGameModeSwitch';
  import { useTarkovStore } from '@/stores/useTarkov';
  import {
    ACTIVE_SEASON,
    GAME_MODES,
    getActiveSeasonTimeRemaining,
    PMC_FACTIONS,
    type PMCFaction,
  } from '@/utils/constants';
  import { getFactionIconPath } from '@/utils/factionIcons';
  const tarkovStore = useTarkovStore();
  const { t } = useI18n({ useScope: 'global' });
  const { dataLoading, switchMode, switchModeError } = useGameModeSwitch();
  const seasonCountdownNow = ref(Date.now());
  const choiceButtonClass =
    'border-default bg-default text-muted enabled:hover:bg-elevated aria-pressed:border-primary/70 aria-pressed:bg-primary/10 aria-pressed:text-highlighted focus-visible:outline-primary min-w-0 cursor-pointer rounded-md border text-center text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60';
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
    { label: t('common.pvp', 'PvP'), value: GAME_MODES.PVP },
    { label: t('common.pve', 'PvE'), value: GAME_MODES.PVE },
    {
      label: t('game_settings.seasonal_label', 'Seasonal'),
      value: GAME_MODES.SEASONAL,
    },
  ]);
  const selectedMode = computed(
    () =>
      modeOptions.value.find((option) => option.value === currentGameMode.value)?.value ??
      GAME_MODES.PVP
  );
</script>
