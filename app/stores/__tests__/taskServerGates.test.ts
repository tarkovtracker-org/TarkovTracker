import { describe, expect, it } from 'vitest';
import { buildTaskEvaluations, type TaskAvailabilityTeamData } from '@/stores/taskAvailability';
import { otherRequirementsSignature } from '@/utils/taskOtherRequirements';
import type { RequirementComparison, Task } from '@/types/tarkov';
const gate = (compareMethod: RequirementComparison = '>=', value = 3): Task => ({
  id: 'target',
  otherRequirements: [
    { type: 'globalVariable', id: 'condition', variableId: 'counter', compareMethod, value },
  ],
});
const data = (overrides: Partial<TaskAvailabilityTeamData> = {}): TaskAvailabilityTeamData => ({
  completions: {},
  faction: 'USEC',
  level: 50,
  mode: 'pvp',
  traders: {},
  ...overrides,
});
const evaluate = (task: Task, overrides: Partial<TaskAvailabilityTeamData> = {}) =>
  buildTaskEvaluations([task], new Map([['self', data(overrides)]]), {
    requireTraderLevels: false,
  })[task.id]!.self!;
/** A confirmation stamped after any status change the test sets up. */
const confirmed = (task: Task, timestamp = 1_000) => ({
  [task.id]: { requirements: otherRequirementsSignature(task) ?? '', timestamp },
});
describe('server-side task start gates', () => {
  it('does not treat missing account values or task completions as counter zero', () => {
    expect(
      evaluate(gate('==', 0), { completions: { contributor: { complete: true } } })
    ).toMatchObject({
      available: false,
      blockers: [{ type: 'global_variable_unknown', required: 0, compareMethod: '==' }],
    });
  });
  it.each<RequirementComparison>(['>=', '>', '<=', '<', '=', '==', '!='])(
    'evaluates %s literally',
    (method) => {
      const expected: Record<RequirementComparison, boolean[]> = {
        '>=': [false, true, true],
        '>': [false, false, true],
        '<=': [true, true, false],
        '<': [true, false, false],
        '=': [false, true, false],
        '==': [false, true, false],
        '!=': [true, false, true],
      };
      expect(
        [2, 3, 4].map(
          (counter) => evaluate(gate(method), { globalVariables: { counter } }).available
        )
      ).toEqual(expected[method]);
    }
  );
  it.each([NaN, Infinity, -Infinity, '3', null])(
    'treats invalid explicit value %s as unknown',
    (counter) => {
      expect(
        evaluate(gate(), { globalVariables: { counter } as Record<string, number> }).blockers[0]
          ?.type
      ).toBe('global_variable_unknown');
    }
  );
  it('does not accept inherited variable values', () => {
    expect(evaluate(gate(), { globalVariables: Object.create({ counter: 10 }) }).available).toBe(
      false
    );
  });
  it('keeps a confirmation task-local, mode/user-local and tied to the exact requirements', () => {
    const task = gate();
    const confirmedData = data({ confirmations: confirmed(task) });
    const sibling = { ...task, id: 'sibling' };
    const results = buildTaskEvaluations(
      [task, sibling],
      new Map([
        ['self', confirmedData],
        ['teammate', data({ mode: 'pve' })],
      ]),
      { requireTraderLevels: false }
    );
    expect(results.target!.self!.available).toBe(true);
    expect(results.target!.teammate!.available).toBe(false);
    expect(results.sibling!.self!.available).toBe(false);
    expect(evaluate(gate('>=', 5), confirmedData).available).toBe(false);
  });
  it('never leaks confirmation into downstream active-status requirements', () => {
    const prerequisite: Task = { ...gate(), id: 'prior', minPlayerLevel: 25 };
    const dependent: Task = {
      id: 'target',
      taskRequirements: [{ task: { id: 'prior' }, status: ['active'] }],
    };
    const confirmedData = data({ confirmations: confirmed(prerequisite) });
    // The confirmed prerequisite is still level-blocked, so the dependent stays blocked.
    expect(
      buildTaskEvaluations(
        [prerequisite, dependent],
        new Map([['self', { ...confirmedData, level: 1 }]]),
        { requireTraderLevels: false }
      ).target!.self!.available
    ).toBe(false);
    // A fully available confirmed prerequisite satisfies the active route exactly like a fresh task.
    expect(
      buildTaskEvaluations(
        [prerequisite, dependent],
        new Map([['self', { ...confirmedData, level: 50 }]]),
        { requireTraderLevels: false }
      ).target!.self!.available
    ).toBe(true);
    // Without confirmation the gated prerequisite blocks the dependent.
    expect(
      buildTaskEvaluations([prerequisite, dependent], new Map([['self', data({ level: 50 })]]), {
        requireTraderLevels: false,
      }).target!.self!.available
    ).toBe(false);
  });
  it('never bypasses a known unmet value, independent gates or terminal state', () => {
    const task = gate();
    const confirmations = confirmed(task);
    expect(evaluate(task, { confirmations, globalVariables: { counter: 0 } }).available).toBe(
      false
    );
    expect(evaluate({ ...task, minPlayerLevel: 60 }, { confirmations }).available).toBe(false);
    expect(evaluate({ ...task, disabled: true }, { confirmations }).available).toBe(false);
    for (const status of [{ failed: true }, { complete: true }])
      expect(
        evaluate(task, {
          confirmations,
          completions: { target: { complete: false, failed: false, timestamp: 1, ...status } },
        }).available
      ).toBe(false);
  });
  it('retires a confirmation once the task status changes after it, on any device', () => {
    const task = gate();
    const reset = { target: { complete: false, failed: false, timestamp: 2_000 } };
    expect(evaluate(task, { confirmations: confirmed(task, 1_000) }).available).toBe(true);
    expect(
      evaluate(task, { confirmations: confirmed(task, 1_000), completions: reset }).available
    ).toBe(false);
    expect(
      evaluate(task, { confirmations: confirmed(task, 2_000), completions: reset }).available
    ).toBe(true);
  });
  it('never unlocks a downstream active requirement from a cleared confirmation', () => {
    // Review #979: confirm then clear used to leave an incomplete record that read as active.
    const prerequisite: Task = { ...gate(), id: 'prior', minPlayerLevel: 60 };
    const dependent: Task = {
      id: 'dep',
      taskRequirements: [{ task: { id: 'prior' }, status: ['active'] }],
    };
    const cleared = { prior: { requirements: '', timestamp: 3_000 } };
    expect(
      buildTaskEvaluations(
        [prerequisite, dependent],
        new Map([['self', data({ confirmations: cleared, level: 10 })]]),
        {
          requireTraderLevels: false,
        }
      ).dep!.self!.available
    ).toBe(false);
  });
  it.each([{}, { complete: false }, { complete: false, failed: false }, false])(
    'does not use legacy incomplete state as confirmation',
    (completion) => {
      expect(evaluate(gate(), { completions: { target: completion } }).available).toBe(false);
    }
  );
  it('requires every declared gate and does not let story progress bypass them', () => {
    const task = gate();
    task.otherRequirements!.push({
      type: 'globalVariable',
      id: 'second',
      variableId: 'scalar',
      compareMethod: '==',
      value: 0,
    });
    task.storyUnlocks = [{ id: 'chapter', name: 'Story' }];
    expect(
      evaluate(task, {
        globalVariables: { counter: 3 },
        storyChapters: { chapter: { complete: true } },
      }).available
    ).toBe(false);
    expect(evaluate(task, { globalVariables: { counter: 3, scalar: 0 } }).available).toBe(true);
  });
  it('requires explicit confirmation for dialogue, never ignores an unsupported gate', () => {
    const task: Task = {
      id: 'target',
      otherRequirements: [{ type: 'dialogue', id: 'talk', traders: ['trader'] }],
    };
    expect(evaluate(task).blockers[0]?.type).toBe('dialogue');
    expect(evaluate(task, { confirmations: confirmed(task) }).available).toBe(true);
    task.otherRequirements!.push({ type: 'unknown' });
    expect(otherRequirementsSignature(task)).toBeUndefined();
    expect(evaluate(task).available).toBe(false);
  });
  it('evaluates overlay story-objective gates from tracked story progress', () => {
    // Pre-merge audit: the live overlay gates four Boreas tasks on a story objective; they must be
    // unlockable, not permanently unknown.
    const task: Task = {
      id: 'target',
      otherRequirements: [
        {
          type: 'storyObjective',
          id: 'story',
          storyChapter: { id: 'boreas', name: 'Boreas' },
          objective: { id: 'drives', name: 'Decode the drives' },
        },
      ],
    };
    expect(evaluate(task)).toMatchObject({
      available: false,
      blockers: [
        {
          type: 'story_objective',
          chapterIds: ['boreas'],
          objective: { id: 'drives', name: 'Decode the drives' },
        },
      ],
    });
    const done = { boreas: { objectives: { drives: { complete: true } } } };
    expect(evaluate(task, { storyChapters: done }).available).toBe(true);
    expect(
      evaluate(task, { storyChapters: { boreas: { objectives: { drives: { complete: false } } } } })
        .available
    ).toBe(false);
    // Story gates are tracked progress, not in-game confirmations.
    expect(otherRequirementsSignature(task)).toBeUndefined();
    expect(
      evaluate(task, { confirmations: { target: { requirements: '[]', timestamp: 1_000 } } })
        .available
    ).toBe(false);
  });
  it('confirms only the confirmable gates of a task that also has a story gate', () => {
    const task: Task = {
      id: 'target',
      otherRequirements: [
        { type: 'dialogue', id: 'talk', traders: ['t'] },
        { type: 'storyObjective', id: 's', storyChapter: { id: 'c' }, objective: { id: 'o' } },
      ],
    };
    expect(otherRequirementsSignature(task)).toBe(
      JSON.stringify([{ type: 'dialogue', id: 'talk', traders: ['t'] }])
    );
    const storyDone = { c: { objectives: { o: { complete: true } } } };
    expect(evaluate(task, { storyChapters: storyDone }).blockers[0]?.type).toBe('dialogue');
    expect(
      evaluate(task, { storyChapters: storyDone, confirmations: confirmed(task) }).available
    ).toBe(true);
  });
  it('does not infer loyalty gates from variable IDs or pool membership', () => {
    expect(evaluate(gate(), { globalVariables: { counter: 3 } }).available).toBe(true);
  });
});
describe('registry-derived counters', () => {
  const counter = { type: 'distinctTaskCompletions' as const, taskIds: ['a', 'b', 'c', 'd'] };
  const derived = (value = 2, compareMethod: RequirementComparison = '>='): Task => ({
    id: 'target',
    otherRequirements: [
      {
        type: 'globalVariable',
        id: 'condition',
        variableId: 'tier',
        compareMethod,
        value,
        counter,
      },
    ],
  });
  const done = (...ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, { complete: true, failed: false }]));
  it('counts completed contributors against the threshold', () => {
    expect(evaluate(derived(), { completions: done('a') })).toMatchObject({
      available: false,
      blockers: [
        {
          type: 'task_counter',
          requirementId: 'condition',
          variableId: 'tier',
          current: 1,
          required: 2,
          compareMethod: '>=',
        },
      ],
    });
    expect(evaluate(derived(), { completions: done('a', 'd') }).available).toBe(true);
  });
  it('reports a known zero for a new account instead of treating it as unknown', () => {
    expect(evaluate(derived(1)).blockers).toEqual([
      expect.objectContaining({ type: 'task_counter', current: 0, required: 1 }),
    ]);
  });
  it('does not count failed, active, confirmed or non-contributor tasks', () => {
    const completions = {
      a: { complete: false, failed: true },
      b: { complete: false, failed: false },
      c: { complete: false, failed: false },
      other: { complete: true, failed: false },
    };
    const confirmations = { c: { requirements: 'confirmed', timestamp: 10 } };
    expect(evaluate(derived(1), { completions, confirmations }).blockers[0]).toMatchObject({
      current: 0,
    });
  });
  it('compares the derived value with the declared operator', () => {
    expect(evaluate(derived(0, '=='), { completions: done('a') }).available).toBe(false);
    expect(evaluate(derived(0, '==')).available).toBe(true);
  });
  it('lets an explicit account value take precedence, including an invalid one', () => {
    expect(
      evaluate(derived(), { completions: done('a', 'b'), globalVariables: { tier: 0 } }).blockers[0]
        ?.type
    ).toBe('global_variable');
    expect(
      evaluate(derived(), {
        completions: done('a', 'b'),
        globalVariables: { tier: NaN } as Record<string, number>,
      }).blockers[0]?.type
    ).toBe('global_variable_unknown');
    expect(evaluate(derived(), { globalVariables: { tier: 5 } }).available).toBe(true);
  });
  it('lets an in-game confirmation override a derived shortfall', () => {
    const task = derived(3);
    expect(
      evaluate(task, { completions: done('a'), confirmations: confirmed(task) }).available
    ).toBe(true);
  });
  it('keeps confirmations valid when a derivation is attached or removed', () => {
    const plain: Task = {
      id: 'target',
      otherRequirements: [
        {
          type: 'globalVariable',
          id: 'condition',
          variableId: 'tier',
          compareMethod: '>=',
          value: 3,
        },
      ],
    };
    expect(otherRequirementsSignature(derived(3))).toBe(otherRequirementsSignature(plain));
  });
  it('still requires independent gates when the derived counter is met', () => {
    const task = { ...derived(1), minPlayerLevel: 60 };
    expect(evaluate(task, { completions: done('a') }).available).toBe(false);
  });
  it.each([
    { type: 'sum', taskIds: ['a'] },
    { type: 'distinctTaskCompletions', taskIds: [] },
    { type: 'distinctTaskCompletions', taskIds: ['a', 'a'] },
    { type: 'distinctTaskCompletions', taskIds: ['a', ''] },
    { type: 'distinctTaskCompletions' },
    'a,b',
  ])('drops malformed derivation %j and falls back to an unknown value', (malformed) => {
    const task = {
      id: 'target',
      otherRequirements: [
        {
          type: 'globalVariable',
          id: 'condition',
          variableId: 'tier',
          compareMethod: '>=',
          value: 1,
          counter: malformed,
        },
      ],
    } as unknown as Task;
    expect(evaluate(task, { completions: done('a') }).blockers[0]?.type).toBe(
      'global_variable_unknown'
    );
  });
});
