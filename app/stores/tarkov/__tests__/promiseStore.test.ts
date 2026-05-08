import { describe, expect, it } from 'vitest';
import {
  getPromiseRequestIdStore,
  getPromiseRequestKeyStore,
  getPromiseStore,
} from '@/stores/tarkov/promiseStore';
describe('promiseStore', () => {
  describe('getPromiseStore', () => {
    it('returns a fresh promise store for a new object', () => {
      const instance = {};
      const store = getPromiseStore(instance);
      expect(store.bootstrapPromise).toBeNull();
      expect(store.initPromise).toBeNull();
      expect(store.isInitializing).toBe(false);
    });
    it('returns the same store on subsequent calls for the same instance', () => {
      const instance = {};
      const store1 = getPromiseStore(instance);
      const store2 = getPromiseStore(instance);
      expect(store1).toBe(store2);
    });
    it('returns different stores for different instances', () => {
      const a = {};
      const b = {};
      const storeA = getPromiseStore(a);
      const storeB = getPromiseStore(b);
      expect(storeA).not.toBe(storeB);
    });
    it('allows mutation of the returned store', () => {
      const instance = {};
      const store = getPromiseStore(instance);
      const promise = Promise.resolve();
      store.bootstrapPromise = promise;
      store.isInitializing = true;
      expect(getPromiseStore(instance).bootstrapPromise).toBe(promise);
      expect(getPromiseStore(instance).isInitializing).toBe(true);
    });
    it('does not appear in Object.keys of the host', () => {
      const instance: Record<string, unknown> = { visible: true };
      getPromiseStore(instance);
      expect(Object.keys(instance)).toEqual(['visible']);
    });
  });
  describe('getPromiseRequestKeyStore', () => {
    it('returns an empty object for a new instance', () => {
      const instance = {};
      const keys = getPromiseRequestKeyStore(instance);
      expect(keys).toEqual({});
    });
    it('returns the same object on subsequent calls', () => {
      const instance = {};
      const keys1 = getPromiseRequestKeyStore(instance);
      const keys2 = getPromiseRequestKeyStore(instance);
      expect(keys1).toBe(keys2);
    });
    it('is independent from promise store', () => {
      const instance = {};
      const keys = getPromiseRequestKeyStore(instance);
      keys.bootstrapPromise = 'request-key-1';
      expect(getPromiseStore(instance).bootstrapPromise).toBeNull();
    });
  });
  describe('getPromiseRequestIdStore', () => {
    it('returns an empty object for a new instance', () => {
      const instance = {};
      const ids = getPromiseRequestIdStore(instance);
      expect(ids).toEqual({});
    });
    it('returns the same object on subsequent calls', () => {
      const instance = {};
      const ids1 = getPromiseRequestIdStore(instance);
      const ids2 = getPromiseRequestIdStore(instance);
      expect(ids1).toBe(ids2);
    });
    it('supports symbol values', () => {
      const instance = {};
      const ids = getPromiseRequestIdStore(instance);
      const sym = Symbol('test');
      ids.bootstrapPromise = sym;
      expect(getPromiseRequestIdStore(instance).bootstrapPromise).toBe(sym);
    });
  });
});
