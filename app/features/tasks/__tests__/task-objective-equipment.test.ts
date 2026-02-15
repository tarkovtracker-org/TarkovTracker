import { describe, expect, it } from 'vitest';
import {
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
});
