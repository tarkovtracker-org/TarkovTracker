import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLeafletMapOptions, type MapRenderConfig } from '@/utils/mapCoordinates';
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
describe('LeafletMap utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  describe('map configuration validation', () => {
    it('isValidMapSvgConfig returns true for valid SVG config', async () => {
      const { isValidMapSvgConfig } = await import('@/utils/mapCoordinates');
      const validConfig = {
        file: 'customs.svg',
        floors: ['ground'],
        defaultFloor: 'ground',
        coordinateRotation: 0,
        bounds: [
          [0, 0],
          [100, 100],
        ],
      };
      expect(isValidMapSvgConfig(validConfig)).toBe(true);
    });
    it('isValidMapSvgConfig returns false for invalid SVG config', async () => {
      const { isValidMapSvgConfig } = await import('@/utils/mapCoordinates');
      expect(isValidMapSvgConfig(null)).toBe(false);
      expect(isValidMapSvgConfig(undefined)).toBe(false);
      expect(isValidMapSvgConfig({})).toBe(false);
    });
    it('isValidMapTileConfig returns true for valid tile config', async () => {
      const { isValidMapTileConfig } = await import('@/utils/mapCoordinates');
      const validConfig = {
        tilePath: 'https://tiles.example.com/{z}/{x}/{y}.png',
        coordinateRotation: 0,
        bounds: [
          [0, 0],
          [100, 100],
        ],
        minZoom: 1,
        maxZoom: 6,
      };
      expect(isValidMapTileConfig(validConfig)).toBe(true);
    });
  });
  describe('leaflet map options', () => {
    it('getLeafletMapOptions returns map configuration', () => {
      const mockL = { CRS: { Simple: {} } } as unknown as typeof import('leaflet');
      const options = getLeafletMapOptions(mockL);
      expect(options).toHaveProperty('crs');
      expect(options).toHaveProperty('minZoom');
      expect(options).toHaveProperty('maxZoom');
    });
    it('getLeafletMapOptions uses custom CRS helpers when render config is provided', () => {
      const extendSpy = vi.fn(
        (
          target: Record<string, unknown>,
          ...sources: Array<Record<string, unknown>>
        ): Record<string, unknown> => {
          return Object.assign(target, ...sources);
        }
      );
      const transformationSpy = vi.fn(function (a: number, b: number, c: number, d: number) {
        return { a, b, c, d };
      });
      const projectSpy = vi.fn((latLng: { lat: number; lng: number }) => ({
        x: latLng.lng,
        y: latLng.lat,
      }));
      const unprojectSpy = vi.fn((point: { x: number; y: number }) => ({
        lat: point.y,
        lng: point.x,
      }));
      const latLngSpy = vi.fn((lat: number, lng: number) => ({ lat, lng }));
      const mockL = {
        CRS: { Simple: { simple: true } },
        Util: { extend: extendSpy },
        Transformation: transformationSpy,
        Projection: { LonLat: { project: projectSpy, unproject: unprojectSpy } },
        latLng: latLngSpy,
      } as unknown as typeof import('leaflet');
      const config: MapRenderConfig = {
        tilePath: 'https://tiles.example.com/{z}/{x}/{y}.png',
        coordinateRotation: 15,
        transform: [1.5, 10, 2, -20],
        bounds: [
          [0, 0],
          [100, 100],
        ],
        minZoom: 2,
        maxZoom: 8,
      };
      const options = getLeafletMapOptions(mockL, config);
      expect(options).toHaveProperty('crs');
      expect(options.minZoom).toBe(2);
      expect(options.maxZoom).toBe(8);
      expect(extendSpy).toHaveBeenCalled();
      expect(transformationSpy).toHaveBeenCalledWith(1.5, 10, -2, -20);
      const projection = options.crs as unknown as {
        projection: {
          project: (latLng: { lat: number; lng: number }) => unknown;
          unproject: (point: { x: number; y: number }) => unknown;
        };
      };
      projection.projection.project({ lat: 40, lng: 20 });
      projection.projection.unproject({ x: 15, y: 30 });
      expect(projectSpy).toHaveBeenCalled();
      expect(unprojectSpy).toHaveBeenCalled();
      expect(latLngSpy).toHaveBeenCalledTimes(2);
    });
    it('getLeafletBounds returns bounds array', async () => {
      const { getLeafletBounds } = await import('@/utils/mapCoordinates');
      const bounds = getLeafletBounds();
      expect(Array.isArray(bounds)).toBe(true);
      expect(bounds.length).toBe(2);
      expect(Array.isArray(bounds[0])).toBe(true);
      expect(bounds[0].length).toBe(2);
      expect(typeof bounds[0][0]).toBe('number');
      expect(typeof bounds[0][1]).toBe('number');
      expect(Array.isArray(bounds[1])).toBe(true);
      expect(bounds[1].length).toBe(2);
      expect(typeof bounds[1][0]).toBe('number');
      expect(typeof bounds[1][1]).toBe('number');
    });
  });
  describe('leaflet layer group operations', () => {
    it('clearLayers removes all layers from group', async () => {
      const leafletModule = await import('leaflet');
      const L = leafletModule.default || leafletModule;
      const container = document.createElement('div');
      container.style.width = '800px';
      container.style.height = '600px';
      document.body.appendChild(container);
      const map = L.map(container, { crs: L.CRS.Simple });
      const layerGroup = L.layerGroup().addTo(map);
      const childLayer = L.layerGroup();
      layerGroup.addLayer(childLayer);
      expect(layerGroup.getLayers().length).toBe(1);
      layerGroup.clearLayers();
      expect(layerGroup.getLayers().length).toBe(0);
      map.remove();
      container.remove();
    });
    it('addTo adds layer group to map', async () => {
      const leafletModule = await import('leaflet');
      const L = leafletModule.default || leafletModule;
      const container = document.createElement('div');
      container.style.width = '800px';
      container.style.height = '600px';
      document.body.appendChild(container);
      const map = L.map(container, { crs: L.CRS.Simple });
      const layerGroup = L.layerGroup();
      layerGroup.addTo(map);
      expect(map.hasLayer(layerGroup)).toBe(true);
      map.remove();
      container.remove();
    });
  });
});
