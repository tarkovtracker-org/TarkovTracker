import { describe, expect, it } from 'vitest';
import { isTokenPermission, parseTokenPermissions, TOKEN_PERMISSIONS } from './permissions.ts';
describe('isTokenPermission', () => {
  it('accepts only the supported permission values', () => {
    for (const permission of TOKEN_PERMISSIONS) {
      expect(isTokenPermission(permission)).toBe(true);
    }
  });
  it('rejects unknown and non-string values', () => {
    expect(isTokenPermission('XX')).toBe(false);
    expect(isTokenPermission('gp')).toBe(false);
    expect(isTokenPermission('')).toBe(false);
    expect(isTokenPermission(123)).toBe(false);
    expect(isTokenPermission(null)).toBe(false);
    expect(isTokenPermission(undefined)).toBe(false);
  });
});
describe('parseTokenPermissions', () => {
  it('accepts non-empty arrays of supported permissions', () => {
    expect(parseTokenPermissions(['GP'])).toEqual(['GP']);
    expect(parseTokenPermissions(['WP', 'GP'])).toEqual(['WP', 'GP']);
    expect(parseTokenPermissions([...TOKEN_PERMISSIONS])).toEqual(['GP', 'TP', 'WP']);
  });
  it('rejects permission-like strings instead of coercing them', () => {
    expect(parseTokenPermissions('GP')).toBeNull();
    expect(parseTokenPermissions('GP,TP')).toBeNull();
    expect(parseTokenPermissions('')).toBeNull();
  });
  it('rejects non-array and missing values', () => {
    expect(parseTokenPermissions(undefined)).toBeNull();
    expect(parseTokenPermissions(null)).toBeNull();
    expect(parseTokenPermissions({ 0: 'GP', length: 1 })).toBeNull();
  });
  it('rejects empty arrays', () => {
    expect(parseTokenPermissions([])).toBeNull();
  });
  it('rejects mixed arrays containing unsupported values', () => {
    expect(parseTokenPermissions(['GP', 'XX'])).toBeNull();
    expect(parseTokenPermissions(['XX', 'GP'])).toBeNull();
    expect(parseTokenPermissions(['GP', 123])).toBeNull();
    expect(parseTokenPermissions(['GP', null])).toBeNull();
  });
  it('rejects arrays containing only unknown permissions', () => {
    expect(parseTokenPermissions(['XX'])).toBeNull();
    expect(parseTokenPermissions(['gp'])).toBeNull();
  });
});
