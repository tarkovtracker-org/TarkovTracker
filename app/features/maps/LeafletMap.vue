<template>
  <div class="relative w-full">
    <!-- Unavailable map placeholder -->
    <div
      v-if="isMapUnavailable"
      class="bg-surface-900 flex h-100 w-full flex-col items-center justify-center rounded sm:h-125 lg:h-150"
    >
      <UIcon name="i-mdi-map-marker-off" class="mb-4 h-16 w-16 text-gray-500" />
      <h3 class="mb-2 text-lg font-semibold text-gray-300">Map Not Available</h3>
      <p class="max-w-md text-center text-sm text-gray-500">
        The interactive map for {{ props.map?.name || 'this location' }} is not yet available. We
        are waiting for a compatible map to be created.
      </p>
    </div>
    <!-- Map content (only shown when map is available) -->
    <template v-else>
      <!-- Floor selector (positioned below Leaflet zoom controls) -->
      <div
        v-if="hasMultipleFloors"
        class="bg-surface-800/90 absolute top-20 left-2 z-1000 flex flex-col gap-1 rounded p-1.5"
      >
        <span class="px-1 text-[10px] font-medium tracking-wide text-gray-400 uppercase">
          Floors
        </span>
        <!-- Display floors in reverse order so lowest floor is at bottom, highest at top -->
        <div class="flex flex-col-reverse gap-1">
          <UButton
            v-for="floor in floors"
            :key="floor"
            :color="floor === selectedFloor ? 'primary' : 'neutral'"
            :variant="floor === selectedFloor ? 'soft' : 'ghost'"
            size="sm"
            class="justify-start"
            @click="setFloor(floor)"
          >
            {{ floor.replace(/_/g, ' ') }}
          </UButton>
        </div>
      </div>
      <!-- Loading indicator -->
      <div
        v-if="isLoading"
        class="bg-surface-900/50 absolute inset-0 z-1001 flex items-center justify-center"
      >
        <UIcon name="i-mdi-loading" class="text-primary-500 h-8 w-8 animate-spin" />
      </div>
      <!-- Map controls (top right) -->
      <div
        class="bg-surface-800/90 absolute top-2 right-2 z-1000 flex flex-wrap items-center gap-2 rounded p-1.5"
      >
        <!-- Reset view button -->
        <UButton
          color="primary"
          variant="soft"
          size="sm"
          icon="i-mdi-fit-to-screen"
          title="Reset view to default"
          @click="refreshView"
        >
          Reset
        </UButton>
        <!-- Extract toggle -->
        <UButton
          v-if="props.showExtractToggle"
          :color="showPmcExtracts ? 'primary' : 'neutral'"
          :variant="showPmcExtracts ? 'soft' : 'ghost'"
          size="sm"
          icon="i-mdi-exit-run"
          @click="showPmcExtracts = !showPmcExtracts"
        >
          PMC
        </UButton>
        <UButton
          v-if="props.showExtractToggle"
          :color="showScavExtracts ? 'primary' : 'neutral'"
          :variant="showScavExtracts ? 'soft' : 'ghost'"
          size="sm"
          icon="i-mdi-exit-run"
          @click="showScavExtracts = !showScavExtracts"
        >
          Scav
        </UButton>
        <div class="bg-surface-900/40 flex items-center gap-2 rounded px-2 py-1">
          <span class="text-[10px] font-semibold text-gray-400 uppercase">Zoom</span>
          <input
            v-model.number="mapZoomSpeed"
            type="range"
            :min="ZOOM_SPEED_MIN"
            :max="ZOOM_SPEED_MAX"
            step="0.1"
            class="accent-primary-500 h-1.5 w-24 cursor-pointer"
            aria-label="Zoom speed"
          />
          <span class="text-[10px] text-gray-300 tabular-nums">{{ zoomSpeedLabel }}</span>
        </div>
      </div>
      <!-- Map container -->
      <div ref="mapContainer" class="bg-surface-900 h-100 w-full rounded sm:h-125 lg:h-150" />
      <!-- Legends Footer -->
      <div class="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-4">
        <!-- Main Objective Legend -->
        <div
          v-if="props.showLegend"
          class="flex flex-wrap items-center gap-4 text-xs text-gray-300"
        >
          <div class="flex items-center gap-1">
            <div class="h-3 w-3 rounded-full bg-red-500" />
            <span>Your Objectives</span>
          </div>
          <div class="flex items-center gap-1">
            <div class="h-3 w-3 rounded-full bg-orange-500" />
            <span>Team Objectives</span>
          </div>
          <div v-if="showPmcExtracts" class="flex items-center gap-1">
            <UIcon name="i-mdi-exit-run" class="h-3 w-3 text-green-500" />
            <span>PMC Extract</span>
          </div>
          <div v-if="showScavExtracts" class="flex items-center gap-1">
            <UIcon name="i-mdi-exit-run" class="h-3 w-3 text-amber-400" />
            <span>Scav Extract</span>
          </div>
          <div
            v-if="(showPmcExtracts || showScavExtracts) && hasSharedExtracts"
            class="flex items-center gap-1"
          >
            <UIcon name="i-mdi-exit-run" class="h-3 w-3 text-sky-400" />
            <span>Shared Extract (Either Faction)</span>
          </div>
          <div
            v-if="(showPmcExtracts || showScavExtracts) && hasCoopExtracts"
            class="flex items-center gap-1"
          >
            <UIcon name="i-mdi-exit-run" class="h-3 w-3 text-sky-600" />
            <span>Co-op Extract (PMC + Scav)</span>
          </div>
        </div>
        <!-- Controls Legend -->
        <div
          class="ml-auto flex flex-wrap-reverse items-center justify-end gap-x-4 gap-y-1 text-[10px] font-medium text-gray-400"
        >
          <div v-if="hasMultipleFloors" class="flex items-center gap-1">
            <kbd class="bg-surface-700 rounded px-1 py-0.5 font-mono text-gray-300">Ctrl</kbd>
            <span>+ Scroll to Cycle Floors</span>
          </div>
          <div class="flex items-center gap-1">
            <kbd class="bg-surface-700 rounded px-1 py-0.5 font-mono text-gray-300">Shift</kbd>
            <span>+ Scroll to Zoom</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
