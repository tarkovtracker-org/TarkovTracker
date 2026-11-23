<template>
  <div class="isolate">
    <div class="border-surface-700 flex flex-wrap items-center justify-between gap-2 border-b p-2">
      <label class="flex min-w-0 items-center gap-2 text-sm">
        {{ t('page.hideout.map.area') }}
        <select
          :value="activeArea ?? ''"
          class="border-surface-600 bg-surface-800 max-w-48 min-w-0 rounded border px-2 py-1.5"
          @change="chooseArea"
        >
          <option value="">{{ t('page.hideout.map.all_areas') }}</option>
          <option v-for="area in visibleAreas" :key="area" :value="area">
            {{ areaName(area) }}
          </option>
        </select>
      </label>
      <div class="flex gap-1">
        <UButton
          icon="i-mdi-minus"
          :aria-label="t('maps.tooltips.zoom_out')"
          color="neutral"
          variant="soft"
          @click="map?.zoomOut(0.5)"
        />
        <UButton
          icon="i-mdi-plus"
          :aria-label="t('maps.tooltips.zoom_in')"
          color="neutral"
          variant="soft"
          @click="map?.zoomIn(0.5)"
        />
        <UButton
          icon="i-mdi-fit-to-screen-outline"
          :label="t('maps.tooltips.reset_view')"
          color="neutral"
          variant="soft"
          @click="reset"
        />
      </div>
    </div>
    <div
      ref="surface"
      role="region"
      :aria-label="t('page.hideout.map.navigation')"
      data-testid="hideout-map-canvas"
      class="!bg-surface-950 relative z-0 h-80 w-full sm:h-112 lg:h-136"
    />
  </div>
