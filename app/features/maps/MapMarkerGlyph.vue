<template>
  <span class="relative inline-block h-5.5 w-4.5 shrink-0" :style="{ '--pin-color': color }">
    <span class="absolute top-0 left-0 size-4.5 border-[1.5px]" :class="MAP_PIN_BODY_SKIN_CLASS" />
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      class="absolute top-0.75 left-0.75 size-3"
      :class="MAP_PIN_GLYPH_SKIN_CLASS"
    >
      <path fill="currentColor" :d="MAP_MARKER_GLYPH_PATHS[kind]" />
    </svg>
  </span>
</template>
<script setup lang="ts">
  import {
    MAP_MARKER_GLYPH_PATHS,
    MAP_PIN_BODY_SKIN_CLASS,
    MAP_PIN_GLYPH_SKIN_CLASS,
    type MapMarkerGlyphKind,
  } from '@/features/maps/utils/markerGlyphs';
  /** Legend copy of a map pin, so the Layers rows match the markers. */
  defineProps<{ kind: MapMarkerGlyphKind; color: string }>();
</script>
