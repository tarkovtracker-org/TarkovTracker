import { useDebounceFn } from '@vueuse/core';
import { logger } from '@/utils/logger';
import {
  getLeafletBounds,
  getLeafletMapOptions,
  getMapSvgCdnUrl,
  getMapSvgFallbackUrl,
  getSvgOverlayBounds,
  isValidMapSvgConfig,
  isValidMapTileConfig,
  normalizeTileConfig,
  type MapRenderConfig,
  type MapSvgConfig,
  type MapTileConfig,
} from '@/utils/mapCoordinates';
import type { TarkovMap } from '@/types/tarkov';
import type L from 'leaflet';
import type { ShallowRef } from 'vue';
export interface UseLeafletMapOptions {
  /** Container element ref */
  containerRef: Ref<HTMLElement | null>;
  /** Map data */
  map: Ref<TarkovMap | null>;
  /** Initial floor selection */
  initialFloor?: string;
  /** Enable idle detection for performance */
  enableIdleDetection?: boolean;
  /** Idle timeout in milliseconds */
  idleTimeout?: number;
}
export interface UseLeafletMapReturn {
  /** Leaflet map instance */
  mapInstance: ShallowRef<L.Map | null>;
  /** Leaflet library reference */
  leaflet: ShallowRef<typeof L | null>;
  /** Currently selected floor */
  selectedFloor: Ref<string>;
  /** Available floors for the current map */
  floors: Ref<string[]>;
  /** Whether the map has multiple floors */
  hasMultipleFloors: Ref<boolean>;
  /** Whether the map is loading */
  isLoading: Ref<boolean>;
  /** Whether the map is in idle mode */
  isIdle: Ref<boolean>;
  /** SVG overlay layer */
  svgLayer: ShallowRef<L.SVGOverlay | null>;
  /** Objective markers layer group */
  objectiveLayer: ShallowRef<L.LayerGroup | null>;
  /** Extract markers layer group */
  extractLayer: ShallowRef<L.LayerGroup | null>;
  /** PMC spawn markers layer group */
  spawnLayer: ShallowRef<L.LayerGroup | null>;
  /** Set the current floor */
  setFloor: (floor: string) => void;
  /** Refresh the map view */
  refreshView: () => void;
  /** Clear all markers */
  clearMarkers: () => void;
  /** Destroy the map instance */
  destroy: () => void;
}
interface MapLayerLoadToken {
  id: number;
  signal: AbortSignal;
}
const svgCache = new Map<string, string>();
function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: string }).name === 'AbortError')
  );
}
async function fetchSvgContent(
  primaryUrl: string,
  fallbackUrls: string[] = [],
  signal?: AbortSignal
): Promise<string | null> {
  if (signal?.aborted) return null;
  // Check cache first
  if (svgCache.has(primaryUrl)) {
    return svgCache.get(primaryUrl)!;
  }
  try {
    const response = await fetch(primaryUrl, { signal });
    if (response.ok) {
      const content = await response.text();
      svgCache.set(primaryUrl, content);
      return content;
    }
  } catch (e) {
    if (isAbortError(e) || signal?.aborted) return null;
    logger.warn(`Failed to fetch SVG from primary URL: ${primaryUrl}`, e);
  }
  // Try fallbacks in order
  for (const fallbackUrl of fallbackUrls) {
    if (signal?.aborted) return null;
    if (!fallbackUrl) continue;
    if (svgCache.has(fallbackUrl)) {
      return svgCache.get(fallbackUrl)!;
    }
    try {
      const response = await fetch(fallbackUrl, { signal });
      if (response.ok) {
        const content = await response.text();
        svgCache.set(fallbackUrl, content);
        svgCache.set(primaryUrl, content); // Cache under primary URL too
        return content;
      }
    } catch (e) {
      if (isAbortError(e) || signal?.aborted) return null;
      logger.warn(`Failed to fetch SVG from fallback URL: ${fallbackUrl}`, e);
    }
  }
  return null;
}
/**
 * Parses SVG content string to SVG element.
 */
