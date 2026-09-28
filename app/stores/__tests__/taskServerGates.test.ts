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
const confirmation = (task: Task) => ({
  complete: false,
  failed: false,
  availabilityRequirements: otherRequirementsSignature(task),
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
    const confirmed = data({ completions: { target: confirmation(task) } });
    const sibling = { ...task, id: 'sibling' };
    const results = buildTaskEvaluations(
      [task, sibling],
      new Map([
        ['self', confirmed],
        ['teammate', data({ mode: 'pve' })],
      ]),
      { requireTraderLevels: false }
    );
    expect(results.target!.self!.available).toBe(true);
    expect(results.target!.teammate!.available).toBe(false);
    expect(results.sibling!.self!.available).toBe(false);
    expect(evaluate(gate('>=', 5), confirmed).available).toBe(false);
  });
  it('never leaks confirmation into downstream active-status requirements', () => {
    const prerequisite: Task = { ...gate(), id: 'prior', minPlayerLevel: 25 };
    const dependent: Task = {
      id: 'target',
      taskRequirements: [{ task: { id: 'prior' }, status: ['active'] }],
    };
    const confirmed = data({ completions: { prior: confirmation(prerequisite) } });
    // The confirmed prerequisite is still level-blocked, so the dependent stays blocked.
    expect(
      buildTaskEvaluations(
        [prerequisite, dependent],
        new Map([['self', { ...confirmed, level: 1 }]]),
        { requireTraderLevels: false }
      ).target!.self!.available
    ).toBe(false);
    // A fully available confirmed prerequisite satisfies the active route exactly like a fresh task.
    expect(
      buildTaskEvaluations(
        [prerequisite, dependent],
        new Map([['self', { ...confirmed, level: 50 }]]),
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
    const completions = { target: confirmation(task) };
    expect(evaluate(task, { completions, globalVariables: { counter: 0 } }).available).toBe(false);
    expect(evaluate({ ...task, minPlayerLevel: 60 }, { completions }).available).toBe(false);
    expect(evaluate({ ...task, disabled: true }, { completions }).available).toBe(false);
    expect(
      evaluate(task, { completions: { target: { ...confirmation(task), failed: true } } }).available
    ).toBe(false);
    expect(
      evaluate(task, { completions: { target: { ...confirmation(task), complete: true } } })
        .available
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
    expect(evaluate(task, { completions: { target: confirmation(task) } }).available).toBe(true);
    task.otherRequirements!.push({ type: 'unknown' });
    expect(otherRequirementsSignature(task)).toBeUndefined();
    expect(evaluate(task).available).toBe(false);
  });
  it('does not infer loyalty gates from variable IDs or pool membership', () => {
    expect(evaluate(gate(), { globalVariables: { counter: 3 } }).available).toBe(true);
  });
});
