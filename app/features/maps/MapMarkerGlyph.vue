<template>
  <span class="map-marker-glyph" :style="{ backgroundColor: color }">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" :d="MAP_MARKER_GLYPH_PATHS[kind]" />
    </svg>
  </span>
</template>
<script setup lang="ts">
  import {
    MAP_MARKER_GLYPH_PATHS,
    type MapMarkerGlyphKind,
  } from '@/features/maps/utils/markerGlyphs';
  /** Legend copy of the icon chip drawn on map markers, so both read identically. */
  defineProps<{ kind: MapMarkerGlyphKind; color: string }>();
</script>
