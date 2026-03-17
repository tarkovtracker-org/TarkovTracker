<template>
  <div class="border-border flex overflow-hidden rounded-md border" role="group">
    <button
      type="button"
      class="flex min-h-8 flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase transition-colors"
      :class="
        modelValue === GAME_MODES.PVP
          ? 'bg-[color-mix(in_srgb,var(--color-pvp-500)_18%,var(--color-panel))] text-[color-mix(in_srgb,var(--color-pvp-500)_75%,var(--color-foreground))]'
          : 'bg-transparent text-[color-mix(in_srgb,var(--color-pvp-500)_70%,var(--color-foreground))] hover:bg-[color-mix(in_srgb,var(--color-pvp-500)_12%,transparent)]'
      "
      :aria-pressed="modelValue === GAME_MODES.PVP"
      @click="setMode(GAME_MODES.PVP)"
    >
      <UIcon name="i-mdi-sword-cross" class="h-3.5 w-3.5 shrink-0" />
      <span class="leading-none">{{ t('settings.game_settings.pvp') }}</span>
    </button>
    <button
      type="button"
      class="flex min-h-8 flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase transition-colors"
      :class="
        modelValue === GAME_MODES.PVE
          ? 'bg-[color-mix(in_srgb,var(--color-pve-500)_18%,var(--color-panel))] text-[color-mix(in_srgb,var(--color-pve-500)_78%,var(--color-foreground))]'
          : 'bg-transparent text-[color-mix(in_srgb,var(--color-pve-500)_74%,var(--color-foreground))] hover:bg-[color-mix(in_srgb,var(--color-pve-500)_12%,transparent)]'
      "
      :aria-pressed="modelValue === GAME_MODES.PVE"
      @click="setMode(GAME_MODES.PVE)"
    >
      <UIcon name="i-mdi-account-group" class="h-3.5 w-3.5 shrink-0" />
      <span class="leading-none">{{ t('settings.game_settings.pve') }}</span>
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
