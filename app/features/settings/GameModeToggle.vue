<template>
  <div class="flex overflow-hidden rounded-md border border-white/10" role="group">
    <button
      type="button"
      class="flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase transition-colors"
      :class="
        modelValue === GAME_MODES.PVP
          ? 'bg-pvp-800 text-pvp-100'
          : 'text-pvp-500 hover:bg-pvp-950/50 bg-transparent'
      "
      :aria-pressed="modelValue === GAME_MODES.PVP"
      @click="setMode(GAME_MODES.PVP)"
    >
      <UIcon name="i-mdi-sword-cross" class="h-3.5 w-3.5" />
      {{ t('settings.game_settings.pvp') }}
    </button>
    <button
      type="button"
      class="flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase transition-colors"
      :class="
        modelValue === GAME_MODES.PVE
          ? 'bg-pve-600 text-white'
          : 'text-pve-500 hover:bg-pve-950/50 bg-transparent'
      "
      :aria-pressed="modelValue === GAME_MODES.PVE"
      @click="setMode(GAME_MODES.PVE)"
    >
      <UIcon name="i-mdi-account-group" class="h-3.5 w-3.5" />
      {{ t('settings.game_settings.pve') }}
    </button>
  </div>
</template>
<script setup lang="ts">
  import { GAME_MODES, type GameMode } from '@/utils/constants';
  const { t } = useI18n({ useScope: 'global' });
  defineOptions({
    name: 'GameModeToggle',
  });
  const { modelValue } = defineProps<{
    modelValue: GameMode;
  }>();
  const emit = defineEmits<{
    'update:modelValue': [value: GameMode];
  }>();
  function setMode(mode: GameMode) {
    emit('update:modelValue', mode);
  }
</script>
