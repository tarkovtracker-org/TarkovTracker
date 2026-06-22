import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, nextTick, ref, type Ref } from 'vue';
import { logger } from '@/utils/logger';
import { createDeferred } from '@/utils/test-helpers';
import type { TarkovMap } from '@/types/tarkov';
type UseLeafletMapFn = typeof import('@/composables/useLeafletMap').useLeafletMap;
const mockMapInstance = {
  on: vi.fn(),
  off: vi.fn(),
  remove: vi.fn(),
  fitBounds: vi.fn(),
  invalidateSize: vi.fn(),
  createPane: vi.fn(() => ({ style: {} })),
  options: { zoomDelta: 1, zoomSnap: 1 },
  dragging: { enable: vi.fn(), disable: vi.fn() },
  getZoom: vi.fn(() => 2),
  setZoomAround: vi.fn(),
  mouseEventToLatLng: vi.fn(),
  hasLayer: vi.fn(() => false),
  removeLayer: vi.fn(),
};
let lastSvgElement: SVGElement | null = null;
const createMockLayerGroup = () => {
  const layers: unknown[] = [];
  const layerGroup = {
    addLayer: vi.fn((layer) => {
      layers.push(layer);
      return layerGroup;
    }),
    addTo: vi.fn().mockReturnThis(),
    clearLayers: vi.fn(() => {
      layers.length = 0;
      return layerGroup;
    }),
    getLayers: vi.fn(() => layers),
  };
  return layerGroup;
};
const mockSvgOverlay = {
  addTo: vi.fn().mockReturnThis(),
  getElement: vi.fn(() => lastSvgElement),
};
const mockTileLayer = {
  addTo: vi.fn().mockReturnThis(),
  on: vi.fn().mockReturnThis(),
  off: vi.fn().mockReturnThis(),
  setUrl: vi.fn(),
};
vi.mock('leaflet', () => ({
  default: {
    map: vi.fn(() => mockMapInstance),
    layerGroup: vi.fn(() => createMockLayerGroup()),
    svgOverlay: vi.fn((svgElement: SVGElement) => {
      lastSvgElement = svgElement;
      return mockSvgOverlay;
    }),
    tileLayer: vi.fn(() => mockTileLayer),
    latLngBounds: vi.fn((sw, ne) => ({ sw, ne })),
    control: {
      zoom: vi.fn(() => ({ addTo: vi.fn() })),
    },
    Control: {
      Zoom: Object.assign(vi.fn(), {
        extend: vi.fn(() => {
          const Ctor = vi.fn();
          Ctor.prototype.addTo = vi.fn();
          return Ctor;
        }),
        prototype: {
          onAdd: vi.fn(() => document.createElement('div')),
        },
      }),
    },
    DomUtil: {
      create: vi.fn((_tag: string, _className: string, container?: HTMLElement) => {
        const el = document.createElement('a');
        if (container) container.appendChild(el);
        return el;
      }),
    },
    DomEvent: {
      disableClickPropagation: vi.fn(),
      on: vi.fn(),
      preventDefault: vi.fn(),
    },
    CRS: {
      Simple: {},
    },
  },
}));
vi.mock('@vueuse/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vueuse/core')>()),
  useDebounceFn: vi.fn((fn) => fn),
}));
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('@/utils/mapCoordinates', () => ({
  getLeafletBounds: vi.fn(() => [
    [0, 0],
    [100, 100],
  ]),
  getLeafletMapOptions: vi.fn((L) => ({
    crs: L.CRS.Simple,
    minZoom: 0,
    maxZoom: 5,
    zoomSnap: 0.5,
    zoomDelta: 0.5,
  })),
  getMapSvgCdnUrl: vi.fn((name, floor) => `https://cdn.example.com/${name}/${floor}.svg`),
  getMapSvgFallbackUrl: vi.fn((file) => `https://fallback.example.com/${file}`),
  getSvgOverlayBounds: vi.fn(() => [
    [0, 0],
    [100, 100],
  ]),
  isValidMapSvgConfig: vi.fn((config) => !!config?.file),
  isValidMapTileConfig: vi.fn((config) => !!config?.tilePath),
  normalizeTileConfig: vi.fn((config) => config),
}));
const waitFor = async (predicate: () => boolean, maxIterations = 10) => {
  for (let index = 0; index < maxIterations; index++) {
    if (predicate()) return;
    await vi.advanceTimersByTimeAsync(1000);
    await nextTick();
  }
  throw new Error(`Condition not met after ${maxIterations} iterations`);
};
let useLeafletMapForTest: UseLeafletMapFn;
let containerRefForTest: Ref<HTMLElement | null>;
const mountUseLeafletMap = async (
  mapValue: TarkovMap | null,
  initialFloor?: string
): Promise<{
  result: ReturnType<UseLeafletMapFn>;
  wrapper: ReturnType<typeof mount>;
  mapRef: Ref<TarkovMap | null>;
}> => {
  let result: ReturnType<UseLeafletMapFn> | null = null;
  let mapRef: Ref<TarkovMap | null> | null = null;
  const wrapper = mount(
    defineComponent({
      setup() {
        mapRef = ref(mapValue) as Ref<TarkovMap | null>;
        result = useLeafletMapForTest({
          containerRef: containerRefForTest,
          map: mapRef,
          initialFloor,
          enableIdleDetection: false,
        });
        return () => null;
      },
    })
  );
  await nextTick();
  await vi.advanceTimersByTimeAsync(1000);
  await nextTick();
  if (!result || !mapRef) {
    throw new Error('useLeafletMap did not initialize - result is null after mounting');
  }
  await waitFor(() => result?.objectiveLayer.value !== null);
  return { result, wrapper, mapRef };
};
describe('useLeafletMap', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    lastSvgElement = null;
    containerRefForTest = ref(document.createElement('div')) as Ref<HTMLElement | null>;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        text: async () => '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      }))
    );
    const module = await import('@/composables/useLeafletMap');
    useLeafletMapForTest = module.useLeafletMap;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  describe('initialization', () => {
    it('creates map instance with correct options on mount', async () => {
      const leafletModule = await import('leaflet');
      const mapSpy = vi.spyOn(leafletModule.default, 'map');
      const mapData = {
        id: 'customs',
        name: 'Customs',
        normalizedName: 'customs',
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
      } as TarkovMap;
      const { getLeafletMapOptions } = await import('@/utils/mapCoordinates');
      const { result, wrapper } = await mountUseLeafletMap(mapData);
      const svgConfig = mapData.svg;
      const expectedOptions = getLeafletMapOptions(
        leafletModule.default,
        typeof svgConfig === 'string' ? undefined : svgConfig
      );
      expect(mapSpy).toHaveBeenCalledWith(containerRefForTest.value, expectedOptions);
      expect(result.isLoading.value).toBe(false);
      expect(result.selectedFloor.value).toBe('ground');
      wrapper.unmount();
    });
    it('uses initialFloor override when provided', async () => {
      const mapData = {
        id: 'interchange',
        name: 'Interchange',
        normalizedName: 'interchange',
        svg: {
          file: 'interchange.svg',
          floors: ['parking', 'ground', 'second'],
          defaultFloor: 'ground',
          coordinateRotation: 0,
          bounds: [
            [0, 0],
            [100, 100],
          ],
        },
      } as TarkovMap;
      const { result, wrapper } = await mountUseLeafletMap(mapData, 'parking');
      expect(result.floors.value).toEqual(['parking', 'ground', 'second']);
      expect(result.selectedFloor.value).toBe('parking');
      wrapper.unmount();
    });
    it('ignores stale async init when map becomes unavailable before layer setup', async () => {
      const deferredFetch = createDeferred<{ ok: boolean; text: () => Promise<string> }>();
      const fetchSpy = vi.fn(() => deferredFetch.promise);
      vi.stubGlobal('fetch', fetchSpy);
      const mapData = {
        id: 'customs',
        name: 'Customs',
        normalizedName: 'customs',
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
      } as TarkovMap;
      const mountedState: {
        mapRef: Ref<TarkovMap | null> | null;
        result: ReturnType<UseLeafletMapFn> | null;
      } = {
        mapRef: null,
        result: null,
      };
      const wrapper = mount(
        defineComponent({
          setup() {
            mountedState.mapRef = ref(mapData) as Ref<TarkovMap | null>;
            mountedState.result = useLeafletMapForTest({
              containerRef: containerRefForTest,
              map: mountedState.mapRef,
              enableIdleDetection: false,
            });
            return () => null;
          },
        })
      );
      await waitFor(() => fetchSpy.mock.calls.length > 0);
      const mapRef = mountedState.mapRef;
      const result = mountedState.result;
      if (!mapRef || !result) {
        throw new Error('useLeafletMap did not initialize for stale init test');
      }
      mapRef.value = {
        ...mapData,
        unavailable: true,
      } as TarkovMap;
      await nextTick();
      deferredFetch.resolve({
        ok: true,
        text: async () => '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      });
      await vi.advanceTimersByTimeAsync(1000);
      await nextTick();
      expect(logger.error).not.toHaveBeenCalledWith(
        'Failed to initialize Leaflet map:',
        expect.anything()
      );
      expect(result.mapInstance.value).toBe(null);
      expect(result.leaflet.value).toBe(null);
      wrapper.unmount();
    });
    it('ignores stale async reload when render key changes again before fetch resolves', async () => {
      const mapWithSvg = (file: string): TarkovMap =>
        ({
          id: 'customs',
          name: 'Customs',
          normalizedName: 'customs',
          svg: {
            file,
            floors: ['ground'],
            defaultFloor: 'ground',
            coordinateRotation: 0,
            bounds: [
              [0, 0],
              [100, 100],
            ],
          },
        }) as TarkovMap;
      const deferredReload = createDeferred<{ ok: boolean; text: () => Promise<string> }>();
      let fetchCount = 0;
      const fetchSpy = vi.fn((_url: string, init?: RequestInit) => {
        fetchCount += 1;
        if (fetchCount === 1) {
          return Promise.resolve({
            ok: true,
            text: async () =>
              '<svg xmlns="http://www.w3.org/2000/svg"><g id="Ground_Level"></g></svg>',
          });
        }
        if (fetchCount === 2) {
          const signal = init?.signal;
          signal?.addEventListener('abort', () => {
            deferredReload.reject(new DOMException('Aborted', 'AbortError'));
          });
          return deferredReload.promise;
        }
        return Promise.resolve({
          ok: true,
          text: async () =>
            '<svg xmlns="http://www.w3.org/2000/svg"><g id="Ground_Level"></g></svg>',
        });
      });
      vi.stubGlobal('fetch', fetchSpy);
      const leafletModule = await import('leaflet');
      const svgOverlaySpy = vi.spyOn(leafletModule.default, 'svgOverlay');
      const { wrapper, mapRef } = await mountUseLeafletMap(mapWithSvg('customs-a.svg'));
      expect(svgOverlaySpy).toHaveBeenCalledTimes(1);
      mapRef.value = mapWithSvg('customs-b.svg');
      await nextTick();
      await waitFor(() => fetchSpy.mock.calls.length >= 2);
      mapRef.value = mapWithSvg('customs-c.svg');
      await nextTick();
      await waitFor(() => fetchSpy.mock.calls.length >= 3);
      await vi.advanceTimersByTimeAsync(1000);
      await nextTick();
      expect(svgOverlaySpy).toHaveBeenCalledTimes(2);
      wrapper.unmount();
    });
  });
  describe('floor management', () => {
    it('moves underground-style floors to the bottom of floor navigation', async () => {
      const mapData = {
        id: 'customs',
        name: 'Customs',
        normalizedName: 'customs',
        svg: {
          file: 'customs.svg',
          floors: [
            'Ground_Level',
            '2nd Floor',
            'Underground',
            'Garage',
            'Tunnels',
            'Bunkers',
            '3rd Floor',
          ],
          defaultFloor: 'Ground_Level',
          coordinateRotation: 0,
          bounds: [
            [0, 0],
            [100, 100],
          ],
        },
      } as TarkovMap;
      const { result, wrapper } = await mountUseLeafletMap(mapData);
      expect(result.floors.value).toEqual([
        'Underground',
        'Garage',
        'Tunnels',
        'Bunkers',
        'Ground_Level',
        '2nd Floor',
        '3rd Floor',
      ]);
      wrapper.unmount();
    });
    it('setFloor updates selectedFloor ref', async () => {
      const mapData = {
        id: 'reserve',
        name: 'Reserve',
        normalizedName: 'reserve',
        svg: {
          file: 'reserve.svg',
          floors: ['bunker', 'ground', 'roof'],
          defaultFloor: 'ground',
          coordinateRotation: 0,
          bounds: [
            [0, 0],
            [100, 100],
          ],
        },
      } as TarkovMap;
      const { result, wrapper } = await mountUseLeafletMap(mapData);
      result.setFloor('bunker');
      expect(result.selectedFloor.value).toBe('bunker');
      wrapper.unmount();
    });
    it('maps numbered floor buttons to distinct SVG floor groups', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          text: async () =>
            '<svg xmlns="http://www.w3.org/2000/svg"><g id="Ground_Level"></g><g id="First_Floor"></g><g id="Second_Floor"></g><g id="Third_Floor"></g></svg>',
        }))
      );
      const mapData = {
        id: 'customs',
        name: 'Customs',
        normalizedName: 'customs',
        svg: {
          file: 'customs.svg',
          floors: ['Ground_Level', '2nd Floor', '3rd Floor', '4th Floor'],
          defaultFloor: 'Ground_Level',
          coordinateRotation: 0,
          bounds: [
            [0, 0],
            [100, 100],
          ],
        },
      } as TarkovMap;
      const { result, wrapper } = await mountUseLeafletMap(mapData);
      const svgElement = mockSvgOverlay.getElement();
      if (!(svgElement instanceof SVGElement)) {
        throw new Error('Expected SVG element to be available after map load');
      }
      const firstFloorLayer = svgElement.querySelector('[id="First_Floor"]');
      const secondFloorLayer = svgElement.querySelector('[id="Second_Floor"]');
      const thirdFloorLayer = svgElement.querySelector('[id="Third_Floor"]');
      if (
        !(firstFloorLayer instanceof SVGElement) ||
        !(secondFloorLayer instanceof SVGElement) ||
        !(thirdFloorLayer instanceof SVGElement)
      ) {
        throw new Error('Expected ordinal floor groups were not found in SVG');
      }
      result.setFloor('2nd Floor');
      expect(firstFloorLayer.style.display).toBe('block');
      expect(secondFloorLayer.style.display).toBe('none');
      expect(thirdFloorLayer.style.display).toBe('none');
      result.setFloor('3rd Floor');
      expect(firstFloorLayer.style.display).toBe('block');
      expect(secondFloorLayer.style.display).toBe('block');
      expect(thirdFloorLayer.style.display).toBe('none');
      result.setFloor('4th Floor');
      expect(firstFloorLayer.style.display).toBe('block');
      expect(secondFloorLayer.style.display).toBe('block');
      expect(thirdFloorLayer.style.display).toBe('block');
      wrapper.unmount();
    });
    it('hides previously visible higher floors when switching to garage overlay', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          text: async () =>
            '<svg xmlns="http://www.w3.org/2000/svg"><g id="Ground_Level"></g><g id="Underground_Level"></g><g id="First_Floor"></g><g id="Second_Floor"></g><g id="Third_Floor"></g></svg>',
        }))
      );
      const mapData = {
        id: 'groundzero',
        name: 'Ground Zero',
        normalizedName: 'groundzero',
        svg: {
          file: 'groundzero.svg',
          floors: ['Ground_Level', '2nd Floor', '3rd Floor', 'Garage'],
          defaultFloor: 'Ground_Level',
          coordinateRotation: 0,
          bounds: [
            [0, 0],
            [100, 100],
          ],
        },
      } as TarkovMap;
      const { result, wrapper } = await mountUseLeafletMap(mapData);
      const svgElement = mockSvgOverlay.getElement();
      if (!(svgElement instanceof SVGElement)) {
        throw new Error('Expected SVG element to be available after map load');
      }
      const groundLayer = svgElement.querySelector('[id="Ground_Level"]');
      const undergroundLayer = svgElement.querySelector('[id="Underground_Level"]');
      const thirdFloorLayer = svgElement.querySelector('[id="Third_Floor"]');
      if (
        !(groundLayer instanceof SVGElement) ||
        !(undergroundLayer instanceof SVGElement) ||
        !(thirdFloorLayer instanceof SVGElement)
      ) {
        throw new Error('Expected floor groups were not found in SVG');
      }
      result.setFloor('3rd Floor');
      expect(thirdFloorLayer.style.display).toBe('block');
      result.setFloor('Garage');
      expect(undergroundLayer.style.display).toBe('block');
      expect(groundLayer.style.display).toBe('block');
      expect(thirdFloorLayer.style.display).toBe('none');
      wrapper.unmount();
    });
    it('renders underground floor above ground overlay and hides upper floors', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          text: async () =>
            '<svg xmlns="http://www.w3.org/2000/svg"><g id="Ground_Level"></g><g id="Upper_Floor"></g><g id="Underground"></g></svg>',
        }))
      );
      const mapData = {
        id: 'customs',
        name: 'Customs',
        normalizedName: 'customs',
        svg: {
          file: 'customs.svg',
          floors: ['Ground_Level', 'Upper_Floor', 'Underground'],
          defaultFloor: 'Ground_Level',
          coordinateRotation: 0,
          bounds: [
            [0, 0],
            [100, 100],
          ],
        },
      } as TarkovMap;
      const { result, wrapper } = await mountUseLeafletMap(mapData);
      result.setFloor('Underground');
      const svgElement = mockSvgOverlay.getElement();
      if (!(svgElement instanceof SVGElement)) {
        throw new Error('Expected SVG element to be available after map load');
      }
      const undergroundLayer = svgElement.querySelector('[id="Underground"]');
      const groundLayer = svgElement.querySelector('[id="Ground_Level"]');
      const secondFloorLayer = svgElement.querySelector('[id="Upper_Floor"]');
      if (
        !(undergroundLayer instanceof SVGElement) ||
        !(groundLayer instanceof SVGElement) ||
        !(secondFloorLayer instanceof SVGElement)
      ) {
        throw new Error('Expected floor groups were not found in SVG');
      }
      expect(undergroundLayer.style.display).toBe('block');
      expect(undergroundLayer.style.opacity).toBe('1');
      expect(groundLayer.style.display).toBe('block');
      expect(groundLayer.style.opacity).toBe('0.3');
      expect(secondFloorLayer.style.display).toBe('none');
      expect(svgElement.lastElementChild?.id).toBe('Underground');
      wrapper.unmount();
    });
    it('hasMultipleFloors returns true when floors > 1', async () => {
      const mapData = {
        id: 'labs',
        name: 'The Lab',
        normalizedName: 'labs',
        svg: {
          file: 'labs.svg',
          floors: ['basement', 'ground', 'second'],
          defaultFloor: 'ground',
          coordinateRotation: 0,
          bounds: [
            [0, 0],
            [100, 100],
          ],
        },
      } as TarkovMap;
      const { result, wrapper } = await mountUseLeafletMap(mapData);
      expect(result.hasMultipleFloors.value).toBe(true);
      wrapper.unmount();
    });
    it('availableFloors computed is reactive to map changes', async () => {
      const mapData = {
        id: 'factory',
        name: 'Factory',
        normalizedName: 'factory',
        svg: {
          file: 'factory.svg',
          floors: ['basement', 'ground'],
          defaultFloor: 'ground',
          coordinateRotation: 0,
          bounds: [
            [0, 0],
            [100, 100],
          ],
        },
      } as TarkovMap;
      const { result, wrapper, mapRef } = await mountUseLeafletMap(mapData);
      expect(result.floors.value).toEqual(['basement', 'ground']);
      const currentSvg = mapRef.value?.svg;
      const nextSvg =
        typeof currentSvg === 'string' || !currentSvg
          ? currentSvg
          : {
              ...currentSvg,
              floors: ['ground', 'upper'],
            };
      mapRef.value = {
        ...(mapRef.value as TarkovMap),
        svg: nextSvg,
      } as TarkovMap;
      await nextTick();
      expect(result.floors.value).toEqual(['ground', 'upper']);
      wrapper.unmount();
    });
    it('rebuilds the tile layer with the new floor path when switching floors', async () => {
      const leafletModule = await import('leaflet');
      const tileLayerSpy = vi.spyOn(leafletModule.default, 'tileLayer');
      const mapData = {
        id: 'lab',
        name: 'The Lab',
        normalizedName: 'lab',
        tile: {
          tilePath: 'https://tiles.example.com/lab/1st/{z}/{x}/{y}.png',
          floorTilePaths: {
            First_Level: 'https://tiles.example.com/lab/1st/{z}/{x}/{y}.png',
            Second_Level: 'https://tiles.example.com/lab/2nd/{z}/{x}/{y}.png',
          },
          floors: ['First_Level', 'Second_Level'],
          defaultFloor: 'First_Level',
          coordinateRotation: 0,
          bounds: [
            [0, 0],
            [100, 100],
          ],
        },
      } as unknown as TarkovMap;
      const { result, wrapper } = await mountUseLeafletMap(mapData);
      tileLayerSpy.mockClear();
      result.setFloor('Second_Level');
      await nextTick();
      await vi.advanceTimersByTimeAsync(1000);
      await nextTick();
      expect(result.selectedFloor.value).toBe('Second_Level');
      expect(tileLayerSpy).toHaveBeenCalledWith(
        'https://tiles.example.com/lab/2nd/{z}/{x}/{y}.png',
        expect.any(Object)
      );
      wrapper.unmount();
    });
  });
  describe('marker management', () => {
    it('clearMarkers removes all layers', async () => {
      const mapData = {
        id: 'customs',
        name: 'Customs',
        normalizedName: 'customs',
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
      } as TarkovMap;
      const { result, wrapper } = await mountUseLeafletMap(mapData);
      const objectiveLayer = result.objectiveLayer.value;
      const extractLayer = result.extractLayer.value;
      const spawnLayer = result.spawnLayer.value;
      const leaflet = result.leaflet.value;
      if (!objectiveLayer || !extractLayer || !spawnLayer || !leaflet) {
        throw new Error('Marker layers or Leaflet were not initialized');
      }
      objectiveLayer.addLayer(leaflet.layerGroup());
      extractLayer.addLayer(leaflet.layerGroup());
      spawnLayer.addLayer(leaflet.layerGroup());
      expect(objectiveLayer.getLayers()).toHaveLength(1);
      expect(extractLayer.getLayers()).toHaveLength(1);
      expect(spawnLayer.getLayers()).toHaveLength(1);
      result.clearMarkers();
      expect(objectiveLayer.getLayers()).toHaveLength(0);
      expect(extractLayer.getLayers()).toHaveLength(0);
      expect(spawnLayer.getLayers()).toHaveLength(0);
      wrapper.unmount();
    });
  });
  describe('cleanup', () => {
    it('destroy removes map instance', async () => {
      const mapData = {
        id: 'woods',
        name: 'Woods',
        normalizedName: 'woods',
        svg: {
          file: 'woods.svg',
          floors: ['ground'],
          defaultFloor: 'ground',
          coordinateRotation: 0,
          bounds: [
            [0, 0],
            [100, 100],
          ],
        },
      } as TarkovMap;
      const { result, wrapper } = await mountUseLeafletMap(mapData);
      result.destroy();
      expect(result.mapInstance.value).toBe(null);
      expect(result.svgLayer.value).toBe(null);
      expect(result.objectiveLayer.value).toBe(null);
      expect(result.extractLayer.value).toBe(null);
      expect(result.spawnLayer.value).toBe(null);
      expect(result.leaflet.value).toBe(null);
      wrapper.unmount();
    });
    it('destroy cancels in-flight reload and prevents stale layer mutation', async () => {
      const mapWithSvg = (file: string): TarkovMap =>
        ({
          id: 'customs',
          name: 'Customs',
          normalizedName: 'customs',
          svg: {
            file,
            floors: ['ground'],
            defaultFloor: 'ground',
            coordinateRotation: 0,
            bounds: [
              [0, 0],
              [100, 100],
            ],
          },
        }) as TarkovMap;
      const deferredReload = createDeferred<{ ok: boolean; text: () => Promise<string> }>();
      let fetchCount = 0;
      const fetchSpy = vi.fn((_url: string, init?: RequestInit) => {
        fetchCount += 1;
        if (fetchCount === 1) {
          return Promise.resolve({
            ok: true,
            text: async () =>
              '<svg xmlns="http://www.w3.org/2000/svg"><g id="Ground_Level"></g></svg>',
          });
        }
        const signal = init?.signal;
        signal?.addEventListener('abort', () => {
          deferredReload.reject(new DOMException('Aborted', 'AbortError'));
        });
        return deferredReload.promise;
      });
      vi.stubGlobal('fetch', fetchSpy);
      const leafletModule = await import('leaflet');
      const svgOverlaySpy = vi.spyOn(leafletModule.default, 'svgOverlay');
      const { result, wrapper, mapRef } = await mountUseLeafletMap(mapWithSvg('customs-a.svg'));
      expect(svgOverlaySpy).toHaveBeenCalledTimes(1);
      mapRef.value = mapWithSvg('customs-b.svg');
      await nextTick();
      await waitFor(() => fetchSpy.mock.calls.length >= 2);
      result.destroy();
      await vi.advanceTimersByTimeAsync(1000);
      await nextTick();
      expect(svgOverlaySpy).toHaveBeenCalledTimes(1);
      expect(result.mapInstance.value).toBe(null);
      wrapper.unmount();
    });
  });
});
