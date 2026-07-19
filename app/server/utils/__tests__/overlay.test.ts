import { describe, expect, it } from 'vitest';
import { deepMerge } from '@/server/utils/deepMerge';
import {
  applyTaskObjectiveAdditions,
  expandObjectiveAdditions,
  getObjectiveItemIds,
} from '@/server/utils/overlay';
describe('deepMerge id-keyed arrays', () => {
  it('deep merges plain-object patches by id and leaves non-object patches unchanged', () => {
    const target = {
      list: [
        { id: 'alpha', foo: 'old', nested: { y: 2 } },
        { id: 'beta', value: 123 },
        { id: 'gamma', keep: true },
      ],
    };
    const source = {
      list: {
        alpha: { foo: 'new', nested: { x: 1 } },
        beta: ['not', 'an', 'object'],
      },
    };
    expect(deepMerge(target, source)).toEqual({
      list: [
        { id: 'alpha', foo: 'new', nested: { y: 2, x: 1 } },
        { id: 'beta', value: 123 },
        { id: 'gamma', keep: true },
      ],
    });
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
describe('getObjectiveItemIds', () => {
  it('extracts id from objective.item', () => {
    const ids = getObjectiveItemIds({ item: { id: 'item-1' } });
    expect(ids).toEqual(new Set(['item-1']));
  });
  it('extracts ids from objective.items array', () => {
    const ids = getObjectiveItemIds({
      items: [{ id: 'item-1' }, { id: 'item-2' }],
    });
    expect(ids).toEqual(new Set(['item-1', 'item-2']));
  });
  it('extracts id from objective.questItem', () => {
    const ids = getObjectiveItemIds({ questItem: { id: 'quest-item-1' } });
    expect(ids).toEqual(new Set(['quest-item-1']));
  });
  it('returns empty set for objective with no items', () => {
    const ids = getObjectiveItemIds({ type: 'visit', description: 'Go somewhere' });
    expect(ids).toEqual(new Set());
  });
  it('skips non-plain-object entries in items array', () => {
    const ids = getObjectiveItemIds({ items: ['not-an-object', null, { id: 'valid' }] });
    expect(ids).toEqual(new Set(['valid']));
  });
});
describe('expandObjectiveAdditions', () => {
  it('expands multi-item entry into individual objectives', () => {
    const additions = [
      {
        id: 'collector-missing',
        description: 'Hand over the found in raid Collector items',
        items: [
          { id: 'item-a', name: 'Item A' },
          { id: 'item-b', name: 'Item B' },
        ],
      },
    ];
    const expanded = expandObjectiveAdditions(additions);
    expect(expanded).toHaveLength(2);
    expect(expanded[0]?.id).toBe('collector-missing:item-a');
    expect(expanded[0]?.items).toEqual([{ id: 'item-a', name: 'Item A' }]);
    expect(expanded[1]?.id).toBe('collector-missing:item-b');
    expect(expanded[1]?.items).toEqual([{ id: 'item-b', name: 'Item B' }]);
  });
  it('skips non-plain-object entries', () => {
    const expanded = expandObjectiveAdditions(['not-an-object', null, 42]);
    expect(expanded).toHaveLength(0);
  });
});
describe('applyTaskObjectiveAdditions', () => {
  it('skips overlay objectives whose items already exist in API objectives', () => {
    const task = {
      id: 'task-1',
      objectives: [
        { id: 'obj-1', type: 'giveItem', item: { id: 'item-a' }, count: 1 },
        { id: 'obj-2', type: 'giveItem', item: { id: 'item-b' }, count: 1 },
      ],
      objectivesAdd: [
        {
          id: 'overlay-obj',
          description: 'Hand over the found in raid items',
          items: [
            { id: 'item-a', name: 'Item A' },
            { id: 'item-b', name: 'Item B' },
          ],
        },
      ],
    };
    const result = applyTaskObjectiveAdditions(task);
    expect(result.objectives).toHaveLength(2);
    expect(result.objectives.map((o: { id: string }) => o.id)).toEqual(['obj-1', 'obj-2']);
    expect(result).not.toHaveProperty('objectivesAdd');
  });
  it('keeps overlay objectives whose items are NOT in API objectives', () => {
    const task = {
      id: 'task-1',
      objectives: [{ id: 'obj-1', type: 'giveItem', item: { id: 'item-a' }, count: 1 }],
      objectivesAdd: [
        {
          id: 'overlay-obj',
          description: 'Hand over the found in raid item',
          items: [{ id: 'item-new', name: 'New Item' }],
        },
      ],
    };
    const result = applyTaskObjectiveAdditions(task);
    expect(result.objectives).toHaveLength(2);
    expect(result.objectives[0]?.id).toBe('obj-1');
    expect(result.objectives[1]?.id).toBe('overlay-obj');
  });
  it('keeps only non-duplicate overlay objectives in a mixed set', () => {
    const task = {
      id: 'task-1',
      objectives: [{ id: 'obj-1', type: 'giveItem', item: { id: 'item-existing' }, count: 1 }],
      objectivesAdd: [
        {
          id: 'overlay-mixed',
          description: 'Hand over the found in raid items',
          items: [
            { id: 'item-existing', name: 'Already in API' },
            { id: 'item-new', name: 'Not in API' },
          ],
        },
      ],
    };
    const result = applyTaskObjectiveAdditions(task);
    expect(result.objectives).toHaveLength(2);
    const objectiveIds = result.objectives.map((o: { id: string }) => o.id);
    expect(objectiveIds).toContain('obj-1');
    expect(objectiveIds).toContain('overlay-mixed:item-new');
    expect(objectiveIds).not.toContain('overlay-mixed:item-existing');
  });
  it('keeps non-item overlay objectives', () => {
    const task = {
      id: 'task-1',
      objectives: [{ id: 'obj-1', type: 'visit' }],
      objectivesAdd: [
        {
          id: 'overlay-extract',
          description: 'Survive and extract from Interchange',
          maps: [{ id: '5714dbc024597771384a510d', name: 'Interchange' }],
          type: 'extract',
        },
      ],
    };
    const result = applyTaskObjectiveAdditions(task);
    expect(result.objectives).toHaveLength(2);
    expect(result.objectives[0]?.id).toBe('obj-1');
    expect(result.objectives[1]?.id).toBe('overlay-extract');
    expect(result).not.toHaveProperty('objectivesAdd');
  });
  it('returns task unchanged when objectivesAdd is empty', () => {
    const task = {
      id: 'task-1',
      objectives: [{ id: 'obj-1', type: 'giveItem', item: { id: 'item-a' }, count: 1 }],
      objectivesAdd: [],
    };
    const result = applyTaskObjectiveAdditions(task);
    expect(result.objectives).toHaveLength(1);
  });
  it('returns task unchanged when there is no objectivesAdd', () => {
    const task = {
      id: 'task-1',
      objectives: [{ id: 'obj-1', type: 'giveItem', item: { id: 'item-a' }, count: 1 }],
    };
    const result = applyTaskObjectiveAdditions(task);
    expect(result).toEqual(task);
  });
  it('deduplicates by questItem id', () => {
    const task = {
      id: 'task-1',
      objectives: [
        { id: 'obj-1', type: 'giveQuestItem', questItem: { id: 'quest-item-1' }, count: 1 },
      ],
      objectivesAdd: [
        {
          id: 'overlay-quest',
          type: 'giveQuestItem',
          questItem: { id: 'quest-item-1' },
        },
      ],
    };
    const result = applyTaskObjectiveAdditions(task);
    expect(result.objectives).toHaveLength(1);
    expect(result.objectives[0]?.id).toBe('obj-1');
  });
  it('strips objectivesAdd from the result', () => {
    const task = {
      id: 'task-1',
      objectives: [],
      objectivesAdd: [
        {
          id: 'overlay-obj',
          type: 'giveItem',
          items: [{ id: 'item-a', name: 'Item A' }],
        },
      ],
    };
    const result = applyTaskObjectiveAdditions(task);
    expect(result).not.toHaveProperty('objectivesAdd');
  });
});
