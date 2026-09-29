import { afterEach, describe, expect, it, vi } from 'vitest';
import { testOverlayEditions } from '@/server/utils/__tests__/overlayFixtures';
import {
  attachCounterDerivations,
  SUPPORTED_COUNTER_REVISIONS,
  usableCounterDerivations,
} from '@/server/utils/overlayCounters';
import { buildTaskEvaluations, type TaskAvailabilityTeamData } from '@/stores/taskAvailability';
import type { Task } from '@/types/tarkov';
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
    expect([...usableCounterDerivations(overlay, 'pve')]).toEqual([['tier', ['a', 'b', 'c']]]);
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
  ])('derives nothing from an absent, empty or malformed registry: %j', (progressionCounters) => {
    expect(usableCounterDerivations({ progressionCounters }, 'pve').size).toBe(0);
  });
  it('does not read an inherited mode', () => {
    const progressionCounters = Object.create({ pve: { tier: entry() } });
    expect(usableCounterDerivations({ progressionCounters }, 'pve').size).toBe(0);
  });
});
describe('attachCounterDerivations', () => {
  const derivations = new Map([['tier', ['a', 'b', 'c']]]);
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
    expect(counter.taskIds).not.toBe(derivations.get('tier'));
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
