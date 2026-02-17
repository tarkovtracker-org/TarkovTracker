import { describe, expect, it } from 'vitest';
import {
  applyRotation,
  getLeafletBounds,
  getSvgOverlayBounds,
  getMapSvgCdnUrl,
  getMapSvgFallbackUrl,
  isValidMapSvgConfig,
  rotateGameCoordinates,
} from '@/utils/mapCoordinates';
describe('mapCoordinates', () => {
  describe('rotateGameCoordinates', () => {
    it('normalizes negative rotations', () => {
      expect(rotateGameCoordinates(10, 20, -90)).toEqual({ x: 20, z: -10 });
    });
    it('normalizes rotations greater than 360', () => {
      expect(rotateGameCoordinates(10, 20, 450)).toEqual({ x: -20, z: 10 });
    });
    it('returns original coordinates for non-right-angle rotations', () => {
      expect(rotateGameCoordinates(10, 20, 405)).toEqual({ x: 10, z: 20 });
    });
  });
  it('rotates coordinates when rotation is applied', () => {
    // Matches tarkov.dev formula: treats (lng, lat) as (x, y)
    // At 90°: lat = x*sin(90) + y*cos(90) = 0*1 + 10*0 = 0
    //         lng = x*cos(90) - y*sin(90) = 0*0 - 10*1 = -10
    const rotated = applyRotation({ lat: 10, lng: 0 }, 90);
    expect(rotated.lat).toBeCloseTo(0, 4);
    expect(rotated.lng).toBeCloseTo(-10, 4);
  });
  describe('getLeafletBounds', () => {
    // Note: getLeafletBounds transforms bounds coordinates from [x, z] input format
    // to [z, x] (i.e., [lat, lng]) output format for Leaflet compatibility
    it('transforms bounds coordinates from [x, z] to [z, x] for Leaflet', () => {
      const bounds = getLeafletBounds({
        file: 'customs.svg',
        floors: ['Ground'],
        defaultFloor: 'Ground',
        coordinateRotation: 0,
        bounds: [
          [10, 20],
          [30, 40],
        ],
      });
      // Input: bounds[0]=[10,20] (x=10, z=20), bounds[1]=[30,40] (x=30, z=40)
      // Output: [[z1, x1], [z2, x2]] = [[20, 10], [40, 30]]
      expect(bounds).toEqual([
        [20, 10],
        [40, 30],
      ]);
    });
    it('returns default bounds when config is undefined', () => {
      const bounds = getLeafletBounds(undefined);
      expect(bounds).toEqual([
        [0, 0],
        [100, 100],
      ]);
    });
    it('returns default bounds when bounds array is missing', () => {
      const bounds = getLeafletBounds({
        file: 'customs.svg',
        floors: ['Ground'],
        defaultFloor: 'Ground',
        coordinateRotation: 0,
        bounds: [],
      });
      expect(bounds).toEqual([
        [0, 0],
        [100, 100],
      ]);
    });
    it('returns default bounds when bounds has insufficient elements', () => {
      const bounds = getLeafletBounds({
        file: 'customs.svg',
        floors: ['Ground'],
        defaultFloor: 'Ground',
        coordinateRotation: 0,
        bounds: [[10, 20]],
      });
      expect(bounds).toEqual([
        [0, 0],
        [100, 100],
      ]);
    });
  });
  describe('getSvgOverlayBounds', () => {
    it('uses svgBounds when available', () => {
      const bounds = getSvgOverlayBounds({
        file: 'reserve.svg',
        floors: ['Ground'],
        defaultFloor: 'Ground',
        coordinateRotation: 0,
        bounds: [
          [0, 0],
          [100, 100],
        ],
        svgBounds: [
          [5, 10],
          [20, 30],
        ],
      });
      // svgBounds takes precedence: [[10, 5], [30, 20]]
      expect(bounds).toEqual([
        [10, 5],
        [30, 20],
      ]);
    });
    it('falls back to bounds when svgBounds is not provided', () => {
      const bounds = getSvgOverlayBounds({
        file: 'customs.svg',
        floors: ['Ground'],
        defaultFloor: 'Ground',
        coordinateRotation: 0,
        bounds: [
          [10, 20],
          [30, 40],
        ],
      });
      // Uses regular bounds with coordinate swap
      expect(bounds).toEqual([
        [20, 10],
        [40, 30],
      ]);
    });
    it('returns default bounds when config is undefined', () => {
      const bounds = getSvgOverlayBounds(undefined);
      expect(bounds).toEqual([
        [0, 0],
        [100, 100],
      ]);
    });
  });
  describe('isValidMapSvgConfig', () => {
    const validConfig = {
      file: 'factory.svg',
      floors: ['Basement'],
      defaultFloor: 'Basement',
      coordinateRotation: 0,
      bounds: [
        [0, 0],
        [100, 100],
      ],
    };
    it('returns true for valid config', () => {
      expect(isValidMapSvgConfig(validConfig)).toBe(true);
    });
    it('returns false when file is missing', () => {
      const { file: _, ...withoutFile } = validConfig;
      expect(isValidMapSvgConfig(withoutFile)).toBe(false);
    });
    it('returns false when floors is missing', () => {
      const { floors: _, ...withoutFloors } = validConfig;
      expect(isValidMapSvgConfig(withoutFloors)).toBe(false);
    });
    it('returns false when defaultFloor is missing', () => {
      const { defaultFloor: _, ...withoutDefaultFloor } = validConfig;
      expect(isValidMapSvgConfig(withoutDefaultFloor)).toBe(false);
    });
    it('returns false when coordinateRotation is missing', () => {
      const { coordinateRotation: _, ...withoutRotation } = validConfig;
      expect(isValidMapSvgConfig(withoutRotation)).toBe(false);
    });
    it('returns false when bounds is missing', () => {
      const { bounds: _, ...withoutBounds } = validConfig;
      expect(isValidMapSvgConfig(withoutBounds)).toBe(false);
    });
    it('returns false when file is not a string', () => {
      expect(isValidMapSvgConfig({ ...validConfig, file: 123 })).toBe(false);
      expect(isValidMapSvgConfig({ ...validConfig, file: null })).toBe(false);
    });
    it('returns false when floors is not an array', () => {
      expect(isValidMapSvgConfig({ ...validConfig, floors: 'Basement' })).toBe(false);
      expect(isValidMapSvgConfig({ ...validConfig, floors: null })).toBe(false);
    });
    it('returns false when defaultFloor is not a string', () => {
      expect(isValidMapSvgConfig({ ...validConfig, defaultFloor: 0 })).toBe(false);
    });
    it('returns false when coordinateRotation is not a number', () => {
      expect(isValidMapSvgConfig({ ...validConfig, coordinateRotation: '90' })).toBe(false);
      expect(isValidMapSvgConfig({ ...validConfig, coordinateRotation: null })).toBe(false);
    });
    it('returns false when bounds is not an array', () => {
      expect(isValidMapSvgConfig({ ...validConfig, bounds: {} })).toBe(false);
    });
    it('returns false when bounds has fewer than 2 elements', () => {
      expect(isValidMapSvgConfig({ ...validConfig, bounds: [[0, 0]] })).toBe(false);
      expect(isValidMapSvgConfig({ ...validConfig, bounds: [] })).toBe(false);
    });
    it('returns false for null or non-object input', () => {
      expect(isValidMapSvgConfig(null)).toBe(false);
      expect(isValidMapSvgConfig(undefined)).toBe(false);
      expect(isValidMapSvgConfig('string')).toBe(false);
      expect(isValidMapSvgConfig(123)).toBe(false);
    });
    it('returns false with empty floors array', () => {
      // Validation requires at least one floor in the floors array
      expect(isValidMapSvgConfig({ ...validConfig, floors: [] })).toBe(false);
    });
    it('returns true with various rotation values', () => {
      expect(isValidMapSvgConfig({ ...validConfig, coordinateRotation: 90 })).toBe(true);
      expect(isValidMapSvgConfig({ ...validConfig, coordinateRotation: -45 })).toBe(true);
      expect(isValidMapSvgConfig({ ...validConfig, coordinateRotation: 360 })).toBe(true);
      expect(isValidMapSvgConfig({ ...validConfig, coordinateRotation: 0 })).toBe(true);
    });
  });
  describe('getMapSvgCdnUrl', () => {
    it('builds correct CDN URL for simple names', () => {
      expect(getMapSvgCdnUrl('Customs', 'Ground')).toBe(
        'https://assets.tarkov.dev/maps/svg/Customs-Ground.svg'
      );
    });
    it('builds correct CDN URL for Factory', () => {
      expect(getMapSvgCdnUrl('Factory', 'Basement')).toBe(
        'https://assets.tarkov.dev/maps/svg/Factory-Basement.svg'
      );
    });
    it('handles map names with spaces', () => {
      // Note: Current implementation does not encode - caller should handle encoding if needed
      expect(getMapSvgCdnUrl('Customs East', 'Ground Level')).toBe(
        'https://assets.tarkov.dev/maps/svg/Customs East-Ground Level.svg'
      );
    });
    it('handles empty strings', () => {
      expect(getMapSvgCdnUrl('', '')).toBe('https://assets.tarkov.dev/maps/svg/-.svg');
    });
  });
  describe('getMapSvgFallbackUrl', () => {
    it('builds correct fallback URL', () => {
      expect(getMapSvgFallbackUrl('customs.svg')).toBe(
        'https://tarkovtracker.github.io/tarkovdata/maps/customs.svg'
      );
    });
    it('handles filenames with spaces by URL-encoding them', () => {
      expect(getMapSvgFallbackUrl('customs east.svg')).toBe(
        'https://tarkovtracker.github.io/tarkovdata/maps/customs%20east.svg'
      );
    });
    it('handles empty string', () => {
      expect(getMapSvgFallbackUrl('')).toBe('https://tarkovtracker.github.io/tarkovdata/maps/');
    });
    it('encodes already-encoded filenames (double encoding per contract)', () => {
      // Per the new contract, filename is always encoded, so pre-encoded input gets encoded again
      const preEncoded = 'customs%20east.svg';
      expect(getMapSvgFallbackUrl(preEncoded)).toBe(
        'https://tarkovtracker.github.io/tarkovdata/maps/customs%2520east.svg'
      );
    });
  });
});
