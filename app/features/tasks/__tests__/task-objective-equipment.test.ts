import { describe, expect, it } from 'vitest';
import {
  getBuildWeaponRequiredItems,
  getObjectiveEquipmentItems,
  MAX_RENDERED_OBJECTIVE_ITEMS,
} from '@/features/tasks/task-objective-equipment';
import type { TaskObjective, TarkovItem } from '@/types/tarkov';
const createItem = (id: string): TarkovItem => ({ id, name: id, shortName: id });
const createObjective = (input: Partial<TaskObjective>): TaskObjective =>
  ({
    id: 'objective-1',
    type: 'mark',
    ...input,
  }) as TaskObjective;
describe('task-objective-equipment', () => {
  it('includes useAny items when size is at or below the render cap', () => {
    const useAny = Array.from({ length: MAX_RENDERED_OBJECTIVE_ITEMS }, (_, index) =>
      createItem(`item-${index}`)
    );
    const equipment = getObjectiveEquipmentItems(
      createObjective({
        useAny,
      })
    );
    expect(equipment).toHaveLength(MAX_RENDERED_OBJECTIVE_ITEMS);
    expect(equipment[0]?.id).toBe('item-0');
  });
  it('truncates useAny items to the render cap when size exceeds it', () => {
    const useAny = Array.from({ length: MAX_RENDERED_OBJECTIVE_ITEMS + 10 }, (_, index) =>
      createItem(`item-${index}`)
    );
    const equipment = getObjectiveEquipmentItems(
      createObjective({
        useAny,
      })
    );
    expect(equipment).toHaveLength(MAX_RENDERED_OBJECTIVE_ITEMS);
    expect(equipment[0]?.id).toBe('item-0');
    expect(equipment[MAX_RENDERED_OBJECTIVE_ITEMS - 1]?.id).toBe(
      `item-${MAX_RENDERED_OBJECTIVE_ITEMS - 1}`
    );
  });
  it('includes sellItem items when size is at or below the render cap', () => {
    const sellItems = Array.from({ length: MAX_RENDERED_OBJECTIVE_ITEMS }, (_, index) =>
      createItem(`sell-item-${index}`)
    );
    const equipment = getObjectiveEquipmentItems(
      createObjective({
        type: 'sellItem',
        items: sellItems,
      })
    );
    expect(equipment).toHaveLength(MAX_RENDERED_OBJECTIVE_ITEMS);
    expect(equipment[0]?.id).toBe('sell-item-0');
  });
  it('truncates sellItem items to the render cap when size exceeds it', () => {
    const sellItems = Array.from({ length: MAX_RENDERED_OBJECTIVE_ITEMS + 10 }, (_, index) =>
      createItem(`sell-item-${index}`)
    );
    const equipment = getObjectiveEquipmentItems(
      createObjective({
        type: 'sellItem',
        items: sellItems,
      })
    );
    expect(equipment).toHaveLength(MAX_RENDERED_OBJECTIVE_ITEMS);
    expect(equipment[0]?.id).toBe('sell-item-0');
    expect(equipment[MAX_RENDERED_OBJECTIVE_ITEMS - 1]?.id).toBe(
      `sell-item-${MAX_RENDERED_OBJECTIVE_ITEMS - 1}`
    );
  });
  it('includes items for non-sell objectives without capping', () => {
    const equipment = getObjectiveEquipmentItems(
      createObjective({
        type: 'giveItem',
        items: [createItem('item-1'), createItem('item-2')],
      })
    );
    expect(equipment.map((item) => item.id)).toEqual(['item-1', 'item-2']);
  });
  it('deduplicates overlapping items across all equipment sources', () => {
    const shared = createItem('shared');
    const equipment = getObjectiveEquipmentItems(
      createObjective({
        items: [shared],
        markerItem: shared,
        questItem: shared,
        useAny: [shared],
        usingWeapon: shared,
        usingWeaponMods: [shared],
        wearing: [shared],
      })
    );
    expect(equipment).toEqual([shared]);
  });
  it('includes items for bring-type objectives when mode is set to "bring"', () => {
    const item1 = createItem('item-1');
    const equipment = getObjectiveEquipmentItems(
      createObjective({
        type: 'plantItem',
        items: [item1],
      }),
      'bring'
    );
    expect(equipment).toEqual([item1]);
  });
  it('excludes items for non-bring objectives when mode is set to "bring"', () => {
    const item2 = createItem('item-2');
    const equipment = getObjectiveEquipmentItems(
      createObjective({
        type: 'giveItem',
        items: [item2],
      }),
      'bring'
    );
    expect(equipment).toEqual([]);
  });
  it('excludes all-mode-only equipment fields when mode is set to "bring"', () => {
    const item = createItem('item-3');
    const equipment = getObjectiveEquipmentItems(
      createObjective({
        type: 'giveItem',
        useAny: [item],
        usingWeapon: item,
        usingWeaponMods: [item],
        wearing: [item],
      }),
      'bring'
    );
    expect(equipment).toEqual([]);
  });
  it('includes buildWeapon base item and containsAll mods as required rows', () => {
    const base = createItem('vector-base');
    const rail = createItem('vector-rail');
    const grip = createItem('vector-grip');
    const objective = createObjective({
      id: 'obj-build',
      type: 'buildWeapon',
      item: base,
      containsAll: [rail, grip],
    });
    const rows = getBuildWeaponRequiredItems(objective);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.progressId)).toEqual([
      'obj-build',
      'obj-build:containsAll:vector-rail',
      'obj-build:containsAll:vector-grip',
    ]);
    expect(rows.map((row) => row.item.id)).toEqual(['vector-base', 'vector-rail', 'vector-grip']);
    expect(rows.every((row) => row.neededCount === 1 || row.progressId === 'obj-build')).toBe(true);
  });
  it('deduplicates buildWeapon base item when it also appears in containsAll', () => {
    const shared = createItem('shared-mod');
    const rows = getBuildWeaponRequiredItems(
      createObjective({
        type: 'buildWeapon',
        item: shared,
        containsAll: [shared, createItem('other-mod')],
      })
    );
    expect(rows.map((row) => row.item.id)).toEqual(['shared-mod', 'other-mod']);
  });
  it('returns an empty list for non-buildWeapon objectives', () => {
    expect(
      getBuildWeaponRequiredItems(
        createObjective({
          type: 'giveItem',
          items: [createItem('item-1')],
        })
      )
    ).toEqual([]);
  });
});