</template>
<script setup lang="ts">
  import { useResizeObserver } from '@vueuse/core';
  import 'leaflet/dist/leaflet.css';
  import {
    AREA_LABELS,
    HIDEOUT_AREAS,
    HIDEOUT_MAP_SIZE,
    type HideoutArea,
    type HideoutPin,
  } from '@/features/hideout/hideoutMapLayout';
  import { STATE_LABELS, type HideoutMapStation } from '@/features/hideout/useHideoutMapStations';
  import type L from 'leaflet';
  const props = defineProps<{
    entries: HideoutMapStation[];
    selectedId?: string;
    activeArea: HideoutArea | null;
  }>();
  const emit = defineEmits<{ area: [area: HideoutArea]; station: [id: string]; reset: [] }>();
  const { t } = useI18n({ useScope: 'global' });
  const surface = useTemplateRef<HTMLDivElement>('surface');
  const map = shallowRef<L.Map>();
  const leaflet = shallowRef<typeof L>();
  const markers = shallowRef<L.LayerGroup>();
  const detailed = ref(false);
  const bounds: L.LatLngBoundsLiteral = [
    [0, 0],
    [HIDEOUT_MAP_SIZE.height, HIDEOUT_MAP_SIZE.width],
  ];
  const areaName = (area: HideoutArea) => t(AREA_LABELS[area]);
  const positions: Record<HideoutArea, [number, number]> = {
    workshop: [260, 292],
    gym: [640, 125],
    living: [1050, 171],
    water: [975, 366],
    utilities: [516, 442],
    security: [695, 641],
  };
  const surfaceWidth = ref(0);
  const compact = computed(() => surfaceWidth.value < 500);
  const compactLabels: Record<HideoutArea, [number, number]> = {
    workshop: [198, 235],
    gym: [500, -16],
    living: [925, 156],
    water: [940, 419],
    utilities: [250, 542],
    security: [717, 755],
  };
  const compactEdgeSpacing: Partial<Record<HideoutArea, number>> = { gym: -110, security: 110 };
  const visibleAreas = computed(() =>
    HIDEOUT_AREAS.filter((area) => props.entries.some((entry) => entry.pin?.area === area))
  );
  const worldPoint = (x: number, y: number): L.LatLngTuple => [HIDEOUT_MAP_SIZE.height - y, x];
  const stationPoint = (pin: HideoutPin) => worldPoint(pin.x, pin.y);
  const detailZoom = 0.5;
  let fittedZoom = 0;
  const chooseArea = (event: Event) => {
    const next = (event.target as HTMLSelectElement).value as HideoutArea;
    if (next) emit('area', next);
    else reset();
  };
  function fit() {
    const instance = map.value;
    if (!instance) return;
    instance.stop();
    instance.setMinZoom(-4);
    instance.fitBounds(bounds, { padding: [12, 12], animate: false });
    fittedZoom = instance.getZoom();
    instance.setMinZoom(fittedZoom);
  }
  function reset() {
    fit();
    emit('reset');
  }
  function focusStation(id: string) {
    const pin = props.entries.find((entry) => entry.station.id === id)?.pin;
    const instance = map.value;
    if (!pin || !instance) return;
    const point = stationPoint(pin);
    if (instance.getZoom() < detailZoom)
      instance.setView(point, detailZoom + 0.5, { animate: false });
    else instance.panInside(point, { padding: [48, 48], animate: false });
  }
  function focusArea(area: HideoutArea) {
    const points = props.entries.flatMap((entry) =>
      entry.pin?.area === area ? [stationPoint(entry.pin)] : []
    );
    if (!points.length || !map.value || !leaflet.value) return;
    const extent = leaflet.value.latLngBounds(points);
    const zoom = map.value.getBoundsZoom(extent, false, leaflet.value.point(80, 80));
    map.value.setView(extent.getCenter(), Math.max(detailZoom, Math.min(1.5, zoom)), {
      animate: false,
    });
  }
  defineExpose({ focusStation, focusArea, reset });
  function addMarker(
    point: L.LatLngTuple,
    badge: HTMLElement,
    label: string,
    action: () => void,
    key: string
  ) {
    const api = leaflet.value;
    if (!api || !markers.value) return;
    const icon = api.divIcon({
      html: badge,
      className: '',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
    const marker = api
      .marker(point, { icon, title: label, keyboard: true, riseOnHover: true })
      .addTo(markers.value);
    const element = marker.getElement();
    if (element) {
      element.setAttribute('aria-label', label);
      element.dataset.hideoutPin = key;
      element.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) action();
      });
    }
    marker.on('click', action);
  }
  function areaMarker(area: HideoutArea) {
    const count = props.entries.filter(
      (entry) => entry.pin?.area === area && entry.state === 'ready'
    ).length;
    const label = areaName(area);
    const badge = document.createElement('span');
    badge.className =
      'border-surface-500 bg-surface-900 text-surface-100 absolute top-1/2 left-1/2 flex min-h-9 -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-xs font-semibold shadow';
    badge.textContent = label;
    if (count) {
      const ready = document.createElement('span');
      ready.className = 'text-success-400';
      ready.textContent = '✓ ' + count;
      badge.append(ready);
    }
    const anchor = worldPoint(...positions[area]);
    let point = anchor;
    if (compact.value) {
      const [x, y] = compactLabels[area];
      // On the smallest phones, stagger the two end labels outside the central rooms.
      const stagger = surfaceWidth.value < 260 ? (compactEdgeSpacing[area] ?? 0) : 0;
      point = worldPoint(x, y + stagger);
    }
    if (compact.value && leaflet.value && markers.value) {
      leaflet.value
        .polyline([anchor, point], {
          color: 'var(--color-surface-400)',
          weight: 1,
          interactive: false,
        })
        .addTo(markers.value);
    }
    addMarker(
      point,
      badge,
      t('page.hideout.map.area_ready', { area: label, count }),
      () => emit('area', area),
      area
    );
  }
  const stateBorders = {
    ready: 'border-success-400',
    items: 'border-warning-400',
    locked: 'border-surface-400 border-dashed',
    maxed: 'border-info-400',
  };
  function stationMarker(entry: HideoutMapStation) {
    if (!entry.pin) return;
    const { station, state, level } = entry;
    const badge = document.createElement('span');
    badge.className =
      'bg-surface-900 text-surface-100 relative grid size-9 place-items-center rounded-full border-2 shadow ' +
      stateBorders[state];
    if (station.id === props.selectedId)
      badge.classList.add('ring-2', 'ring-primary-400', 'ring-offset-1');
    badge.textContent = station.name.slice(0, 2);
    if (station.imageLink) {
      const img = document.createElement('img');
      img.src = station.imageLink;
      img.alt = '';
      img.draggable = false;
      img.className = 'absolute size-7 rounded-full bg-surface-900 object-contain';
      img.onerror = () => img.remove();
      badge.append(img);
    }
    const number = document.createElement('span');
    number.className =
      'bg-surface-900 text-surface-100 absolute -right-1 -bottom-1 rounded px-1 text-xs font-bold';
    number.textContent = String(level);
    badge.append(number);
    const label = [
      station.name,
      t('page.hideout.map.level', { level }),
      t(STATE_LABELS[state]),
    ].join(', ');
    addMarker(stationPoint(entry.pin), badge, label, () => emit('station', station.id), station.id);
  }
  function drawMarkers() {
    const layer = markers.value;
    if (!layer) return;
    const focused = (document.activeElement as HTMLElement | null)?.dataset.hideoutPin;
    layer.clearLayers();
    if (detailed.value) props.entries.forEach(stationMarker);
    else visibleAreas.value.forEach(areaMarker);
    if (focused && surface.value) {
      const target = surface.value.querySelector<HTMLElement>(
        '[data-hideout-pin="' + CSS.escape(focused) + '"]'
      );
      (target ?? surface.value).focus({ preventScroll: true });
    }
  }
  watchEffect(drawMarkers);
  onMounted(async () => {
    const module = await import('leaflet');
    const api = module.default ?? module;
    if (!surface.value) return;
    leaflet.value = api;
    const instance = api.map(surface.value, {
      crs: api.CRS.Simple,
      attributionControl: false,
      zoomControl: false,
      // A reset or area selection must take effect even during a wheel or pinch gesture.
      zoomAnimation: false,
      minZoom: -4,
      maxZoom: 3,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      maxBounds: api.latLngBounds(bounds).pad(0.2),
      maxBoundsViscosity: 1,
    });
    surfaceWidth.value = instance.getSize().x;
    map.value = instance;
    api.imageOverlay('/img/hideout-floor.svg', bounds, { interactive: false }).addTo(instance);
    instance.on('zoomend', () => {
      detailed.value = instance.getZoom() >= detailZoom;
    });
    fit();
    markers.value = api.layerGroup().addTo(instance);
  });
  useResizeObserver(surface, () => {
    const instance = map.value;
    if (!instance) return;
    const wasFitted = instance.getZoom() === fittedZoom;
    instance.invalidateSize({ pan: false });
    surfaceWidth.value = instance.getSize().x;
    if (wasFitted) fit();
    else if (leaflet.value) {
      instance.setMinZoom(-4);
      fittedZoom = instance.getBoundsZoom(
        leaflet.value.latLngBounds(bounds),
        false,
        leaflet.value.point(24, 24)
      );
      instance.setMinZoom(fittedZoom);
    }
  });
  onBeforeUnmount(() => {
    map.value?.remove();
    map.value = undefined;
    markers.value = undefined;
  });
</script>
