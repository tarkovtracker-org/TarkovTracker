import { describe, expect, it } from 'vitest';
import fixtures from '@/server/utils/__tests__/fixtures/objective-equipment.json';
import { adaptTaskObjectivesResponse } from '@/server/utils/tarkov-json';
import { objectiveEquipmentItems } from '@/utils/objectiveEquipment';
const fields = ['usingWeapon', 'usingWeaponMods', 'wearing', 'notWearing'] as const;
const idsOnly = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(idsOnly);
  if (typeof value === 'string') return { id: value };
  return { id: (value as { id: string }).id };
};
describe('objective equipment source compatibility', () => {
  it.each(Object.entries(fixtures))(
    'retains equipment identity and groups from %s',
    (_, fixture) => {
      const result = adaptTaskObjectivesResponse(fixture).data.tasks;
      for (const sourceTask of Object.values(fixture.tasks)) {
        const task = result.find((entry) => entry.id === sourceTask.id);
        for (const source of sourceTask.objectives) {
          const objective = task?.objectives?.find((entry) => entry.id === source.id);
          for (const field of fields)
            expect(idsOnly(objective?.[field])).toEqual(idsOnly(source[field]));
        }
      }
      const weapons = (taskId: string) =>
        objectiveEquipmentItems(
          result.find((task) => task.id === taskId)?.objectives?.[0]?.usingWeapon
        ).map((item) => item.id);
      expect(weapons('5c0bd94186f7747a727f09b2')).toEqual([
        '5df8ce05b11454561e39243b',
        '6932abeb5403890d0c09c926',
      ]);
      expect(weapons('63a5cf262964a7488f5243ce')).toEqual(['5926bb2186f7744b1c6c6e60']);
    }
  );
  it.each(fields)(
    'distinguishes empty, unknown and malformed %s without dropping leaves',
    (field) => {
      const values = [
        undefined,
        [],
        'legacy',
        { id: 'overlay', name: 'Overlay' },
        ['unknown-id', null, 42, {}, '', [undefined, ['nested']]],
        null,
      ];
      const tasks = [
        {
          id: 'task',
          objectives: values.map((value, index) => ({ id: `${index}`, [field]: value })),
        },
      ];
      const result = adaptTaskObjectivesResponse({ tasks }).data.tasks[0]?.objectives;
      expect(result?.map((objective) => objective[field])).toEqual([
        undefined,
        [],
        { id: 'legacy' },
        { id: 'overlay', name: 'Overlay' },
        [
          { id: 'unknown-id' },
          { id: '' },
          { id: '' },
          { id: '' },
          { id: '' },
          [{ id: '' }, { id: '' }],
        ],
        { id: '' },
      ]);
    }
  );
  it('resolves catalog metadata without changing groups or unknown identities', () => {
    const result = adaptTaskObjectivesResponse(
      {
        tasks: [
          { id: 'task', objectives: [{ id: 'objective', wearing: [['known', 'unknown'], []] }] },
        ],
      },
      { itemsPayload: { items: { known: { id: 'known', name: 'Known item' } } } }
    );
    expect(result.data.tasks[0]?.objectives?.[0]?.wearing).toEqual([
      [{ id: 'known', name: 'Known item' }, { id: 'unknown' }],
      [],
    ]);
  });
});
