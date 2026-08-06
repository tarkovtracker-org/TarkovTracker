<template>
  <div class="flex overflow-hidden rounded-md border border-white/10" role="group">
    <button
      v-for="option in modeOptions"
      :key="option.value"
      type="button"
      class="flex min-h-8 flex-1 items-center justify-center gap-1.5 px-2 py-2 text-xs font-semibold transition-colors"
      :class="getModeClasses(option.value)"
      :disabled="disabledModes.includes(option.value)"
      :aria-pressed="modelValue === option.value"
      @click="setMode(option.value)"
    >
      <UIcon :name="option.icon" class="h-3.5 w-3.5 shrink-0" />
      <span class="leading-none">{{ option.label }}</span>
    </button>
  </div>
</template>
<script setup lang="ts">
  import { GAME_MODES, type GameMode } from '@/utils/constants';
  const { t } = useI18n({ useScope: 'global' });
  defineOptions({
    name: 'GameModeToggle',
  });
  const { modelValue, disabledModes = [] } = defineProps<{
    modelValue: GameMode;
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
    { icon: 'i-mdi-sword-cross', label: t('common.pvp'), value: GAME_MODES.PVP },
    { icon: 'i-mdi-account-group', label: t('common.pve'), value: GAME_MODES.PVE },
    {
      icon: 'i-mdi-calendar-star',
      label: t('common.seasonal_pvp', 'Seasonal PvP'),
      value: GAME_MODES.SEASONAL,
    },
  ]);
  const modeClasses: Record<GameMode, { active: string; inactive: string }> = {
    [GAME_MODES.PVP]: {
      active: 'bg-pvp-800 text-pvp-100',
      inactive: 'bg-transparent text-pvp-500 hover:bg-pvp-950/50',
    },
    [GAME_MODES.PVE]: {
      active: 'bg-pve-600 text-white',
      inactive: 'bg-transparent text-pve-500 hover:bg-pve-950/50',
    },
    [GAME_MODES.SEASONAL]: {
      active: 'bg-warning-700 text-warning-50',
      inactive: 'bg-transparent text-warning-500 hover:bg-warning-950/50',
    },
  };
  const getModeClasses = (mode: GameMode) => {
    if (disabledModes.includes(mode)) return 'cursor-not-allowed bg-transparent text-white/25';
    return modeClasses[mode][modelValue === mode ? 'active' : 'inactive'];
  };
</script>
