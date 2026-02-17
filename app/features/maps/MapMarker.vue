<template>
  <div
    :style="markerStyle"
    :class="markerColor"
    @mouseenter="showTooltip()"
    @mouseleave="hideTooltip()"
    @click="forceTooltipToggle()"
  >
    <UIcon
      :name="tooltipVisible == true ? 'i-mdi-map-marker-radius' : 'i-mdi-map-marker'"
      class="h-5 w-5"
    />
  </div>
  <div v-if="tooltipVisible" :style="tooltipStyle">
    <div class="bg-accent-800 border-surface-700 m-0 rounded border px-1 pt-2 shadow-md">
      <task-link v-if="relatedTask" :task="relatedTask" show-wiki-link />
      <task-objective v-if="relatedObjective" :objective="relatedObjective" />
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useMapTooltip } from '@/composables/useMapTooltip';
  import { logger } from '@/utils/logger';
  import { rotateGameCoordinates } from '@/utils/mapCoordinates';
  import type { MapBoundsArray, MapProp, MarkLocationProp, MarkProp } from '@/features/maps/types';
  import type { CSSProperties } from 'vue';
  const props = defineProps<{
    mark: MarkProp;
    markLocation: MarkLocationProp;
    selectedFloor?: string;
    map: MapProp;
  }>();
  const {
    forceTooltipToggle,
    showTooltip,
    hideTooltip,
    tooltipVisible,
    relatedObjective,
    relatedTask,
  } = useMapTooltip(() => props.mark.id);
  const markerColor = computed(() => {
    return (props.mark.users ?? []).includes('self') ? 'text-extract-pmc' : 'text-extract-scav';
  });
  const relativeLocation = computed(() => {
    const mapSvg = props.map?.svg && typeof props.map.svg === 'object' ? props.map.svg : undefined;
    const bounds: MapBoundsArray | undefined = mapSvg?.bounds;
    if (
      !bounds ||
      !Array.isArray(bounds) ||
      bounds.length < 2 ||
      !Array.isArray(bounds[0]) ||
      !Array.isArray(bounds[1])
    ) {
      logger.warn('MapMarker: Invalid or missing map bounds for map:', props.map?.name);
      return { leftPercent: 0, topPercent: 0 };
    }
    const firstPosition = props.markLocation.positions?.[0];
    if (!firstPosition) {
      logger.warn('MapMarker: Missing marker position for mark:', props.mark.id ?? 'unknown');
      return { leftPercent: 0, topPercent: 0 };
    }
    const firstBounds = bounds[0];
    const secondBounds = bounds[1];
    if (!firstBounds || !secondBounds) {
      logger.warn('MapMarker: Invalid bounds array for map:', props.map?.name);
      return { leftPercent: 0, topPercent: 0 };
    }
    const { x, z } = rotateGameCoordinates(
      firstPosition.x,
      firstPosition.z,
      mapSvg?.coordinateRotation ?? 0
    );
    const mapLeft = Math.min(firstBounds[0], secondBounds[0]);
    const mapTop = Math.min(firstBounds[1], secondBounds[1]);
    const mapWidth =
      Math.max(firstBounds[0], secondBounds[0]) - Math.min(firstBounds[0], secondBounds[0]);
    const mapHeight =
      Math.max(firstBounds[1], secondBounds[1]) - Math.min(firstBounds[1], secondBounds[1]);
    if (mapWidth === 0 || mapHeight === 0) {
      logger.warn('MapMarker: Map width or height is zero for map:', props.map?.name);
      return { leftPercent: 0, topPercent: 0 };
    }
    const clampedX = Math.max(mapLeft, Math.min(x, mapLeft + mapWidth));
    const clampedZ = Math.max(mapTop, Math.min(z, mapTop + mapHeight));
    const relativeLeft = clampedX - mapLeft;
    const relativeTop = clampedZ - mapTop;
    const relativeLeftPercent = (relativeLeft / mapWidth) * 100;
    const relativeTopPercent = (relativeTop / mapHeight) * 100;
    return {
      leftPercent: relativeLeftPercent,
      topPercent: relativeTopPercent,
    };
  });
  const markerStyle = computed<CSSProperties>(() => {
    return {
      position: 'absolute',
      top: relativeLocation.value.topPercent + '%',
      left: relativeLocation.value.leftPercent + '%',
      width: '20px',
      height: '20px',
      transform: 'translate(-50%, -50%)',
      cursor: 'pointer',
      opacity: 1,
    };
  });
  const tooltipStyle = computed<CSSProperties>(() => {
    return {
      position: 'absolute',
      top: relativeLocation.value.topPercent + '%',
      left: relativeLocation.value.leftPercent + '%',
      transform: 'translate(-50%, -125%)',
      zIndex: 100,
    };
  });
</script>
