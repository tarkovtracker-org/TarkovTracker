import { mountSuspended } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, shallowRef } from 'vue';
import maps from '@/data/maps.json';
import { resetExtractRuleData } from '@/features/maps/composables/useExtractRuleData';
import { MAP_MARKER_GLYPH_PATHS } from '@/features/maps/utils/markerGlyphs';
import extractRuleFixture from '@/utils/__tests__/fixtures/extractRuleData.json';
import type { TarkovMap } from '@/types/tarkov';
// Saved Layers rows, shared by every map the test mounts and reactive like the real store. The
// preferences mock reads it lazily, after module evaluation.
const savedLayers = shallowRef<Record<string, boolean>>({});
const { mapState, mockMapInstance, resetMapMarkerColorsSpy } = vi.hoisted(() => {
  const instance = {
    size: { x: 800, y: 600 },
    zoom: 4.25,
    center: { lat: 12.5, lng: 34.5 },
    options: { zoomSnap: 1 } as Record<string, unknown>,
    zoomSnapDuringCall: undefined as number | undefined,
    on: vi.fn(),
    off: vi.fn(),
    hasLayer: vi.fn((layer?: { isOpen?: boolean }) => Boolean(layer?.isOpen)),
    getPane: vi.fn(() => document.createElement('div')),
    getContainer: vi.fn(() => document.createElement('div')),
    latLngToContainerPoint: vi.fn(() => ({ x: 50, y: 50 })),
    getMinZoom: vi.fn(() => -2),
    getMaxZoom: vi.fn(() => 10),
    panBy: vi.fn(),
    panTo: vi.fn(),
    containerPointToLatLng: vi.fn(() => ({ lat: 0, lng: 0 })),
    setZoomAround: vi.fn(),
  };
  const mapInstance = {
    ...instance,
    getSize: vi.fn(() => mapInstance.size),
    getZoom: vi.fn(() => mapInstance.zoom),
    getCenter: vi.fn(() => mapInstance.center),
    setView: vi.fn(() => {
      mapInstance.zoomSnapDuringCall = mapInstance.options.zoomSnap as number;
      return mapInstance;
    }),
    zoomIn: vi.fn(() => {
      mapInstance.zoomSnapDuringCall = mapInstance.options.zoomSnap as number;
      return mapInstance;
    }),
    zoomOut: vi.fn(() => {
      mapInstance.zoomSnapDuringCall = mapInstance.options.zoomSnap as number;
      return mapInstance;
    }),
  };
  return {
    mockMapInstance: mapInstance,
    resetMapMarkerColorsSpy: vi.fn(),
    mapState: {
      hasMultipleFloors: false,
      isLoading: false,
      leaflet: null as unknown,
      fitZoom: null as number | null,
      objectiveLayer: null as unknown,
      extractLayer: null as unknown,
      spawnLayer: null as unknown,
      transitLayer: null as unknown,
    },
  };
});
const { mockTarkovApiFetch } = vi.hoisted(() => ({ mockTarkovApiFetch: vi.fn() }));
vi.mock('@/utils/tarkovApiFetch', () => ({ tarkovApiFetch: mockTarkovApiFetch }));
const refreshViewSpy = vi.fn();
const setFloorSpy = vi.fn();
const useLeafletMapOptionsSpy = vi.fn();
vi.mock('@/composables/useLeafletMap', () => ({
  withoutZoomSnap: (instance: { options: { zoomSnap?: number } }, apply: () => void): void => {
    const originalZoomSnap = instance.options.zoomSnap ?? 0;
    instance.options.zoomSnap = 0;
    try {
      apply();
    } finally {
      instance.options.zoomSnap = originalZoomSnap;
    }
  },
  useLeafletMap: (options: unknown) => {
    useLeafletMapOptionsSpy(options);
    const selectedFloor = ref('');
    return {
      mapInstance: shallowRef(mockMapInstance),
      leaflet: shallowRef(mapState.leaflet),
      selectedFloor,
      floors: ref([]),
      hasMultipleFloors: ref(mapState.hasMultipleFloors),
      isLoading: ref(mapState.isLoading),
      isIdle: ref(false),
      svgLayer: shallowRef(null),
      objectiveLayer: shallowRef(mapState.objectiveLayer),
      extractLayer: shallowRef(mapState.extractLayer),
      spawnLayer: shallowRef(mapState.spawnLayer),
      transitLayer: shallowRef(mapState.transitLayer),
      setFloor: (floor: string) => {
        setFloorSpy(floor);
        selectedFloor.value = floor;
      },
      refreshView: refreshViewSpy,
      getFitZoom: () => mapState.fitZoom,
      clearMarkers: vi.fn(),
      destroy: vi.fn(),
    };
  },
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({
    resetMapMarkerColors: resetMapMarkerColorsSpy,
    getMapMarkerColors: {
      SELF_OBJECTIVE: '#111111',
      TEAM_OBJECTIVE: '#222222',
      PMC_SPAWN: '#333333',
      PMC_EXTRACT: '#444444',
      SCAV_EXTRACT: '#555555',
      SHARED_EXTRACT: '#666666',
      COOP_EXTRACT: '#777777',
      DEFAULT_EXTRACT: '#888888',
      TRANSIT: '#cf5959',
    },
    getMapTooltipDensity: 'comfortable',
    getMapShowSelfObjectives: true,
    getMapShowPinnedObjectives: false,
    getMapShowTeamObjectives: false,
    getMapZoneOpacity: 0.3,
    getMapZoomSpeed: 1,
    mapPanSpeed: 1,
    setMapMarkerColor: vi.fn(),
    setMapShowPinnedObjectives: vi.fn(),
    setMapShowSelfObjectives: vi.fn(),
    setMapShowTeamObjectives: vi.fn(),
    setMapPanSpeed: vi.fn(),
    setMapTooltipDensity: vi.fn(),
    setMapZoneOpacity: vi.fn(),
    setMapZoomSpeed: vi.fn(),
    get getMapLayerVisibility() {
      return savedLayers.value;
    },
    setMapLayerVisible: (key: string, visible: boolean) => {
      savedLayers.value = { ...savedLayers.value, [key]: visible };
    },
  }),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    objectives: [
      { id: 'objective-a', taskId: 'task-a', description: 'Objective A' },
      { id: 'objective-b', taskId: 'task-b', description: 'Objective B' },
    ],
    tasks: [
      { id: 'task-a', name: 'Task A' },
      { id: 'task-b', name: 'Task B' },
    ],
  }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getObjectiveCount: () => 0,
    isTaskObjectiveComplete: () => false,
    isTaskComplete: () => false,
    isTaskFailed: () => false,
    setObjectiveCount: vi.fn(),
    setTaskObjectiveComplete: vi.fn(),
    setTaskObjectiveUncomplete: vi.fn(),
  }),
}));
const mapData = {
  id: 'customs',
  name: 'Customs',
  normalizedName: 'customs',
} as TarkovMap;
const mapStubs = {
  AppTooltip: { template: '<div><slot /></div>' },
  UPopover: {
    template: '<div><slot /><slot name="content" /></div>',
  },
  UButton: {
    inheritAttrs: false,
    emits: ['click'],
    template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
  },
  UIcon: { template: '<span />' },
};
const mountMap = async (props: Record<string, unknown> = {}) => {
  const LeafletMap = (await import('@/features/maps/LeafletMap.vue')).default;
  return mountSuspended(LeafletMap, {
    attachTo: document.body,
    props: { map: mapData, showFullscreenToggle: true, ...props },
    global: { stubs: mapStubs },
  });
};
describe('LeafletMap controls', () => {
  beforeEach(() => {
    mapState.hasMultipleFloors = false;
    mapState.leaflet = null;
    mapState.objectiveLayer = null;
    mapState.extractLayer = null;
    mapState.spawnLayer = null;
    mapState.transitLayer = null;
    mapState.fitZoom = null;
    localStorage.clear();
    savedLayers.value = {};
    resetExtractRuleData();
    mockTarkovApiFetch.mockReset();
    mockTarkovApiFetch.mockResolvedValue({ data: null });
    refreshViewSpy.mockClear();
    setFloorSpy.mockClear();
    useLeafletMapOptionsSpy.mockClear();
    mockMapInstance.options.zoomSnap = 1;
    mockMapInstance.zoomSnapDuringCall = undefined;
    mockMapInstance.size = { x: 800, y: 600 };
    mockMapInstance.zoom = 4.25;
    mockMapInstance.setView.mockClear();
    mockMapInstance.panTo.mockClear();
    mockMapInstance.zoomIn.mockClear();
    mockMapInstance.zoomOut.mockClear();
    mockMapInstance.hasLayer.mockReset();
    mockMapInstance.hasLayer.mockImplementation((layer) => Boolean(layer?.isOpen));
    mockMapInstance.getPane.mockReset();
    mockMapInstance.getPane.mockImplementation(() => document.createElement('div'));
    mockMapInstance.getContainer.mockReset();
    mockMapInstance.getContainer.mockImplementation(() => document.createElement('div'));
    mockMapInstance.latLngToContainerPoint.mockClear();
    mockMapInstance.latLngToContainerPoint.mockReturnValue({ x: 50, y: 50 });
  });
  const openLayersPanel = async (wrapper: Awaited<ReturnType<typeof mountMap>>) => {
    await wrapper.get('[data-testid="map-layers-toggle"]').trigger('click');
    return (key: string) => wrapper.find(`[data-testid="map-layers-panel"] [data-layer="${key}"]`);
  };
  it('starts extracts from the saved default and follows it when it changes', async () => {
    const wrapper = await mountMap({
      map: {
        ...mapData,
        extracts: [
          { id: 'a', name: 'Crossroads', faction: 'pmc', position: { x: 1, y: 0, z: 1 } },
          { id: 'b', name: 'Old Gas Station', faction: 'scav', position: { x: 2, y: 0, z: 2 } },
          { id: 'c', name: 'Railroad', faction: 'shared', position: { x: 3, y: 0, z: 3 } },
        ],
      },
      showExtracts: false,
    });
    const row = await openLayersPanel(wrapper);
    const pressed = () =>
      ['pmc', 'scav', 'shared'].map((key) => row(key).attributes('aria-pressed'));
    expect(pressed()).toEqual(['false', 'false', 'false']);
    // The preference can arrive from account sync after the map mounted.
    await wrapper.setProps({ showExtracts: true });
    expect(pressed()).toEqual(['true', 'true', 'true']);
    // A row the user changed keeps their choice through later default changes.
    await row('scav').trigger('click');
    await wrapper.setProps({ showExtracts: false });
    await wrapper.setProps({ showExtracts: true });
    expect(pressed()).toEqual(['true', 'false', 'true']);
    wrapper.unmount();
  });
  it('remembers extract and transit rows across a refresh or page change', async () => {
    const map = {
      id: '653e6760052c01c1c805532f',
      name: 'Ground Zero',
      svg: maps.groundzero.svg,
      extracts: [
        {
          id: 'a',
          name: 'Crossroads',
          faction: 'pmc',
          position: { x: 151.63, y: 24.66, z: -97.46 },
        },
        { id: 'b', name: 'Scav exit', faction: 'scav', position: { x: 150, y: 24.66, z: -90 } },
      ],
      transits: [
        {
          id: 't',
          description: 'Streets transit',
          map: 'streets',
          position: { x: 229.6, y: 16.99, z: 65.36 },
        },
      ],
    } as TarkovMap;
    const first = await mountMap({ map });
    const firstRow = await openLayersPanel(first);
    await firstRow('scav').trigger('click');
    await firstRow('transit').trigger('click');
    expect(savedLayers.value).toEqual({ scav: false, transit: false });
    first.unmount();
    // The panel remembers being opened; reset that so the helper opens it again.
    localStorage.removeItem('map_layers_panel_open');
    // A new map instance stands in for the reload: it starts from the saved rows.
    const second = await mountMap({ map });
    const row = await openLayersPanel(second);
    expect(['pmc', 'scav', 'transit'].map((key) => row(key).attributes('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    // A saved row is the user's choice, so a later default change leaves it alone.
    await second.setProps({ showExtracts: false });
    await second.setProps({ showExtracts: true });
    expect(row('scav').attributes('aria-pressed')).toBe('false');
    // Show all layers is an explicit choice for every listed row, and is remembered.
    await second.get('[data-testid="map-layers-show-all"]').trigger('click');
    expect(savedLayers.value).toEqual({ pmc: true, scav: true, transit: true });
    second.unmount();
  });
  it('restores a saved row over an explicit page value', async () => {
    savedLayers.value = { pmc: false };
    const wrapper = await mountMap({
      map: {
        ...mapData,
        extracts: [{ id: 'a', name: 'Crossroads', faction: 'pmc', position: { x: 1, y: 0, z: 1 } }],
      },
      showPmcExtracts: true,
    });
    const row = await openLayersPanel(wrapper);
    expect(row('pmc').attributes('aria-pressed')).toBe('false');
    wrapper.unmount();
  });
  it('follows a row saved by another map on the page, such as the full-screen map', async () => {
    const wrapper = await mountMap({
      map: {
        ...mapData,
        extracts: [{ id: 'a', name: 'Crossroads', faction: 'pmc', position: { x: 1, y: 0, z: 1 } }],
      },
    });
    const row = await openLayersPanel(wrapper);
    expect(row('pmc').attributes('aria-pressed')).toBe('true');
    savedLayers.value = { pmc: false };
    await nextTick();
    expect(row('pmc').attributes('aria-pressed')).toBe('false');
    wrapper.unmount();
  });
  it('combines the legend and layer toggles in one panel that remembers being opened', async () => {
    const wrapper = await mountMap({
      map: {
        ...mapData,
        extracts: [
          { id: 'a', name: 'Crossroads', faction: 'pmc', position: { x: 1, y: 0, z: 1 } },
          { id: 'b', name: 'Old Gas Station', faction: 'scav', position: { x: 2, y: 0, z: 2 } },
          { id: 'c', name: 'Railroad', faction: 'shared', position: { x: 3, y: 0, z: 3 } },
          { id: 'd', name: 'Scav Co-op Exfil', faction: 'shared', position: { x: 4, y: 0, z: 4 } },
        ],
      },
      showPmcExtracts: true,
      showScavExtracts: true,
    });
    const toggle = wrapper.get('[data-testid="map-layers-toggle"]');
    // The test surface has no width, so the narrow-screen default keeps the panel closed.
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('[data-testid="map-layers-panel"]').exists()).toBe(false);
    const row = await openLayersPanel(wrapper);
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(toggle.classes()).toContain('light:text-primary-900');
    expect(localStorage.getItem('map_layers_panel_open')).toBe('true');
    const panel = wrapper.get('[data-testid="map-layers-panel"]');
    expect(panel.attributes('id')).toBe(toggle.attributes('aria-controls'));
    expect(panel.findAll('[role="group"]').map((group) => group.find('p').text())).toEqual([
      'Tasks',
      'Extracts',
    ]);
    for (const key of ['self', 'pinned', 'team', 'pmc', 'scav', 'shared', 'coop']) {
      expect(row(key).exists()).toBe(true);
    }
    expect(row('transit').exists()).toBe(false);
    expect(row('pmc').attributes('aria-pressed')).toBe('true');
    expect(row('pmc').text()).toContain('PMC');
    expect(row('shared').text()).toContain('Shared / unknown');
    expect(
      row('shared')
        .findAll('svg path')
        .map((path) => path.attributes('d'))
    ).toEqual([MAP_MARKER_GLYPH_PATHS.shared, MAP_MARKER_GLYPH_PATHS.extract]);
    expect(row('coop').text()).toContain('PMC and Scav together');
    await row('pmc').trigger('click');
    await row('shared').trigger('click');
    expect(row('pmc').attributes('aria-pressed')).toBe('false');
    expect(row('shared').attributes('aria-pressed')).toBe('false');
    expect(row('scav').attributes('aria-pressed')).toBe('true');
    // Pinned and Team start hidden in the mocked preferences.
    expect(wrapper.get('[data-testid="map-layers-hidden-count"]').text()).toBe('4 hidden');
    await wrapper.get('[data-testid="map-layers-show-all"]').trigger('click');
    expect(row('pmc').attributes('aria-pressed')).toBe('true');
    expect(row('shared').attributes('aria-pressed')).toBe('true');
    await toggle.trigger('click');
    expect(wrapper.find('[data-testid="map-layers-panel"]').exists()).toBe(false);
    expect(localStorage.getItem('map_layers_panel_open')).toBe('false');
    wrapper.unmount();
  });
  it('attaches visible vehicle requirements and keyboard details that fit after resizing', async () => {
    const popup = { options: {}, isOpen: vi.fn(() => true), update: vi.fn() };
    const markerInstance = {
      on: vi.fn<(event: string, handler: (event: { popup: typeof popup }) => void) => void>(),
      getPopup: vi.fn(() => popup),
      bindPopup: vi.fn<(content: HTMLElement, options: unknown) => unknown>().mockReturnThis(),
    };
    const marker = vi.fn((_position: unknown, _options: unknown) => markerInstance);
    const divIcon = vi.fn((options) => options);
    const layer = () => ({ clearLayers: vi.fn(), addLayer: vi.fn() });
    mapState.leaflet = { marker, divIcon };
    mapState.objectiveLayer = layer();
    mapState.spawnLayer = layer();
    mapState.extractLayer = {
      ...layer(),
      eachLayer: (visit: (entry: unknown) => void) => visit(markerInstance),
    };
    const extractMap = {
      ...mapData,
      id: '653e6760052c01c1c805532f',
      svg: maps.groundzero.svg,
      extracts: [
        {
          id: 'e858220a780a95ffbb923225d7649aa134df8836',
          name: 'Police Cordon V-Ex',
          faction: 'pmc',
          position: { x: 0, y: 0, z: 0 },
        },
      ],
    } as TarkovMap;
    let answerRules!: (response: unknown) => void;
    mockTarkovApiFetch.mockImplementation(() => new Promise((resolve) => (answerRules = resolve)));
    const wrapper = await mountMap({ map: extractMap });
    await wrapper.setProps({ map: { ...extractMap } });
    // Until the overlay rules answer, the pin claims nothing: unknown requirements, no source line.
    const pendingPin = divIcon.mock.calls.at(-1)![0].html as HTMLElement;
    expect(pendingPin.querySelector<HTMLElement>('.map-extract-requirements')?.dataset.tags).toBe(
      'unknown'
    );
    const pendingDetails = markerInstance.bindPopup.mock.calls.at(-1)![0] as HTMLElement;
    expect(pendingDetails.textContent).toContain('Requirements unknown. Check in raid.');
    expect(pendingDetails.textContent).not.toContain('No requirements listed');
    expect(wrapper.find('[data-testid="map-extract-source"]').exists()).toBe(false);
    answerRules({ data: extractRuleFixture });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    const pin = divIcon.mock.calls.at(-1)![0].html as HTMLElement;
    const strip = pin.querySelector<HTMLElement>('.map-pin-side > .map-extract-requirements');
    expect(strip?.dataset.tags).toBe('money conditional');
    expect(strip?.nextElementSibling?.classList).toContain('map-pin-label');
    expect(pin.getAttribute('aria-label')).toContain('Money, Conditional');
    expect(marker.mock.calls.at(-1)?.[1]).toMatchObject({ keyboard: true });
    const details = markerInstance.bindPopup.mock.calls.at(-1)![0] as HTMLElement;
    expect(details.textContent).toContain(`Pay ${new Intl.NumberFormat().format(20000)} roubles`);
    expect(details.textContent).not.toContain('Not live raid status');
    // The popup opens above the pin head so the pin and its name stay visible.
    expect(markerInstance.bindPopup.mock.calls.at(-1)![1]).toMatchObject({ offset: [0, -28] });
    // The source and not-live notice appear once for the map, not in every popup.
    const source = wrapper.get('[data-testid="map-extract-source"]');
    expect(source.text()).toBe(
      'Requirements: game data, EFT 1.3.0.0, plus curated cues · Not live raid status'
    );
    expect(source.attributes('title')).toContain('EFT 1.3.0.0.48484');
    expect(wrapper.findAll('[data-testid="map-extract-source"]')).toHaveLength(1);
    // Hiding the only drawn extract's category also removes its source line.
    const row = await openLayersPanel(wrapper);
    await row('pmc').trigger('click');
    expect(wrapper.find('[data-testid="map-extract-source"]').exists()).toBe(false);
    const openPopup = markerInstance.on.mock.calls.find(([event]) => event === 'popupopen')![1];
    mockMapInstance.size = { x: 286, y: 320 };
    openPopup({ popup });
    expect(popup.options).toMatchObject({ maxWidth: 226, maxHeight: 220 });
    mockMapInstance.size = { x: 220, y: 240 };
    const resize = mockMapInstance.on.mock.calls.filter(([event]) => event === 'resize').at(-1)![1];
    resize();
    expect(popup.options).toMatchObject({ maxWidth: 160, minWidth: 160, maxHeight: 140 });
    expect(popup.update).toHaveBeenCalled();
    wrapper.unmount();
  });
  it('shows pin names on tap, past the whole-map zoom, or with the always-names switch', async () => {
    const layer = () => ({ clearLayers: vi.fn(), addLayer: vi.fn() });
    const pinClicks: Array<() => void> = [];
    const marker = vi.fn(() => ({
      bindPopup: vi.fn().mockReturnThis(),
      on: vi.fn((event: string, handler: () => void) => {
        if (event === 'click') pinClicks.push(handler);
      }),
    }));
    const divIcon = vi.fn((options) => options);
    mapState.leaflet = { marker, divIcon };
    mapState.objectiveLayer = layer();
    mapState.extractLayer = layer();
    mapState.spawnLayer = layer();
    mapState.transitLayer = layer();
    // The mocked view sits at zoom 4.25; names show for every pin once the fit zoom is <= 3.25.
    mapState.fitZoom = 4;
    const extractMap: TarkovMap = {
      ...mapData,
      extracts: [
        { id: 'a', name: 'Crossroads', faction: 'pmc', position: { x: 1, y: 0, z: 1 } },
        { id: 'b', name: 'Old Gas Station', faction: 'scav', position: { x: 2, y: 0, z: 2 } },
      ],
      svg: {
        file: 'customs.svg',
        floors: ['ground'],
        defaultFloor: 'ground',
        coordinateRotation: 0,
        bounds: [
          [0, 0],
          [100, 100],
        ],
      },
    };
    const wrapper = await mountMap({ map: extractMap });
    await wrapper.setProps({ map: { ...extractMap } });
    // Extracts start visible when the parent asks for them, without per-faction props.
    const pins = divIcon.mock.calls.map(([options]) => options.html as HTMLElement).slice(-2);
    expect(pins.map((pin) => pin.querySelector('.map-pin-label')?.textContent)).toEqual([
      'Crossroads',
      'Old Gas Station',
    ]);
    const clicks = pinClicks.slice(-2);
    clicks[0]!();
    expect(pins[0]!.classList.contains('is-open')).toBe(true);
    clicks[1]!();
    expect(pins[0]!.classList.contains('is-open')).toBe(false);
    expect(pins[1]!.classList.contains('is-open')).toBe(true);
    // Only a click outside every pin closes the open name.
    const mapClick = mockMapInstance.on.mock.calls
      .filter(([event]) => event === 'click')
      .at(-1)?.[1] as (event: { originalEvent: { target: EventTarget } }) => void;
    mapClick({ originalEvent: { target: pins[1]!.firstElementChild! } });
    expect(pins[1]!.classList.contains('is-open')).toBe(true);
    mapClick({ originalEvent: { target: document.body } });
    expect(pins[1]!.classList.contains('is-open')).toBe(false);
    clicks[1]!();
    clicks[1]!();
    expect(pins[1]!.classList.contains('is-open')).toBe(false);
    const viewport = wrapper.get('[data-testid="map-viewport"]');
    expect(viewport.classes()).not.toContain('map-names-visible');
    // A resize that lowers the whole-map fit zoom makes the current view count as zoomed in.
    const onResize = mockMapInstance.on.mock.calls
      .filter(([event]) => event === 'resize')
      .at(-1)?.[1] as () => void;
    mapState.fitZoom = 3;
    onResize();
    await nextTick();
    expect(viewport.classes()).toContain('map-names-visible');
    mapState.fitZoom = 4;
    onResize();
    await nextTick();
    expect(viewport.classes()).not.toContain('map-names-visible');
    const row = await openLayersPanel(wrapper);
    expect(row('pmc').attributes('aria-pressed')).toBe('true');
    const names = wrapper.get('[data-testid="map-layers-always-names"]');
    expect(names.attributes('aria-checked')).toBe('false');
    await names.trigger('click');
    expect(names.attributes('aria-checked')).toBe('true');
    expect(viewport.classes()).toContain('map-names-visible');
    expect(localStorage.getItem('map_always_show_names')).toBe('true');
    wrapper.unmount();
  });
  it('redraws extract and transit arrows with accessible directions when the selected floor changes', async () => {
    const divIcon = vi.fn((options) => options);
    const marker = vi.fn(() => ({ on: vi.fn(), bindPopup: vi.fn().mockReturnThis() }));
    mapState.leaflet = { divIcon, marker };
    mapState.extractLayer = { clearLayers: vi.fn(), addLayer: vi.fn() };
    mapState.transitLayer = { clearLayers: vi.fn(), addLayer: vi.fn() };
    const map = {
      id: '653e6760052c01c1c805532f',
      name: 'Ground Zero',
      svg: maps.groundzero.svg,
      extracts: [
        {
          id: 'native',
          name: 'Emercom',
          faction: 'shared',
          position: { x: 151.63, y: 24.66, z: -97.46 },
        },
      ],
      transits: [
        {
          id: '1',
          description: 'Streets transit',
          map: 'streets',
          position: { x: 229.6, y: 16.99, z: 65.36 },
        },
      ],
    } as TarkovMap;
    const wrapper = await mountMap({ map });
    const vm = wrapper.vm as unknown as { setFloor: (floor: string) => void };
    const pins = () => divIcon.mock.calls.map(([options]) => options.html as HTMLElement);
    divIcon.mockClear();
    vm.setFloor('3rd Floor');
    await nextTick();
    expect(pins()).toHaveLength(2);
    for (const pin of pins()) {
      const badge = pin.querySelector<HTMLElement>('.map-elevation');
      expect(badge?.dataset.direction).toBe('down');
      expect(badge?.textContent).toBe('2');
      expect(pin.getAttribute('aria-label')).toMatch(/Go down 2 levels/);
      // Off-floor pins fade their head; the floor badge itself is not faded.
      expect(pin.classList).toContain('map-pin--off-floor');
      expect(pin.querySelector('.map-pin-head')?.classList).toContain('opacity-55');
      expect(badge?.className).not.toContain('opacity-55');
    }
    divIcon.mockClear();
    vm.setFloor('Garage');
    await nextTick();
    expect(pins()).toHaveLength(2);
    for (const pin of pins()) {
      const badge = pin.querySelector<HTMLElement>('.map-elevation');
      expect(badge?.dataset.direction).toBe('up');
      expect(badge?.textContent).toBe('');
    }
    divIcon.mockClear();
    vm.setFloor('Ground_Level');
    await nextTick();
    expect(pins()).toHaveLength(2);
    for (const pin of pins()) {
      expect(pin.querySelector('.map-elevation')).toBeNull();
      expect(pin.classList).not.toContain('map-pin--off-floor');
    }
    wrapper.unmount();
  });
  it('renders transit locations safely, toggles independently, and clears on map changes', async () => {
    const transitLayer = { clearLayers: vi.fn(), addLayer: vi.fn() };
    const marker = vi.fn(() => ({ on: vi.fn(), bindPopup: vi.fn().mockReturnThis() }));
    const divIcon = vi.fn((options) => options);
    mapState.transitLayer = transitLayer;
    mapState.leaflet = { marker, divIcon };
    const transit = {
      id: '9',
      description: 'Transit to <Reserve>',
      map: 'reserve',
      position: { x: 650.64, y: 1.59, z: 124.94 },
    };
    const transitMap: TarkovMap = {
      ...mapData,
      transits: [transit],
      spawns: [{ position: { x: 1, y: 0, z: 1 }, sides: ['pmc'], categories: ['player'] }],
      svg: {
        file: 'customs.svg',
        floors: ['ground'],
        defaultFloor: 'ground',
        coordinateRotation: 0,
        bounds: [
          [0, 0],
          [100, 100],
        ],
      },
    };
    const wrapper = await mountMap({
      map: transitMap,
      showPmcExtracts: true,
      showScavExtracts: true,
      showPmcSpawns: true,
    });
    // Exercise the real redraw watcher without depending on SVG load timing.
    await wrapper.setProps({ map: { ...transitMap } });
    const row = await openLayersPanel(wrapper);
    const toggle = row('transit');
    expect(toggle.attributes('aria-pressed')).toBe('true');
    expect(marker).toHaveBeenLastCalledWith([124.94, 650.64], expect.any(Object));
    const badge = divIcon.mock.calls.at(-1)?.[0].html as HTMLElement;
    expect(badge.textContent).toContain('Transit to <Reserve>');
    expect(badge.querySelector('reserve')).toBeNull();
    expect(transitLayer.addLayer).toHaveBeenCalled();
    const added = transitLayer.addLayer.mock.calls.length;
    transitLayer.clearLayers.mockClear();
    await toggle.trigger('click');
    expect(toggle.attributes('aria-pressed')).toBe('false');
    expect(transitLayer.clearLayers).toHaveBeenCalledOnce();
    expect(transitLayer.addLayer).toHaveBeenCalledTimes(added);
    // This map has no extracts, so only the spawn row sits beside Transit outside the task rows.
    expect(row('pmc').exists()).toBe(false);
    expect(row('spawns').attributes('aria-pressed')).toBe('true');
    await toggle.trigger('click');
    expect(transitLayer.addLayer.mock.calls.length).toBeGreaterThan(added);
    transitLayer.addLayer.mockClear();
    transitLayer.clearLayers.mockClear();
    await wrapper.setProps({ map: { ...transitMap, svg: undefined } });
    expect(transitLayer.clearLayers).toHaveBeenCalled();
    expect(transitLayer.addLayer).not.toHaveBeenCalled();
    await wrapper.setProps({
      map: {
        ...transitMap,
        svg: undefined,
        tile: {
          tilePath: '/tiles/{z}/{x}/{y}.png',
          coordinateRotation: 0,
          bounds: [
            [0, 0],
            [100, 100],
          ],
        },
      },
    });
    expect(transitLayer.addLayer).toHaveBeenCalled();
    transitLayer.clearLayers.mockClear();
    await wrapper.setProps({ map: { ...mapData, id: 'other', transits: [] } });
    expect(row('transit').exists()).toBe(false);
    expect(transitLayer.clearLayers).toHaveBeenCalled();
    wrapper.unmount();
  });
  it('uses the same theme-aware active foreground for the opened help control', async () => {
    const wrapper = await mountMap();
    await wrapper.find('[data-testid="map-hint-all-controls"]').trigger('click');
    expect(wrapper.get('[data-testid="map-help-toggle"]').classes()).toContain(
      'light:text-primary-900'
    );
    wrapper.unmount();
  });
  it('emits toggle-fullscreen from the fullscreen control', async () => {
    const wrapper = await mountMap();
    const toggle = wrapper.find('[data-testid="map-fullscreen-toggle"]');
    expect(toggle.exists()).toBe(true);
    await toggle.trigger('click');
    expect(wrapper.emitted('toggle-fullscreen')).toHaveLength(1);
    wrapper.unmount();
  });
  it('keeps fractional zoom by disabling zoom snapping for zoom controls', async () => {
    const wrapper = await mountMap();
    await wrapper.find('[data-testid="map-zoom-in"]').trigger('click');
    expect(mockMapInstance.zoomIn).toHaveBeenCalled();
    expect(mockMapInstance.zoomSnapDuringCall).toBe(0);
    expect(mockMapInstance.options.zoomSnap).toBe(1);
    mockMapInstance.zoomSnapDuringCall = undefined;
    await wrapper.find('[data-testid="map-zoom-out"]').trigger('click');
    expect(mockMapInstance.zoomOut).toHaveBeenCalled();
    expect(mockMapInstance.zoomSnapDuringCall).toBe(0);
    wrapper.unmount();
  });
  it('resets the view from the reset control', async () => {
    const wrapper = await mountMap();
    await wrapper.find('[data-testid="map-reset-view"]').trigger('click');
    expect(refreshViewSpy).toHaveBeenCalled();
    wrapper.unmount();
  });
  it('passes the initialFloor prop through to useLeafletMap', async () => {
    const wrapper = await mountMap({ initialFloor: '2nd Floor' });
    expect(useLeafletMapOptionsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ initialFloor: '2nd Floor' })
    );
    wrapper.unmount();
  });
  it('exposes the current floor and the floor setter', async () => {
    const wrapper = await mountMap();
    const vm = wrapper.vm as unknown as {
      getFloor: () => string;
      setFloor: (floor: string) => void;
    };
    expect(vm.getFloor()).toBe('');
    vm.setFloor('garage');
    expect(setFloorSpy).toHaveBeenCalledWith('garage');
    wrapper.unmount();
  });
  it('clears the help notification dot when help is opened from the first-use hint', async () => {
    const wrapper = await mountMap();
    const hint = wrapper.find('[data-testid="map-first-use-hint"]');
    expect(hint.exists()).toBe(true);
    const helpTrigger = wrapper.find('[data-testid="map-help-toggle"]');
    expect(helpTrigger.find('[data-testid="map-help-unseen-dot"]').exists()).toBe(true);
    await hint.find('[data-testid="map-hint-all-controls"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="map-first-use-hint"]').exists()).toBe(false);
    expect(
      wrapper
        .find('[data-testid="map-help-toggle"]')
        .find('[data-testid="map-help-unseen-dot"]')
        .exists()
    ).toBe(false);
    wrapper.unmount();
  });
  it('renders localized help rows with their keyboard shortcuts in message slots', async () => {
    mapState.hasMultipleFloors = true;
    const wrapper = await mountMap();
    expect(wrapper.findAll('kbd')).toHaveLength(9);
    expect(wrapper.text()).toMatch(/WASD\s*\/\s*←↑↓→\s+or drag to pan/);
    expect(wrapper.text()).toMatch(/Shift\s*Scroll\s*\/\s*Q\/E\s+to zoom/);
    expect(wrapper.text()).toMatch(/R\s+to reset view/);
    expect(wrapper.text()).toMatch(/Ctrl\s*Scroll\s+to cycle floors/);
    expect(wrapper.text()).toMatch(/F\s+to click at cursor/);
    const hint = wrapper.find('[data-testid="map-first-use-hint"]');
    expect(hint.exists()).toBe(true);
    expect(hint.text()).toMatch(/Ctrl \+ Scroll to change floors/);
    wrapper.unmount();
  });
  it('hides floor help and the floor shortcut from the hint on single-floor maps', async () => {
    const wrapper = await mountMap();
    expect(wrapper.findAll('kbd')).toHaveLength(7);
    expect(wrapper.text()).not.toContain('to cycle floors');
    expect(wrapper.text()).not.toContain('Or use the floor panel.');
    const hint = wrapper.find('[data-testid="map-first-use-hint"]');
    expect(hint.exists()).toBe(true);
    expect(hint.text()).toContain('Drag to pan · Shift + Scroll to zoom');
    expect(hint.text()).not.toContain('Ctrl');
    wrapper.unmount();
  });
  it('dismisses the first-use hint and remembers it', async () => {
    const wrapper = await mountMap();
    await wrapper.find('[data-testid="map-hint-dismiss"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="map-first-use-hint"]').exists()).toBe(false);
    expect(localStorage.getItem('mapControlsHintSeen')).toBe('true');
    wrapper.unmount();
  });
  it('persists the help seen flag so the dot stays hidden after remount', async () => {
    const wrapper = await mountMap();
    expect(wrapper.find('[data-testid="map-help-unseen-dot"]').exists()).toBe(true);
    await wrapper.find('[data-testid="map-hint-all-controls"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="map-help-unseen-dot"]').exists()).toBe(false);
    expect(localStorage.getItem('mapHelpSeen')).toBe('true');
    wrapper.unmount();
    const remounted = await mountMap();
    expect(remounted.find('[data-testid="map-help-unseen-dot"]').exists()).toBe(false);
    remounted.unmount();
  });
  it('hides the help dot on every mounted map instance when help opens in another one', async () => {
    const inlineMap = await mountMap();
    const fullscreenMap = await mountMap();
    expect(inlineMap.find('[data-testid="map-help-unseen-dot"]').exists()).toBe(true);
    expect(fullscreenMap.find('[data-testid="map-help-unseen-dot"]').exists()).toBe(true);
    await fullscreenMap.find('[data-testid="map-hint-all-controls"]').trigger('click');
    await nextTick();
    expect(fullscreenMap.find('[data-testid="map-help-unseen-dot"]').exists()).toBe(false);
    expect(inlineMap.find('[data-testid="map-help-unseen-dot"]').exists()).toBe(false);
    inlineMap.unmount();
    fullscreenMap.unmount();
  });
  it('exposes the current view state and skips a hidden container', async () => {
    const wrapper = await mountMap();
    const vm = wrapper.vm as unknown as {
      getViewState: () => { center: [number, number]; zoom: number } | null;
      setViewState: (state: { center: [number, number]; zoom: number }) => void;
    };
    expect(vm.getViewState()).toEqual({ center: [12.5, 34.5], zoom: 4.25 });
    mockMapInstance.size = { x: 0, y: 0 };
    expect(vm.getViewState()).toBeNull();
    wrapper.unmount();
  });
  it('restores a fractional zoom without snapping in setViewState', async () => {
    const wrapper = await mountMap();
    const vm = wrapper.vm as unknown as {
      setViewState: (state: { center: [number, number]; zoom: number }) => void;
    };
    vm.setViewState({ center: [1.5, 2.5], zoom: 6.4 });
    expect(mockMapInstance.setView).toHaveBeenCalledWith([1.5, 2.5], 6.4, { animate: false });
    expect(mockMapInstance.zoomSnapDuringCall).toBe(0);
    expect(mockMapInstance.options.zoomSnap).toBe(1);
    mockMapInstance.setView.mockClear();
    vm.setViewState({ center: [3.5, 4.5], zoom: mockMapInstance.zoom });
    expect(mockMapInstance.setView).not.toHaveBeenCalled();
    expect(mockMapInstance.panTo).toHaveBeenCalledWith([3.5, 4.5], { animate: false });
    wrapper.unmount();
  });
  it('stacks overlapping objectives, focuses after attach, and restores map focus on close', async () => {
    type FakeEvent = { containerPoint?: { x: number; y: number } };
    type FakeHandler = (event?: FakeEvent) => void;
    const createdLayers: Array<{
      handlers: Map<string, FakeHandler[]>;
      options: Record<string, unknown>;
      setStyle: ReturnType<typeof vi.fn>;
      getLatLng: () => { lat: number; lng: number };
      getRadius: () => number;
    }> = [];
    const createLayer = (options: Record<string, unknown> = {}) => {
      const handlers = new Map<string, FakeHandler[]>();
      const layer = {
        handlers,
        options,
        setStyle: vi.fn(),
        getLatLng: () => ({ lat: 0, lng: 0 }),
        getRadius: () => 8,
        getBounds: () => ({ getCenter: () => ({ lat: 0, lng: 0 }) }),
        on(name: string, handler: FakeHandler) {
          handlers.set(name, [...(handlers.get(name) ?? []), handler]);
          return layer;
        },
      };
      createdLayers.push(layer);
      return layer;
    };
    const createLayerGroup = () => ({ clearLayers: vi.fn(), addLayer: vi.fn() });
    const mapPane = document.createElement('div');
    mapPane.innerHTML = '<svg width="100" height="100"></svg>';
    mockMapInstance.getPane.mockReturnValue(mapPane);
    mockMapInstance.getContainer.mockReturnValue(mapPane);
    const popups: Array<{
      element: HTMLElement;
      isOpen: boolean;
      options: Record<string, unknown>;
      update: ReturnType<typeof vi.fn>;
      setContent: (content: HTMLElement) => void;
      setLatLng: ReturnType<typeof vi.fn>;
      getElement: () => HTMLElement;
      addTo: () => void;
      remove: () => void;
      on: (name: string, handler: FakeHandler) => void;
      once: (name: string, handler: FakeHandler) => void;
    }> = [];
    const createPopup = () => {
      const element = document.createElement('div');
      const handlers = new Map<string, FakeHandler[]>();
      const onceHandlers = new Map<string, FakeHandler[]>();
      const fire = (name: string) => {
        for (const handler of handlers.get(name) ?? []) handler();
        for (const handler of onceHandlers.get(name) ?? []) handler();
        onceHandlers.delete(name);
      };
      const popup = {
        element,
        isOpen: false,
        options: {} as Record<string, unknown>,
        update: vi.fn(),
        setContent(content: HTMLElement) {
          element.replaceChildren(content);
        },
        setLatLng: vi.fn(),
        getElement: () => element,
        addTo() {
          popup.isOpen = true;
          document.body.append(element);
          fire('add');
        },
        remove() {
          popup.isOpen = false;
          fire('remove');
          element.remove();
        },
        on(name: string, handler: FakeHandler) {
          handlers.set(name, [...(handlers.get(name) ?? []), handler]);
        },
        once(name: string, handler: FakeHandler) {
          onceHandlers.set(name, [...(onceHandlers.get(name) ?? []), handler]);
        },
      };
      popups.push(popup);
      return popup;
    };
    const circleMarker = vi.fn((_position: unknown, options: Record<string, unknown>) =>
      createLayer(options)
    );
    const objectiveLayer = createLayerGroup();
    const divIcon = vi.fn((options: { html: HTMLElement }) => options);
    const marker = vi.fn((_position: unknown, options: Record<string, unknown>) => ({ options }));
    mapState.leaflet = {
      circleMarker,
      divIcon,
      marker,
      polygon: (_positions: unknown, options: Record<string, unknown>) => createLayer(options),
      popup: createPopup,
      DomEvent: { stop: vi.fn() },
    };
    mapState.objectiveLayer = objectiveLayer;
    mapState.extractLayer = createLayerGroup();
    mapState.spawnLayer = createLayerGroup();
    mockMapInstance.hasLayer.mockImplementation((layer) => Boolean(layer?.isOpen));
    const marks = [
      {
        id: 'objective-a',
        type: 'plantItem',
        users: ['self'],
        zones: [
          {
            map: { id: 'customs' },
            outline: [
              { x: 0, z: 0 },
              { x: 20, z: 0 },
              { x: 0, z: 20 },
            ],
          },
        ],
        possibleLocations: [],
      },
      {
        id: 'objective-b',
        type: 'findQuestItem',
        users: ['self'],
        zones: [],
        possibleLocations: [{ map: { id: 'customs' }, positions: [{ x: 10, z: 10 }] }],
      },
    ];
    const wrapper = await mountMap({
      map: {
        ...mapData,
        svg: {
          file: 'customs.svg',
          floors: ['ground'],
          defaultFloor: 'ground',
          coordinateRotation: 0,
          bounds: [
            [0, 0],
            [100, 100],
          ],
        },
      },
      marks,
      showExtracts: false,
      showPmcSpawns: false,
    });
    await wrapper.setProps({ marks: [...marks] });
    await nextTick();
    expect(objectiveLayer.clearLayers).toHaveBeenCalled();
    expect(circleMarker).toHaveBeenCalled();
    // Each dot carries a pass-through glyph for its objective's action.
    const glyphs = divIcon.mock.calls.map(([options]) => options.html);
    expect(glyphs.map((glyph) => glyph.dataset.kind)).toEqual(['plant', 'find']);
    expect(glyphs.every((glyph) => glyph.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(marker.mock.calls.map(([, options]) => options.interactive)).toEqual([false, false]);
    expect(objectiveLayer.addLayer).toHaveBeenCalledWith(marker.mock.results[0]?.value);
    // The chip is the visible marker in the category color; the dot under it only takes input.
    expect(glyphs.map((glyph) => glyph.style.getPropertyValue('--chip-color'))).toEqual([
      '#111111',
      '#111111',
    ]);
    expect(circleMarker.mock.calls.map(([, options]) => options.fillOpacity)).toEqual([0, 0]);
    const zoneLayer = createdLayers[0]!;
    zoneLayer.handlers.get('mouseover')?.forEach((handler) => handler({}));
    expect(glyphs[0]!.classList).toContain('is-hovered');
    zoneLayer.handlers.get('mouseout')?.forEach((handler) => handler({}));
    expect(glyphs[0]!.classList).not.toContain('is-hovered');
    // The mocked map projects every point to one pixel, so this zone is far smaller than its
    // chip: its outline is hidden, and hovering its chip (the centre dot) shows it.
    expect(zoneLayer.setStyle).toHaveBeenLastCalledWith(
      expect.objectContaining({ opacity: 0, fillOpacity: 0 })
    );
    const zoneCentre = createdLayers[1]!;
    zoneCentre.handlers.get('mouseover')?.forEach((handler) => handler({}));
    expect(zoneLayer.setStyle).toHaveBeenLastCalledWith(
      expect.objectContaining({ opacity: 0.95, weight: 3 })
    );
    zoneCentre.handlers.get('mouseout')?.forEach((handler) => handler({}));
    expect(zoneLayer.setStyle).toHaveBeenLastCalledWith(
      expect.objectContaining({ opacity: 0, fillOpacity: 0 })
    );
    try {
      const firstMarker = createdLayers[0];
      expect(firstMarker).toBeDefined();
      firstMarker?.handlers.get('click')?.[0]?.({ containerPoint: { x: 59, y: 50 } });
      const popup = popups[0];
      expect(popup).toBeDefined();
      const objectiveButtons = popup?.element.querySelectorAll('ul button');
      expect(objectiveButtons).toHaveLength(2);
      expect(document.activeElement).toBe(objectiveButtons?.[0]);
      const closeButton = popup?.element.querySelector<HTMLButtonElement>('button');
      const mapSurface = wrapper.element as HTMLElement;
      expect(closeButton).toBeDefined();
      closeButton?.focus();
      closeButton?.click();
      expect(document.activeElement).toBe(mapSurface);
      firstMarker?.handlers.get('mouseover')?.[0]?.({ containerPoint: { x: 50, y: 50 } });
      firstMarker?.handlers.get('mouseout')?.[0]?.();
      await new Promise((resolve) => setTimeout(resolve, 120));
      const mapVm = wrapper.vm as unknown as {
        activateObjectivePopup: (objectiveId: string) => boolean;
      };
      expect(mapVm.activateObjectivePopup('objective-a')).toBe(true);
      expect(popups[1]?.element.textContent).toContain('Task A');
    } finally {
      wrapper.unmount();
      popups.forEach((popup) => popup.element.remove());
    }
  });
});
