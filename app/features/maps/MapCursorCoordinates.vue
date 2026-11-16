<template>
  <p
    v-if="position"
    data-testid="map-cursor-coordinates"
    class="text-surface-200 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] leading-snug whitespace-nowrap tabular-nums"
  >
    {{
      t('maps.cursor_coordinates', {
        x: formatGameCoordinate(position.x),
        z: formatGameCoordinate(position.z),
      })
    }}
  </p>
</template>
<script setup lang="ts">
  import { useMapCursorCoordinates } from '@/features/maps/composables/useMapCursorCoordinates';
  import { formatGameCoordinate } from '@/utils/mapCoordinates';
  import type L from 'leaflet';
  /**
   * Game coordinates under the cursor. A component of its own, so pointer movement re-renders
   * this line and not the whole map.
   */
  const props = defineProps<{ map: L.Map | null; crosshairShown: boolean }>();
  const { t } = useI18n({ useScope: 'global' });
  const position = useMapCursorCoordinates({
    map: toRef(props, 'map'),
    crosshairShown: toRef(props, 'crosshairShown'),
  });
</script>
