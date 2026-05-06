import { describe, expect, it } from 'vitest';
import { isFetchError, isFetchSuccess } from '@/stores/tarkov/fetchResponse';
describe('fetchResponse', () => {
  describe('isFetchError', () => {
    it('returns true for object with string error', () => {
      expect(isFetchError({ error: 'something failed' })).toBe(true);
    });
    it('returns true for object with object error', () => {
      expect(isFetchError({ error: { code: 500, message: 'internal' } })).toBe(true);
    });
    it('returns false for null', () => {
      expect(isFetchError(null)).toBe(false);
    });
    it('returns false for undefined', () => {
      expect(isFetchError(undefined)).toBe(false);
    });
    it('returns false for array', () => {
      expect(isFetchError([{ error: 'nope' }])).toBe(false);
    });
    it('returns false for object without error key', () => {
      expect(isFetchError({ data: 'hello' })).toBe(false);
    });
    it('returns false when error is null', () => {
      expect(isFetchError({ error: null })).toBe(false);
    });
    it('returns false when error is an array', () => {
      expect(isFetchError({ error: ['a', 'b'] })).toBe(false);
    });
    it('returns false for primitive values', () => {
      expect(isFetchError(42)).toBe(false);
      expect(isFetchError('string')).toBe(false);
      expect(isFetchError(true)).toBe(false);
    });
  });
  describe('isFetchSuccess', () => {
    it('returns true for object with data key and no error', () => {
      expect(isFetchSuccess({ data: { items: [] } })).toBe(true);
    });
    it('returns true for object with null data', () => {
      expect(isFetchSuccess({ data: null })).toBe(true);
    });
    it('returns false when error key is present', () => {
      expect(isFetchSuccess({ data: {}, error: 'something' })).toBe(false);
    });
    it('returns false for object without data key', () => {
      expect(isFetchSuccess({ result: 'value' })).toBe(false);
    });
    it('returns false for null', () => {
      expect(isFetchSuccess(null)).toBe(false);
    });
    it('returns false for undefined', () => {
      expect(isFetchSuccess(undefined)).toBe(false);
    });
    it('returns false for array', () => {
      expect(isFetchSuccess([{ data: 'nope' }])).toBe(false);
    });
    it('returns false for primitive values', () => {
      expect(isFetchSuccess(42)).toBe(false);
      expect(isFetchSuccess('string')).toBe(false);
    });
  });
});
