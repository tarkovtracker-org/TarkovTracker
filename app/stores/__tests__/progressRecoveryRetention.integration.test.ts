// @vitest-environment happy-dom
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@/utils/storageKeys';
vi.unmock('@/stores/tarkov/progressAuthority');
describe('older-tab recovery retention', () => {
  beforeEach(() => {
    vi.resetModules();
    const factory = new IDBFactory();
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: factory });
    localStorage.clear();
  });
  it('retains each distinct older snapshot once instead of growing on repeated values', async () => {
    const a = await import('@/stores/tarkov/progressAuthority');
    await a.initializeProgressAuthority(null);
    for (const value of ['first', 'second', 'first', 'second']) {
      localStorage.setItem(STORAGE_KEYS.progress, value);
      await a.refreshProgressAuthority();
    }
    expect((await a.readCommittedProgressAuthority()).legacyUpdates).toEqual(['first', 'second']);
  });
  it('clears only exported owned copies and preserves newer edits, original and active bytes', async () => {
    const a = await import('@/stores/tarkov/progressAuthority');
    const original = JSON.stringify({ _userId: 'A', data: {} });
    const exported = JSON.stringify({ _userId: 'A', data: { level: 20 } });
    const newer = JSON.stringify({ _userId: 'A', data: { level: 21 } });
    const foreign = JSON.stringify({ _userId: 'B', data: {} });
    localStorage.setItem(STORAGE_KEYS.progress, original);
    await a.initializeProgressAuthority('A');
    for (const value of [exported, foreign, newer]) {
      localStorage.setItem(STORAGE_KEYS.progress, value);
      await a.refreshProgressAuthority();
    }
    await a.discardExportedLegacyProgress('A', [exported]);
    expect(await a.readCommittedProgressAuthority()).toMatchObject({
      raw: original,
      legacyRaw: original,
      legacyUpdates: [foreign, newer],
    });
    expect(a.legacyProgressRecoveryCount.value).toBe(1);
    await a.refreshProgressAuthority();
    expect((await a.readCommittedProgressAuthority()).legacyUpdates).toEqual([foreign, newer]);
  });
});