<script setup lang="ts">
  import { ref, watch, onUnmounted, computed, toRef } from 'vue';
  import { useLeafletMap } from '@/composables/useLeafletMap';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import type { TarkovMap, MapExtract } from '@/types/tarkov';
  import { logger } from '@/utils/logger';
  import { gameToLatLng, outlineToLatLngArray, isValidMapSvgConfig } from '@/utils/mapCoordinates';
  import type L from 'leaflet';
  // Types for marks (matching TarkovMap.vue structure)
  interface MapZone {
    map: { id: string };
    outline: Array<{ x: number; z: number }>;
  }
  interface MapMarkLocation {
    map: { id: string };
    positions?: Array<{ x: number; y?: number; z: number }>;
    [key: string]: unknown;
  }
  interface MapMark {
    id?: string;
    zones: MapZone[];
    possibleLocations?: MapMarkLocation[];
    users?: string[];
  }
  interface Props {
    map: TarkovMap;
    marks?: MapMark[];
    showExtracts?: boolean;
    showPmcExtracts?: boolean;
    showScavExtracts?: boolean;
    showExtractToggle?: boolean;
    showLegend?: boolean;
  }
  const props = withDefaults(defineProps<Props>(), {
    marks: () => [],
    showExtracts: true,
    showExtractToggle: true,
    showLegend: true,
  });
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  // Check if map is unavailable
  const isMapUnavailable = computed(() => {
    return props.map?.unavailable === true;
  });
  // Local state
  const mapContainer = ref<HTMLElement | null>(null);
  const showPmcExtracts = ref(props.showPmcExtracts ?? props.showExtracts);
  const showScavExtracts = ref(props.showScavExtracts ?? props.showExtracts);
  // Use the Leaflet map composable
  const {
    mapInstance,
    leaflet,
    selectedFloor,
    floors,
    hasMultipleFloors,
    isLoading,
    objectiveLayer,
    extractLayer,
    setFloor,
    refreshView,
    clearMarkers,
  } = useLeafletMap({
    containerRef: mapContainer,
    map: toRef(props, 'map'),
  });
  // Get extracts for the current map
  const mapExtracts = computed<MapExtract[]>(() => {
    if (!props.map?.extracts) return [];
    return props.map.extracts;
  });
  const isCoopExtract = (extract: MapExtract): boolean => {
    return /\bco-?op\b/i.test(extract.name || '');
  };
  const hasSharedExtracts = computed(() => {
    return mapExtracts.value.some(
      (extract) => extract.faction === 'shared' && !isCoopExtract(extract)
    );
  });
  const hasCoopExtracts = computed(() => {
    return mapExtracts.value.some(
      (extract) => extract.faction === 'shared' && isCoopExtract(extract)
    );
  });
  const ZOOM_SPEED_MIN = 0.5;
  const ZOOM_SPEED_MAX = 3;
  const mapZoomSpeed = computed({
    get: () => preferencesStore.getMapZoomSpeed,
    set: (value) => {
      const parsed = Number(value);
      const clamped = Math.min(ZOOM_SPEED_MAX, Math.max(ZOOM_SPEED_MIN, parsed));
      preferencesStore.setMapZoomSpeed(clamped);
    },
  });
  const zoomSpeedLabel = computed(() => `${mapZoomSpeed.value.toFixed(1)}x`);
  const baseZoomDelta = ref<number | null>(null);
  const baseZoomSnap = ref<number | null>(null);
  const popupOptions = {
    autoClose: false,
    closeOnClick: false,
    closeButton: true,
  };
  const attachTogglePopup = (
    layer: L.Layer,
    html: string,
    getLatLng: () => L.LatLngExpression
  ): void => {
    if (!leaflet.value || !mapInstance.value) return;
    const popup = leaflet.value.popup(popupOptions).setContent(html);
    const togglePopup = () => {
      if (!mapInstance.value) return;
      if (mapInstance.value.hasLayer(popup)) {
        popup.remove();
        return;
      }
      popup.setLatLng(getLatLng());
      popup.addTo(mapInstance.value);
    };
    layer.on('click', (event) => {
      leaflet.value?.DomEvent.stop(event);
      togglePopup();
    });
    layer.on('remove', () => {
      popup.remove();
    });
  };
  /**
   * Creates objective markers on the map.
   */
  function createObjectiveMarkers(): void {
    if (!leaflet.value || !objectiveLayer.value || !props.map) return;
    const L = leaflet.value;
    const svgConfig = props.map.svg;
    if (!isValidMapSvgConfig(svgConfig)) return;
    objectiveLayer.value.clearLayers();
    const zoneEntries: Array<{
      polygon: L.Polygon;
      area: number;
      popupContent?: string;
    }> = [];
    const pointEntries: Array<{
      marker: L.CircleMarker;
      popupContent?: string;
    }> = [];
    const calculateZoneArea = (outline: Array<{ x: number; z: number }>): number => {
      if (outline.length < 3) return 0;
      let sum = 0;
      for (let i = 0; i < outline.length; i++) {
        const current = outline[i];
        const next = outline[(i + 1) % outline.length];
        if (!current || !next) continue;
        sum += current.x * next.z - next.x * current.z;
      }
      return Math.abs(sum / 2);
    };
    // Create markers and zones, but add zones later sorted by size.
    props.marks.forEach((mark) => {
      const objective = metadataStore.objectives.find((obj) => obj.id === mark.id);
      const task = objective ? metadataStore.tasks.find((t) => t.id === objective.taskId) : null;
      const popupContent =
        task || objective
          ? `
          <div class="text-sm">
            ${task ? `<div class="font-semibold">${task.name}</div>` : ''}
            ${objective ? `<div class="text-gray-400">${objective.description}</div>` : ''}
          </div>
        `
          : undefined;
      // Handle point markers (possibleLocations)
      mark.possibleLocations?.forEach((location) => {
        if (location.map.id !== props.map.id) return;
        const positions = location.positions;
        if (!positions || positions.length === 0) return;
        const pos = positions[0];
        if (!pos) return;
        const latLng = gameToLatLng(pos.x, pos.z);
        const isSelf = mark.users?.includes('self') ?? false;
        const markerColor = isSelf ? '#ef4444' : '#f97316'; // red-500 : orange-500
        const marker = L.circleMarker([latLng.lat, latLng.lng], {
          radius: 8,
          fillColor: markerColor,
          fillOpacity: 0.8,
          color: '#ffffff',
          weight: 2,
        });
        pointEntries.push({ marker, popupContent });
      });
      // Handle zone polygons
      mark.zones.forEach((zone) => {
        if (zone.map.id !== props.map.id) return;
        if (zone.outline.length < 3) return;
        const latLngs = outlineToLatLngArray(zone.outline);
        if (latLngs.length < 3) return;
        const isSelf = mark.users?.includes('self') ?? false;
        const zoneColor = isSelf ? '#ef4444' : '#f97316';
        const polygon = L.polygon(
          latLngs.map((ll) => [ll.lat, ll.lng]),
          {
            color: zoneColor,
            fillColor: zoneColor,
            fillOpacity: 0.2,
            weight: 2,
            dashArray: '5, 5',
          }
        );
        zoneEntries.push({
          polygon,
          area: calculateZoneArea(zone.outline),
          popupContent,
        });
      });
    });
    // Add larger zones first so smaller zones stay on top (clickable)
    zoneEntries
      .sort((a, b) => b.area - a.area)
      .forEach(({ polygon, popupContent }) => {
        if (popupContent) {
          attachTogglePopup(polygon, popupContent, () => polygon.getBounds().getCenter());
          polygon.bindTooltip(popupContent, {
            className: 'map-zone-tooltip',
            opacity: 0.95,
            sticky: true,
          });
        }
        polygon.on('mouseover', () => polygon.setStyle({ fillOpacity: 0.35, weight: 3 }));
        polygon.on('mouseout', () => polygon.setStyle({ fillOpacity: 0.2, weight: 2 }));
        objectiveLayer.value!.addLayer(polygon);
      });
    // Add point markers last so they render above zones
    pointEntries.forEach(({ marker, popupContent }) => {
      if (popupContent) {
        attachTogglePopup(marker, popupContent, () => marker.getLatLng());
        marker.bindTooltip(popupContent, {
          className: 'map-zone-tooltip',
          opacity: 0.95,
          direction: 'top',
        });
      }
      objectiveLayer.value!.addLayer(marker);
    });
  }
  /**
   * Creates extract markers on the map.
   */
  function createExtractMarkers(): void {
    if (!leaflet.value || !extractLayer.value || !props.map) return;
    const L = leaflet.value;
    const svgConfig = props.map.svg;
    if (!isValidMapSvgConfig(svgConfig)) return;
    extractLayer.value.clearLayers();
    const showAnyExtracts = showPmcExtracts.value || showScavExtracts.value;
    if (!showAnyExtracts) return;
    mapExtracts.value.forEach((extract) => {
      if (!extract.position) return;
      const isCoop = extract.faction === 'shared' && isCoopExtract(extract);
      const shouldShow =
        extract.faction === 'pmc'
          ? showPmcExtracts.value
          : extract.faction === 'scav'
            ? showScavExtracts.value
            : showAnyExtracts;
      if (!shouldShow) return;
      const latLng = gameToLatLng(extract.position.x, extract.position.z);
      // Color based on faction
      let markerColor: string;
      switch (extract.faction) {
        case 'pmc':
          markerColor = '#22c55e'; // green-500
          break;
        case 'scav':
          markerColor = '#f59e0b'; // amber-500
          break;
        case 'shared':
          markerColor = isCoop ? '#0284c7' : '#38bdf8'; // sky-600 : sky-400
          break;
        default:
          markerColor = '#3b82f6'; // blue-500
          break;
      }
      const extractDot = L.circleMarker([latLng.lat, latLng.lng], {
        radius: 3,
        fillColor: markerColor,
        fillOpacity: 1,
        color: '#0b0b0f',
        weight: 1,
        opacity: 1,
        interactive: false,
      });
      // Create custom icon for extracts
      // Use inline styles instead of Tailwind classes since Leaflet injects these outside Vue context
      const extractBadge = document.createElement('div');
      extractBadge.setAttribute('title', extract.name);
      extractBadge.setAttribute('aria-label', extract.name);
      extractBadge.style.display = 'inline-flex';
      extractBadge.style.alignItems = 'center';
      extractBadge.style.gap = '6px';
      extractBadge.style.padding = '3px 6px';
      extractBadge.style.borderRadius = '999px';
      extractBadge.style.backgroundColor = 'rgba(26, 26, 30, 0.9)';
      extractBadge.style.border = `2px solid ${markerColor}`;
      extractBadge.style.fontSize = '11px';
      extractBadge.style.lineHeight = '1';
      extractBadge.style.color = '#e5e5e5';
      extractBadge.style.boxShadow = '0 2px 4px rgba(0,0,0,0.5)';
      extractBadge.style.whiteSpace = 'nowrap';
      extractBadge.style.transform = 'translate(-50%, calc(-100% - 6px))';
      const extractLabel = document.createElement('span');
      extractLabel.style.fontWeight = '600';
      extractLabel.textContent = extract.name;
      extractBadge.appendChild(extractLabel);
      const extractIcon = L.divIcon({
        className: 'extract-marker',
        html: extractBadge,
        iconAnchor: [0, 0],
        iconSize: undefined,
      });
      const labelMarker = L.marker([latLng.lat, latLng.lng], {
        icon: extractIcon,
        interactive: false,
        zIndexOffset: 1000,
      });
      extractLayer.value!.addLayer(extractDot);
      extractLayer.value!.addLayer(labelMarker);
    });
  }
  /**
   * Updates all markers on the map.
   */
  function updateMarkers(): void {
    try {
      createObjectiveMarkers();
      createExtractMarkers();
    } catch (error) {
      logger.error('Error updating map markers:', error);
    }
  }
  const applyZoomSpeed = (instance: L.Map | null, speed: number) => {
    if (!instance) return;
    if (baseZoomDelta.value === null) {
      baseZoomDelta.value = instance.options.zoomDelta ?? 0.35;
    }
    if (baseZoomSnap.value === null) {
      baseZoomSnap.value = instance.options.zoomSnap ?? 0.25;
    }
    instance.options.zoomDelta = baseZoomDelta.value * speed;
    if (baseZoomSnap.value !== null) {
      const nextZoomSnap =
        speed < 1 ? Math.max(0.05, baseZoomSnap.value * speed) : baseZoomSnap.value;
      instance.options.zoomSnap = nextZoomSnap;
    }
  };
  // Watch for changes that require marker updates
  watch(
    () => props.marks,
    () => updateMarkers(),
    { deep: true }
  );
  watch(mapZoomSpeed, (speed) => {
    applyZoomSpeed(mapInstance.value, speed);
  });
  watch([showPmcExtracts, showScavExtracts], () => createExtractMarkers());
  watch(selectedFloor, () => {
    // Markers might need floor-based visibility in the future
    updateMarkers();
  });
  // Wait for map to be ready, then create markers
  watch(
    mapInstance,
    (instance) => {
      if (instance) {
        baseZoomDelta.value = instance.options.zoomDelta ?? 0.35;
        baseZoomSnap.value = instance.options.zoomSnap ?? 0.25;
        applyZoomSpeed(instance, mapZoomSpeed.value);
        // Give the SVG time to load
        setTimeout(() => updateMarkers(), 500);
      }
    },
    { immediate: true }
  );
  // Cleanup
  onUnmounted(() => {
    clearMarkers();
  });
</script>
<style>
  /* Override Leaflet default styles for dark theme */
  .leaflet-container {
    background-color: rgb(var(--color-surface-900));
    font-family: inherit;
  }
  .leaflet-popup-content-wrapper {
    background-color: #1a1a1e !important;
    color: #e5e5e5 !important;
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  }
  .leaflet-popup-tip {
    background-color: #1a1a1e !important;
  }
  .leaflet-popup-content {
    margin: 0.75rem;
  }
  .leaflet-control-zoom a {
    background-color: rgb(var(--color-surface-800)) !important;
    color: rgb(var(--color-gray-200)) !important;
    border-color: rgb(var(--color-surface-700)) !important;
  }
  .leaflet-control-zoom a:hover {
    background-color: rgb(var(--color-surface-700)) !important;
  }
  /* Zone hover tooltip styling */
  .map-zone-tooltip {
    background-color: #1a1a1e !important;
    color: #e5e5e5 !important;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    padding: 6px 8px;
  }
  /* Extract marker styling */
  .extract-marker {
    background: transparent;
    border: none;
  }
</style>
