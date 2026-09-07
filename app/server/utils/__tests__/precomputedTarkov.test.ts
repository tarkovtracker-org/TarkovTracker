import { describe, expect, it } from 'vitest';
import {
  buildPrecomputedEnvelope,
  buildTasksCorePrecomputedKey,
  getPrecomputedStore,
  isPrecomputedEnvelope,
} from '@/server/utils/precomputedTarkov';
describe('precomputedTarkov', () => {
  describe('buildTasksCorePrecomputedKey', () => {
    it('matches the tasks-core edge cache key format', () => {
      expect(buildTasksCorePrecomputedKey('en', 'regular')).toBe('tasks-core-json-v4-en-regular');
      expect(buildTasksCorePrecomputedKey('de', 'pve')).toBe('tasks-core-json-v4-de-pve');
    });
  });
  describe('envelope round trip', () => {
    it('builds an envelope that validates', () => {
      const envelope = buildPrecomputedEnvelope({ data: { tasks: [] } });
      expect(isPrecomputedEnvelope(envelope)).toBe(true);
      expect(envelope.payload).toEqual({ data: { tasks: [] } });
      expect(envelope.version).toBe(2);
      expect(Number.isFinite(envelope.storedAt)).toBe(true);
    });
    it('rejects provenance that differs from the served payload', () => {
      const envelope = buildPrecomputedEnvelope({
        dataOverlay: { version: '1', sha256: 'published' },
      });
      expect(envelope.overlay).toEqual({ version: '1', sha256: 'published' });
      expect(
        isPrecomputedEnvelope({ ...envelope, overlay: { version: '1', sha256: 'other' } })
      ).toBe(false);
    });
    it('rejects non-envelope values', () => {
      expect(isPrecomputedEnvelope(null)).toBe(false);
      expect(isPrecomputedEnvelope(undefined)).toBe(false);
      expect(isPrecomputedEnvelope('json')).toBe(false);
      expect(isPrecomputedEnvelope({ payload: {} })).toBe(false);
      expect(isPrecomputedEnvelope({ payload: {}, storedAt: Date.now(), version: 2 })).toBe(false);
      expect(isPrecomputedEnvelope({ storedAt: Date.now(), version: 1 })).toBe(false);
    });
    it('rejects envelopes with a null or undefined payload', () => {
      expect(isPrecomputedEnvelope({ payload: null, storedAt: Date.now(), version: 1 })).toBe(
        false
      );
      expect(isPrecomputedEnvelope({ payload: undefined, storedAt: Date.now(), version: 1 })).toBe(
        false
      );
    });
    it('rejects envelopes with a non-finite or non-numeric storedAt', () => {
      expect(isPrecomputedEnvelope({ payload: {}, storedAt: Number.NaN, version: 1 })).toBe(false);
      expect(
        isPrecomputedEnvelope({ payload: {}, storedAt: Number.POSITIVE_INFINITY, version: 1 })
      ).toBe(false);
      expect(isPrecomputedEnvelope({ payload: {}, storedAt: 'now', version: 1 })).toBe(false);
    });
    it('accepts falsy-but-valid payloads such as empty arrays', () => {
      expect(
        isPrecomputedEnvelope({ payload: [], storedAt: Date.now(), version: 2, overlay: null })
      ).toBe(true);
      expect(
        isPrecomputedEnvelope({ payload: 0, storedAt: Date.now(), version: 2, overlay: null })
      ).toBe(true);
    });
  });
  describe('getPrecomputedStore', () => {
    it('returns the KV binding when present on the event context', () => {
      const binding = { get: async () => null };
      const event = { context: { cloudflare: { env: { TARKOV_DATA: binding } } } };
      expect(getPrecomputedStore(event)).toBe(binding);
    });
    it('returns null when the binding is absent or malformed', () => {
      expect(getPrecomputedStore(undefined)).toBeNull();
      expect(getPrecomputedStore({})).toBeNull();
      expect(getPrecomputedStore({ context: {} })).toBeNull();
      expect(getPrecomputedStore({ context: { cloudflare: { env: {} } } })).toBeNull();
      expect(
        getPrecomputedStore({ context: { cloudflare: { env: { TARKOV_DATA: 'not-a-kv' } } } })
      ).toBeNull();
      expect(
        getPrecomputedStore({ context: { cloudflare: { env: { TARKOV_DATA: {} } } } })
      ).toBeNull();
    });
  });
});
