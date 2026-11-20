<template>
  <div class="flex overflow-hidden rounded-md border border-white/10" role="group">
    <button
      v-for="option in modeOptions"
      :key="option.value"
      type="button"
      class="flex min-h-8 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs font-semibold transition-colors sm:flex-row sm:gap-1"
      :class="getModeClasses(option.value)"
      :disabled="disabledModes.includes(option.value)"
      :aria-pressed="modelValue === option.value"
      @click="setMode(option.value)"
    >
      <GameModeBadge :mode="option.value" class="-my-1" />
      <span
        class="flex min-h-7 min-w-0 items-center text-center leading-tight wrap-anywhere sm:min-h-0"
      >
        {{ option.label }}
      </span>
    </button>
  </div>
</template>
<script setup lang="ts">
  import GameModeBadge from '@/components/GameModeBadge.vue';
  import { GAME_MODES, type GameMode } from '@/utils/constants';
  const { t } = useI18n({ useScope: 'global' });
  defineOptions({
    name: 'GameModeToggle',
  });
  const { modelValue, disabledModes = [] } = defineProps<{
    modelValue: GameMode | undefined;
    disabledModes?: GameMode[];
  }>();
  const emit = defineEmits<{
    'update:modelValue': [value: GameMode];
  }>();
  function setMode(mode: GameMode) {
    if (disabledModes.includes(mode)) return;
    emit('update:modelValue', mode);
  }
  const modeOptions = computed(() => [
    { label: t('common.pvp'), value: GAME_MODES.PVP },
    { label: t('common.pve'), value: GAME_MODES.PVE },
    {
      label: t('common.seasonal_pvp', 'Seasonal PvP'),
      value: GAME_MODES.SEASONAL,
    },
  ]);
  const modeClasses: Record<GameMode, { active: string; inactive: string }> = {
    [GAME_MODES.PVP]: {
      active: 'bg-pvp-800 text-pvp-100',
      inactive:
        'bg-transparent text-pvp-500 light:text-pvp-900 hover:bg-pvp-950/50 light:hover:bg-pvp-100',
    },
    [GAME_MODES.PVE]: {
      active: 'bg-pve-600 text-white',
      inactive:
        'bg-transparent text-pve-500 light:text-pve-900 hover:bg-pve-950/50 light:hover:bg-pve-100',
    },
    [GAME_MODES.SEASONAL]: {
      active: 'bg-warning-700 text-warning-50',
      inactive:
        'bg-transparent text-warning-500 light:text-warning-800 hover:bg-warning-950/50 light:hover:bg-warning-100',
    },
  };
  const getModeClasses = (mode: GameMode) => {
    if (disabledModes.includes(mode))
      return 'cursor-not-allowed bg-transparent text-white/25 light:text-surface-500';
    return modeClasses[mode][modelValue === mode ? 'active' : 'inactive'];
  };
</script>
