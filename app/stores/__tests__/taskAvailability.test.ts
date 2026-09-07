import { describe, expect, it } from 'vitest';
import {
  buildTaskEvaluations,
  type TaskAvailabilityTeamData,
  type TaskEvaluationOptions,
} from '@/stores/taskAvailability';
import { normalizeTraderRequirements } from '@/utils/taskRequirements';
import type { Task, RequirementComparison } from '@/types/tarkov';
import type { GameMode } from '@/utils/constants';
const data = (overrides: Partial<TaskAvailabilityTeamData> = {}): TaskAvailabilityTeamData => ({
  completions: {},
  faction: 'USEC',
  level: 1,
  mode: 'pvp',
  traders: {},
  prestigeLevel: 0,
  storyChapters: {},
  ...overrides,
});
const taskWithTrader = (kind = 'level', method = '>=', value = 3, trader = 'prapor'): Task => ({
  id: 'target',
  normalizedTraderRequirements: normalizeTraderRequirements([
    {
      id: 'req',
      requirementType: kind,
      compareMethod: method,
      value,
      trader: { id: trader, name: trader },
    },
  ]),
});
const evaluate = (
  task: Task,
  progress = data(),
  others: Task[] = [],
  options: Partial<TaskEvaluationOptions> = {}
) =>
  buildTaskEvaluations([task, ...others], new Map([['self', progress]]), {
    requireTraderLevels: true,
    ...options,
  })[task.id]!.self!;