function parseSvgContent(content: string): SVGElement | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'image/svg+xml');
  // Check for parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    logger.error('SVG parse error:', parseError.textContent);
    return null;
  }
  return doc.documentElement as unknown as SVGElement;
}
export function useLeafletMap(options: UseLeafletMapOptions): UseLeafletMapReturn {
  const {
    containerRef,
    map,
    initialFloor,
    enableIdleDetection = true,
    idleTimeout = 60000, // 1 minute
  } = options;
  // State
  const mapInstance = shallowRef<L.Map | null>(null);
  const leaflet = shallowRef<typeof L | null>(null);
  const selectedFloor = ref<string>('');
  const isLoading = ref(false);
  const isIdle = ref(false);
  const svgLayer = shallowRef<L.SVGOverlay | null>(null);
  const tileLayer = shallowRef<L.TileLayer | null>(null);
  const objectiveLayer = shallowRef<L.LayerGroup | null>(null);
  const extractLayer = shallowRef<L.LayerGroup | null>(null);
  const spawnLayer = shallowRef<L.LayerGroup | null>(null);
  const crsKey = ref('');
  const renderKey = ref('');
  // Map event handlers
  const onWheel = (e: WheelEvent) => {
    if (!mapInstance.value) return;
    // Shift + Scroll: Zoom
    if (e.shiftKey) {
      e.preventDefault();
      const options = mapInstance.value.options;
      const zoomDelta = options?.zoomDelta ?? 1;
      const zoomSnap = options?.zoomSnap ?? 1;
      const delta = e.deltaY > 0 ? -zoomDelta : zoomDelta;
      let newZoom = mapInstance.value.getZoom() + delta;
      if (zoomSnap > 0) {
        newZoom = Math.round(newZoom / zoomSnap) * zoomSnap;
      }
      const zoomTarget = mapInstance.value.mouseEventToLatLng(e);
      mapInstance.value.setZoomAround(zoomTarget, newZoom);
    }
    // Ctrl + Scroll: Cycle Floors
    else if (e.ctrlKey && hasMultipleFloors.value) {
      e.preventDefault();
      const currentIndex = floors.value.indexOf(selectedFloor.value);
      if (currentIndex === -1) return;
      // Scroll UP (negative delta) -> Go UP a floor (next index)
      // Scroll DOWN (positive delta) -> Go DOWN a floor (previous index)
      // Assuming floors are ordered lowest to highest in array
      const direction = e.deltaY < 0 ? 1 : -1;
      const nextIndex = currentIndex + direction;
      if (nextIndex >= 0 && nextIndex < floors.value.length) {
        const nextFloor = floors.value[nextIndex];
        if (nextFloor !== undefined) {
          setFloor(nextFloor);
        }
      }
    }
  };
  // Idle detection timer
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  // Resize observer
  let resizeObserver: ResizeObserver | null = null;
  let initializeToken = 0;
  const isInitializeTokenActive = (token: number): boolean => token === initializeToken;
  let currentLoadId = 0;
  let currentLoadController: AbortController | null = null;
  const createMapLayerLoadToken = (): MapLayerLoadToken => {
    if (currentLoadController) {
      currentLoadController.abort();
    }
    currentLoadId += 1;
    currentLoadController = new AbortController();
    return {
      id: currentLoadId,
      signal: currentLoadController.signal,
    };
  };
  const cancelMapLayerLoad = (): void => {
    currentLoadId += 1;
    if (currentLoadController) {
      currentLoadController.abort();
      currentLoadController = null;
    }
  };
  const isMapLayerLoadActive = (token?: MapLayerLoadToken): boolean => {
    if (!token) return true;
    return token.id === currentLoadId && !token.signal.aborted;
  };
  const isLayerLoadOperationActive = (
    initToken?: number,
    loadToken?: MapLayerLoadToken
  ): boolean => {
    if (initToken !== undefined && !isInitializeTokenActive(initToken)) return false;
    return isMapLayerLoadActive(loadToken);
  };
  // Computed
  const getSvgConfig = (): MapSvgConfig | undefined => {
    const svgConfig = map.value?.svg;
    return isValidMapSvgConfig(svgConfig) ? svgConfig : undefined;
  };
  const getTileConfig = (): MapTileConfig | undefined => {
    const tileConfig = map.value?.tile;
    if (!isValidMapTileConfig(tileConfig)) return undefined;
    return normalizeTileConfig(tileConfig);
  };
  const isMapUnavailable = (): boolean => map.value?.unavailable === true;
  const getRenderConfig = (): MapRenderConfig | undefined => getSvgConfig() ?? getTileConfig();
  const renderKeyRef = computed<string | undefined>(() => {
    const svgConfig = getSvgConfig();
    if (svgConfig) {
      return JSON.stringify({
        type: 'svg',
        file: svgConfig.file,
        floors: svgConfig.floors,
        defaultFloor: svgConfig.defaultFloor,
        svgBounds: svgConfig.svgBounds ?? null,
      });
    }
    const tileConfig = getTileConfig();
    if (tileConfig) {
      return JSON.stringify({
        type: 'tile',
        tilePath: tileConfig.tilePath,
        tileFallbacks: tileConfig.tileFallbacks ?? null,
        minZoom: tileConfig.minZoom ?? null,
        maxZoom: tileConfig.maxZoom ?? null,
      });
    }
    return undefined;
  });
  const getRenderKey = (): string | undefined => renderKeyRef.value;
  const rawFloors = computed<string[]>(() => {
    return getSvgConfig()?.floors ?? getTileConfig()?.floors ?? [];
  });
  const floors = computed<string[]>(() => {
    if (rawFloors.value.length <= 1) return rawFloors.value;
    const bottomFloors = rawFloors.value.filter((floorName) => isBottomOverlayFloor(floorName));
    if (!bottomFloors.length) return rawFloors.value;
    const remainingFloors = rawFloors.value.filter((floorName) => !isBottomOverlayFloor(floorName));
    return [...bottomFloors, ...remainingFloors];
  });
  const hasMultipleFloors = computed(() => floors.value.length > 1);
  const getCrsKey = (config?: MapRenderConfig): string => {
    if (!config) return 'none';
    return JSON.stringify({
      transform: config.transform ?? null,
      coordinateRotation: config.coordinateRotation ?? 0,
      bounds: config.bounds,
      svgBounds: 'svgBounds' in config ? (config.svgBounds ?? null) : null,
    });
  };
  /**
   * Resets the idle timer.
   */
  function resetIdleTimer() {
    if (!enableIdleDetection) return;
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    if (isIdle.value) {
      isIdle.value = false;
      // Re-enable interactions when coming out of idle
      if (mapInstance.value) {
        mapInstance.value.dragging.enable();
      }
    }
    idleTimer = setTimeout(() => {
      isIdle.value = true;
      // Disable some interactions when idle to reduce CPU
      if (mapInstance.value) {
        // Keep zoom available but reduce update frequency
        mapInstance.value.options.zoomSnap = 1;
      }
    }, idleTimeout);
  }
  /**
   * Loads SVG overlay for a standard map (single SVG file).
   */
  async function loadStandardMapSvg(
    L: typeof import('leaflet'),
    initToken?: number,
    loadToken?: MapLayerLoadToken
  ): Promise<void> {
    if (!isLayerLoadOperationActive(initToken, loadToken)) return;
    const svgConfig = map.value?.svg;
    if (!isValidMapSvgConfig(svgConfig)) return;
    const floor = selectedFloor.value || svgConfig.defaultFloor;
    const fileBase = svgConfig.file.replace(/\.svg$/i, '');
    const mapName = fileBase || map.value?.normalizedName || map.value?.name || '';
    const baseUrl = `https://assets.tarkov.dev/maps/svg/${svgConfig.file}`;
    const perFloorUrl = getMapSvgCdnUrl(mapName, floor);
    const fallbackUrl = getMapSvgFallbackUrl(svgConfig.file);
    const hasMultipleFloors = svgConfig.floors.length > 1;
    const primaryUrl = baseUrl;
    const fallbackUrls = hasMultipleFloors ? [fallbackUrl] : [perFloorUrl, fallbackUrl];
    const svgContent = await fetchSvgContent(primaryUrl, fallbackUrls, loadToken?.signal);
    if (!isLayerLoadOperationActive(initToken, loadToken)) return;
    if (!svgContent) {
      logger.error(`Failed to load SVG for map: ${mapName}`);
      return;
    }
    const svgElement = parseSvgContent(svgContent);
    if (!svgElement) return;
    if (!isLayerLoadOperationActive(initToken, loadToken)) return;
    if (tileLayer.value && mapInstance.value) {
      mapInstance.value.removeLayer(tileLayer.value);
      tileLayer.value = null;
    }
    // Remove existing SVG layer
    if (svgLayer.value && mapInstance.value) {
      mapInstance.value.removeLayer(svgLayer.value);
    }
    // Create new SVG overlay using svgBounds if available
    if (!isLayerLoadOperationActive(initToken, loadToken)) return;
    const bounds = getSvgOverlayBounds(svgConfig);
    const nextSvgLayer = L.svgOverlay(svgElement, bounds, { pane: 'mapBackground' });
    if (!isLayerLoadOperationActive(initToken, loadToken)) return;
    svgLayer.value = nextSvgLayer;
    if (mapInstance.value) {
      nextSvgLayer.addTo(mapInstance.value);
      // Apply floor visibility if there are multiple floors in a single SVG
      if (floors.value.length > 1) {
        updateFloorVisibility(svgElement);
      }
    }
  }
  async function loadTileMap(
    L: typeof import('leaflet'),
    tileConfig: MapTileConfig,
    initToken?: number,
    loadToken?: MapLayerLoadToken
  ): Promise<void> {
    if (!isLayerLoadOperationActive(initToken, loadToken)) return;
    const leafletMap = mapInstance.value;
    if (!leafletMap) return;
    if (tileLayer.value) {
      tileLayer.value.off();
      leafletMap.removeLayer(tileLayer.value);
      tileLayer.value = null;
    }
    try {
      const bounds = getLeafletBounds(tileConfig);
      const initialPath =
        (selectedFloor.value && tileConfig.floorTilePaths?.[selectedFloor.value]) ||
        tileConfig.tilePath;
      const tilePaths = [initialPath, ...(tileConfig.tileFallbacks ?? [])];
      tileLayer.value = L.tileLayer(initialPath, {
        minZoom: tileConfig.minZoom ?? 1,
        maxZoom: tileConfig.maxZoom ?? 6,
        noWrap: true,
        bounds,
        pane: 'mapBackground',
        tileSize: tileConfig.tileSize ?? 256,
      });
      const layer = tileLayer.value;
      const attachTileErrorHandler = (currentIndex: number) => {
        const handleTileError = (event: L.LeafletEvent) => {
          if (
            !layer ||
            tileLayer.value !== layer ||
            !isLayerLoadOperationActive(initToken, loadToken)
          )
            return;
          const failedUrl = tilePaths[currentIndex] ?? tileConfig.tilePath;
          const nextIndex = currentIndex + 1;
          const nextUrl = tilePaths[nextIndex];
          if (nextUrl) {
            logger.warn(`Tile layer failed for ${failedUrl}. Trying fallback: ${nextUrl}`, event);
            layer.off('tileerror', handleTileError);
            layer.setUrl(nextUrl, true);
            attachTileErrorHandler(nextIndex);
            return;
          }
          logger.error(`Tile layer failed for ${failedUrl}. No fallback URLs available.`, event);
          layer.off('tileerror', handleTileError);
          if (leafletMap.hasLayer(layer)) {
            leafletMap.removeLayer(layer);
          }
          if (tileLayer.value === layer) {
            tileLayer.value = null;
          }
        };
        layer.on('tileerror', handleTileError);
      };
      if (layer && isLayerLoadOperationActive(initToken, loadToken)) {
        attachTileErrorHandler(0);
        layer.addTo(leafletMap);
      }
      if (!isLayerLoadOperationActive(initToken, loadToken)) return;
      if (svgLayer.value) {
        leafletMap.removeLayer(svgLayer.value);
        svgLayer.value = null;
      }
    } catch (error) {
      if (tileLayer.value && leafletMap.hasLayer(tileLayer.value)) {
        leafletMap.removeLayer(tileLayer.value);
      }
      tileLayer.value = null;
      logger.error('Failed to load tile map layer:', error);
    }
  }
  function normalizeFloorName(floorName: string): string {
    return floorName.toLowerCase().replace(/_/g, ' ');
  }
  function normalizeFloorIdToken(token: string): string {
    return token.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  function parseConfiguredOrdinalFloor(floorName: string): number | null {
    const match = normalizeFloorName(floorName).match(/^(\d+)(st|nd|rd|th)\s+floor$/);
    if (!match?.[1]) return null;
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function parseSvgOrdinalFloor(groupId: string): number | null {
    const normalized = groupId.toLowerCase().replace(/[- ]+/g, '_');
    const numericMatch = normalized.match(/^floor_(\d+)$/);
    if (numericMatch?.[1]) {
      const parsed = Number.parseInt(numericMatch[1], 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
    const textMatch = normalized.match(
      /^(first|second|third|fourth|fifth|sixth|seventh|eighth)_floor$/
    );
    if (!textMatch?.[1]) return null;
    const ordinalMap: Record<string, number> = {
      first: 1,
      second: 2,
      third: 3,
      fourth: 4,
      fifth: 5,
      sixth: 6,
      seventh: 7,
      eighth: 8,
    };
    return ordinalMap[textMatch[1]] ?? null;
  }
  function getFloorIdCandidates(floorName: string): string[] {
    const normalized = normalizeFloorName(floorName);
    const candidates = new Set<string>([
      floorName,
      floorName.replace(/\s+/g, '_'),
      floorName.replace(/\s+/g, '-'),
      normalized,
      normalized.replace(/\s+/g, '_'),
      normalized.replace(/\s+/g, '-'),
    ]);
    if (isGroundFloor(floorName)) {
      candidates.add('Ground_Level');
      candidates.add('Ground_Floor');
      candidates.add('Ground');
    }
    if (normalized.includes('underground') || normalized.includes('basement')) {
      candidates.add('Underground_Level');
      candidates.add('Basement');
      candidates.add('Floor-U');
      candidates.add('Floor-b');
    }
    if (normalized.includes('tunnel')) {
      candidates.add('Tunnels');
      candidates.add('Tunnel');
      candidates.add('Basement');
      candidates.add('Floor-b');
      candidates.add('Floor-U');
      candidates.add('Underground_Level');
    }
    if (normalized.includes('bunker')) {
      candidates.add('Bunkers');
      candidates.add('Bunker');
      candidates.add('Bunker_entr');
      candidates.add('Basement');
      candidates.add('Floor-b');
      candidates.add('Floor-U');
      candidates.add('Underground_Level');
    }
    if (normalized.includes('garage')) {
      candidates.add('Garage');
      candidates.add('Garages');
      candidates.add('Garages-2');
      candidates.add('Floor-U');
      candidates.add('Underground_Level');
    }
    const configuredOrdinal = parseConfiguredOrdinalFloor(floorName);
    if (configuredOrdinal !== null) {
      const ordinalWordMap: Record<number, string> = {
        1: 'First',
        2: 'Second',
        3: 'Third',
        4: 'Fourth',
        5: 'Fifth',
        6: 'Sixth',
        7: 'Seventh',
        8: 'Eighth',
      };
      const ordinalWord = ordinalWordMap[configuredOrdinal];
      if (ordinalWord) {
        candidates.add(`${ordinalWord}_Floor`);
      }
      candidates.add(`Floor-${configuredOrdinal}`);
      const shiftedOrdinal = configuredOrdinal - 1;
      const shiftedOrdinalWord = ordinalWordMap[shiftedOrdinal];
      if (shiftedOrdinalWord) {
        candidates.add(`${shiftedOrdinalWord}_Floor`);
      }
      if (shiftedOrdinal > 0) {
        candidates.add(`Floor-${shiftedOrdinal}`);
      }
    }
    return Array.from(candidates);
  }
  function resolveConfiguredFloorToSvgId(
    floorOrder: string[],
    availableIds: Set<string>
  ): Map<string, string> {
    const floorToId = new Map<string, string>();
    const canonicalIdLookup = new Map<string, string>();
    for (const id of availableIds) {
      canonicalIdLookup.set(normalizeFloorIdToken(id), id);
    }
    const ordinalEntries = floorOrder
      .map((floorName) => ({ floorName, ordinal: parseConfiguredOrdinalFloor(floorName) }))
      .filter((entry): entry is { floorName: string; ordinal: number } => entry.ordinal !== null);
    const ordinalSvgIdsByNumber = new Map<number, string>();
    for (const id of availableIds) {
      const ordinal = parseSvgOrdinalFloor(id);
      if (ordinal === null) continue;
      const existing = ordinalSvgIdsByNumber.get(ordinal);
      const isPreferred = /_floor$/i.test(id);
      const existingIsPreferred = existing ? /_floor$/i.test(existing) : false;
      if (!existing || (isPreferred && !existingIsPreferred)) {
        ordinalSvgIdsByNumber.set(ordinal, id);
      }
    }
    if (ordinalEntries.length > 0 && ordinalSvgIdsByNumber.size > 0) {
      const maxConfiguredOrdinal = Math.max(...ordinalEntries.map((entry) => entry.ordinal));
      const maxSvgOrdinal = Math.max(...ordinalSvgIdsByNumber.keys());
      const inferredOffset = maxSvgOrdinal - maxConfiguredOrdinal;
      for (const entry of ordinalEntries) {
        const svgId = ordinalSvgIdsByNumber.get(entry.ordinal + inferredOffset);
        if (svgId) {
          floorToId.set(entry.floorName, svgId);
        }
      }
    }
    for (const floorName of floorOrder) {
      if (floorToId.has(floorName)) continue;
      const candidates = getFloorIdCandidates(floorName);
      const resolvedId = candidates
        .map((candidate) => canonicalIdLookup.get(normalizeFloorIdToken(candidate)))
        .find((candidate): candidate is string => Boolean(candidate));
      if (resolvedId) {
        floorToId.set(floorName, resolvedId);
      }
    }
    return floorToId;
  }
  const FLOOR_GROUP_ID_PATTERN = /(ground|underground|basement|bunker|tunnel|garage|floor|level)/i;
  function getTopLevelFloorGroups(svgElement: SVGElement): SVGGElement[] {
    return Array.from(svgElement.children).filter(
      (child): child is SVGGElement =>
        child instanceof SVGGElement && !!child.id && FLOOR_GROUP_ID_PATTERN.test(child.id)
    );
  }
  function isBottomOverlayFloor(floorName: string): boolean {
    const lowerName = normalizeFloorName(floorName);
    return (
      lowerName.includes('underground') ||
      lowerName.includes('basement') ||
      lowerName.includes('bunker') ||
      lowerName.includes('tunnel') ||
      lowerName.includes('garage')
    );
  }
  function isGroundFloor(floorName: string): boolean {
    return /\bground\b/.test(normalizeFloorName(floorName));
  }
  function findGroundOverlayIndex(floorNames: string[], selectedFloorName: string): number {
    const selectedIndex = floorNames.indexOf(selectedFloorName);
    if (selectedIndex === -1) return -1;
    let nearestGroundIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < floorNames.length; index++) {
      const floor = floorNames[index];
      if (!floor || !isGroundFloor(floor)) continue;
      const distance = Math.abs(index - selectedIndex);
      if (distance < nearestDistance) {
        nearestGroundIndex = index;
        nearestDistance = distance;
      }
    }
    if (nearestGroundIndex !== -1) return nearestGroundIndex;
    const floorAbove = selectedIndex + 1;
    if (floorAbove < floorNames.length) return floorAbove;
    const floorBelow = selectedIndex - 1;
    if (floorBelow >= 0) return floorBelow;
    return -1;
  }
  function updateFloorVisibility(svgElement: SVGElement): void {
    const floorOrder = rawFloors.value.length > 0 ? rawFloors.value : floors.value;
    const selectedIndex = floorOrder.indexOf(selectedFloor.value);
    if (selectedIndex === -1) return;
    const topLevelFloorGroups = getTopLevelFloorGroups(svgElement);
    if (topLevelFloorGroups.length === 0) return;
    const availableFloorIds = new Set<string>(topLevelFloorGroups.map((group) => group.id));
    const floorToSvgId = resolveConfiguredFloorToSvgId(floorOrder, availableFloorIds);
    const selectedFloorSvgId = floorToSvgId.get(selectedFloor.value);
    if (!selectedFloorSvgId) return;
    const selectedFloorSvgIdToken = normalizeFloorIdToken(selectedFloorSvgId);
    const svgConfig = map.value?.svg;
    const stackFloors =
      isValidMapSvgConfig(svgConfig) && svgConfig.stackFloors === false ? false : true;
    const inactiveFloorOpacity = 0.7;
    const undergroundOverlayOpacity = 0.3;
    const isUnderground = isBottomOverlayFloor(selectedFloor.value);
    const groundFloorIndex = isUnderground
      ? findGroundOverlayIndex(floorOrder, selectedFloor.value)
      : -1;
    const groundOverlayFloor = groundFloorIndex >= 0 ? floorOrder[groundFloorIndex] : undefined;
    const groundOverlaySvgId = groundOverlayFloor
      ? floorToSvgId.get(groundOverlayFloor)
      : undefined;
    const mappedFloorIndexBySvgId = new Map<string, number>();
    for (let index = 0; index < floorOrder.length; index++) {
      const floor = floorOrder[index];
      const mappedId = floor ? floorToSvgId.get(floor) : undefined;
      if (!mappedId) continue;
      const existing = mappedFloorIndexBySvgId.get(mappedId);
      if (existing === undefined || index < existing) {
        mappedFloorIndexBySvgId.set(mappedId, index);
      }
    }
    let selectedFloorGroup: SVGElement | null = null;
    for (const floorGroup of topLevelFloorGroups) {
      const keepWith = floorGroup.getAttribute('data-keep-with-group');
      const mappedFloorIndex = mappedFloorIndexBySvgId.get(floorGroup.id);
      const isSelected = floorGroup.id === selectedFloorSvgId;
      const isKeptWithSelected = normalizeFloorIdToken(keepWith ?? '') === selectedFloorSvgIdToken;
      const isGroundOverlay = isUnderground && floorGroup.id === groundOverlaySvgId;
      const shouldShow =
        isSelected ||
        isKeptWithSelected ||
        isGroundOverlay ||
        (!isUnderground &&
          stackFloors &&
          mappedFloorIndex !== undefined &&
          mappedFloorIndex <= selectedIndex);
      floorGroup.style.display = shouldShow ? 'block' : 'none';
      if (!shouldShow) {
        floorGroup.style.opacity = '0';
        floorGroup.style.pointerEvents = 'none';
        continue;
      }
      let opacity = inactiveFloorOpacity;
      if (isSelected) opacity = 1;
      else if (isGroundOverlay) opacity = undergroundOverlayOpacity;
      floorGroup.style.opacity = String(opacity);
      floorGroup.style.pointerEvents = 'auto';
      if (isSelected) {
        selectedFloorGroup = floorGroup;
      }
    }
    if (selectedFloorGroup?.parentNode) {
      selectedFloorGroup.parentNode.appendChild(selectedFloorGroup);
    }
  }
  function setFloor(floor: string): void {
    if (!floors.value.includes(floor)) return;
    selectedFloor.value = floor;
    // Use standard floor visibility for all maps
    if (svgLayer.value) {
      const svgElement = svgLayer.value.getElement();
      if (svgElement) {
        updateFloorVisibility(svgElement);
      }
    }
    resetIdleTimer();
  }
  async function initializeMap(): Promise<void> {
    // Skip initialization for unavailable maps or missing container
    if (!containerRef.value || isMapUnavailable()) return;
    const initToken = ++initializeToken;
    let loadToken: MapLayerLoadToken | undefined;
    isLoading.value = true;
    try {
      // Dynamic import Leaflet
      const L = await import('leaflet');
      if (!isInitializeTokenActive(initToken) || !containerRef.value || isMapUnavailable()) {
        return;
      }
      leaflet.value = L.default || L;
      const svgConfig = getSvgConfig();
      const tileConfig = getTileConfig();
      const renderConfig = svgConfig ?? tileConfig;
      crsKey.value = getCrsKey(renderConfig);
      // Create map instance with custom CRS
      const mapOptions = getLeafletMapOptions(leaflet.value, renderConfig);
      mapInstance.value = leaflet.value.map(containerRef.value, mapOptions);
      const ZoomWithReset = leaflet.value.Control.Zoom.extend({
        onAdd(this: L.Control.Zoom, map: L.Map) {
          const container = leaflet.value!.Control.Zoom.prototype.onAdd!.call(this, map);
          const resetBtn = leaflet.value!.DomUtil.create(
            'a',
            'leaflet-control-zoom-reset',
            container
          );
          resetBtn.textContent = '\u27F2';
          resetBtn.href = '#';
          resetBtn.title = 'Reset view';
          resetBtn.setAttribute('role', 'button');
          resetBtn.setAttribute('aria-label', 'Reset view');
          leaflet.value!.DomEvent.disableClickPropagation(resetBtn);
          leaflet.value!.DomEvent.on(resetBtn, 'click', (e: Event) => {
            leaflet.value!.DomEvent.preventDefault(e);
            refreshView();
          });
          return container;
        },
      });
      new ZoomWithReset({ position: 'bottomright' }).addTo(mapInstance.value);
      // Create a custom pane for the map background to ensure it stays behind markers
      const backgroundPane = mapInstance.value.createPane('mapBackground');
      backgroundPane.style.zIndex = '200'; // Below overlayPane (400) and markerPane (600)
      // Set initial view using map bounds
      const bounds = getLeafletBounds(renderConfig);
      mapInstance.value.fitBounds(bounds);
      // Set initial floor
      if (svgConfig) {
        selectedFloor.value =
          initialFloor ||
          svgConfig.defaultFloor ||
          svgConfig.floors[svgConfig.floors.length - 1] ||
          '';
      } else if (tileConfig) {
        selectedFloor.value =
          initialFloor ||
          tileConfig.defaultFloor ||
          tileConfig.floors?.[tileConfig.floors.length - 1] ||
          '';
      } else {
        selectedFloor.value = '';
      }
      renderKey.value = getRenderKey() ?? '';
      loadToken = createMapLayerLoadToken();
      await loadMapLayer(initToken, loadToken);
      if (
        !isLayerLoadOperationActive(initToken, loadToken) ||
        !leaflet.value ||
        !mapInstance.value
      ) {
        return;
      }
      // Create layer groups for markers
      objectiveLayer.value = leaflet.value.layerGroup().addTo(mapInstance.value);
      extractLayer.value = leaflet.value.layerGroup().addTo(mapInstance.value);
      spawnLayer.value = leaflet.value.layerGroup().addTo(mapInstance.value);
      // Setup idle detection
      if (enableIdleDetection && mapInstance.value) {
        mapInstance.value.on('movestart', resetIdleTimer);
        mapInstance.value.on('zoomstart', resetIdleTimer);
        mapInstance.value.on('click', resetIdleTimer);
        resetIdleTimer();
      }
      // Attach custom wheel handler
      if (containerRef.value) {
        containerRef.value.addEventListener('wheel', onWheel, { passive: false });
      }
    } catch (error) {
      logger.error('Failed to initialize Leaflet map:', error);
    } finally {
      if (isInitializeTokenActive(initToken) && isMapLayerLoadActive(loadToken)) {
        isLoading.value = false;
      }
    }
    if (!isInitializeTokenActive(initToken)) return;
    // Setup resize observer
    if (containerRef.value) {
      const handleResize = useDebounceFn(() => {
        if (mapInstance.value) {
          mapInstance.value.invalidateSize({ animate: false });
          // Optional: re-fit bounds if needed, or just invalidate size
          // refreshView(); // calling refreshView would re-fit bounds
        }
      }, 100);
      try {
        resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(containerRef.value);
      } catch (error) {
        logger.error('Failed to initialize ResizeObserver:', error);
      }
    }
  }
  async function loadMapLayer(initToken?: number, loadToken?: MapLayerLoadToken): Promise<void> {
    if (!isLayerLoadOperationActive(initToken, loadToken)) return;
    if (!leaflet.value || !mapInstance.value) return;
    const tileConfig = getTileConfig();
    if (tileConfig) {
      await loadTileMap(leaflet.value, tileConfig, initToken, loadToken);
      return;
    }
    const svgConfig = getSvgConfig();
    if (svgConfig) {
      await loadStandardMapSvg(leaflet.value, initToken, loadToken);
    }
  }
  function refreshView(): void {
    if (mapInstance.value) {
      mapInstance.value.invalidateSize();
      const renderConfig = getRenderConfig();
      const bounds = getLeafletBounds(renderConfig);
      mapInstance.value.fitBounds(bounds);
    }
    resetIdleTimer();
  }
  function clearMarkers(): void {
    if (objectiveLayer.value) {
      objectiveLayer.value.clearLayers();
    }
    if (extractLayer.value) {
      extractLayer.value.clearLayers();
    }
    if (spawnLayer.value) {
      spawnLayer.value.clearLayers();
    }
  }
  function destroy(): void {
    initializeToken += 1;
    cancelMapLayerLoad();
    isLoading.value = false;
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (mapInstance.value) {
      mapInstance.value.remove();
      mapInstance.value = null;
    }
    // Remove custom wheel handler
    if (containerRef.value) {
      containerRef.value.removeEventListener('wheel', onWheel);
    }
    svgLayer.value = null;
    tileLayer.value = null;
    objectiveLayer.value = null;
    extractLayer.value = null;
    spawnLayer.value = null;
    leaflet.value = null;
  }
  // Watch for map changes
  watch(
    () => map.value,
    async (newMap) => {
      // Handle unavailable maps - destroy instance and skip initialization
      if (!newMap || newMap.unavailable === true) {
        destroy();
        return;
      }
      // If no existing map instance, try to initialize (handles switching from unavailable to available)
      if (!mapInstance.value || !leaflet.value) {
        // Wait for DOM to update (container may be inside v-else that just became visible)
        await nextTick();
        await initializeMap();
        return;
      }
      const newSvgConfig = isValidMapSvgConfig(newMap.svg) ? newMap.svg : undefined;
      const newTileConfig = isValidMapTileConfig(newMap.tile)
        ? normalizeTileConfig(newMap.tile)
        : undefined;
      const nextCrsKey = getCrsKey(newSvgConfig ?? newTileConfig);
      if (nextCrsKey !== crsKey.value) {
        destroy();
        await nextTick();
        await initializeMap();
        return;
      }
      // Update floor selection
      const svgConfig = newMap.svg;
      if (isValidMapSvgConfig(svgConfig)) {
        selectedFloor.value =
          svgConfig.defaultFloor || svgConfig.floors[svgConfig.floors.length - 1] || '';
      } else {
        selectedFloor.value = '';
      }
      const nextRenderKey = getRenderKey() ?? '';
      if (nextRenderKey !== renderKey.value) {
        const loadToken = createMapLayerLoadToken();
        isLoading.value = true;
        try {
          renderKey.value = nextRenderKey;
          await loadMapLayer(undefined, loadToken);
          if (!isMapLayerLoadActive(loadToken)) return;
          refreshView();
        } finally {
          if (isMapLayerLoadActive(loadToken)) {
            isLoading.value = false;
          }
        }
      }
    }
  );
  // Rebuild the tile layer on a user-initiated floor change so the tile-error fallback chain
  // is recreated for the new floor instead of reusing stale fallback state from the initial
  // floor. Skip while a load is already in flight (initial load already builds the right floor).
  watch(selectedFloor, () => {
    if (isLoading.value) return;
    const tileConfig = getTileConfig();
    if (!tileConfig || !tileLayer.value || !leaflet.value || !mapInstance.value) return;
    void loadTileMap(leaflet.value, tileConfig, undefined, createMapLayerLoadToken());
  });
  // Lifecycle
  onMounted(() => {
    initializeMap();
  });
  onUnmounted(() => {
    destroy();
  });
  return {
    mapInstance,
    leaflet,
    selectedFloor,
    floors,
    hasMultipleFloors,
    isLoading,
    isIdle,
    svgLayer,
    objectiveLayer,
    extractLayer,
    spawnLayer,
    setFloor,
    refreshView,
    clearMarkers,
    destroy,
  };
}
