// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPreferencesStorage,
  clearProgressStorage,
  clearUserScopedAppStorage,
  hasSupabaseAuthSessionHint,
} from '@/utils/clientStorage';
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '@/utils/storageKeys';
const createStorageMock = (): Storage => {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
  };
};
describe('clearUserScopedAppStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  it('clears scoped app storage keys and the default session migration guard', () => {
    [
      STORAGE_KEYS.progress,
      LEGACY_STORAGE_KEYS.progress,
      STORAGE_KEYS.preferences,
      LEGACY_STORAGE_KEYS.preferences,
      STORAGE_KEYS.analyticsConsent,
      LEGACY_STORAGE_KEYS.analyticsConsent,
      STORAGE_KEYS.adminLastPurge,
      LEGACY_STORAGE_KEYS.adminLastPurge,
      STORAGE_KEYS.cachePurgeAt,
      LEGACY_STORAGE_KEYS.cachePurgeAt,
      STORAGE_KEYS.cachePurgeCheckAt,
      LEGACY_STORAGE_KEYS.cachePurgeCheckAt,
      STORAGE_KEYS.activityLogManual,
      LEGACY_STORAGE_KEYS.activityLogManual,
      STORAGE_KEYS.activityLogLastRead,
      LEGACY_STORAGE_KEYS.activityLogLastRead,
    ].forEach((key) => localStorage.setItem(key, key));
    sessionStorage.setItem(STORAGE_KEYS.sessionDataMigrated, 'true');
    sessionStorage.setItem(LEGACY_STORAGE_KEYS.sessionDataMigrated, 'true');
    clearUserScopedAppStorage(localStorage);
    [
      STORAGE_KEYS.progress,
      LEGACY_STORAGE_KEYS.progress,
      STORAGE_KEYS.preferences,
      LEGACY_STORAGE_KEYS.preferences,
      STORAGE_KEYS.analyticsConsent,
      LEGACY_STORAGE_KEYS.analyticsConsent,
      STORAGE_KEYS.adminLastPurge,
      LEGACY_STORAGE_KEYS.adminLastPurge,
      STORAGE_KEYS.cachePurgeAt,
      LEGACY_STORAGE_KEYS.cachePurgeAt,
      STORAGE_KEYS.cachePurgeCheckAt,
      LEGACY_STORAGE_KEYS.cachePurgeCheckAt,
      STORAGE_KEYS.activityLogManual,
      LEGACY_STORAGE_KEYS.activityLogManual,
      STORAGE_KEYS.activityLogLastRead,
      LEGACY_STORAGE_KEYS.activityLogLastRead,
    ].forEach((key) => expect(localStorage.getItem(key)).toBeNull());
    expect(sessionStorage.getItem(STORAGE_KEYS.sessionDataMigrated)).toBeNull();
    expect(sessionStorage.getItem(LEGACY_STORAGE_KEYS.sessionDataMigrated)).toBeNull();
  });
  it('removes auth session keys when includeAuthSessions is enabled', () => {
    const authTokenKey = 'sb-test-auth-token';
    const codeVerifierKey = 'sb-test-code-verifier';
    const unrelatedKey = 'sb-test-refresh-token';
    localStorage.setItem(authTokenKey, 'token');
    localStorage.setItem(codeVerifierKey, 'verifier');
    localStorage.setItem(unrelatedKey, 'refresh');
    clearUserScopedAppStorage(localStorage, { includeAuthSessions: true });
    expect(localStorage.getItem(authTokenKey)).toBeNull();
    expect(localStorage.getItem(codeVerifierKey)).toBeNull();
    expect(localStorage.getItem(unrelatedKey)).toBe('refresh');
  });
  it('clears session migration guards from a custom session storage area', () => {
    const customSessionStorage = createStorageMock();
    customSessionStorage.setItem(STORAGE_KEYS.sessionDataMigrated, 'true');
    customSessionStorage.setItem(LEGACY_STORAGE_KEYS.sessionDataMigrated, 'true');
    sessionStorage.setItem(STORAGE_KEYS.sessionDataMigrated, 'default');
    sessionStorage.setItem(LEGACY_STORAGE_KEYS.sessionDataMigrated, 'default');
    clearUserScopedAppStorage(localStorage, { sessionStorageArea: customSessionStorage });
    expect(customSessionStorage.getItem(STORAGE_KEYS.sessionDataMigrated)).toBeNull();
    expect(customSessionStorage.getItem(LEGACY_STORAGE_KEYS.sessionDataMigrated)).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEYS.sessionDataMigrated)).toBe('default');
    expect(sessionStorage.getItem(LEGACY_STORAGE_KEYS.sessionDataMigrated)).toBe('default');
  });
  it('skips session migration cleanup when sessionStorageArea is null', () => {
    sessionStorage.setItem(STORAGE_KEYS.sessionDataMigrated, 'true');
    sessionStorage.setItem(LEGACY_STORAGE_KEYS.sessionDataMigrated, 'true');
    clearUserScopedAppStorage(localStorage, { sessionStorageArea: null });
    expect(sessionStorage.getItem(STORAGE_KEYS.sessionDataMigrated)).toBe('true');
    expect(sessionStorage.getItem(LEGACY_STORAGE_KEYS.sessionDataMigrated)).toBe('true');
  });
});
describe('hasSupabaseAuthSessionHint', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it('detects auth token and verifier keys', () => {
    expect(hasSupabaseAuthSessionHint()).toBe(false);
    localStorage.setItem('sb-test-auth-token', 'token');
    expect(hasSupabaseAuthSessionHint()).toBe(true);
    localStorage.clear();
    localStorage.setItem('sb-test-code-verifier', 'verifier');
    expect(hasSupabaseAuthSessionHint()).toBe(true);
  });
});
describe('safe storage defaults', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('does not throw when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => clearProgressStorage()).not.toThrow();
    expect(() => clearPreferencesStorage()).not.toThrow();
    expect(() => clearUserScopedAppStorage()).not.toThrow();
  });
});
