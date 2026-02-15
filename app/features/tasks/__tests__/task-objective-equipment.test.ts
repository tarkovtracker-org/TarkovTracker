import { describe, expect, it } from 'vitest';
import {
  getObjectiveEquipmentItems,
  MAX_RENDERED_USE_ANY_ITEMS,
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
    const useAny = Array.from({ length: MAX_RENDERED_USE_ANY_ITEMS }, (_, index) =>
      createItem(`item-${index}`)
    );
    const equipment = getObjectiveEquipmentItems(
      createObjective({
        useAny,
      })
    );
    expect(equipment).toHaveLength(MAX_RENDERED_USE_ANY_ITEMS);
    expect(equipment[0]?.id).toBe('item-0');
  });
  it('omits useAny items when size exceeds the render cap', () => {
    const useAny = Array.from({ length: MAX_RENDERED_USE_ANY_ITEMS + 1 }, (_, index) =>
      createItem(`item-${index}`)
    );
    const equipment = getObjectiveEquipmentItems(
      createObjective({
        useAny,
      })
    );
    expect(equipment).toEqual([]);
  });
  it('includes sellItem items when size is at or below the render cap', () => {
    const sellItems = Array.from({ length: MAX_RENDERED_USE_ANY_ITEMS }, (_, index) =>
      createItem(`sell-item-${index}`)
    );
    const equipment = getObjectiveEquipmentItems(
      createObjective({
        type: 'sellItem',
        items: sellItems,
      })
    );
    expect(equipment).toHaveLength(MAX_RENDERED_USE_ANY_ITEMS);
    expect(equipment[0]?.id).toBe('sell-item-0');
  });
  it('omits sellItem items when size exceeds the render cap', () => {
    const sellItems = Array.from({ length: MAX_RENDERED_USE_ANY_ITEMS + 1 }, (_, index) =>
      createItem(`sell-item-${index}`)
    );
    const equipment = getObjectiveEquipmentItems(
      createObjective({
        type: 'sellItem',
        items: sellItems,
      })
    );
    expect(equipment).toEqual([]);
  });
  it('includes items for non-sell objectives', () => {
    const equipment = getObjectiveEquipmentItems(
      createObjective({
        type: 'giveItem',
        items: [createItem('item-1'), createItem('item-2')],
      })
    );
    expect(equipment.map((item) => item.id)).toEqual(['item-1', 'item-2']);
  });
  it('includes standalone primary item', () => {
    const equipment = getObjectiveEquipmentItems(
      createObjective({
        item: createItem('primary-item'),
      })
    );
    expect(equipment.map((item) => item.id)).toEqual(['primary-item']);
  });
  it('deduplicates overlapping items across all equipment sources', () => {
    const shared = createItem('shared');
    const equipment = getObjectiveEquipmentItems(
      createObjective({
        item: shared,
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
});
