import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskPoolRequirements } from '@/features/tasks/composables/useTaskPoolRequirements';
import { otherRequirementsSignature } from '@/utils/taskOtherRequirements';
import type { TaskAvailabilityTeamData } from '@/stores/taskAvailability';
import type { Task, TaskOtherRequirement, TaskProgressionPool } from '@/types/tarkov';
const en = JSON.parse(readFileSync('app/locales/en.json', 'utf8'));
const state = vi.hoisted(() => ({
  completions: {} as TaskAvailabilityTeamData['completions'],
  confirmations: {} as NonNullable<TaskAvailabilityTeamData['confirmations']>,
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getCurrentProgressData: () => ({
      taskCompletions: state.completions,
      taskAvailability: state.confirmations,
    }),
  }),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    traders: [{ id: 'mechanic', name: 'Mechanic' }],
    getTaskById: (id: string) => ({ id, name: id }),
  }),
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({
    taskEvaluations: {
      a: { self: { available: true } },
      b: { self: { available: false, blockers: [{ type: 'faction' }] } },
    },
  }),
}));
vi.mock('vue-i18n', async (original) => ({
  ...(await original<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, params: Record<string, unknown> = {}): string => {
      const text = key.split('.').reduce((value, part) => value[part], en) as string;
      return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name]));
    },
  }),
}));
const pool: TaskProgressionPool = {
  traderId: 'mechanic',
  loyaltyLevel: 2,
  verification: 'verified',
  coverage: 'complete',
  derivation: { type: 'distinctTaskCompletions', taskIds: ['a', 'b'] },
};
const gate = (): Extract<TaskOtherRequirement, { type: 'globalVariable' }> => ({
  type: 'globalVariable',
  id: 'gate',
  variableId: 'variable',
  value: 2,
  compareMethod: '>=',
  counter: pool.derivation,
  taskPool: pool,
});
describe('pool requirement rows', () => {
  beforeEach(() => {
    state.completions = {};
    state.confirmations = {};
  });
  it("uses each contributor's own gates and marks wrong-faction work unavailable", () => {
    const row = useTaskPoolRequirements(() => ({ id: 'target' }))(gate(), false);
    expect(
      row.pool?.groups.flatMap((group) => group.tasks).map(({ id, status }) => ({ id, status }))
    ).toEqual([
      { id: 'a', status: 'available' },
      { id: 'b', status: 'unavailable' },
    ]);
  });
  it('shows a named requirement and actual tracked count even when it is met', () => {
    state.completions = { a: { complete: true }, b: { complete: true } };
    const requirement = gate();
    const row = useTaskPoolRequirements(() => ({ id: 'target' }))(requirement, true);
    expect(row).toMatchObject({
      label: 'Complete at least 2 LL2 tasks for Mechanic',
      progress: '2/2 tracked',
      met: true,
    });
  });
  it('labels unresolved candidates without deriving their completed count', () => {
    state.completions = { a: { complete: true }, b: { complete: true } };
    const requirement = gate();
    delete requirement.counter;
    requirement.taskPool = { ...pool, verification: 'unresolved', coverage: 'partial' };
    const row = useTaskPoolRequirements(() => ({ id: 'target' }))(requirement, false);
    expect(row).toMatchObject({ progress: 'Progress unverified', pool: { candidate: true } });
    expect(row.pool?.groups).toHaveLength(2);
  });
  it('honors unknown or known account blockers instead of falling back to tracked completions', () => {
    state.completions = { a: { complete: true }, b: { complete: true } };
    const row = useTaskPoolRequirements(() => ({ id: 'target' }));
    expect(row(gate(), false, { type: 'global_variable_unknown' })).toMatchObject({
      progress: 'Progress unverified',
      hint: 'If this task is already available in-game, use Mark available. This does not complete any pool tasks.',
    });
    expect(row(gate(), false, { type: 'global_variable', current: 0 }).hint).toBeUndefined();
    expect(row(gate(), false, { type: 'global_variable', current: 0 }).progress).toBe(
      '0/2 in game'
    );
  });
  it('keeps confirmed availability distinct from incomplete tracked history', () => {
    const requirement = gate();
    const task: Task = { id: 'target', otherRequirements: [requirement] };
    state.confirmations.target = { requirements: otherRequirementsSignature(task)!, timestamp: 2 };
    const row = useTaskPoolRequirements(() => task)(requirement, true);
    expect(row).toMatchObject({ progress: '0/2 tracked', pool: { confirmed: true } });
    expect(state.completions).toEqual({});
  });
  it('uses generic in-game wording for an unmapped scalar', () => {
    const requirement = gate();
    delete requirement.counter;
    delete requirement.taskPool;
    const row = useTaskPoolRequirements(() => ({ id: 'target' }))(requirement, false);
    expect(row).toEqual({
      kind: 'other',
      met: false,
      label: 'Additional in-game progression required',
    });
  });
});
