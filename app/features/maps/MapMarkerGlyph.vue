<template>
  <span
    class="inline-flex size-4.5 shrink-0 items-center justify-center rounded-full border-2 border-white text-white shadow-md"
    :style="{ backgroundColor: color }"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true" class="size-3 drop-shadow-sm">
      <path fill="currentColor" :d="MAP_MARKER_GLYPH_PATHS[kind]" />
    </svg>
  </span>
</template>
<script setup lang="ts">
  import {
    MAP_MARKER_GLYPH_PATHS,
    type MapMarkerGlyphKind,
  } from '@/features/maps/utils/markerGlyphs';
  /** Legend copy of a map pin's head, so the Layers rows match the markers. */
  defineProps<{ kind: MapMarkerGlyphKind; color: string }>();
</script>
