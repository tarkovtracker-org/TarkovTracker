<template>
  <div
    ref="mapSurfaceRef"
    tabindex="0"
    class="relative isolate w-full focus-visible:outline-none"
    @pointerdown.capture="focusMapSurface"
  >
    <div
      v-if="isMapUnavailable"
      class="bg-surface-900 flex h-100 w-full flex-col items-center justify-center rounded sm:h-125 lg:h-150"
      :style="mapHeightStyle"
    >
      <UIcon name="i-mdi-map-marker-off" class="text-surface-500 mb-4 h-16 w-16" />
      <h3 class="text-surface-300 mb-2 text-lg font-semibold">
        {{ t('maps.not_available_title') }}
      </h3>
      <p class="text-surface-500 max-w-md text-center text-sm">
        {{
          t('maps.not_available_description', {
            mapName: props.map?.name || t('maps.placeholder'),
          })
        }}
      </p>
    </div>
    <template v-else>
      <div
        v-if="hasMultipleFloors"
        class="bg-surface-800/90 absolute top-2 left-2 z-1000 flex flex-col gap-1 rounded p-1.5"
      >
        <span class="text-surface-400 px-1 text-[10px] font-medium tracking-wide uppercase">
          {{ t('maps.floors') }}
        </span>
        <div class="flex flex-col-reverse gap-1">
          <UButton
            v-for="floor in floors"
            :key="floor"
            color="neutral"
            :variant="floor === selectedFloor ? 'soft' : 'ghost'"
            size="sm"
            :class="[
              'justify-start',
              floor === selectedFloor ? MAP_BUTTON_ACTIVE_CLASS : MAP_BUTTON_INACTIVE_CLASS,
            ]"
            @click="setFloor(floor)"
          >
            {{ floor.replace(/_/g, ' ') }}
          </UButton>
        </div>
      </div>
      <div
        v-if="isLoading"
        class="bg-surface-900/50 absolute inset-0 z-1001 flex items-center justify-center"
      >
        <UIcon name="i-mdi-loading" class="text-surface-200 h-8 w-8 animate-spin" />
      </div>
      <div
        class="bg-surface-800/90 absolute top-2 right-2 z-1000 flex flex-wrap items-center gap-2 rounded p-1.5"
      >
        <UButton
          v-if="props.showExtractToggle"
          color="neutral"
          :variant="showPmcExtracts ? 'soft' : 'ghost'"
          size="sm"
          icon="i-mdi-exit-run"
          :class="showPmcExtracts ? MAP_BUTTON_ACTIVE_CLASS : MAP_BUTTON_INACTIVE_CLASS"
          @click="showPmcExtracts = !showPmcExtracts"
        >
          {{ t('maps.factions.pmc') }}
        </UButton>
        <UButton
          v-if="props.showExtractToggle"
          color="neutral"
          :variant="showScavExtracts ? 'soft' : 'ghost'"
          size="sm"
          icon="i-mdi-exit-run"
          :class="showScavExtracts ? MAP_BUTTON_ACTIVE_CLASS : MAP_BUTTON_INACTIVE_CLASS"
          @click="showScavExtracts = !showScavExtracts"
        >
          {{ t('maps.factions.scav') }}
        </UButton>
        <UButton
          v-if="props.showSpawnToggle && hasPmcSpawns"
          color="neutral"
          :variant="showPmcSpawns ? 'soft' : 'ghost'"
          size="sm"
          icon="i-mdi-crosshairs-gps"
          :class="showPmcSpawns ? MAP_BUTTON_ACTIVE_CLASS : MAP_BUTTON_INACTIVE_CLASS"
          @click="showPmcSpawns = !showPmcSpawns"
        >
          {{ t('maps.layers.pmc_spawns') }}
        </UButton>
        <UPopover>
          <UButton
            color="neutral"
            variant="soft"
            size="sm"
            icon="i-mdi-palette"
            :class="MAP_BUTTON_ACTIVE_CLASS"
            :title="t('settings.interface.maps.colors.title')"
            :aria-label="t('settings.interface.maps.colors.title')"
          >
            <span class="hidden md:inline">{{ t('settings.interface.maps.colors.title') }}</span>
          </UButton>
          <template #content>
            <div
              class="bg-surface-900 border-surface-700 w-72 space-y-3 rounded-md border p-3 md:w-80"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="space-y-0.5">
                  <p class="text-surface-200 text-xs font-semibold tracking-wide uppercase">
                    {{ t('settings.interface.maps.colors.title') }}
                  </p>
                  <p class="text-surface-400 text-xs">
                    {{ t('settings.interface.maps.colors.description') }}
                  </p>
                </div>
                <UButton
                  color="neutral"
                  size="xs"
                  variant="ghost"
                  @click="preferencesStore.resetMapMarkerColors()"
                >
                  {{ t('settings.interface.maps.colors.reset') }}
                </UButton>
              </div>
              <div class="grid gap-2 sm:grid-cols-2">
                <label
                  v-for="option in mapColorOptions"
                  :key="option.key"
                  class="bg-surface-800/70 border-surface-700 flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                >
                  <span class="flex min-w-0 items-center gap-2">
                    <span
                      class="h-3.5 w-3.5 shrink-0 rounded-full border border-white/30"
                      :style="{ backgroundColor: mapColors[option.key] }"
                    />
                    <span class="text-surface-200 truncate text-[11px] font-medium">
                      {{ option.label }}
                    </span>
                  </span>
                  <input
                    :aria-label="option.label"
                    :value="mapColors[option.key]"
                    type="color"
                    class="bg-surface-900 border-surface-700 h-7 w-10 shrink-0 cursor-pointer rounded border p-1"
                    @input="onMapColorInput(option.key, $event)"
                  />
                </label>
              </div>
            </div>
          </template>
        </UPopover>
        <UPopover>
          <UButton
            color="neutral"
            variant="soft"
            size="sm"
            icon="i-mdi-cog"
            :class="MAP_BUTTON_ACTIVE_CLASS"
            :title="t('maps.map_settings')"
            :aria-label="t('maps.map_settings')"
          />
          <template #content>
            <div class="bg-surface-900 border-surface-700 w-56 space-y-2 rounded-md border p-3">
              <p class="text-surface-200 text-xs font-semibold tracking-wide uppercase">
                {{ t('maps.map_settings') }}
              </p>
              <div class="space-y-2">
                <div class="space-y-1">
                  <div
                    class="text-surface-400 flex items-center justify-between text-[10px] font-semibold uppercase"
                  >
                    <span>{{ t('maps.zoom_speed') }}</span>
                    <span class="text-surface-200 tabular-nums">{{ zoomSpeedLabel }}</span>
                  </div>
                  <input
                    v-model.number="mapZoomSpeed"
                    type="range"
                    :min="ZOOM_SPEED_MIN"
                    :max="ZOOM_SPEED_MAX"
                    step="0.1"
                    class="accent-surface-200 h-1.5 w-full cursor-pointer"
                    :aria-label="t('maps.aria.zoom_speed')"
                  />
                </div>
                <div class="space-y-1">
                  <div
                    class="text-surface-400 flex items-center justify-between text-[10px] font-semibold uppercase"
                  >
                    <span>{{ t('maps.pan_speed') }}</span>
                    <span class="text-surface-200 tabular-nums">{{ panSpeedLabel }}</span>
                  </div>
                  <input
                    v-model.number="mapPanSpeed"
                    type="range"
                    :min="PAN_SPEED_MIN"
                    :max="PAN_SPEED_MAX"
                    step="0.1"
                    class="accent-surface-200 h-1.5 w-full cursor-pointer"
                    :aria-label="t('maps.aria.pan_speed')"
                  />
                </div>
              </div>
            </div>
          </template>
        </UPopover>
      </div>
      <div class="relative">
        <div
          ref="mapContainer"
          class="bg-surface-900 h-100 w-full rounded sm:h-125 lg:h-150"
          :style="mapHeightStyle"
        />
        <div
          v-if="showKeyboardCursor"
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 z-1000"
        >
          <div
            class="border-surface-50/80 bg-surface-950/40 ring-surface-950/80 absolute top-1/2 left-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border ring-1"
          >
            <div
              class="bg-surface-50 absolute top-1/2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            />
          </div>
        </div>
      </div>
      <div class="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-4">
        <div
          v-if="props.showLegend"
          class="text-surface-300 flex flex-wrap items-center gap-4 text-xs"
        >
          <div class="flex items-center gap-1">
            <div
              class="h-3 w-3 rounded-full border border-white/30"
              :style="{ backgroundColor: mapColors.SELF_OBJECTIVE }"
            />
            <span>{{ t('maps.legend.your_objectives') }}</span>
          </div>
          <div class="flex items-center gap-1">
            <div
              class="h-3 w-3 rounded-full border border-white/30"
              :style="{ backgroundColor: mapColors.TEAM_OBJECTIVE }"
            />
            <span>{{ t('maps.legend.team_objectives') }}</span>
          </div>
          <div v-if="showPmcSpawns && hasPmcSpawns" class="flex items-center gap-1">
            <div class="h-3 w-3 rounded-full" :style="{ backgroundColor: mapColors.PMC_SPAWN }" />
            <span>{{ t('maps.legend.pmc_spawn') }}</span>
          </div>
          <div v-if="showPmcExtracts" class="flex items-center gap-1">
            <UIcon
              name="i-mdi-exit-run"
              class="h-3 w-3"
              :style="{ color: mapColors.PMC_EXTRACT }"
            />
            <span>{{ t('maps.legend.pmc_extract') }}</span>
          </div>
          <div v-if="showScavExtracts" class="flex items-center gap-1">
            <UIcon
              name="i-mdi-exit-run"
              class="h-3 w-3"
              :style="{ color: mapColors.SCAV_EXTRACT }"
            />
            <span>{{ t('maps.legend.scav_extract') }}</span>
          </div>
          <div
            v-if="(showPmcExtracts || showScavExtracts) && hasSharedExtracts"
            class="flex items-center gap-1"
          >
            <UIcon
              name="i-mdi-exit-run"
              class="h-3 w-3"
              :style="{ color: mapColors.SHARED_EXTRACT }"
            />
            <span>{{ t('maps.legend.shared_extract') }}</span>
          </div>
          <div
            v-if="(showPmcExtracts || showScavExtracts) && hasCoopExtracts"
            class="flex items-center gap-1"
          >
            <UIcon
              name="i-mdi-exit-run"
              class="h-3 w-3"
              :style="{ color: mapColors.COOP_EXTRACT }"
            />
            <span>{{ t('maps.legend.coop_extract') }}</span>
          </div>
        </div>
        <div
          class="text-surface-400 ml-auto flex flex-wrap-reverse items-center justify-end gap-x-4 gap-y-1 text-[10px] font-medium"
        >
          <div class="flex items-center gap-1">
            <kbd class="bg-surface-700 text-surface-300 rounded px-1 py-0.5 font-mono">WASD</kbd>
            <span>/</span>
            <kbd class="bg-surface-700 text-surface-300 rounded px-1 py-0.5 font-mono">←↑↓→</kbd>
            <span>{{ t('maps.controls.keyboard.pan') }}</span>
          </div>
          <div class="flex items-center gap-1">
            <kbd class="bg-surface-700 text-surface-300 rounded px-1 py-0.5 font-mono">Q/E</kbd>
            <span>{{ t('maps.controls.keyboard.zoom_keys') }}</span>
          </div>
          <div class="flex items-center gap-1">
            <kbd class="bg-surface-700 text-surface-300 rounded px-1 py-0.5 font-mono">F</kbd>
            <span>{{ t('maps.controls.keyboard.click') }}</span>
          </div>
          <div class="flex items-center gap-1">
            <kbd class="bg-surface-700 text-surface-300 rounded px-1 py-0.5 font-mono">R</kbd>
            <span>{{ t('maps.controls.keyboard.reset') }}</span>
          </div>
          <div v-if="hasMultipleFloors" class="flex items-center gap-1">
            <kbd class="bg-surface-700 text-surface-300 rounded px-1 py-0.5 font-mono">Ctrl</kbd>
            <span>{{ t('maps.controls.keyboard.cycle_floors') }}</span>
          </div>
          <div class="flex items-center gap-1">
            <kbd class="bg-surface-700 text-surface-300 rounded px-1 py-0.5 font-mono">Shift</kbd>
            <span>{{ t('maps.controls.keyboard.zoom') }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
<script setup lang="ts">
  import 'leaflet/dist/leaflet.css';
  import { createApp } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { useLeafletMap } from '@/composables/useLeafletMap';
  import LeafletObjectiveTooltip from '@/features/maps/LeafletObjectiveTooltip.vue';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { logger } from '@/utils/logger';
  import { clusterSpawns } from '@/utils/mapClustering';
  import {
    gameToLatLng,
    outlineToLatLngArray,
    isValidMapSvgConfig,
    isValidMapTileConfig,
  } from '@/utils/mapCoordinates';
  import { getMapColorOptions, type MapMarkerColorKey } from '@/utils/theme-colors';
  import type { MapExtract, MapSpawn, TarkovMap } from '@/types/tarkov';
  import type L from 'leaflet';
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
    showPmcSpawns?: boolean;
    showSpawnToggle?: boolean;
    showLegend?: boolean;
    height?: number;
  }
  const props = withDefaults(defineProps<Props>(), {
    marks: () => [],
    showExtracts: true,
    showExtractToggle: true,
    showSpawnToggle: true,
    showLegend: true,
    height: undefined,
  });
  const { t } = useI18n({ useScope: 'global' });
  const router = useRouter();
  const preferencesStore = usePreferencesStore();
  const mapSurfaceRef = ref<HTMLElement | null>(null);
  const showKeyboardCursor = ref(false);
  const mapColors = computed(() => preferencesStore.getMapMarkerColors);
  const clearPinnedTask = inject<(() => void) | null>('clearPinnedTask', null);
  const mapHeightStyle = computed(() => {
    if (typeof props.height !== 'number' || Number.isNaN(props.height)) return undefined;
    return { height: `${props.height}px` };
  });
  const isMapUnavailable = computed(() => {
    return props.map?.unavailable === true;
  });
  const mapContainer = ref<HTMLElement | null>(null);
  const showPmcExtracts = ref(props.showPmcExtracts ?? props.showExtracts);
  const showScavExtracts = ref(props.showScavExtracts ?? props.showExtracts);
  const showPmcSpawns = ref(props.showPmcSpawns ?? false);
  const {
    mapInstance,
    leaflet,
    selectedFloor,
    floors,
    hasMultipleFloors,
    isLoading,
    objectiveLayer,
    extractLayer,
    spawnLayer,
    setFloor,
    refreshView,
    clearMarkers,
  } = useLeafletMap({
    containerRef: mapContainer,
    map: toRef(props, 'map'),
  });
  const mapExtracts = computed<MapExtract[]>(() => {
    if (!props.map?.extracts) return [];
    return props.map.extracts;
  });
  const mapPmcSpawns = computed<MapSpawn[]>(() => {
    if (!props.map?.spawns) return [];
    return props.map.spawns.filter((spawn) => {
      const hasPmcAccess = spawn.sides?.includes('pmc') || spawn.sides?.includes('all');
      const isPlayerSpawn =
        spawn.categories?.includes('player') || spawn.categories?.includes('all');
      return Boolean(spawn.position) && Boolean(hasPmcAccess) && Boolean(isPlayerSpawn);
    });
  });
  const hasPmcSpawns = computed(() => mapPmcSpawns.value.length > 0);
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
  const PAN_SPEED_MIN = 0.5;
  const PAN_SPEED_MAX = 3;
  const MAP_BUTTON_ACTIVE_CLASS = '!bg-surface-700/80 !text-surface-50 !ring-1 !ring-white/30';
  const MAP_BUTTON_INACTIVE_CLASS = 'text-surface-300 hover:text-surface-100';
  const SPAWN_CLUSTER_ZOOM_THRESHOLD = 3.5;
  const SPAWN_CLUSTER_GRID_SIZE = 50;
  const SPAWN_CLUSTER_MIN_RADIUS = 6;
  const SPAWN_CLUSTER_MAX_RADIUS = 14;
  const FNV1A_OFFSET_BASIS = 0x811c9dc5;
  const FNV1A_PRIME = 0x01000193;
  const MARKER_SVG_LOAD_DELAY_MS = 500;
  const updateFnv1a = (hash: number, value: string | number): number => {
    const token = typeof value === 'number' ? String(value) : value;
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, FNV1A_PRIME);
    }
    hash ^= 124;
    return Math.imul(hash, FNV1A_PRIME) >>> 0;
  };
  const hashZoneOutline = (outline: Array<{ x: number; z: number }>): number => {
    let zoneHash = updateFnv1a(FNV1A_OFFSET_BASIS, outline.length);
    for (const point of outline) {
      zoneHash = updateFnv1a(zoneHash, point.x);
      zoneHash = updateFnv1a(zoneHash, point.z);
    }
    return zoneHash;
  };
  const hashLocationPositions = (
    positions?: Array<{ x: number; y?: number; z: number }>
  ): number => {
    let locationHash = updateFnv1a(FNV1A_OFFSET_BASIS, positions?.length ?? 0);
    for (const point of positions ?? []) {
      locationHash = updateFnv1a(locationHash, point.x);
      locationHash = updateFnv1a(locationHash, point.z);
    }
    return locationHash;
  };
  const mapZoomSpeed = computed({
    get: () => preferencesStore.getMapZoomSpeed,
    set: (value) => {
      const parsed = Number(value);
      const clamped = Math.min(ZOOM_SPEED_MAX, Math.max(ZOOM_SPEED_MIN, parsed));
      preferencesStore.setMapZoomSpeed(clamped);
    },
  });
  const mapPanSpeed = computed({
    get: () => preferencesStore.mapPanSpeed ?? 1,
    set: (value) => {
      const parsed = Number(value);
      const clamped = Math.min(PAN_SPEED_MAX, Math.max(PAN_SPEED_MIN, parsed));
      preferencesStore.setMapPanSpeed(clamped);
    },
  });
  const mapColorOptions = computed(() => getMapColorOptions(t));
  const onMapColorInput = (key: MapMarkerColorKey, event: Event) => {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;
    preferencesStore.setMapMarkerColor(key, input.value);
  };
  const zoomSpeedLabel = computed(() => `${mapZoomSpeed.value.toFixed(1)}x`);
  const panSpeedLabel = computed(() => `${mapPanSpeed.value.toFixed(1)}x`);
  const pressedMapKeys = new Set<'up' | 'down' | 'left' | 'right' | 'zoom-in' | 'zoom-out'>();
  let mapKeyboardFrameId: number | null = null;
  let mapKeyboardLastTick = 0;
  let keyboardCursorHoverTarget: Element | null = null;
  const MAP_KEYBOARD_PAN_SPEED = 225;
  const MAP_KEYBOARD_ZOOM_SPEED = 1.7;
  const normalizeMapControlKey = (
    key: string,
    code?: string
  ): 'up' | 'down' | 'left' | 'right' | 'zoom-in' | 'zoom-out' | null => {
    const normalizedKey = key.toLowerCase();
    switch (normalizedKey) {
      case 'w':
      case 'arrowup':
        return 'up';
      case 's':
      case 'arrowdown':
        return 'down';
      case 'a':
      case 'arrowleft':
        return 'left';
      case 'd':
      case 'arrowright':
        return 'right';
      case 'e':
        return 'zoom-in';
      case 'q':
        return 'zoom-out';
      default:
        break;
    }
    switch (code) {
      case 'KeyW':
        return 'up';
      case 'KeyS':
        return 'down';
      case 'KeyA':
        return 'left';
      case 'KeyD':
        return 'right';
      case 'KeyE':
        return 'zoom-in';
      case 'KeyQ':
        return 'zoom-out';
      default:
        return null;
    }
  };
  const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    return Boolean(
      target.closest(
        'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]'
      )
    );
  };
  const isMapKeyboardActive = (): boolean => {
    if (!mapInstance.value) return false;
    const mapSurface = mapSurfaceRef.value;
    if (!mapSurface) return false;
    const activeElement = document.activeElement;
    return activeElement instanceof HTMLElement && mapSurface.contains(activeElement);
  };
  const stopMapKeyboardLoop = (clearKeys = false) => {
    if (mapKeyboardFrameId !== null) {
      window.cancelAnimationFrame(mapKeyboardFrameId);
      mapKeyboardFrameId = null;
    }
    mapKeyboardLastTick = 0;
    if (clearKeys) {
      pressedMapKeys.clear();
    }
  };
  const getMapCenterTarget = (): {
    clientX: number;
    clientY: number;
    target: Element;
  } | null => {
    const instance = mapInstance.value;
    if (!instance) return null;
    const container = instance.getContainer();
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const eventTarget = document.elementFromPoint(clientX, clientY);
    const target =
      eventTarget instanceof Element && container.contains(eventTarget) ? eventTarget : container;
    return { clientX, clientY, target };
  };
  const dispatchCenterMouseEvent = (
    type: string,
    target: Element,
    clientX: number,
    clientY: number,
    buttons = 0,
    detail = 0
  ) => {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons,
        clientX,
        clientY,
        detail,
        view: window,
      })
    );
  };
  const clearKeyboardCursorHover = () => {
    if (!keyboardCursorHoverTarget) return;
    const centerTarget = getMapCenterTarget();
    if (centerTarget) {
      dispatchCenterMouseEvent(
        'mouseout',
        keyboardCursorHoverTarget,
        centerTarget.clientX,
        centerTarget.clientY
      );
      dispatchCenterMouseEvent(
        'mouseleave',
        keyboardCursorHoverTarget,
        centerTarget.clientX,
        centerTarget.clientY
      );
    }
    keyboardCursorHoverTarget = null;
  };
  const syncKeyboardCursorHover = () => {
    if (!showKeyboardCursor.value) {
      clearKeyboardCursorHover();
      return;
    }
    const centerTarget = getMapCenterTarget();
    if (!centerTarget) return;
    const { clientX, clientY, target } = centerTarget;
    if (keyboardCursorHoverTarget !== target) {
      if (keyboardCursorHoverTarget) {
        dispatchCenterMouseEvent('mouseout', keyboardCursorHoverTarget, clientX, clientY);
        dispatchCenterMouseEvent('mouseleave', keyboardCursorHoverTarget, clientX, clientY);
      }
      dispatchCenterMouseEvent('mouseover', target, clientX, clientY);
      dispatchCenterMouseEvent('mouseenter', target, clientX, clientY);
      keyboardCursorHoverTarget = target;
    }
    dispatchCenterMouseEvent('mousemove', target, clientX, clientY);
  };
  const applyMapKeyboardStep = (elapsedMs: number) => {
    const instance = mapInstance.value;
    if (!instance || !pressedMapKeys.size) return;
    const panDelta = MAP_KEYBOARD_PAN_SPEED * mapPanSpeed.value * (elapsedMs / 1000);
    const zoomDelta = MAP_KEYBOARD_ZOOM_SPEED * mapZoomSpeed.value * (elapsedMs / 1000);
    let panX = 0;
    let panY = 0;
    const moveUp = pressedMapKeys.has('up');
    const moveDown = pressedMapKeys.has('down');
    const moveLeft = pressedMapKeys.has('left');
    const moveRight = pressedMapKeys.has('right');
    if (moveUp && !moveDown) panY -= panDelta;
    if (moveDown && !moveUp) panY += panDelta;
    if (moveLeft && !moveRight) panX -= panDelta;
    if (moveRight && !moveLeft) panX += panDelta;
    if (panX !== 0 || panY !== 0) {
      instance.panBy([panX, panY], {
        animate: false,
        noMoveStart: true,
      });
    }
    const zoomIn = pressedMapKeys.has('zoom-in');
    const zoomOut = pressedMapKeys.has('zoom-out');
    if ((zoomIn && zoomOut) || (!zoomIn && !zoomOut)) {
      syncKeyboardCursorHover();
      return;
    }
    const currentZoom = instance.getZoom();
    const minZoom = Number.isFinite(instance.getMinZoom()) ? instance.getMinZoom() : currentZoom;
    const maxZoom = Number.isFinite(instance.getMaxZoom()) ? instance.getMaxZoom() : currentZoom;
    let nextZoom = currentZoom;
    if (zoomIn) {
      nextZoom = Math.min(maxZoom, currentZoom * (1 + zoomDelta));
    } else {
      nextZoom = Math.max(minZoom, currentZoom / (1 + zoomDelta));
    }
    if (nextZoom === currentZoom) {
      syncKeyboardCursorHover();
      return;
    }
    const container = instance.getContainer();
    const center = instance.containerPointToLatLng([
      container.clientWidth / 2,
      container.clientHeight / 2,
    ]);
    const originalZoomSnap = instance.options.zoomSnap ?? 0;
    instance.options.zoomSnap = 0;
    try {
      instance.setZoomAround(center, nextZoom, { animate: false });
    } finally {
      instance.options.zoomSnap = originalZoomSnap;
    }
    syncKeyboardCursorHover();
  };
  const runMapKeyboardLoop = (timestamp: number) => {
    if (!isMapKeyboardActive() || !pressedMapKeys.size) {
      clearKeyboardCursorHover();
      showKeyboardCursor.value = false;
      stopMapKeyboardLoop(true);
      return;
    }
    const elapsedMs = mapKeyboardLastTick ? Math.min(48, timestamp - mapKeyboardLastTick) : 16;
    mapKeyboardLastTick = timestamp;
    applyMapKeyboardStep(elapsedMs);
    mapKeyboardFrameId = window.requestAnimationFrame(runMapKeyboardLoop);
  };
  const startMapKeyboardLoop = () => {
    if (mapKeyboardFrameId !== null) return;
    mapKeyboardLastTick = 0;
    mapKeyboardFrameId = window.requestAnimationFrame(runMapKeyboardLoop);
  };
  const focusMapSurface = () => {
    clearKeyboardCursorHover();
    showKeyboardCursor.value = false;
    mapSurfaceRef.value?.focus({ preventScroll: true });
  };
  const triggerCenterMapClick = () => {
    const centerTarget = getMapCenterTarget();
    if (!centerTarget) return;
    const { clientX, clientY, target } = centerTarget;
    dispatchCenterMouseEvent('mousedown', target, clientX, clientY, 1);
    dispatchCenterMouseEvent('mouseup', target, clientX, clientY);
    dispatchCenterMouseEvent('click', target, clientX, clientY, 0, 1);
  };
  const onGlobalMapKeydown = (event: KeyboardEvent) => {
    const normalizedKey = event.key.toLowerCase();
    const normalizedCode = event.code.toLowerCase();
    if (normalizedKey === 'f' || normalizedCode === 'keyf') {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (!isMapKeyboardActive()) return;
      event.preventDefault();
      showKeyboardCursor.value = true;
      syncKeyboardCursorHover();
      if (event.repeat) return;
      triggerCenterMapClick();
      return;
    }
    if (normalizedKey === 'r' || normalizedCode === 'keyr') {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (!isMapKeyboardActive()) return;
      event.preventDefault();
      showKeyboardCursor.value = true;
      if (event.repeat) return;
      refreshView();
      window.requestAnimationFrame(syncKeyboardCursorHover);
      return;
    }
    const controlKey = normalizeMapControlKey(event.key, event.code);
    if (!controlKey) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isEditableTarget(event.target)) return;
    if (!isMapKeyboardActive()) return;
    event.preventDefault();
    showKeyboardCursor.value = true;
    syncKeyboardCursorHover();
    pressedMapKeys.add(controlKey);
    startMapKeyboardLoop();
  };
  const onGlobalMapKeyup = (event: KeyboardEvent) => {
    const controlKey = normalizeMapControlKey(event.key, event.code);
    if (!controlKey) return;
    pressedMapKeys.delete(controlKey);
    if (!pressedMapKeys.size) {
      stopMapKeyboardLoop();
    }
  };
  const onMapWindowBlur = () => {
    clearKeyboardCursorHover();
    showKeyboardCursor.value = false;
    stopMapKeyboardLoop(true);
  };
  const baseZoomDelta = ref<number | null>(null);
  const baseZoomSnap = ref<number | null>(null);
  let svgReadyFallbackTimeout: ReturnType<typeof setTimeout> | null = null;
  let svgReadyListener: EventListener | null = null;
  let svgReadyElement: SVGElement | null = null;
  let svgReadyObserver: MutationObserver | null = null;
  const teardownSvgReadyWatcher = () => {
    if (svgReadyObserver) {
      svgReadyObserver.disconnect();
      svgReadyObserver = null;
    }
    if (svgReadyFallbackTimeout !== null) {
      clearTimeout(svgReadyFallbackTimeout);
      svgReadyFallbackTimeout = null;
    }
    if (svgReadyElement && svgReadyListener) {
      svgReadyElement.removeEventListener('load', svgReadyListener);
    }
    svgReadyElement = null;
    svgReadyListener = null;
  };
  const getMapSvgElement = (instance: L.Map): SVGElement | null => {
    const mapBackgroundSvg = instance.getPane('mapBackground')?.querySelector('svg');
    if (mapBackgroundSvg instanceof SVGElement) {
      return mapBackgroundSvg;
    }
    const markerLayerSvg = instance.getPane('overlayPane')?.querySelector('svg');
    if (markerLayerSvg instanceof SVGElement) {
      return markerLayerSvg;
    }
    const containerSvg = instance.getContainer().querySelector('svg');
    return containerSvg instanceof SVGElement ? containerSvg : null;
  };
  const isSvgReady = (svgElement: SVGElement | null): boolean => {
    if (!svgElement) return false;
    if (svgElement.childElementCount > 0) return true;
    return (
      !!svgElement.getAttribute('viewBox') ||
      (!!svgElement.getAttribute('width') && !!svgElement.getAttribute('height'))
    );
  };
  const waitForSvgAndUpdateMarkers = (instance: L.Map) => {
    teardownSvgReadyWatcher();
    if (!isValidMapSvgConfig(props.map.svg)) {
      updateMarkers();
      return;
    }
    const finalizeUpdate = () => {
      teardownSvgReadyWatcher();
      updateMarkers();
    };
    const ensureSvgLoadListener = (svgElement: SVGElement | null) => {
      if (!svgElement || svgReadyElement === svgElement) return;
      if (svgReadyElement && svgReadyListener) {
        svgReadyElement.removeEventListener('load', svgReadyListener);
      }
      svgReadyElement = svgElement;
      svgReadyListener = () => finalizeUpdate();
      svgReadyElement.addEventListener('load', svgReadyListener, { once: true });
    };
    const tryUpdateMarkers = () => {
      const svgElement = getMapSvgElement(instance);
      ensureSvgLoadListener(svgElement);
      if (isSvgReady(svgElement)) {
        finalizeUpdate();
      }
    };
    const observerTarget =
      instance.getPane('mapBackground') ??
      instance.getPane('overlayPane') ??
      instance.getContainer();
    svgReadyObserver = new MutationObserver(() => {
      tryUpdateMarkers();
    });
    svgReadyObserver.observe(observerTarget, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['viewBox', 'width', 'height'],
    });
    tryUpdateMarkers();
    if (svgReadyObserver || svgReadyElement) {
      svgReadyFallbackTimeout = setTimeout(() => {
        finalizeUpdate();
      }, MARKER_SVG_LOAD_DELAY_MS);
    }
  };
  const popupOptions = {
    autoClose: false,
    closeOnClick: false,
    closeButton: false,
  };
  let activePinnedPopupCleanup: (() => void) | null = null;
  const objectiveMarkers = new Map<
    string,
    { layer: L.Layer; getLatLng: () => L.LatLngExpression; showPopup: (pinned: boolean) => void }
  >();
  const lastMarksHash = ref('');
  const mountObjectiveTooltip = (
    objectiveId: string,
    onClose: () => void
  ): { element: HTMLElement; unmount: () => void } => {
    const container = document.createElement('div');
    const app = createApp(LeafletObjectiveTooltip, { objectiveId, onClose, t });
    app.provide('router', router);
    app.provide('clearPinnedTask', clearPinnedTask);
    app.mount(container);
    return { element: container, unmount: () => app.unmount() };
  };
  const POPUP_HIDE_DELAY = 100;
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
    let popupListenersAttached = false;
    const styledLayer = layer as L.CircleMarker | L.Polygon;
    const originalFillColor = styledLayer.options?.fillColor || mapColors.value.SELF_OBJECTIVE;
    const originalStrokeColor = styledLayer.options?.color || mapColors.value.SELF_OBJECTIVE;
    const isCircleMarker = 'getRadius' in styledLayer;
    const setLayerSelected = (selected: boolean) => {
      if (!('setStyle' in styledLayer)) return;
      if (selected) {
        if (isCircleMarker) {
          styledLayer.setStyle({ fillColor: mapColors.value.SELECTED });
        } else {
          styledLayer.setStyle({
            color: mapColors.value.SELECTED,
            fillColor: mapColors.value.SELECTED,
          });
        }
        return;
      }
      if (isCircleMarker) {
        styledLayer.setStyle({ fillColor: originalFillColor });
        return;
      }
      styledLayer.setStyle({ color: originalStrokeColor, fillColor: originalFillColor });
    };
    const cleanupMountedComponent = () => {
      if (currentMountedComponent) {
        currentMountedComponent.unmount();
        currentMountedComponent = null;
      }
    };
    const unpinAndHide = () => {
      isPinned = false;
      setLayerSelected(false);
      if (activePinnedPopupCleanup === unpinAndHide) {
        activePinnedPopupCleanup = null;
      }
      if (mapInstance.value) {
        popup.remove();
        cleanupMountedComponent();
      }
    };
    const showPopup = (pinned: boolean) => {
      if (!mapInstance.value) return;
      if (pinned && activePinnedPopupCleanup) {
        activePinnedPopupCleanup();
      }
      isPinned = pinned;
      if (pinned) {
        setLayerSelected(true);
      }
      cleanupMountedComponent();
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
    objectiveMarkers.set(objectiveId, { layer, getLatLng, showPopup });
    layer.on('mouseover', () => {
      isHovering = true;
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
    layer.on('click', (event) => {
      leaflet.value?.DomEvent.stop(event);
      if (isPinned) {
        unpinAndHide();
        return;
      }
      if (activePinnedPopupCleanup) {
        activePinnedPopupCleanup();
      }
      showPopup(true);
    });
    const handlePopupMouseEnter = () => {
      isHovering = true;
      if (popupHideTimer) {
        clearTimeout(popupHideTimer);
        popupHideTimer = null;
      }
    };
    const handlePopupMouseLeave = () => {
      isHovering = false;
      if (!isPinned) {
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
    popup.on('add', () => {
      if (popupListenersAttached) return;
      const popupElement = popup.getElement();
      if (popupElement) {
        popupElement.addEventListener('mouseenter', handlePopupMouseEnter);
        popupElement.addEventListener('mouseleave', handlePopupMouseLeave);
        popupListenersAttached = true;
      }
    });
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
      if (popupHideTimer) {
        clearTimeout(popupHideTimer);
        popupHideTimer = null;
      }
      popup.remove();
      objectiveMarkers.delete(objectiveId);
      cleanupMountedComponent();
    });
  };
  function getMarksHash(marks: MapMark[], mapId: string): string {
    let hash = updateFnv1a(FNV1A_OFFSET_BASIS, mapId);
    hash = updateFnv1a(hash, marks.length);
    for (const mark of marks) {
      hash = updateFnv1a(hash, mark.id ?? '');
      const sortedUsers = [...(mark.users ?? [])].sort();
      hash = updateFnv1a(hash, sortedUsers.length);
      for (const user of sortedUsers) {
        hash = updateFnv1a(hash, user);
      }
      const zoneHashes = mark.zones
        .filter((zone) => zone.map.id === mapId)
        .map((zone) => hashZoneOutline(zone.outline))
        .sort((a, b) => a - b);
      hash = updateFnv1a(hash, zoneHashes.length);
      for (const zoneHash of zoneHashes) {
        hash = updateFnv1a(hash, zoneHash);
      }
      const locationHashes = (mark.possibleLocations ?? [])
        .filter((location) => location.map.id === mapId)
        .map((location) => hashLocationPositions(location.positions))
        .sort((a, b) => a - b);
      hash = updateFnv1a(hash, locationHashes.length);
      for (const locationHash of locationHashes) {
        hash = updateFnv1a(hash, locationHash);
      }
    }
    return hash.toString(16).padStart(8, '0');
  }
  function createObjectiveMarkers(): void {
    if (!leaflet.value || !objectiveLayer.value || !props.map) return;
    const L = leaflet.value;
    if (!isValidMapSvgConfig(props.map.svg) && !isValidMapTileConfig(props.map.tile)) return;
    const currentHash = getMarksHash(props.marks, props.map.id);
    if (currentHash === lastMarksHash.value && objectiveMarkers.size > 0) {
      return;
    }
    lastMarksHash.value = currentHash;
    if (activePinnedPopupCleanup) {
      activePinnedPopupCleanup();
      activePinnedPopupCleanup = null;
    }
    objectiveLayer.value.clearLayers();
    objectiveMarkers.clear();
    const zoneEntries: Array<{
      polygon: L.Polygon;
      centerMarker: L.CircleMarker;
      area: number;
      objectiveId: string;
    }> = [];
    const pointEntries: Array<{
      marker: L.CircleMarker;
      objectiveId: string;
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
    props.marks.forEach((mark) => {
      const objectiveId = mark.id;
      if (!objectiveId) return;
      mark.possibleLocations?.forEach((location) => {
        if (location.map.id !== props.map.id) return;
        const positions = location.positions;
        if (!positions || positions.length === 0) return;
        const pos = positions[0];
        if (!pos) return;
        const latLng = gameToLatLng(pos.x, pos.z);
        const isSelf = mark.users?.includes('self') ?? false;
        const markerColor = isSelf
          ? mapColors.value.SELF_OBJECTIVE
          : mapColors.value.TEAM_OBJECTIVE;
        const marker = L.circleMarker([latLng.lat, latLng.lng], {
          radius: 8,
          fillColor: markerColor,
          fillOpacity: 0.8,
          color: mapColors.value.MARKER_BORDER,
          weight: 2,
        });
        pointEntries.push({ marker, objectiveId });
      });
      mark.zones.forEach((zone) => {
        if (zone.map.id !== props.map.id) return;
        if (zone.outline.length < 3) return;
        const latLngs = outlineToLatLngArray(zone.outline);
        if (latLngs.length < 3) return;
        const isSelf = mark.users?.includes('self') ?? false;
        const zoneColor = isSelf ? mapColors.value.SELF_OBJECTIVE : mapColors.value.TEAM_OBJECTIVE;
        const polygonLatLngs = latLngs.map((ll) => [ll.lat, ll.lng]) as L.LatLngExpression[];
        const polygon = L.polygon(polygonLatLngs, {
          color: zoneColor,
          fillColor: zoneColor,
          fillOpacity: 0.24,
          weight: 2.25,
          opacity: 0.95,
        });
        const center = polygon.getBounds().getCenter();
        const centerMarker = L.circleMarker([center.lat, center.lng], {
          radius: 5,
          fillColor: zoneColor,
          fillOpacity: 0.95,
          color: mapColors.value.MARKER_BORDER,
          weight: 1.5,
          opacity: 1,
        });
        zoneEntries.push({
          polygon,
          centerMarker,
          area: calculateZoneArea(zone.outline),
          objectiveId,
        });
      });
    });
    zoneEntries
      .sort((a, b) => b.area - a.area)
      .forEach(({ polygon, centerMarker, objectiveId }) => {
        if (objectiveId) {
          attachHoverPinPopup(polygon, objectiveId, () => polygon.getBounds().getCenter());
          attachHoverPinPopup(centerMarker, objectiveId, () => centerMarker.getLatLng());
        }
        polygon.on('mouseover', () => polygon.setStyle({ fillOpacity: 0.4, weight: 3 }));
        polygon.on('mouseout', () => polygon.setStyle({ fillOpacity: 0.24, weight: 2.25 }));
        objectiveLayer.value!.addLayer(polygon);
        objectiveLayer.value!.addLayer(centerMarker);
      });
    pointEntries.forEach(({ marker, objectiveId }) => {
      if (objectiveId) {
        attachHoverPinPopup(marker, objectiveId, () => marker.getLatLng());
      }
      objectiveLayer.value!.addLayer(marker);
    });
  }
  function createExtractMarkers(): void {
    if (!leaflet.value || !extractLayer.value || !props.map) return;
    const L = leaflet.value;
    if (!isValidMapSvgConfig(props.map.svg) && !isValidMapTileConfig(props.map.tile)) return;
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
      let markerColor: string;
      switch (extract.faction) {
        case 'pmc':
          markerColor = mapColors.value.PMC_EXTRACT;
          break;
        case 'scav':
          markerColor = mapColors.value.SCAV_EXTRACT;
          break;
        case 'shared':
          markerColor = isCoop ? mapColors.value.COOP_EXTRACT : mapColors.value.SHARED_EXTRACT;
          break;
        default:
          markerColor = mapColors.value.DEFAULT_EXTRACT;
          break;
      }
      const extractDot = L.circleMarker([latLng.lat, latLng.lng], {
        radius: 3,
        fillColor: markerColor,
        fillOpacity: 1,
        color: mapColors.value.EXTRACT_DOT_BORDER,
        weight: 1,
        opacity: 1,
        interactive: false,
      });
      const extractBadge = document.createElement('div');
      extractBadge.setAttribute('title', extract.name);
      extractBadge.setAttribute('aria-label', extract.name);
      extractBadge.className = 'extract-badge';
      extractBadge.style.borderColor = markerColor;
      const extractLabel = document.createElement('span');
      extractLabel.className = 'extract-badge-label';
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
  let lastSpawnZoomAboveThreshold: boolean | null = null;
  function createPmcSpawnMarkers(): void {
    if (!leaflet.value || !spawnLayer.value || !props.map) return;
    if (!isValidMapSvgConfig(props.map.svg) && !isValidMapTileConfig(props.map.tile)) return;
    spawnLayer.value.clearLayers();
    if (!showPmcSpawns.value || mapPmcSpawns.value.length === 0) return;
    const L = leaflet.value;
    const currentZoom = mapInstance.value?.getZoom() ?? 0;
    const aboveThreshold = currentZoom >= SPAWN_CLUSTER_ZOOM_THRESHOLD;
    lastSpawnZoomAboveThreshold = aboveThreshold;
    if (aboveThreshold) {
      mapPmcSpawns.value.forEach((spawn) => {
        const position = spawn.position;
        if (!position) return;
        const latLng = gameToLatLng(position.x, position.z);
        const marker = L.circleMarker([latLng.lat, latLng.lng], {
          radius: 3,
          fillColor: mapColors.value.PMC_SPAWN,
          fillOpacity: 0.9,
          color: mapColors.value.MARKER_BORDER,
          weight: 1,
          interactive: false,
        });
        spawnLayer.value!.addLayer(marker);
      });
    } else {
      const clusters = clusterSpawns(mapPmcSpawns.value, SPAWN_CLUSTER_GRID_SIZE);
      for (const cluster of clusters) {
        const latLng = gameToLatLng(cluster.centerX, cluster.centerZ);
        if (cluster.count === 1) {
          const marker = L.circleMarker([latLng.lat, latLng.lng], {
            radius: 3,
            fillColor: mapColors.value.PMC_SPAWN,
            fillOpacity: 0.9,
            color: mapColors.value.MARKER_BORDER,
            weight: 1,
            interactive: false,
          });
          spawnLayer.value!.addLayer(marker);
        } else {
          const clampedCount = Math.min(cluster.count, 20);
          const radius =
            SPAWN_CLUSTER_MIN_RADIUS +
            ((clampedCount - 2) / 18) * (SPAWN_CLUSTER_MAX_RADIUS - SPAWN_CLUSTER_MIN_RADIUS);
          const marker = L.circleMarker([latLng.lat, latLng.lng], {
            radius,
            fillColor: mapColors.value.PMC_SPAWN,
            fillOpacity: 0.6,
            color: mapColors.value.MARKER_BORDER,
            weight: 1.5,
            interactive: false,
          });
          spawnLayer.value!.addLayer(marker);
          const label = L.tooltip({
            permanent: true,
            direction: 'center',
            className: 'spawn-cluster-label',
          })
            .setContent(String(cluster.count))
            .setLatLng([latLng.lat, latLng.lng]);
          spawnLayer.value!.addLayer(label as unknown as L.Layer);
        }
      }
    }
  }
  function handleSpawnZoomChange(): void {
    if (!mapInstance.value || !showPmcSpawns.value) return;
    const currentZoom = mapInstance.value.getZoom();
    const aboveThreshold = currentZoom >= SPAWN_CLUSTER_ZOOM_THRESHOLD;
    if (aboveThreshold === lastSpawnZoomAboveThreshold) return;
    createPmcSpawnMarkers();
  }
  function updateMarkers(): void {
    try {
      createObjectiveMarkers();
      createExtractMarkers();
      createPmcSpawnMarkers();
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
  watch(
    () => props.marks,
    () => updateMarkers(),
    { deep: true }
  );
  watch(mapZoomSpeed, (speed) => {
    applyZoomSpeed(mapInstance.value, speed);
  });
  watch(
    mapColors,
    () => {
      lastMarksHash.value = '';
      updateMarkers();
    },
    { deep: true }
  );
  watch([showPmcExtracts, showScavExtracts], () => createExtractMarkers());
  watch(showPmcSpawns, () => createPmcSpawnMarkers());
  watch(
    () => props.showPmcSpawns,
    (value) => {
      if (typeof value === 'boolean') {
        showPmcSpawns.value = value;
      }
    }
  );
  watch(
    () => props.map,
    () => {
      lastMarksHash.value = '';
      lastSpawnZoomAboveThreshold = null;
      updateMarkers();
    }
  );
  watch(selectedFloor, () => {
    lastMarksHash.value = '';
    updateMarkers();
  });
  watch(
    mapInstance,
    (instance) => {
      teardownSvgReadyWatcher();
      if (instance) {
        baseZoomDelta.value = instance.options.zoomDelta ?? 0.35;
        baseZoomSnap.value = instance.options.zoomSnap ?? 0.25;
        applyZoomSpeed(instance, mapZoomSpeed.value);
      }
    },
    { immediate: true }
  );
  onMounted(() => {
    window.addEventListener('keydown', onGlobalMapKeydown);
    window.addEventListener('keyup', onGlobalMapKeyup);
    window.addEventListener('blur', onMapWindowBlur);
  });
  watch(
    [isLoading, objectiveLayer, extractLayer, spawnLayer, mapInstance],
    (
      [loading, objectiveMarkersLayer, extractMarkersLayer, spawnMarkersLayer, instance],
      oldValues
    ) => {
      const oldInstance = oldValues?.[4] as L.Map | null | undefined;
      if (oldInstance && oldInstance !== instance) {
        oldInstance.off('zoomend', handleSpawnZoomChange);
      }
      if (
        loading ||
        !instance ||
        !objectiveMarkersLayer ||
        !extractMarkersLayer ||
        !spawnMarkersLayer
      )
        return;
      lastMarksHash.value = '';
      instance.off('zoomend', handleSpawnZoomChange);
      instance.on('zoomend', handleSpawnZoomChange);
      waitForSvgAndUpdateMarkers(instance);
    },
    { immediate: true, flush: 'post' }
  );
  const activateObjectivePopup = (objectiveId: string): boolean => {
    const markerData = objectiveMarkers.get(objectiveId);
    if (!markerData) return false;
    markerData.showPopup(true);
    return true;
  };
  const closeActivePopup = (): void => {
    if (activePinnedPopupCleanup) {
      activePinnedPopupCleanup();
    }
  };
  defineExpose({
    activateObjectivePopup,
    closeActivePopup,
    refreshView,
  });
  onUnmounted(() => {
    window.removeEventListener('keydown', onGlobalMapKeydown);
    window.removeEventListener('keyup', onGlobalMapKeyup);
    window.removeEventListener('blur', onMapWindowBlur);
    clearKeyboardCursorHover();
    stopMapKeyboardLoop(true);
    teardownSvgReadyWatcher();
    if (mapInstance.value) {
      mapInstance.value.off('zoomend', handleSpawnZoomChange);
    }
    if (activePinnedPopupCleanup) {
      activePinnedPopupCleanup();
    }
    objectiveMarkers.clear();
    clearMarkers();
  });
</script>
