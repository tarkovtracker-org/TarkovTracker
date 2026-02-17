<template>
  <div
    :style="zoneStyle"
    :class="[zoneBackgroundClass, zoneColor]"
    @mouseenter="showTooltip()"
    @mouseleave="hideTooltip()"
    @click="forceTooltipToggle()"
  ></div>
  <div v-if="tooltipVisible" :style="tooltipStyle">
    <div class="bg-accent-800 border-surface-700 m-0 rounded border px-1 pt-2 shadow-md">
      <TaskLink v-if="relatedTask" :task="relatedTask" show-wiki-link />
      <TaskObjective v-if="relatedObjective" :objective="relatedObjective" />
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useMapTooltip } from '@/composables/useMapTooltip';
  import { logger } from '@/utils/logger';
  import { rotateGameCoordinates } from '@/utils/mapCoordinates';
  import type { MapBoundsArray, MapProp, ZoneLocation, ZoneMark } from '@/features/maps/types';
  import type { CSSProperties } from 'vue';
  const TaskObjective = defineAsyncComponent(() => import('@/features/tasks/TaskObjective.vue'));
  const TaskLink = defineAsyncComponent(() => import('@/features/tasks/TaskLink.vue'));
  const props = defineProps<{
    mark: ZoneMark;
    zoneLocation: ZoneLocation;
    selectedFloor?: string;
    map: MapProp;
  }>();
  interface PercentPoint {
    leftPercent: number;
    topPercent: number;
  }
  const {
    forceTooltipToggle,
    showTooltip,
    hideTooltip,
    tooltipVisible,
    relatedObjective,
    relatedTask,
  } = useMapTooltip(() => props.mark.id);
  const zoneColor = computed(() => {
    if (tooltipVisible.value) return 'text-success-500';
    return (props.mark.users ?? []).includes('self') ? 'text-error-500' : 'text-warning-500';
  });
  const zoneBackgroundClass = computed(() => {
    if (tooltipVisible.value) return 'bg-success-500/50';
    return 'bg-warning-500/20';
  });
  const emptyRelativeLocation = () => {
    return {
      leftPercent: 0,
      topPercent: 0,
      rightPercent: 0,
      bottomPercent: 0,
      internalPercents: [] as PercentPoint[],
    };
  };
  const relativeLocation = computed(() => {
    if (!props.zoneLocation.outline.length) {
      return emptyRelativeLocation();
    }
    const warningContext = {
      mapName: props.map?.name ?? 'unknown',
      zoneId: props.mark?.id ?? 'unknown',
      zoneLocation: props.zoneLocation,
    };
    const mapSvg = props.map?.svg && typeof props.map.svg === 'object' ? props.map.svg : undefined;
    const bounds: MapBoundsArray | undefined = mapSvg?.bounds;
    if (!mapSvg || !bounds || !Array.isArray(bounds) || bounds.length < 2) {
      logger.warn(
        '[MapZone] relativeLocation -> emptyRelativeLocation: invalid map.svg or bounds',
        warningContext
      );
      return emptyRelativeLocation();
    }
    if (!Array.isArray(bounds[0]) || !Array.isArray(bounds[1])) {
      logger.warn(
        '[MapZone] relativeLocation -> emptyRelativeLocation: bounds entries must be arrays',
        warningContext
      );
      return emptyRelativeLocation();
    }
    const firstBounds = bounds[0];
    const secondBounds = bounds[1];
    if (!firstBounds || !secondBounds) {
      logger.warn(
        '[MapZone] relativeLocation -> emptyRelativeLocation: missing bounds entries',
        warningContext
      );
      return emptyRelativeLocation();
    }
    const mapLeft = Math.min(firstBounds[0], secondBounds[0]);
    const mapTop = Math.min(firstBounds[1], secondBounds[1]);
    const mapWidth =
      Math.max(firstBounds[0], secondBounds[0]) - Math.min(firstBounds[0], secondBounds[0]);
    const mapHeight =
      Math.max(firstBounds[1], secondBounds[1]) - Math.min(firstBounds[1], secondBounds[1]);
    if (mapWidth === 0 || mapHeight === 0) {
      logger.warn('[MapZone] relativeLocation -> emptyRelativeLocation: map width/height is zero', {
        ...warningContext,
        mapHeight,
        mapWidth,
      });
      return emptyRelativeLocation();
    }
    const coordinateRotation = mapSvg?.coordinateRotation ?? 0;
    const outlinePercents: PercentPoint[] = [];
    props.zoneLocation.outline.forEach((outline) => {
      const { x, z } = rotateGameCoordinates(outline.x, outline.z, coordinateRotation);
      const clampedX = Math.max(mapLeft, Math.min(x, mapLeft + mapWidth));
      const clampedZ = Math.max(mapTop, Math.min(z, mapTop + mapHeight));
      const relativeLeft = clampedX - mapLeft;
      const relativeTop = clampedZ - mapTop;
      const relativeLeftPercent = (relativeLeft / mapWidth) * 100;
      const relativeTopPercent = (relativeTop / mapHeight) * 100;
      outlinePercents.push({
        leftPercent: relativeLeftPercent,
        topPercent: relativeTopPercent,
      });
    });
    if (!outlinePercents.length) {
      return emptyRelativeLocation();
    }
    const firstOutlinePercent = outlinePercents[0]!;
    const leftPercent = outlinePercents.reduce((min, current) => {
      return current.leftPercent < min ? current.leftPercent : min;
    }, firstOutlinePercent.leftPercent);
    const topPercent = outlinePercents.reduce((min, current) => {
      return current.topPercent < min ? current.topPercent : min;
    }, firstOutlinePercent.topPercent);
    const rightPercent = outlinePercents.reduce((max, current) => {
      return current.leftPercent > max ? current.leftPercent : max;
    }, firstOutlinePercent.leftPercent);
    const bottomPercent = outlinePercents.reduce((max, current) => {
      return current.topPercent > max ? current.topPercent : max;
    }, firstOutlinePercent.topPercent);
    const widthDelta = rightPercent - leftPercent;
    const heightDelta = bottomPercent - topPercent;
    const internalPercents = outlinePercents.map((outline) => {
      return {
        leftPercent:
          widthDelta === 0 ? 0 : ((outline.leftPercent - leftPercent) / widthDelta) * 100,
        topPercent: heightDelta === 0 ? 0 : ((outline.topPercent - topPercent) / heightDelta) * 100,
      };
    });
    return {
      leftPercent,
      topPercent,
      rightPercent,
      bottomPercent,
      internalPercents,
    };
  });
  const zoneStyle = computed((): CSSProperties => {
    return {
      position: 'absolute' as const,
      top: `${relativeLocation.value.topPercent}%`,
      left: `${relativeLocation.value.leftPercent}%`,
      width: `${relativeLocation.value.rightPercent - relativeLocation.value.leftPercent}%`,
      height: `${relativeLocation.value.bottomPercent - relativeLocation.value.topPercent}%`,
      clipPath: `polygon(${relativeLocation.value.internalPercents
        .map((point) => {
          return `${point.leftPercent}% ${point.topPercent}%`;
        })
        .join(', ')})`,
      borderStyle: 'dashed' as const,
      cursor: 'pointer' as const,
      opacity: 1,
    };
  });
  const tooltipStyle = computed((): CSSProperties => {
    return {
      position: 'absolute' as const,
      top: `${relativeLocation.value.topPercent}%`,
      left: `${relativeLocation.value.leftPercent}%`,
      transform: 'translate(-50%, -125%)',
      zIndex: 100,
    };
  });
</script>
