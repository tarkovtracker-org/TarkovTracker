<template>
  <button
    type="button"
    :aria-pressed="visible"
    :data-layer="item.key"
    class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-850 flex min-h-8 w-full items-center gap-2.5 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    @click="emit('toggle', item)"
  >
    <span
      class="flex h-6 w-6 shrink-0 items-center justify-center transition"
      :class="visible ? '' : 'opacity-35 grayscale'"
      aria-hidden="true"
    >
      <span
        v-if="dotClass"
        class="rounded-full border-white"
        :class="dotClass"
        :style="{ backgroundColor: item.color }"
      />
      <MapMarkerGlyph v-else :kind="glyphKind" :color="item.color" />
    </span>
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="truncate font-medium" :class="visible ? 'text-surface-100' : 'text-surface-500'">
        {{ item.label }}
      </span>
      <span v-if="item.hint" class="text-surface-500 truncate text-[10px]">{{ item.hint }}</span>
    </span>
    <UIcon
      :name="visible ? 'i-mdi-eye-outline' : 'i-mdi-eye-off-outline'"
      class="h-4 w-4 shrink-0"
      :class="visible ? 'text-surface-300' : 'text-surface-600'"
      aria-hidden="true"
    />
  </button>
</template>
<script setup lang="ts">
  import MapMarkerGlyph from '@/features/maps/MapMarkerGlyph.vue';
  import type { MapLayerItem, MapLayerSwatch } from '@/features/maps/utils/mapLayerGroups';
  import type { MapMarkerGlyphKind } from '@/features/maps/utils/markerGlyphs';
  /** One legend row: the marker as the map draws it, its name, and its visibility toggle. */
  const props = defineProps<{ item: MapLayerItem }>();
  const emit = defineEmits<{ toggle: [item: MapLayerItem] }>();
  const visible = computed(() => props.item.visible.value);
  type DotSwatch = Exclude<MapLayerSwatch, MapMarkerGlyphKind>;
  // Objective and spawn markers are plain circles on the map, so their rows use matching dots.
  const DOT_CLASSES: Record<DotSwatch, string> = {
    objective: 'h-3.5 w-3.5 border-2',
    spawn: 'h-2 w-2 border',
  };
  const isDotSwatch = (swatch: MapLayerSwatch): swatch is DotSwatch => swatch in DOT_CLASSES;
  const dotClass = computed(() =>
    isDotSwatch(props.item.swatch) ? DOT_CLASSES[props.item.swatch] : undefined
  );
  const glyphKind = computed<MapMarkerGlyphKind>(() =>
    isDotSwatch(props.item.swatch) ? 'extract' : props.item.swatch
  );
</script>
