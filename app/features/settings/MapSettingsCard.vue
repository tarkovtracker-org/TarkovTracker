<template>
  <GenericCard
    icon="mdi-map"
    icon-color="success"
    highlight-color="success"
    :fill-height="false"
    :title="$t('settings.interface.maps.title')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-4 px-4 py-4">
        <div class="grid gap-4 md:grid-cols-3">
          <UCheckbox
            v-model="showMapExtracts"
            :label="$t('settings.interface.maps.show_extracts')"
          />
          <div class="space-y-1">
            <div class="flex justify-between">
              <span class="text-sm font-medium">
                {{ $t('settings.interface.maps.zoom_speed') }}
              </span>
              <span class="text-surface-200 text-xs">{{ mapZoomSpeed }}x</span>
            </div>
            <input
              v-model.number="mapZoomSpeed"
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              class="bg-surface-700 accent-surface-200 h-2 w-full cursor-pointer appearance-none rounded-lg"
            />
          </div>
          <div class="space-y-1">
            <div class="flex justify-between">
              <span class="text-sm font-medium">
                {{ $t('settings.interface.maps.pan_speed') }}
              </span>
              <span class="text-surface-200 text-xs">{{ mapPanSpeed.toFixed(1) }}x</span>
            </div>
            <input
              v-model.number="mapPanSpeed"
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              class="bg-surface-700 accent-surface-200 h-2 w-full cursor-pointer appearance-none rounded-lg"
            />
          </div>
        </div>
        <div class="bg-surface-800/50 border-surface-700 space-y-3 rounded-lg border p-3">
          <div class="flex items-center justify-between gap-3">
            <div class="space-y-0.5">
              <p class="text-surface-200 text-sm font-medium">
                {{ $t('settings.interface.maps.colors.title') }}
              </p>
              <p class="text-surface-400 text-xs">
                {{ $t('settings.interface.maps.colors.description') }}
              </p>
            </div>
            <UButton
              color="neutral"
              size="xs"
              variant="ghost"
              @click="preferencesStore.resetMapMarkerColors()"
            >
              {{ $t('settings.interface.maps.colors.reset') }}
            </UButton>
          </div>
          <div class="grid gap-2 md:grid-cols-2">
            <label
              v-for="option in mapColorOptions"
              :key="option.key"
              class="bg-surface-900/40 border-surface-700 flex items-center justify-between gap-3 rounded-md border px-2.5 py-2"
            >
              <span class="flex items-center gap-2">
                <span
                  class="h-3.5 w-3.5 rounded-full border border-white/30"
                  :style="{ backgroundColor: mapMarkerColors[option.key] }"
                />
                <span class="text-surface-200 text-xs font-medium">
                  {{ option.label }}
                </span>
              </span>
              <input
                :aria-label="option.label"
                :value="mapMarkerColors[option.key]"
                type="color"
                class="bg-surface-900 border-surface-700 h-8 w-11 cursor-pointer rounded border p-1"
                @input="onMapColorInput(option.key, $event)"
              />
            </label>
          </div>
        </div>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { getMapColorOptions, type MapMarkerColorKey } from '@/utils/theme-colors';
  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();
  const showMapExtracts = computed({
    get: () => preferencesStore.getShowMapExtracts,
    set: (val) => preferencesStore.setShowMapExtracts(val),
  });
  const mapZoomSpeed = computed({
    get: () => preferencesStore.getMapZoomSpeed,
    set: (val) => preferencesStore.setMapZoomSpeed(val),
  });
  const mapPanSpeed = computed({
    get: () => preferencesStore.getMapPanSpeed,
    set: (val) => preferencesStore.setMapPanSpeed(val),
  });
  const mapMarkerColors = computed(() => preferencesStore.getMapMarkerColors);
  const mapColorOptions = computed(() => getMapColorOptions(t));
  const onMapColorInput = (key: MapMarkerColorKey, event: Event) => {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;
    preferencesStore.setMapMarkerColor(key, input.value);
  };
</script>
