// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  persistActiveProgressValue,
  progressPersistStorage,
  safeGetItem,
} from '@/stores/tarkov/localStorage';
import {
  classifyLocalSaveFailure,
  hasUnsavedProgressChanges,
  progressSaveStatus,
  recordLocalSave,
  registerCloudRetryHandler,
  resetCloudSaveStatus,
  retryCloudSave,
  setCloudSaveStatus,
} from '@/stores/tarkov/progressSaveStatus';
import { STORAGE_KEYS } from '@/utils/storageKeys';
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
const quotaError = () => Object.assign(new Error('full'), { name: 'QuotaExceededError' });
/** A storage whose writes fail until `failWrites` is cleared, like a full browser quota. */
const stubFailingStorage = () => {
  const values = new Map<string, string>();
  const control = { failWrites: true };
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (control.failWrites) throw quotaError();
      values.set(key, value);
    },
    removeItem: (key: string) => values.delete(key),
  });
  return { control, values };
};
describe('progress save status', () => {
  beforeEach(() => {
    localStorage.clear();
    resetCloudSaveStatus();
    recordLocalSave(true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('records a confirmed local save only when the browser accepts the write', () => {
    expect(persistActiveProgressValue('{"data":{}}')).toBe(true);
    expect(progressSaveStatus.local).toBe('saved');
    expect(safeGetItem(STORAGE_KEYS.progress)).toBe('{"data":{}}');
    expect(hasUnsavedProgressChanges()).toBe(false);
  });
  it('surfaces quota failures that the persist plugin would otherwise swallow', () => {
    stubFailingStorage();
    expect(() => progressPersistStorage.setItem(STORAGE_KEYS.progress, '{}')).not.toThrow();
    expect(progressSaveStatus.local).toBe('failed');
    expect(progressSaveStatus.localFailure).toBe('quota');
  });
  it('warns for failed local persistence until the latest mutation is cloud-acknowledged', () => {
    recordLocalSave(false, 'quota');
    // No sync controller ran, so cloud idle does not prove that the mutation was saved.
    expect(hasUnsavedProgressChanges()).toBe(true);
    setCloudSaveStatus({
      state: 'saving',
      failure: null,
      retryAttempt: 0,
      nextRetryAt: null,
    });
    setCloudSaveStatus({ state: 'idle', failure: null, retryAttempt: 0, nextRetryAt: null });
    expect(hasUnsavedProgressChanges()).toBe(false);
    recordLocalSave(false, 'quota');
    setCloudSaveStatus({ state: 'failed', failure: 'offline', retryAttempt: 3, nextRetryAt: null });
    expect(hasUnsavedProgressChanges()).toBe(true);
    recordLocalSave(true);
    expect(hasUnsavedProgressChanges()).toBe(false);
  });
  it('does not mistake a session reset to cloud idle for an acknowledgement', () => {
    recordLocalSave(false, 'unavailable');
    resetCloudSaveStatus();
    expect(hasUnsavedProgressChanges()).toBe(true);
  });
  it('clears the unsaved state after a later write succeeds', () => {
    const { control, values } = stubFailingStorage();
    progressPersistStorage.setItem(STORAGE_KEYS.progress, '{"v":1}');
    expect(progressSaveStatus.local).toBe('failed');
    control.failWrites = false;
    progressPersistStorage.setItem(STORAGE_KEYS.progress, '{"v":2}');
    expect(values.get(STORAGE_KEYS.progress)).toBe('{"v":2}');
    expect(progressSaveStatus.local).toBe('saved');
    expect(progressSaveStatus.localFailure).toBeNull();
  });
  it('does not treat writes to other keys as progress saves', () => {
    recordLocalSave(false, 'quota');
    progressPersistStorage.setItem('other-key', 'value');
    expect(progressSaveStatus.local).toBe('failed');
  });
  it.each([
    [quotaError(), 'quota'],
    [Object.assign(new Error('denied'), { name: 'SecurityError' }), 'unavailable'],
    [new Error('other'), 'unknown'],
    [null, 'unknown'],
  ])('classifies local failure %o as %s', (error, expected) => {
    expect(classifyLocalSaveFailure(error)).toBe(expected);
  });
  it('routes manual retries to the current controller only', async () => {
    const first = vi.fn().mockResolvedValue(true);
    const second = vi.fn().mockResolvedValue(false);
    const unregisterFirst = registerCloudRetryHandler(first);
    registerCloudRetryHandler(second);
    unregisterFirst();
    await expect(retryCloudSave()).resolves.toBe(false);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
  it('resets cloud status and the retry handler with the session', async () => {
    registerCloudRetryHandler(vi.fn().mockResolvedValue(true));
    setCloudSaveStatus({ state: 'failed', failure: 'offline', retryAttempt: 3, nextRetryAt: null });
    resetCloudSaveStatus();
    expect(progressSaveStatus.cloud.state).toBe('idle');
    await expect(retryCloudSave()).resolves.toBe(false);
  });
  it('reports a rejected retry handler as a failed retry', async () => {
    registerCloudRetryHandler(vi.fn().mockRejectedValue(new Error('boom')));
    await expect(retryCloudSave()).resolves.toBe(false);
  });
});
