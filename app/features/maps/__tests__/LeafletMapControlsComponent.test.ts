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
    hasLayer: vi.fn(() => false),
    getPane: vi.fn(() => document.createElement('div')),
    getContainer: vi.fn(() => document.createElement('div')),
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
    mapState: { hasMultipleFloors: false, isLoading: false },
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
      leaflet: shallowRef(null),
      selectedFloor: ref(''),
      floors: ref([]),
      hasMultipleFloors: ref(mapState.hasMultipleFloors),
      isLoading: ref(mapState.isLoading),
      isIdle: ref(false),
      svgLayer: shallowRef(null),
      objectiveLayer: shallowRef(null),
      extractLayer: shallowRef(null),
      spawnLayer: shallowRef(null),
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
});
