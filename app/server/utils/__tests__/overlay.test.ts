import { describe, expect, it, vi, afterEach } from 'vitest';
import { deepMerge } from '@/server/utils/deepMerge';
import {
  applyLocaleOverlay,
  applyTaskObjectiveAdditions,
  expandObjectiveAdditions,
  getObjectiveItemIds,
} from '@/server/utils/overlay';
const stubOverlayFetch = (overlay: unknown) => {
  const fetchMock = vi.fn(async () => {
    return new Response(JSON.stringify(overlay), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  });
  vi.stubGlobal('fetch', fetchMock as typeof fetch);
  return fetchMock;
};
afterEach(() => {
  vi.unstubAllGlobals();
});
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
  it('preserves empty projection arrays when an overlay contains ID-keyed patches', () => {
    expect(deepMerge({ objectives: [] }, { objectives: { objective1: { count: 2 } } })).toEqual({
      objectives: [],
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
  it('splits overlaid trader requirements into level and reputation fields', async () => {
    const fetchMock = stubOverlayFetch({
      $meta: { version: 'split-test-v1' },
      modes: {
        pve: {
          tasks: {
            'task-1': {
              traderRequirements: [
                {
                  id: 'overlay.1',
                  requirementType: 'level',
                  compareMethod: '>=',
                  value: 1,
                  trader: { id: 'trader-1', name: 'Prapor' },
                },
                {
                  id: 'overlay.2',
                  requirementType: 'reputation',
                  compareMethod: '>=',
                  value: 0.2,
                  trader: { id: 'trader-1', name: 'Prapor' },
                },
              ],
            },
          },
        },
      },
    });
    const { applyOverlay } = await import('@/server/utils/overlay');
    const payload = {
      data: {
        tasks: [
          {
            id: 'task-1',
            name: 'Base Task',
            traderLevelRequirements: [{ id: 'api-level', trader: { id: 'trader-1' }, level: 3 }],
            traderRequirements: [{ id: 'api-rep', trader: { id: 'trader-1' }, value: 0.5 }],
          },
        ],
      },
    };
    const result = await applyOverlay(payload, { gameMode: 'pve' });
    const task = result.data?.tasks?.[0];
    expect(task?.traderLevelRequirements).toEqual([
      {
        id: 'overlay.1',
        requirementType: 'level',
        compareMethod: '>=',
        value: 1,
        level: 1,
        trader: { id: 'trader-1', name: 'Prapor' },
      },
    ]);
    expect(task?.traderRequirements).toEqual([
      {
        id: 'overlay.2',
        requirementType: 'reputation',
        compareMethod: '>=',
        value: 0.2,
        trader: { id: 'trader-1', name: 'Prapor' },
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('splits trader requirements on tasksAdd entries', async () => {
    const fetchMock = stubOverlayFetch({
      $meta: { version: 'tasksadd-split-test-v1' },
      tasksAdd: {
        'new-task': {
          id: 'new-task',
          name: 'Added Task',
          traderRequirements: [
            {
              id: 'add.1',
              requirementType: 'level',
              compareMethod: '>=',
              value: 2,
              trader: { id: 'trader-2', name: 'Therapist' },
            },
            {
              id: 'add.2',
              requirementType: 'reputation',
              compareMethod: '>=',
              value: 0.3,
              trader: { id: 'trader-2', name: 'Therapist' },
            },
          ],
        },
      },
    });
    const { applyOverlay } = await import('@/server/utils/overlay');
    const result = await applyOverlay(
      { data: { tasks: [{ id: 'existing-task', name: 'Existing' }] } },
      { gameMode: 'pve', bypassCache: true }
    );
    const added = result.data?.tasks?.find((task) => task.id === 'new-task') as
      Record<string, unknown> | undefined;
    expect(added?.traderLevelRequirements).toEqual([
      {
        id: 'add.1',
        requirementType: 'level',
        compareMethod: '>=',
        value: 2,
        level: 2,
        trader: { id: 'trader-2', name: 'Therapist' },
      },
    ]);
    expect(added?.traderRequirements).toEqual([
      {
        id: 'add.2',
        requirementType: 'reputation',
        compareMethod: '>=',
        value: 0.3,
        trader: { id: 'trader-2', name: 'Therapist' },
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('drops malformed trader requirement entries during the split', async () => {
    const fetchMock = stubOverlayFetch({
      $meta: { version: 'malformed-split-test-v1' },
      modes: {
        pve: {
          tasks: {
            'task-1': {
              traderRequirements: [
                {
                  id: 'bad-level',
                  requirementType: 'level',
                  trader: { id: 'trader-1', name: 'Prapor' },
                },
                null,
                {
                  id: 'good-rep',
                  requirementType: 'reputation',
                  compareMethod: '>=',
                  value: 0.1,
                  trader: { id: 'trader-1', name: 'Prapor' },
                },
              ],
            },
          },
        },
      },
    });
    const { applyOverlay } = await import('@/server/utils/overlay');
    const result = await applyOverlay(
      { data: { tasks: [{ id: 'task-1', name: 'Base Task' }] } },
      { gameMode: 'pve', bypassCache: true }
    );
    const task = result.data?.tasks?.[0] as Record<string, unknown> | undefined;
    expect(task?.traderLevelRequirements).toBeUndefined();
    expect(task?.traderRequirements).toEqual([
      {
        id: 'good-rep',
        requirementType: 'reputation',
        compareMethod: '>=',
        value: 0.1,
        trader: { id: 'trader-1', name: 'Prapor' },
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('drops level trader requirements with non-finite thresholds', async () => {
    const fetchMock = stubOverlayFetch(
      JSON.parse(
        '{"$meta":{"version":"nonfinite-split-test-v1"},"modes":{"pve":{"tasks":{"task-1":{"traderRequirements":[{"id":"inf-level","requirementType":"level","compareMethod":">=","value":1e999,"trader":{"id":"trader-1","name":"Prapor"}}]}}}}}'
      )
    );
    const { applyOverlay } = await import('@/server/utils/overlay');
    const result = await applyOverlay(
      { data: { tasks: [{ id: 'task-1', name: 'Base Task' }] } },
      { gameMode: 'pve', bypassCache: true }
    );
    const task = result.data?.tasks?.[0] as Record<string, unknown> | undefined;
    expect(task?.traderLevelRequirements).toBeUndefined();
    expect(task?.traderRequirements).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
describe('applyLocaleOverlay', () => {
  it('shallow-merges locale patches (name/wikiLink) over matching entities', () => {
    const tasks = [
      {
        id: '6761f28a022f60bb320f3e95',
        name: 'Neuanfang',
        wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Neuanfang',
      },
      { id: 'other-task', name: 'Unchanged' },
    ];
    const patches = {
      '6761f28a022f60bb320f3e95': {
        name: 'New Beginning',
        wikiLink: 'https://escapefromtarkov.fandom.com/wiki/New_Beginning_(Prestige_1)',
      },
    };
    expect(applyLocaleOverlay(tasks, patches)).toEqual([
      {
        id: '6761f28a022f60bb320f3e95',
        name: 'New Beginning',
        wikiLink: 'https://escapefromtarkov.fandom.com/wiki/New_Beginning_(Prestige_1)',
      },
      { id: 'other-task', name: 'Unchanged' },
    ]);
  });
  it('applies ID-keyed objective description patches', () => {
    const tasks = [
      {
        id: 'task-1',
        name: 'Task',
        objectives: [{ id: 'obj-1', description: 'old description' }],
      },
    ];
    const patches = {
      'task-1': { objectives: { 'obj-1': { description: 'new description' } } },
    };
    expect(applyLocaleOverlay(tasks, patches)).toEqual([
      {
        id: 'task-1',
        name: 'Task',
        objectives: [{ id: 'obj-1', description: 'new description' }],
      },
    ]);
  });
  it('returns entities unchanged when no locale patches are provided', () => {
    const tasks = [{ id: 'task-1', name: 'Task' }];
    expect(applyLocaleOverlay(tasks, undefined)).toBe(tasks);
    expect(applyLocaleOverlay(tasks, {})).toEqual(tasks);
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
