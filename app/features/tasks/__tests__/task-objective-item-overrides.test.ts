import { describe, expect, it } from 'vitest';
import { resolveObjectiveItemIcon } from '@/features/tasks/task-objective-item-overrides';
describe('task-objective-item-overrides', () => {
  it('returns icon override for Duck Hunt duck pate objective item', () => {
    expect(resolveObjectiveItemIcon('69774bb0a247161ff1068335')).toBe(
      '/img/items/69774bb0a247161ff1068335-icon.webp'
    );
  });
  it('returns undefined for items without an override', () => {
    expect(resolveObjectiveItemIcon('not-a-real-item')).toBeUndefined();
    expect(resolveObjectiveItemIcon()).toBeUndefined();
  });
});
