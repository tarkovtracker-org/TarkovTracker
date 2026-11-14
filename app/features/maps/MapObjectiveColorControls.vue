<template>
  <div class="space-y-2" data-testid="map-objective-color-controls">
    <div class="space-y-0.5">
      <p :id="`${id}-title`" class="text-surface-200 text-xs font-semibold">
        {{ t('settings.interface.maps.objective_colors.title') }}
      </p>
      <p class="text-surface-400 text-xs">
        {{ t('settings.interface.maps.objective_colors.description') }}
      </p>
    </div>
    <div
      role="group"
      :aria-labelledby="`${id}-title`"
      class="bg-surface-900/60 grid grid-cols-3 gap-1 rounded-md p-1"
    >
      <button
        v-for="mode in MAP_OBJECTIVE_COLOR_MODES"
        :key="mode"
        type="button"
        :data-testid="`map-objective-color-mode-${mode}`"
        :aria-pressed="colorMode === mode"
        class="focus-visible:ring-primary-500 rounded px-2 py-1 text-[11px] font-medium transition-colors focus:outline-hidden focus-visible:ring-2"
        :class="
          colorMode === mode
            ? 'bg-surface-600 text-surface-50'
            : 'text-surface-400 hover:text-surface-200 hover:bg-white/5'
        "
        @click="preferencesStore.setMapObjectiveColorMode(mode)"
      >
        {{ t(`settings.interface.maps.objective_colors.modes.${mode}`) }}
      </button>
    </div>
    <p class="text-surface-400 text-[11px]" data-testid="map-objective-color-mode-hint">
      {{ t(`settings.interface.maps.objective_colors.mode_hints.${colorMode}`) }}
    </p>
    <div v-if="colorMode !== 'category'" class="space-y-1">
      <p :id="`${id}-palette`" class="text-surface-300 text-[11px] font-medium">
        {{ t('settings.interface.maps.objective_colors.palette') }}
      </p>
      <div role="group" :aria-labelledby="`${id}-palette`" class="grid gap-1">
        <button
          v-for="key in MAP_OBJECTIVE_PALETTE_KEYS"
          :key="key"
          type="button"
          :data-testid="`map-objective-palette-${key}`"
          :aria-pressed="palette === key"
          class="focus-visible:ring-primary-500 flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left transition-colors focus:outline-hidden focus-visible:ring-2"
          :class="
            palette === key
              ? 'border-primary-500/60 bg-primary-500/10'
              : 'border-surface-700 hover:bg-white/5'
          "
          @click="preferencesStore.setMapObjectivePalette(key)"
        >
          <span class="text-surface-200 text-[11px] font-medium">
            {{ t(`settings.interface.maps.objective_colors.palettes.${key}`) }}
          </span>
          <span class="flex shrink-0 gap-0.5" aria-hidden="true">
            <span
              v-for="color in MAP_OBJECTIVE_PALETTES[key]"
              :key="color"
              class="size-3 rounded-full border border-black/40"
              :style="{ backgroundColor: color }"
            />
          </span>
        </button>
      </div>
      <p class="text-surface-500 text-[10px] leading-snug">
        {{ t('settings.interface.maps.objective_colors.palette_hint') }}
      </p>
    </div>
  </div>
</template>
<script setup lang="ts">
  import {
    MAP_OBJECTIVE_COLOR_MODES,
    MAP_OBJECTIVE_PALETTE_KEYS,
    MAP_OBJECTIVE_PALETTES,
  } from '@/features/maps/utils/objectiveColors';
  import { usePreferencesStore } from '@/stores/usePreferences';
  /** Chooses what objective chip colors encode and which color-blind-safe palette they use. */
  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();
  const id = `map-objective-colors-${useId()}`;
  const colorMode = computed(() => preferencesStore.getMapObjectiveColorMode);
  const palette = computed(() => preferencesStore.getMapObjectivePalette);
</script>