describe('canonical task availability', () => {
  it('preserves cycle and missing-reference diagnostics through active prerequisites', () => {
    const a: Task = { id: 'a', taskRequirements: [{ task: { id: 'b' }, status: ['active'] }] };
    const b: Task = { id: 'b', taskRequirements: [{ task: { id: 'a' }, status: ['active'] }] };
    expect(evaluate(a, data(), [b]).blockers).toContainEqual(
      expect.objectContaining({ type: 'cycle' })
    );
    expect(evaluate(a).blockers).toContainEqual(
      expect.objectContaining({ type: 'unknown', reason: 'task_reference' })
    );
  });
  it.each([1, 2, 3, 4])('evaluates LL%i against loyalty, never reputation', (required) => {
    const task = taskWithTrader('level', '>=', required);
    expect(
      evaluate(task, data({ traders: { prapor: { level: required, reputation: -10 } } })).available
    ).toBe(true);
    if (required > 1)
      expect(
        evaluate(task, data({ traders: { prapor: { level: required - 1, reputation: 100 } } }))
          .blockers
      ).toMatchObject([{ type: 'trader_level', required }]);
  });
  it.each<RequirementComparison>(['>=', '>', '<=', '<', '=', '==', '!='])(
    'honors declared %s comparisons for positive/negative/zero reputation',
    (method) => {
      const operators = {
        '>=': (a: number, b: number) => a >= b,
        '>': (a: number, b: number) => a > b,
        '<=': (a: number, b: number) => a <= b,
        '<': (a: number, b: number) => a < b,
        '=': (a: number, b: number) => a === b,
        '==': (a: number, b: number) => a === b,
        '!=': (a: number, b: number) => a !== b,
      };
      for (const threshold of [-3, 0, 0.5])
        for (const current of [threshold - 1, threshold, threshold + 1]) {
          expect(
            evaluate(
              taskWithTrader('reputation', method, threshold),
              data({ traders: { prapor: { reputation: current } } })
            ).available
          ).toBe(operators[method](current, threshold));
        }
    }
  );
  it('keeps Fence level and reputation independently required', () => {
    const task = taskWithTrader('level', '>=', 2, 'fence');
    task.normalizedTraderRequirements!.push(
      ...taskWithTrader('reputation', '<', -3, 'fence').normalizedTraderRequirements!
    );
    expect(
      evaluate(task, data({ traders: { fence: { level: 2, reputation: -3 } } })).blockers[0]?.type
    ).toBe('trader_reputation');
    expect(
      evaluate(task, data({ traders: { fence: { level: 2, reputation: -4 } } })).available
    ).toBe(true);
  });
  it('does not silently ignore unknown requirements even with trader gating disabled', () => {
    for (const raw of [
      null,
      { requirementType: 'future' },
      { value: 3 },
      { requirementType: 'level', value: 3 },
      { requirementType: 'level', value: NaN },
      { requirementType: 'reputation', compareMethod: 'approximately', value: 1 },
    ]) {
      const task: Task = {
        id: 'unknown',
        normalizedTraderRequirements: normalizeTraderRequirements([raw]),
      };
      expect(evaluate(task, data(), [], { requireTraderLevels: false }).blockers[0]?.type).toBe(
        'unknown'
      );
    }
  });
  it('retains real player-level and exact prestige gates', () => {
    const task: Task = {
      id: 'new-beginning',
      minPlayerLevel: 40,
      requiredPrestige: { id: 'prestige-2' },
    };
    const options = { prestigeTaskMap: new Map([[task.id, 2]]) };
    expect(evaluate(task, data({ level: 40, prestigeLevel: 2 }), [], options).available).toBe(true);
    expect(
      evaluate(task, data({ level: 39, prestigeLevel: 1 }), [], options).blockers.map((b) => b.type)
    ).toEqual(['player_level', 'prestige']);
    expect(
      evaluate(task, data({ level: 50, prestigeLevel: 3 }), [], options).blockers[0]?.type
    ).toBe('prestige');
    expect(evaluate(task, data({ level: 50 })).blockers[0]?.type).toBe('unknown');
  });
  it.each(['complete', 'completed', 'active', 'accept', 'accepted', 'failed'])(
    'honors %s prerequisite status',
    (status) => {
      const task: Task = {
        id: 'target',
        taskRequirements: [{ task: { id: 'prior' }, status: [status] }],
      };
      const completion =
        status === 'failed' ? { complete: true, failed: true } : { complete: true };
      expect(
        evaluate(task, data({ completions: { prior: completion } }), [{ id: 'prior' }]).available
      ).toBe(true);
    }
  );
  it('treats complete|failed as either terminal outcome without treating failed as active', () => {
    const task: Task = {
      id: 'target',
      taskRequirements: [{ task: { id: 'prior' }, status: ['complete', 'failed'] }],
    };
    const progress = data({ completions: { prior: { complete: true, failed: true } } });
    expect(evaluate(task, progress, [{ id: 'prior' }]).available).toBe(true);
    task.taskRequirements![0]!.status = ['active'];
    expect(evaluate(task, progress, [{ id: 'prior' }]).available).toBe(false);
    expect(evaluate({ id: 'prior' }, progress).blockers).toEqual([
      { type: 'failed', taskId: 'prior' },
    ]);
  });
  it('preserves recursive unlockability and terminates cycles', () => {
    const a: Task = { id: 'a', taskRequirements: [{ task: { id: 'b' }, status: ['active'] }] };
    const b: Task = { id: 'b', minPlayerLevel: 2 };
    expect(evaluate(a, data({ level: 2 }), [b]).available).toBe(true);
    b.taskRequirements = [{ task: { id: 'a' }, status: ['active'] }];
    expect(evaluate(a, data({ level: 2 }), [b]).available).toBe(false);
  });
  it('blocks malformed references and unsupported statuses', () => {
    const task: Task = {
      id: 'target',
      taskRequirements: [{ task: { id: '' }, status: ['complete'] }],
    };
    expect(evaluate(task).blockers[0]?.type).toBe('unknown');
    task.taskRequirements = [{ task: { id: 'prior' }, status: ['future'] }];
    expect(evaluate(task).blockers[0]?.type).toBe('unknown');
  });
  it('allows quest completion OR story progression, while keeping trader gates', () => {
    const task: Task = {
      ...taskWithTrader(),
      storyUnlocks: [
        { id: 'batya', name: 'Batya' },
        { id: 'ticket', name: 'The Ticket' },
      ],
      taskRequirements: [{ task: { id: 'chemical' }, status: ['complete', 'failed'] }],
    };
    const story = data({
      traders: { prapor: { level: 3 } },
      storyChapters: { ticket: { objectives: { first: { complete: true } } } },
    });
    expect(evaluate(task, story).available).toBe(true);
    story.traders.prapor!.level = 2;
    expect(evaluate(task, story).blockers.map((b) => b.type)).toEqual(['trader_level']);
    const quest = data({
      traders: { prapor: { level: 3 } },
      completions: { chemical: { failed: true } },
    });
    expect(evaluate(task, quest, [{ id: 'chemical' }]).available).toBe(true);
    expect(
      evaluate(task, data({ traders: { prapor: { level: 3 } } }), [{ id: 'chemical' }]).blockers[0]
    ).toMatchObject({
      type: 'prerequisite',
      chapterIds: ['batya', 'ticket'],
    });
  });
  it('isolates per-mode and teammate progression', () => {
    const task = taskWithTrader();
    const teams = new Map<GameMode, TaskAvailabilityTeamData>(
      ['pvp', 'pve', 'seasonal'].map((mode) => [
        mode as GameMode,
        data({ mode: mode as GameMode, traders: { prapor: { level: mode === 'pvp' ? 3 : 1 } } }),
      ])
    );
    const results = buildTaskEvaluations([task], teams, { requireTraderLevels: true });
    expect(results.target?.pvp?.available).toBe(true);
    expect(results.target?.pve?.available).toBe(false);
    expect(results.target?.seasonal?.available).toBe(false);
  });
  it('keeps ordinary prerequisites alongside missing-reference diagnostics', () => {
    const task: Task = {
      id: 'target',
      taskRequirements: [
        { task: { id: 'missing' }, status: ['complete'] },
        { task: { id: 'known' }, status: ['complete'] },
      ],
    };
    const result = evaluate(task, data({ completions: { missing: { complete: true } } }), [
      { id: 'known' },
    ]);
    expect(result.blockers).toEqual([
      { type: 'unknown', taskId: 'missing', reason: 'task_reference' },
      { type: 'prerequisite', requirements: [task.taskRequirements![1]], chapterIds: [] },
    ]);
  });
  it('does not infer safety for an absent failed-branch reference', () => {
    const task: Task = {
      id: 'target',
      failConditions: [],
      failedRequirements: [{ task: { id: 'missing' } }],
    };
    expect(evaluate(task).blockers).toContainEqual({
      type: 'unknown',
      taskId: 'missing',
      reason: 'failed_requirement',
    });
  });
});
