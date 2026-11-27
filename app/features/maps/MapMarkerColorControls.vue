<template>
  <div class="grid gap-2" :class="compact ? 'grid-cols-2' : 'sm:grid-cols-2'">
    <label
      v-for="option in options"
      :key="option.key"
      class="border-surface-700 flex items-center justify-between rounded-md border"
      :class="
        compact ? 'bg-surface-800/70 gap-2 px-2 py-1.5' : 'bg-surface-900/40 gap-3 px-2.5 py-2'
      "
    >
      <span class="flex items-center gap-2" :class="{ 'min-w-0': compact }">
        <span
          class="h-3.5 w-3.5 rounded-full border border-white/30"
          :class="{ 'shrink-0': compact }"
          :style="{ backgroundColor: colors[option.key] }"
        />
        <span class="text-surface-200 font-medium" :class="compact ? 'text-[11px]' : 'text-xs'">
          {{ option.label }}
        </span>
      </span>
      <input
        :aria-label="option.label"
        :value="colors[option.key]"
        type="color"
        class="bg-surface-900 border-surface-700 shrink-0 cursor-pointer rounded border p-1"
        :class="compact ? 'h-7 w-9' : 'h-8 w-11'"
        @input="onColorInput(option.key, $event)"
      />
    </label>
  </div>
</template>
<script setup lang="ts">
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { getMapColorOptions, type MapMarkerColorKey } from '@/utils/theme-colors';
  defineProps<{ compact?: boolean }>();
  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();
  const colors = computed(() => preferencesStore.getMapMarkerColors);
  const options = computed(() => getMapColorOptions(t));
  function onColorInput(key: MapMarkerColorKey, event: Event) {
    const input = event.target as HTMLInputElement | null;
    if (input) preferencesStore.setMapMarkerColor(key, input.value);
  }
</script>
