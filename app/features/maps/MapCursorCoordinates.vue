<template>
  <p
    v-if="position"
    data-testid="map-cursor-coordinates"
    class="text-surface-200 flex items-center gap-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] leading-snug whitespace-nowrap tabular-nums"
  >
    <span data-testid="map-cursor-coordinates-value">{{ formatPosition(position) }}</span>
    <i18n-t
      keypath="maps.cursor_coordinates_copy_hint"
      tag="span"
      scope="global"
      class="text-surface-400 flex items-center gap-1 font-sans pointer-coarse:hidden"
    >
      <template #key>
        <kbd class="bg-surface-700 text-surface-200 rounded px-1 font-mono text-[10px]">
          {{ 'C' }}
        </kbd>
      </template>
    </i18n-t>
  </p>
</template>
<script setup lang="ts">
  import { useCopyToClipboard } from '@/composables/useCopyToClipboard';
  import {
    useMapCursorCoordinates,
    type GamePoint,
  } from '@/features/maps/composables/useMapCursorCoordinates';
  import { formatGameCoordinate } from '@/utils/mapCoordinates';
  import type L from 'leaflet';
  /**
   * Game coordinates under the cursor, copied with C. A component of its own, so pointer
   * movement re-renders this line and not the whole map.
   */
  const props = defineProps<{
    map: L.Map | null;
    crosshairShown: boolean;
    keyboardActivity: number;
    hasKeyboardFocus: () => boolean;
    /** Map and floor names lead the copied text, so a pasted report names the place. */
    mapName: string;
    floor: string | null;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const { copyToClipboard } = useCopyToClipboard();
  const formatPosition = (point: GamePoint) =>
    t('maps.cursor_coordinates', {
      x: formatGameCoordinate(point.x),
      z: formatGameCoordinate(point.z),
    });
  const copyPosition = (point: GamePoint) => {
    const place = [props.mapName, props.floor].filter(Boolean);
    void copyToClipboard([...place, formatPosition(point)].join(' · '));
  };
  const position = useMapCursorCoordinates({
    map: toRef(props, 'map'),
    crosshairShown: toRef(props, 'crosshairShown'),
    keyboardActivity: toRef(props, 'keyboardActivity'),
    hasKeyboardFocus: () => props.hasKeyboardFocus(),
    onCopy: copyPosition,
  });
</script>
