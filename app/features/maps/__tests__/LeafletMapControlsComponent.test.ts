import { mountSuspended } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TarkovMap } from '@/types/tarkov';
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
      objectiveLayer: null as unknown,
      extractLayer: null as unknown,
      spawnLayer: null as unknown,
    },
  };
});
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
    return {
      mapInstance: shallowRef(mockMapInstance),
      leaflet: shallowRef(mapState.leaflet),
      selectedFloor: ref(''),
      floors: ref([]),
      hasMultipleFloors: ref(mapState.hasMultipleFloors),
      isLoading: ref(mapState.isLoading),
      isIdle: ref(false),
      svgLayer: shallowRef(null),
      objectiveLayer: shallowRef(mapState.objectiveLayer),
      extractLayer: shallowRef(mapState.extractLayer),
      spawnLayer: shallowRef(mapState.spawnLayer),
      setFloor: setFloorSpy,
      refreshView: refreshViewSpy,
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
    },
    getMapTooltipDensity: 'comfortable',
    getMapShowSelfObjectives: true,
    getMapShowPinnedObjectives: false,
    getMapShowTeamObjectives: false,
    getMapZoneOpacity: 0.3,
    getMapZoomSpeed: 1,
    mapPanSpeed: 1,
    setMapMarkerColor: vi.fn(),
    setMapPanSpeed: vi.fn(),
    setMapTooltipDensity: vi.fn(),
    setMapZoneOpacity: vi.fn(),
    setMapZoomSpeed: vi.fn(),
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
    localStorage.clear();
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
  it('keeps enabled extract labels readable on the light toolbar and updates when toggled', async () => {
    const wrapper = await mountMap({ showPmcExtracts: true });
    const toggle = wrapper.findAll('button').find((button) => button.text() === 'PMC')!;
    expect(toggle.attributes('aria-pressed')).toBe('true');
    expect(toggle.classes()).toContain('text-primary-100');
    expect(toggle.classes()).toContain('light:text-primary-900');
    await toggle.trigger('click');
    expect(toggle.attributes('aria-pressed')).toBe('false');
    expect(toggle.classes()).not.toContain('light:text-primary-900');
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
    mapState.leaflet = {
      circleMarker,
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
