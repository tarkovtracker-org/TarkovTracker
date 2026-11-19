import { describe, expect, it } from 'vitest';
import {
  remainingSellUses,
  sellGroups,
  type SellProgress,
} from '@/features/stash-import/sellAdvice';
import type { HideoutModule, TarkovItem, Task, TaskObjective } from '@/types/tarkov';
import type { ReviewedCell, ScanItem } from '@/utils/stashScan/types';
const item = (id: string) => ({ id }) as TarkovItem;
const objective = (extra: Partial<TaskObjective> = {}): TaskObjective => ({
  id: 'objective',
  type: 'giveItem',
  item: item('needed'),
  ...extra,
});
const task = (extra: Partial<Task> = {}): Task => ({
  id: 'task',
  objectives: [objective()],
  ...extra,
});
const module = (id = 'hideout'): HideoutModule =>
  ({
    id,
    itemRequirements: [{ item: item('hideout-item'), count: 2 }],
  }) as HideoutModule;
const progress: SellProgress = {
  isTaskComplete: () => false,
  isTaskFailed: () => false,
  isTaskObjectiveComplete: () => false,
  isHideoutModuleComplete: () => false,
};
const catalog: ScanItem[] = [
  { id: 'free', name: 'Free item', shortName: 'Free', maxStack: 10, width: 1, height: 1 },
  { id: 'needed', name: 'Needed item', shortName: 'Need', maxStack: 1, width: 1, height: 1 },
];
const row = (key = 0, extra: Partial<ReviewedCell> = {}): ReviewedCell => ({
  cell: {
    key,
    x: key * 65,
    y: 0,
    width: 65,
    height: 65,
    slotsWide: 1,
    slotsHigh: 1,
    empty: false,
    candidates: [],
    margin: 1,
    fir: false,
    stack: 1,
  },
  itemId: 'free',
  quantity: 1,
  raidStatus: 'unknown',
  reviewed: true,
  excluded: false,
  ...extra,
});
describe('remaining tracked uses', () => {
  it('protects later, conditional and optional quests regardless of current visibility or eligibility', () => {
    const later = task({
      minPlayerLevel: 70,
      factionName: 'BEAR',
      disabled: true,
      taskRequirements: [{ task: { id: 'prerequisite' }, status: ['active'] }],
      objectives: [objective({ optional: true, items: [item('pool-a'), item('pool-b')] })],
    });
    expect(remainingSellUses([later], [module()], progress)).toEqual(
      new Set(['needed', 'pool-a', 'pool-b', 'hideout-item'])
    );
  });
  it('protects every member of large alternative pools, keys, equipment and build parts', () => {
    const pool = Array.from({ length: 30 }, (_, index) => item(`alternative-${index}`));
    const requirements = task({
      objectives: [
        objective({
          items: pool,
          containsAll: [item('mod')],
          useAny: pool,
          usingWeapon: item('weapon'),
          usingWeaponMods: [item('sight')],
          wearing: [item('vest')],
          requiredKeys: [[item('key-a'), item('key-b')]],
        }),
      ],
    });
    const protectedIds = remainingSellUses([requirements], [], progress)!;
    expect(protectedIds.has('alternative-29')).toBe(true);
    expect(
      ['mod', 'weapon', 'sight', 'vest', 'key-a', 'key-b'].every((id) => protectedIds.has(id))
    ).toBe(true);
  });
  it('retains every item in nested equipment alternatives present in the loaded catalog', () => {
    const nested = [[item('vest-a')], [item('vest-b')]] as unknown as TarkovItem[];
    expect(
      remainingSellUses([task({ objectives: [objective({ wearing: nested })] })], [], progress)
    ).toEqual(new Set(['needed', 'vest-a', 'vest-b']));
  });
  it('does not treat collected counts as hand-in, construction or surplus', () => {
    const collected = { ...progress, getObjectiveCount: () => 100, getHideoutPartCount: () => 100 };
    expect(remainingSellUses([task()], [module()], collected)).toEqual(
      new Set(['needed', 'hideout-item'])
    );
  });
  it('releases actual completed objectives/tasks and built modules', () => {
    expect(
      remainingSellUses([task()], [module()], {
        ...progress,
        isTaskObjectiveComplete: () => true,
        isHideoutModuleComplete: () => true,
      })
    ).toEqual(new Set());
    expect(remainingSellUses([task()], [], { ...progress, isTaskComplete: () => true })).toEqual(
      new Set()
    );
  });
  it('keeps failed branches protected even when failure also set completion flags', () => {
    expect(
      remainingSellUses([task()], [], {
        ...progress,
        isTaskComplete: () => true,
        isTaskFailed: () => true,
        isTaskObjectiveComplete: () => true,
      })
    ).toEqual(new Set(['needed']));
  });
  it.each([
    task({ objectives: undefined }),
    task({ objectives: [] }),
    task({ objectives: [{ id: 'incomplete' }] }),
    task({ objectives: [objective({ type: 'shoot', usingWeapon: { id: '' } as TarkovItem })] }),
    task({ objectives: [objective({ item: undefined })] }),
    task({ objectives: [objective({ items: [{} as TarkovItem] })] }),
  ])('withholds the answer when task data is incomplete', (incomplete) => {
    expect(remainingSellUses([task(), incomplete], [], progress)).toBeUndefined();
  });
  it('does not require missing data for a quest the player actually completed', () => {
    expect(
      remainingSellUses([task({ objectives: [] })], [], {
        ...progress,
        isTaskComplete: () => true,
      })
    ).toEqual(new Set());
    expect(
      remainingSellUses([task({ objectives: [{ id: 'completed-placeholder' }] })], [], {
        ...progress,
        isTaskObjectiveComplete: () => true,
      })
    ).toEqual(new Set());
  });
  it('withholds the answer when hideout requirements are incomplete', () => {
    expect(remainingSellUses([], [{ id: 'missing' } as HideoutModule], progress)).toBeUndefined();
  });
});
describe('sell candidates in one screenshot', () => {
  it('groups distinct known observations once, with unit counts and a representative crop', () => {
    const rows = [row(0, { quantity: 2 }), row(1, { quantity: 3 }), row(2)];
    expect(sellGroups(rows, catalog, new Set())).toEqual([
      { itemId: 'free', name: 'Free item', quantity: 6, cell: rows[0]!.cell },
    ]);
  });
  it('does not derive surplus or FIR-dependent advice for any remaining use', () => {
    const rows = [
      row(0, { itemId: 'needed' }),
      row(1, { itemId: 'needed', raidStatus: 'non_fir' }),
    ];
    expect(sellGroups(rows, catalog, new Set(['needed']))).toEqual([]);
  });
  it.each([
    { reviewed: false },
    { itemId: '' },
    { itemId: 'not-in-catalog' },
    { excluded: true },
    { quantity: null },
    { quantity: 0 },
    { quantity: 1.5 },
    { quantity: 11 },
  ] satisfies Partial<ReviewedCell>[])(
    'withholds uncertain or excluded observations: %j',
    (patch) => {
      expect(sellGroups([row(0, patch)], catalog, new Set())).toEqual([]);
    }
  );
  it('does not count empty detections, even when other fields were left populated', () => {
    const empty = row();
    empty.cell.empty = true;
    expect(sellGroups([empty], catalog, new Set())).toEqual([]);
  });
  it('rejects repeated keys and overlapping observations instead of inferring duplicates are extra stock', () => {
    const first = row();
    const repeated = row();
    expect(sellGroups([first, repeated], catalog, new Set())).toEqual([]);
    const overlap = row(1);
    overlap.cell.x = 20;
    expect(sellGroups([first, overlap], catalog, new Set())).toEqual([]);
    const sameKey = row();
    sameKey.cell.x = 200;
    expect(sellGroups([first, sameKey], catalog, new Set())).toEqual([]);
  });
  it('does not count an overlap with an uncertain identity; excluded regions have no claim', () => {
    const uncertain = row(1, { reviewed: false });
    uncertain.cell.x = 20;
    expect(sellGroups([row(), uncertain], catalog, new Set())).toEqual([]);
    uncertain.excluded = true;
    expect(sellGroups([row(), uncertain], catalog, new Set())[0]?.quantity).toBe(1);
  });
  it('withholds totals when requirement evidence is unavailable, with a useful empty result', () => {
    expect(sellGroups([row()], catalog, undefined)).toEqual([]);
    expect(sellGroups([], catalog, new Set())).toEqual([]);
  });
  it('withholds impossible aggregate volume rather than showing a partial or surplus recommendation', () => {
    const bulk = [{ ...catalog[0]!, maxStack: 1_000_000 }];
    expect(sellGroups([row(0, { quantity: 1_000_000 }), row(1)], bulk, new Set())).toEqual([]);
  });
  it('requires valid physical bounds before grouping an observation', () => {
    const invalid = row();
    invalid.cell.width = 0;
    expect(sellGroups([invalid], catalog, new Set())).toEqual([]);
  });
  it('does not mutate observations or catalog data while building advice', () => {
    const rows = [row()];
    const before = JSON.stringify({ rows, catalog });
    sellGroups(rows, catalog, new Set());
    expect(JSON.stringify({ rows, catalog })).toBe(before);
  });
});
