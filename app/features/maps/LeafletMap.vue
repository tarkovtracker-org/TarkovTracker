<template>
  <div class="relative w-full">
    <!-- Unavailable map placeholder -->
    <div
      v-if="isMapUnavailable"
      class="bg-surface-900 flex h-100 w-full flex-col items-center justify-center rounded sm:h-125 lg:h-150"
    >
      <UIcon name="i-mdi-map-marker-off" class="mb-4 h-16 w-16 text-gray-500" />
      <h3 class="mb-2 text-lg font-semibold text-gray-300">{{ t('maps.notAvailableTitle') }}</h3>
      <p class="max-w-md text-center text-sm text-gray-500">
        {{
          t('maps.notAvailableDescription', {
            mapName: props.map?.name || t('maps.placeholder'),
          })
        }}
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
          {{ t('maps.floors') }}
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
          :title="t('maps.resetTitle')"
          @click="refreshView"
        >
          {{ t('maps.reset') }}
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
          {{ t('maps.factions.pmc') }}
        </UButton>
        <UButton
          v-if="props.showExtractToggle"
          :color="showScavExtracts ? 'primary' : 'neutral'"
          :variant="showScavExtracts ? 'soft' : 'ghost'"
          size="sm"
          icon="i-mdi-exit-run"
          @click="showScavExtracts = !showScavExtracts"
        >
          {{ t('maps.factions.scav') }}
        </UButton>
        <div class="bg-surface-900/40 flex items-center gap-2 rounded px-2 py-1">
          <span class="text-[10px] font-semibold text-gray-400 uppercase">
            {{ t('maps.zoom') }}
          </span>
          <input
            v-model.number="mapZoomSpeed"
            type="range"
            :min="ZOOM_SPEED_MIN"
            :max="ZOOM_SPEED_MAX"
            step="0.1"
            class="accent-primary-500 h-1.5 w-24 cursor-pointer"
            :aria-label="t('maps.aria.zoomSpeed')"
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
            <span>{{ t('maps.legend.yourObjectives') }}</span>
          </div>
          <div class="flex items-center gap-1">
            <div class="h-3 w-3 rounded-full bg-orange-500" />
            <span>{{ t('maps.legend.teamObjectives') }}</span>
          </div>
          <div v-if="showPmcExtracts" class="flex items-center gap-1">
            <UIcon name="i-mdi-exit-run" class="h-3 w-3 text-green-500" />
            <span>{{ t('maps.legend.pmcExtract') }}</span>
          </div>
          <div v-if="showScavExtracts" class="flex items-center gap-1">
            <UIcon name="i-mdi-exit-run" class="h-3 w-3 text-amber-400" />
            <span>{{ t('maps.legend.scavExtract') }}</span>
          </div>
          <div
            v-if="(showPmcExtracts || showScavExtracts) && hasSharedExtracts"
            class="flex items-center gap-1"
          >
            <UIcon name="i-mdi-exit-run" class="h-3 w-3 text-sky-400" />
            <span>{{ t('maps.legend.sharedExtract') }}</span>
          </div>
          <div
            v-if="(showPmcExtracts || showScavExtracts) && hasCoopExtracts"
            class="flex items-center gap-1"
          >
            <UIcon name="i-mdi-exit-run" class="h-3 w-3 text-sky-600" />
            <span>{{ t('maps.legend.coopExtract') }}</span>
          </div>
        </div>
        <!-- Controls Legend -->
        <div
          class="ml-auto flex flex-wrap-reverse items-center justify-end gap-x-4 gap-y-1 text-[10px] font-medium text-gray-400"
        >
          <div v-if="hasMultipleFloors" class="flex items-center gap-1">
            <kbd class="bg-surface-700 rounded px-1 py-0.5 font-mono text-gray-300">Ctrl</kbd>
            <span>{{ t('maps.controls.keyboard.cycleFloors') }}</span>
          </div>
          <div class="flex items-center gap-1">
            <kbd class="bg-surface-700 rounded px-1 py-0.5 font-mono text-gray-300">Shift</kbd>
            <span>{{ t('maps.controls.keyboard.zoom') }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
<script setup lang="ts">
  import { computed, createApp, inject, onUnmounted, ref, toRef, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { useLeafletMap } from '@/composables/useLeafletMap';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import type { TarkovMap, MapExtract } from '@/types/tarkov';
  import { logger } from '@/utils/logger';
  import { gameToLatLng, outlineToLatLngArray, isValidMapSvgConfig } from '@/utils/mapCoordinates';
  import { MAP_MARKER_COLORS as MAP_COLORS } from '@/utils/theme-colors';
  import LeafletObjectiveTooltip from './LeafletObjectiveTooltip.vue';
  import type L from 'leaflet';
  import { useNuxtApp } from '#imports';
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
  const { t } = useI18n({ useScope: 'global' });
  const router = useRouter();
  const { $i18n } = useNuxtApp();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  // Inject clearPinnedTask from parent (tasks.vue) to pass to tooltip
  const clearPinnedTask = inject<(() => void) | null>('clearPinnedTask', null);
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
    closeButton: false, // We use our own close button
  };
  // Track currently pinned popup's cleanup function to allow only one pinned popup at a time
  let activePinnedPopupCleanup: (() => void) | null = null;
  // Store marker references by objective ID for programmatic activation
  const objectiveMarkers = new Map<
    string,
    { layer: L.Layer; getLatLng: () => L.LatLngExpression; showPopup: (pinned: boolean) => void }
  >();
  /**
   * Mounts the LeafletObjectiveTooltip Vue component and returns the container element.
   */
  function mountObjectiveTooltip(
    objectiveId: string,
    onClose: () => void
  ): { element: HTMLElement; unmount: () => void } {
    const container = document.createElement('div');
    const app = createApp(LeafletObjectiveTooltip, { objectiveId, onClose });
    // Provide dependencies to the standalone app instance
    app.provide('router', router);
    app.provide('clearPinnedTask', clearPinnedTask);
    app.use($i18n);
    app.mount(container);
    return { element: container, unmount: () => app.unmount() };
  }
  /**
   * Attaches a popup to a layer that shows on hover and can be pinned on click.
   * - On hover: shows popup (closes when mouse leaves)
   * - On click: pins the popup (stays open until close button or click again)
   */
  /**
   * Popup timing constants (in milliseconds)
   */
  const POPUP_HIDE_DELAY = 100; // Delay before hiding popup on mouseout
  const attachHoverPinPopup = (
    layer: L.Layer,
    objectiveId: string,
    getLatLng: () => L.LatLngExpression
  ): void => {
    if (!leaflet.value || !mapInstance.value) return;
    const popup = leaflet.value.popup({
      ...popupOptions,
      className: 'map-objective-popup',
    });
    let isPinned = false;
    let isHovering = false;
    let popupHideTimer: ReturnType<typeof setTimeout> | null = null;
    let currentMountedComponent: { element: HTMLElement; unmount: () => void } | null = null;
    // Track whether popup element listeners have been attached (prevents accumulation)
    let popupListenersAttached = false;
    // Store original colors for restoration when unpinned
    const styledLayer = layer as L.CircleMarker | L.Polygon;
    const originalFillColor = styledLayer.options?.fillColor || MAP_COLORS.SELF_OBJECTIVE;
    const originalStrokeColor = styledLayer.options?.color || MAP_COLORS.SELF_OBJECTIVE;
    const isCircleMarker = 'getRadius' in styledLayer;
    const setLayerSelected = (selected: boolean) => {
      if (!('setStyle' in styledLayer)) return;
      if (selected) {
        // For circle markers, only change fillColor (keep white border)
        // For polygons, change both stroke and fill
        if (isCircleMarker) {
          styledLayer.setStyle({ fillColor: MAP_COLORS.SELECTED });
        } else {
          styledLayer.setStyle({ color: MAP_COLORS.SELECTED, fillColor: MAP_COLORS.SELECTED });
        }
      } else {
        // Restore original colors
        if (isCircleMarker) {
          styledLayer.setStyle({ fillColor: originalFillColor });
        } else {
          styledLayer.setStyle({ color: originalStrokeColor, fillColor: originalFillColor });
        }
      }
    };
    const cleanupMountedComponent = () => {
      if (currentMountedComponent) {
        currentMountedComponent.unmount();
        currentMountedComponent = null;
      }
    };
    const showPopup = (pinned: boolean) => {
      if (!mapInstance.value) return;
      // Close any other pinned popup first if we're pinning
      if (pinned && activePinnedPopupCleanup) {
        activePinnedPopupCleanup();
      }
      isPinned = pinned;
      // Change marker color to purple when pinned
      if (pinned) {
        setLayerSelected(true);
      }
      // Unmount previous component if exists
      cleanupMountedComponent();
      // Mount the Vue component
      currentMountedComponent = mountObjectiveTooltip(objectiveId, unpinAndHide);
      popup.setContent(currentMountedComponent.element);
      popup.setLatLng(getLatLng());
      if (!mapInstance.value.hasLayer(popup)) {
        popup.addTo(mapInstance.value);
      }
      if (pinned) {
        activePinnedPopupCleanup = unpinAndHide;
      }
    };
    const hidePopup = () => {
      if (!isPinned && mapInstance.value) {
        popup.remove();
        cleanupMountedComponent();
      }
    };
    const unpinAndHide = () => {
      isPinned = false;
      // Restore original marker color
      setLayerSelected(false);
      // Clear active reference if this was the pinned popup
      if (activePinnedPopupCleanup === unpinAndHide) {
        activePinnedPopupCleanup = null;
      }
      if (mapInstance.value) {
        popup.remove();
        cleanupMountedComponent();
      }
    };
    // Store reference for programmatic activation
    objectiveMarkers.set(objectiveId, { layer, getLatLng, showPopup });
    // Hover events
    layer.on('mouseover', () => {
      isHovering = true;
      // Cancel any pending hide timeout
      if (popupHideTimer) {
        clearTimeout(popupHideTimer);
        popupHideTimer = null;
      }
      if (!isPinned) {
        showPopup(false);
      }
    });
    layer.on('mouseout', () => {
      isHovering = false;
      // Cancel any pending hide timeout before setting a new one
      if (popupHideTimer) {
        clearTimeout(popupHideTimer);
      }
      popupHideTimer = setTimeout(() => {
        popupHideTimer = null;
        if (!isHovering && !isPinned) {
          hidePopup();
        }
      }, POPUP_HIDE_DELAY);
    });
    // Click to pin
    layer.on('click', (event) => {
      leaflet.value?.DomEvent.stop(event);
      if (isPinned) {
        unpinAndHide();
      } else {
        // Close any other pinned popup first
        if (activePinnedPopupCleanup) {
          activePinnedPopupCleanup();
        }
        showPopup(true);
      }
    });
    // Popup element hover handlers (stored for cleanup)
    const handlePopupMouseEnter = () => {
      isHovering = true;
      // Cancel any pending hide timeout
      if (popupHideTimer) {
        clearTimeout(popupHideTimer);
        popupHideTimer = null;
      }
    };
    const handlePopupMouseLeave = () => {
      isHovering = false;
      if (!isPinned) {
        // Cancel any pending hide timeout before setting a new one
        if (popupHideTimer) {
          clearTimeout(popupHideTimer);
        }
        popupHideTimer = setTimeout(() => {
          popupHideTimer = null;
          if (!isHovering) {
            hidePopup();
          }
        }, POPUP_HIDE_DELAY);
      }
    };
    // Handle popup element hover - only add listeners once per popup instance
    popup.on('add', () => {
      if (popupListenersAttached) return;
      const popupElement = popup.getElement();
      if (popupElement) {
        popupElement.addEventListener('mouseenter', handlePopupMouseEnter);
        popupElement.addEventListener('mouseleave', handlePopupMouseLeave);
        popupListenersAttached = true;
      }
    });
    // Clean up popup element listeners when popup is removed
    popup.on('remove', () => {
      if (!popupListenersAttached) return;
      const popupElement = popup.getElement();
      if (popupElement) {
        popupElement.removeEventListener('mouseenter', handlePopupMouseEnter);
        popupElement.removeEventListener('mouseleave', handlePopupMouseLeave);
        popupListenersAttached = false;
      }
    });
    layer.on('remove', () => {
      // Clear any pending hide timeout to prevent stale closure calls
      if (popupHideTimer) {
        clearTimeout(popupHideTimer);
        popupHideTimer = null;
      }
      popup.remove();
      objectiveMarkers.delete(objectiveId);
      cleanupMountedComponent();
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
    // Clear any pinned popup before recreating markers
    if (activePinnedPopupCleanup) {
      activePinnedPopupCleanup();
      activePinnedPopupCleanup = null;
    }
    objectiveLayer.value.clearLayers();
    interface MarkerEntry {
      polygon?: L.Polygon;
      marker?: L.CircleMarker;
      area?: number;
      objectiveId?: string;
    }
    const zoneEntries: MarkerEntry[] = [];
    const pointEntries: MarkerEntry[] = [];
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
      // Get the objective ID for the tooltip
      const objectiveId = mark.id;
      // Skip if no meaningful content
      if (!task && !objective) return;
      // Handle point markers (possibleLocations)
      mark.possibleLocations?.forEach((location) => {
        if (location.map.id !== props.map.id) return;
        const positions = location.positions;
        if (!positions || positions.length === 0) return;
        const pos = positions[0];
        if (!pos) return;
        const latLng = gameToLatLng(pos.x, pos.z);
        const isSelf = mark.users?.includes('self') ?? false;
        const markerColor = isSelf ? MAP_COLORS.SELF_OBJECTIVE : MAP_COLORS.TEAM_OBJECTIVE;
        const marker = L.circleMarker([latLng.lat, latLng.lng], {
          radius: 8,
          fillColor: markerColor,
          fillOpacity: 0.8,
          color: MAP_COLORS.MARKER_BORDER,
          weight: 2,
        });
        pointEntries.push({ marker, objectiveId });
      });
      // Handle zone polygons
      mark.zones.forEach((zone) => {
        if (zone.map.id !== props.map.id) return;
        if (zone.outline.length < 3) return;
        const latLngs = outlineToLatLngArray(zone.outline);
        if (latLngs.length < 3) return;
        const isSelf = mark.users?.includes('self') ?? false;
        const zoneColor = isSelf ? MAP_COLORS.SELF_OBJECTIVE : MAP_COLORS.TEAM_OBJECTIVE;
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
          objectiveId,
        });
      });
    });
    // Add larger zones first so smaller zones stay on top (clickable)
    zoneEntries
      .sort((a, b) => (b.area ?? 0) - (a.area ?? 0))
      .forEach(({ polygon, objectiveId }) => {
        if (!polygon) return;
        if (objectiveId) {
          // Attach hover/pin popup - shows on hover, pins on click
          attachHoverPinPopup(polygon, objectiveId, () => polygon.getBounds().getCenter());
        }
        polygon.on('mouseover', () => polygon.setStyle({ fillOpacity: 0.35, weight: 3 }));
        polygon.on('mouseout', () => polygon.setStyle({ fillOpacity: 0.2, weight: 2 }));
        objectiveLayer.value!.addLayer(polygon);
      });
    // Add point markers last so they render above zones
    pointEntries.forEach(({ marker, objectiveId }) => {
      if (!marker) return;
      if (objectiveId) {
        // Attach hover/pin popup - shows on hover, pins on click
        attachHoverPinPopup(marker, objectiveId, () => marker.getLatLng());
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
          markerColor = MAP_COLORS.PMC_EXTRACT;
          break;
        case 'scav':
          markerColor = MAP_COLORS.SCAV_EXTRACT;
          break;
        case 'shared':
          markerColor = isCoop ? MAP_COLORS.COOP_EXTRACT : MAP_COLORS.SHARED_EXTRACT;
          break;
        default:
          markerColor = MAP_COLORS.DEFAULT_EXTRACT;
          break;
      }
      const extractDot = L.circleMarker([latLng.lat, latLng.lng], {
        radius: 3,
        fillColor: markerColor,
        fillOpacity: 1,
        color: MAP_COLORS.EXTRACT_DOT_BORDER,
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
  /**
   * Activates (pins) the popup for a specific objective marker.
   * Called programmatically from outside the component.
   */
  const activateObjectivePopup = (objectiveId: string): boolean => {
    const markerData = objectiveMarkers.get(objectiveId);
    if (!markerData) return false;
    markerData.showPopup(true);
    return true;
  };
  /**
   * Closes the currently active/pinned popup and deselects the marker.
   */
  const closeActivePopup = (): void => {
    if (activePinnedPopupCleanup) {
      activePinnedPopupCleanup();
    }
  };
  // Expose methods for parent components
  defineExpose({
    activateObjectivePopup,
    closeActivePopup,
    refreshView,
  });
  // Cleanup
  onUnmounted(() => {
    // Clean up any pinned popup before unmounting
    if (activePinnedPopupCleanup) {
      activePinnedPopupCleanup();
    }
    objectiveMarkers.clear();
    clearMarkers();
  });
</script>
