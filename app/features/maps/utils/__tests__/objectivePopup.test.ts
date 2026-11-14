import { describe, expect, it } from 'vitest';
import {
  getObjectiveKeyLabels,
  getObjectivePopupItem,
  getObjectiveProgress,
} from '@/features/maps/utils/objectivePopup';
import type { TaskObjective } from '@/types/tarkov';
const marker = { id: 'ms2000', name: 'MS2000 Marker' };
const folder = { id: 'folder', name: 'Intelligence folder' };
describe('objective popup details', () => {
  it('shows the marker for marks and the quest item for pickups and stashes', () => {
    const mark = { id: 'o', type: 'mark', markerItem: marker } as TaskObjective;
    expect(getObjectivePopupItem(mark)).toEqual({ item: marker, alternatives: 0 });
    const pickup = { id: 'o', type: 'findQuestItem', questItem: folder, item: marker };
    expect(getObjectivePopupItem(pickup as TaskObjective)?.item).toBe(folder);
  });
  it('shows the first accepted item and counts the alternatives', () => {
    const flares = [
      { id: 'red', name: 'Red flare' },
      { id: 'yellow', name: 'Yellow flare' },
    ];
    const use = { id: 'o', type: 'useItem', useAny: flares } as TaskObjective;
    expect(getObjectivePopupItem(use)).toEqual({ item: flares[0], alternatives: 1 });
    // Accepted alternatives win over the singular item, so none are hidden.
    const stash = { id: 'o', type: 'plantItem', items: flares, item: flares[0] } as TaskObjective;
    expect(getObjectivePopupItem(stash)).toEqual({ item: flares[0], alternatives: 1 });
    expect(getObjectivePopupItem({ id: 'o', type: 'visit' })).toBeUndefined();
  });
  it('ignores empty item placeholders from adapted objectives', () => {
    // A shoot objective with no weapon requirement arrives as `usingWeapon: { id: '' }`.
    const shoot = { id: 'o', type: 'shoot', usingWeapon: { id: '' } } as TaskObjective;
    expect(getObjectivePopupItem(shoot)).toBeUndefined();
    const rifle = { id: 'ash12', name: 'ASh-12' };
    const mixed = { id: 'o', type: 'shoot', items: [{ id: '' }, rifle] } as TaskObjective;
    expect(getObjectivePopupItem(mixed)).toEqual({ item: rifle, alternatives: 0 });
  });
  it('shows the weapon or gear an elimination must be done with', () => {
    const rifle = { id: 'ash12', name: 'ASh-12' };
    const shoot = { id: 'o', type: 'shoot', usingWeapon: rifle } as TaskObjective;
    expect(getObjectivePopupItem(shoot)).toEqual({ item: rifle, alternatives: 0 });
    const gear = [{ id: 'helmet', name: 'Helmet' }];
    const worn = { id: 'o', type: 'shoot', wearing: gear } as TaskObjective;
    expect(getObjectivePopupItem(worn)?.item).toBe(gear[0]);
  });
  it('joins each key group as alternatives and skips unnamed groups', () => {
    const objective = {
      id: 'o',
      requiredKeys: [[{ id: 'a' }, { id: 'b' }], [{ id: 'c' }], []],
    } as TaskObjective;
    const names: Record<string, string> = { a: 'Key A', b: 'Key B', c: '' };
    expect(getObjectiveKeyLabels(objective, (item) => names[item.id] ?? '')).toEqual([
      'Key A / Key B',
    ]);
  });
  it('reports progress only for counted objectives, clamped to the requirement', () => {
    expect(getObjectiveProgress(0, 1)).toBeNull();
    expect(getObjectiveProgress(2, 4)).toEqual({ current: 2, required: 4, percent: 50 });
    expect(getObjectiveProgress(9, 4)).toEqual({ current: 4, required: 4, percent: 100 });
    expect(getObjectiveProgress(-1, 3)?.current).toBe(0);
  });
});
