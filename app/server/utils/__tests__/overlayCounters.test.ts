import { afterEach, describe, expect, it, vi } from 'vitest';
import { testOverlayEditions } from '@/server/utils/__tests__/overlayFixtures';
import {
  attachCounterDerivations,
  progressionPools,
  validProgressionCounters,
  SUPPORTED_COUNTER_REVISIONS,
  usableCounterDerivations,
} from '@/server/utils/overlayCounters';
import { buildTaskEvaluations, type TaskAvailabilityTeamData } from '@/stores/taskAvailability';
import type { Task, TaskCounterDerivation } from '@/types/tarkov';
const entry = (overrides: Record<string, unknown> = {}) => ({
  revision: '1.1.0',
  verification: 'verified',
  coverage: 'complete',
  derivation: { type: 'distinctTaskCompletions', taskIds: ['a', 'b', 'c'] },
  proof: ['https://example.com/proof'],
  ...overrides,
});
const gate = (variableId = 'tier', value = 2, extra: Record<string, unknown> = {}) => ({
  type: 'globalVariable',
  id: `condition-${variableId}`,
  variableId,
  compareMethod: '>=',
  value,
  ...extra,
});
const tasks = () => [
  { id: 'a' },
  { id: 'b' },
  { id: 'c' },
  { id: 'target', otherRequirements: [gate()] },
];
describe('usableCounterDerivations', () => {
  it('pins the supported game-rules revision', () => {
    expect([...SUPPORTED_COUNTER_REVISIONS]).toEqual(['1.1.0']);
  });
  it('returns only verified, complete entries for the requested mode and supported revision', () => {
    const overlay = {
      progressionCounters: {
        pve: {
          tier: entry(),
          unresolved: entry({ verification: 'unresolved', coverage: 'partial' }),
          partial: entry({ coverage: 'partial' }),
          futureRules: entry({ revision: '2.0.0' }),
        },
        regular: { other: entry() },
      },
    };
    expect([...usableCounterDerivations(overlay, 'pve')]).toEqual([
      ['tier', { type: 'distinctTaskCompletions', taskIds: ['a', 'b', 'c'] }],
    ]);
    expect([...usableCounterDerivations(overlay, 'regular').keys()]).toEqual(['other']);
    expect(usableCounterDerivations(overlay, 'pvp-season').size).toBe(0);
  });
  it.each([
    undefined,
    null,
    [],
    {},
    { pve: { tier: entry({ extra: 1 }) } },
    { pvp: { tier: entry() } },
    { pve: { tier: entry({ derivation: { type: 'sum', taskIds: ['a'] } }) } },
    { pve: { tier: entry({ derivation: { type: 'taskGroupCompletions', taskIds: ['a'] } }) } },
    { pve: { tier: entry({ derivation: { type: 'taskGroupCompletions', groups: [] } }) } },
    { pve: { tier: entry({ derivation: { type: 'taskGroupCompletions', groups: [[]] } }) } },
    { pve: { tier: entry({ derivation: { type: 'taskGroupCompletions', groups: ['a'] } }) } },
    {
      pve: {
        tier: entry({ derivation: { type: 'taskGroupCompletions', groups: [['a'], ['b', 'a']] } }),
      },
    },
    ...[
      [{ anyOf: ['a'] }],
      [{ anyOf: [] }],
      [{ anyOf: ['a', 'a'] }],
      [{ anyOf: ['a', 'b'], extra: 1 }],
      [{ allOf: ['a', 'b'] }],
      [{ anyOf: ['a', 'b'] }, ['b']],
    ].map((groups) => ({
      pve: { tier: entry({ derivation: { type: 'taskGroupCompletions', groups } }) },
    })),
    {
      pve: {
        tier: entry({
          derivation: { type: 'taskGroupCompletions', groups: [['a']], taskIds: ['a'] },
        }),
      },
    },
  ])('derives nothing from an absent, empty or malformed registry: %j', (progressionCounters) => {
    expect(usableCounterDerivations({ progressionCounters }, 'pve').size).toBe(0);
  });
  it('accepts task-group derivations', () => {
    const derivation = {
      type: 'taskGroupCompletions',
      groups: [['a', 'b'], { anyOf: ['c', 'd'] }],
    };
    const overlay = { progressionCounters: { pve: { tier: entry({ derivation }) } } };
    expect([...usableCounterDerivations(overlay, 'pve')]).toEqual([['tier', derivation]]);
  });
  it('does not read an inherited mode', () => {
    const progressionCounters = Object.create({ pve: { tier: entry() } });
    expect(usableCounterDerivations({ progressionCounters }, 'pve').size).toBe(0);
  });
});
describe('attachCounterDerivations', () => {
  const derivations = new Map<string, TaskCounterDerivation>([
    ['tier', { type: 'distinctTaskCompletions', taskIds: ['a', 'b', 'c'] }],
  ]);
  it('attaches contributors to the matching gate only', () => {
    const input = [
      ...tasks(),
      { id: 'dialogue', otherRequirements: [{ type: 'dialogue', id: 'd', traders: ['t'] }] },
      { id: 'scalar', otherRequirements: [gate('scalar')] },
    ];
    const [, , , target, dialogue, scalar] = attachCounterDerivations(input, derivations);
    expect(target!.otherRequirements).toEqual([
      gate('tier', 2, { counter: { type: 'distinctTaskCompletions', taskIds: ['a', 'b', 'c'] } }),
    ]);
    expect(dialogue!.otherRequirements).toEqual(input[4]!.otherRequirements);
    expect(scalar!.otherRequirements).toEqual([gate('scalar')]);
  });
  it('attaches nothing when a contributor is missing from the task list', () => {
    const [target] = attachCounterDerivations(
      [{ id: 'target', otherRequirements: [gate()] }, { id: 'a' }],
      derivations
    );
    expect(target!.otherRequirements).toEqual([gate()]);
  });
  it('replaces a derivation the registry does not declare', () => {
    const injected = gate('tier', 2, {
      counter: { type: 'distinctTaskCompletions', taskIds: ['a'] },
    });
    const stray = gate('scalar', 1, {
      counter: { type: 'distinctTaskCompletions', taskIds: ['a'] },
    });
    const [target] = attachCounterDerivations(
      [
        { id: 'target', otherRequirements: [injected, stray] },
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
      ],
      derivations
    );
    expect(target!.otherRequirements).toEqual([
      gate('tier', 2, { counter: { type: 'distinctTaskCompletions', taskIds: ['a', 'b', 'c'] } }),
      gate('scalar', 1),
    ]);
  });
  it('does not mutate the input or share contributor arrays', () => {
    const input = tasks();
    const [, , , target] = attachCounterDerivations(input, derivations);
    expect(input[3]!.otherRequirements).toEqual([gate()]);
    const counter = (
      target!.otherRequirements as unknown as Array<{ counter: { taskIds: string[] } }>
    )[0]!.counter;
    expect(counter.taskIds).not.toBe((derivations.get('tier') as { taskIds: string[] }).taskIds);
  });
  it('attaches a task-group derivation only when every member exists, as a copy', () => {
    const groups = [['a', 'b'], ['c']];
    const grouped = new Map<string, TaskCounterDerivation>([
      ['tier', { type: 'taskGroupCompletions', groups }],
    ]);
    const [, , , target] = attachCounterDerivations(tasks(), grouped);
    const [attached] = target!.otherRequirements as unknown as Array<{
      counter: { groups: string[][] };
    }>;
    expect(attached).toEqual(
      gate('tier', 2, { counter: { type: 'taskGroupCompletions', groups } })
    );
    expect(attached!.counter.groups[0]).not.toBe(groups[0]);
    const anyOf = { anyOf: ['b', 'c'] };
    const [, , , anyOfTarget] = attachCounterDerivations(
      tasks(),
      new Map<string, TaskCounterDerivation>([
        ['tier', { type: 'taskGroupCompletions', groups: [['a'], anyOf] }],
      ])
    );
    const [anyOfGate] = anyOfTarget!.otherRequirements as unknown as Array<{
      counter: { groups: unknown[] };
    }>;
    expect(anyOfGate!.counter.groups).toEqual([['a'], anyOf]);
    expect(anyOfGate!.counter.groups[1]).not.toBe(anyOf);
    expect((anyOfGate!.counter.groups[1] as typeof anyOf).anyOf).not.toBe(anyOf.anyOf);
    const [missing] = attachCounterDerivations(
      [{ id: 'target', otherRequirements: [gate()] }, { id: 'a' }, { id: 'c' }],
      grouped
    );
    expect(missing!.otherRequirements).toEqual([gate()]);
  });
});
describe('applyOverlay progression counters', () => {
  const stubOverlay = (progressionCounters: unknown) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              editions: testOverlayEditions,
              $meta: { generated: '2026-09-28T00:00:00.000Z', sha256: 'counter-sha', version: '1' },
              progressionCounters,
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 }
          )
      ) as typeof fetch
    );
  const apply = async (progressionCounters: unknown, gameMode: string) => {
    stubOverlay(progressionCounters);
    const { applyOverlay } = await import('@/server/utils/overlay');
    return applyOverlay({ data: { tasks: tasks() } }, { gameMode });
  };
  const progress = (completions: TaskAvailabilityTeamData['completions']) =>
    new Map([
      [
        'self',
        {
          completions,
          faction: 'USEC',
          level: 99,
          mode: 'pve',
          traders: {},
        } as TaskAvailabilityTeamData,
      ],
    ]);
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });
  it('consumes the registry and lets completed contributors satisfy the gate in that mode', async () => {
    const result = await apply({ pve: { tier: entry() } }, 'pve');
    expect(result.dataOverlay.unconsumedSections).toEqual([]);
    const payload = result.data!.tasks as unknown as Task[];
    const evaluate = (completions: TaskAvailabilityTeamData['completions']) =>
      buildTaskEvaluations(payload, progress(completions), { requireTraderLevels: false }).target!
        .self!;
    expect(evaluate({ a: { complete: true } })).toMatchObject({
      available: false,
      blockers: [{ type: 'task_counter', current: 1, required: 2, compareMethod: '>=' }],
    });
    expect(evaluate({ a: { complete: true }, c: { complete: true } }).available).toBe(true);
  });
  it('counts a task group only once all its members are complete, end to end', async () => {
    const derivation = { type: 'taskGroupCompletions', groups: [['a', 'b'], ['c']] };
    const result = await apply({ pve: { tier: entry({ derivation }) } }, 'pve');
    expect(result.dataOverlay.unconsumedSections).toEqual([]);
    const payload = result.data!.tasks as unknown as Task[];
    const evaluate = (completions: TaskAvailabilityTeamData['completions']) =>
      buildTaskEvaluations(payload, progress(completions), { requireTraderLevels: false }).target!
        .self!;
    expect(evaluate({ b: { complete: true }, c: { complete: true } })).toMatchObject({
      available: false,
      blockers: [{ type: 'task_counter', current: 1, required: 2 }],
    });
    expect(
      evaluate({ a: { complete: true }, b: { complete: true }, c: { complete: true } }).available
    ).toBe(true);
  });
  it('counts an anyOf group once any member is complete, end to end', async () => {
    const derivation = { type: 'taskGroupCompletions', groups: [{ anyOf: ['a', 'b'] }, ['c']] };
    const result = await apply({ pve: { tier: entry({ derivation }) } }, 'pve');
    const payload = result.data!.tasks as unknown as Task[];
    const evaluate = (completions: TaskAvailabilityTeamData['completions']) =>
      buildTaskEvaluations(payload, progress(completions), { requireTraderLevels: false }).target!
        .self!;
    expect(evaluate({ a: { complete: true }, b: { complete: true } })).toMatchObject({
      available: false,
      blockers: [{ type: 'task_counter', current: 1, required: 2 }],
    });
    expect(evaluate({ b: { complete: true }, c: { complete: true } }).available).toBe(true);
  });
  it('applies no derivation in a mode the registry does not cover', async () => {
    const result = await apply({ pve: { tier: entry() } }, 'regular');
    const target = (result.data!.tasks as Array<{ id: string; otherRequirements?: unknown }>)[3]!;
    expect(target.otherRequirements).toEqual([gate()]);
  });
  it('reports and ignores a malformed registry', async () => {
    const result = await apply({ pve: { tier: entry({ coverage: 'most' }) } }, 'pve');
    expect(result.dataOverlay.unconsumedSections).toEqual(['progressionCounters']);
    const target = (result.data!.tasks as Array<{ id: string; otherRequirements?: unknown }>)[3]!;
    expect(target.otherRequirements).toEqual([gate()]);
  });
});
describe('progression pool metadata', () => {
  const pool = { traderId: 'mechanic', loyaltyLevel: 2 };
  it.each(['regular', 'pve', 'pvp-season'])(
    'projects unresolved pools only for supported %s rules',
    (mode) => {
      const overlay = {
        progressionCounters: {
          [mode]: { tier: entry({ pool, verification: 'unresolved', coverage: 'partial' }) },
        },
      };
      expect(validProgressionCounters(overlay.progressionCounters)).toBe(true);
      const pools = progressionPools(overlay, mode);
      expect(pools.get('tier')).toMatchObject({
        ...pool,
        verification: 'unresolved',
        coverage: 'partial',
      });
      expect(usableCounterDerivations(overlay, mode).size).toBe(0);
      const output = attachCounterDerivations(tasks(), new Map(), pools);
      expect(output[3]!.otherRequirements).toEqual([
        gate('tier', 2, { taskPool: pools.get('tier') }),
      ]);
      expect(progressionPools(overlay, 'missing').size).toBe(0);
      expect(
        progressionPools(
          { progressionCounters: { [mode]: { tier: entry({ pool, revision: 'future' }) } } },
          mode
        ).size
      ).toBe(0);
    }
  );
  it.each([
    null,
    {},
    { traderId: '', loyaltyLevel: 2 },
    { traderId: 'm', loyaltyLevel: 0 },
    { traderId: 'm', loyaltyLevel: 2.5 },
    { ...pool, extra: true },
  ])('rejects malformed metadata %j', (pool) => {
    expect(validProgressionCounters({ pve: { tier: entry({ pool }) } })).toBe(false);
  });
  it('strips injected metadata and requires every candidate to exist', () => {
    const pools = progressionPools(
      { progressionCounters: { pve: { tier: entry({ pool }) } } },
      'pve'
    );
    const injected = gate('tier', 2, {
      taskPool: { ...pool, traderId: 'injected' },
      counter: { type: 'distinctTaskCompletions', taskIds: ['a'] },
    });
    const input = [{ id: 'target', otherRequirements: [injected] }, { id: 'a' }];
    expect(attachCounterDerivations(input, new Map(), pools)[0]!.otherRequirements).toEqual([
      gate(),
    ]);
  });
});
