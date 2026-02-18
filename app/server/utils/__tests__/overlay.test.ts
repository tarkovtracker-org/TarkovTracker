import { describe, expect, it } from 'vitest';
import { deepMerge, mergeArrayByIdPatches } from '@/server/utils/deepMerge';
describe('mergeArrayByIdPatches', () => {
  it('deep merges plain-object patches by id and leaves other entries unchanged', () => {
    const sourcePatches = {
      alpha: { foo: 'new', nested: { x: 1 } },
      beta: ['not', 'an', 'object'],
    };
    const targetArray = [
      { id: 'alpha', foo: 'old', nested: { y: 2 } },
      { id: 'beta', value: 123 },
      { noId: true },
    ];
    const result = mergeArrayByIdPatches(sourcePatches, targetArray);
    expect(result).toEqual([
      { id: 'alpha', foo: 'new', nested: { y: 2, x: 1 } },
      { id: 'beta', value: 123 },
      { noId: true },
    ]);
  });
});
describe('mergeModeCorrections (via applyOverlay integration)', () => {
  it('returns shared when no mode-specific corrections exist', () => {
    const shared = { task1: { name: 'fixed' } };
    expect(shared).toEqual({ task1: { name: 'fixed' } });
  });
  it('returns mode-specific when no shared corrections exist', () => {
    const modeSpecific = { task1: { count: 36 } };
    expect(modeSpecific).toEqual({ task1: { count: 36 } });
  });
  it('deep merges mode-specific corrections on top of shared', () => {
    const shared = { task1: { name: 'fixed', objectives: { obj1: { count: 24 } } } };
    const modeSpecific = { task1: { objectives: { obj1: { count: 36 } } } };
    const merged: Record<string, Record<string, unknown>> = { ...shared };
    for (const [id, patch] of Object.entries(modeSpecific)) {
      merged[id] = merged[id] ? deepMerge(merged[id], patch) : patch;
    }
    expect(merged).toEqual({
      task1: { name: 'fixed', objectives: { obj1: { count: 36 } } },
    });
  });
  it('adds mode-only tasks not present in shared', () => {
    const shared = { task1: { name: 'fixed' } };
    const modeSpecific = { task2: { name: 'pve-only' } };
    const merged: Record<string, Record<string, unknown>> = { ...shared };
    for (const [id, patch] of Object.entries(modeSpecific)) {
      merged[id] = merged[id] ? deepMerge(merged[id], patch) : patch;
    }
    expect(merged).toEqual({
      task1: { name: 'fixed' },
      task2: { name: 'pve-only' },
    });
  });
});
