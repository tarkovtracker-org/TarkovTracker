import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskRequirements } from '@/features/tasks/composables/useTaskRequirements';
import { buildTaskEvaluations } from '@/stores/taskAvailability';
import { TASK_ID_REGISTRY } from '@/utils/constants';
import { otherRequirementsSignature } from '@/utils/taskOtherRequirements';
import type { TaskAvailabilityTeamData, TaskBlocker } from '@/stores/taskAvailability';
import type { Task } from '@/types/tarkov';
const state = vi.hoisted(() => ({
  data: {} as TaskAvailabilityTeamData,
  missing: false,
  blockers: undefined as TaskBlocker[] | undefined,
}));
const task: Task = {
  id: 'target',
  otherRequirements: [
    {
      type: 'storyObjective',
      id: 'story',
      storyChapter: { id: 'chapter' },
      objective: { id: 'objective' },
    },
    { type: 'dialogue', id: 'dialogue', traders: ['trader'] },
  ],
};
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    $state: { currentGameMode: 'pvp' },
    getCurrentProgressData: () => ({
      taskCompletions: state.data.completions,
      taskAvailability: state.data.confirmations,
      storyChapters: state.data.storyChapters,
    }),
  }),
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({
    get taskEvaluations() {
      if (state.blockers)
        return { target: { self: { available: false, blockers: state.blockers } } };
      return state.missing
        ? {}
        : buildTaskEvaluations([task], new Map([['self', state.data]]), {
            requireTraderLevels: false,
          });
    },
  }),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    tasks: [],
    storyChapters: [],
    getTaskById: (id: string) =>
      (
        ({
          'unlock-quest': { id },
          'named-quest': { id, name: 'Named quest' },
          [TASK_ID_REGISTRY.CUT_DOWN_TO_THE_ROOT]: { id, name: 'Cut Down to the Root' },
        }) as Record<string, { id: string; name?: string }>
      )[id],
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    // Render every interpolation so label tests catch missing names and values.
    t: (key: string, values?: Record<string, unknown>) =>
      values
        ? `${key}(${Object.entries(values)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(', ')})`
        : key,
  }),
}));
describe('task requirement summary server gates', () => {
  beforeEach(() => {
    state.missing = false;
    state.blockers = undefined;
    state.data = { completions: {}, faction: 'USEC', level: 50, mode: 'pvp', traders: {} };
  });
  it('links a trader unlock blocker to its known unlock quest', () => {
    state.blockers = [{ type: 'trader_unlock', taskId: 'unlock-quest' }];
    const { blocking, summary } = useTaskRequirements(() => ({ id: 'target' }));
    expect(blocking.value[0]?.to).toBe('/tasks?task=unlock-quest');
    expect(summary.value[0]?.to).toBe('/tasks?task=unlock-quest');
  });
  it.each(['complete', 'failed', 'missing'] as const)(
    'evaluates gates independently of %s availability',
    (status) => {
      state.missing = status === 'missing';
      if (status !== 'missing') state.data.completions.target = { [status]: true, timestamp: 1 };
      const unmet = useTaskRequirements(() => task);
      expect(unmet.summary.value.map((row) => row.met)).toEqual([false, false]);
      expect(unmet.blocking.value).toEqual([]);
      state.data.confirmations = {
        target: { requirements: otherRequirementsSignature(task)!, timestamp: 2 },
      };
      const confirmedOnly = useTaskRequirements(() => task).summary.value;
      expect(confirmedOnly.map((row) => row.met)).toEqual([true, false]);
      expect(confirmedOnly[0]?.label).toBe('page.tasks.requirements.dialogue');
      state.data.storyChapters = { chapter: { objectives: { objective: { complete: true } } } };
      state.data.confirmations = {};
      const storyOnly = useTaskRequirements(() => task).summary.value;
      expect(storyOnly.map((row) => row.met)).toEqual([true, false]);
      expect(storyOnly[0]?.label).toBe('page.tasks.requirements.story(objective=objective)');
      state.data.confirmations = {
        target: { requirements: otherRequirementsSignature(task)!, timestamp: 2 },
      };
      expect(useTaskRequirements(() => task).summary.value.map((row) => row.met)).toEqual([
        true,
        true,
      ]);
    }
  );
  it('keeps the accepted Jaeger quest linked in the requirements summary', () => {
    const jaeger = TASK_ID_REGISTRY.CUT_DOWN_TO_THE_ROOT;
    const target: Task = {
      id: TASK_ID_REGISTRY.PRESERVE_A_VALUABLE_PIECE,
      taskRequirements: [{ task: { id: jaeger }, status: ['active'] }],
    };
    state.data.confirmations = {
      [target.id]: { requirements: otherRequirementsSignature(target)!, timestamp: 2 },
    };
    const { summary } = useTaskRequirements(() => target);
    expect(summary.value).toEqual([
      expect.objectContaining({
        met: true,
        label: 'page.tasks.requirements.task_accepted(task=Cut Down to the Root)',
        to: `/tasks?task=${jaeger}`,
      }),
    ]);
  });
  it('keeps normal availability blockers for a nonterminal task', () => {
    const requirements = useTaskRequirements(() => task);
    expect(requirements.summary.value.map((row) => row.met)).toEqual([false, false]);
    expect(requirements.blocking.value).toHaveLength(2);
  });
  it('links story objective rows to the storyline objective', () => {
    const link = '/storyline?chapter=chapter&objective=objective';
    const unmet = useTaskRequirements(() => task);
    expect(unmet.blocking.value.map((row) => row.to)).toEqual([link, undefined]);
    expect(unmet.summary.value.map((row) => row.to)).toEqual([link, undefined]);
    state.data.storyChapters = { chapter: { objectives: { objective: { complete: true } } } };
    expect(useTaskRequirements(() => task).summary.value.map((row) => row.to)).toEqual([
      link,
      undefined,
    ]);
  });
  it('links story trader unlock blockers to the storyline objective', () => {
    const trader = { id: 'trader', name: 'Ref' };
    state.blockers = [
      {
        type: 'trader_unlock',
        trader,
        chapterIds: ['tour'],
        objective: { id: 'talk ref', name: 'Talk to Ref' },
      },
      { type: 'trader_unlock', trader, taskId: 'task' },
    ];
    const requirements = useTaskRequirements(() => task);
    const links = ['/storyline?chapter=tour&objective=talk%20ref', undefined];
    expect(requirements.blocking.value.map((row) => row.to)).toEqual(links);
    expect(requirements.summary.value.filter((row) => !row.met).map((row) => row.to)).toEqual(
      links
    );
  });
  it('uses short labels for long blockers and keeps dropped details on demand', () => {
    const trader = { id: 'trader', name: 'Mechanic' };
    state.blockers = [
      { type: 'dialogue', requirementId: 'dialogue' },
      {
        type: 'trader_unlock',
        trader,
        chapterIds: ['tour'],
        objective: { id: 'hand-over', name: 'Hand over any 5 building materials' },
      },
      { type: 'trader_unlock', trader, taskId: 'named-quest' },
      { type: 'prestige', current: 0, required: 1 },
    ];
    const rows = useTaskRequirements(() => ({ id: 'target' })).blocking.value;
    expect(rows.map(({ label, detail, hint }) => ({ label, detail, hint }))).toEqual([
      {
        label: 'page.tasks.requirements.dialogue',
        detail: undefined,
        hint: 'page.tasks.requirements.availability_hint',
      },
      {
        label: 'page.tasks.requirements.trader_unlock(trader=Mechanic)',
        detail: expect.stringMatching(
          /^page\.tasks\.blockers\.trader_story_unlock\(.*trader=Mechanic.*objective=Hand over any 5 building materials/
        ),
        hint: undefined,
      },
      {
        label: 'page.tasks.requirements.trader_unlock_task(trader=Mechanic, task=Named quest)',
        detail: undefined,
        hint: undefined,
      },
      { label: 'page.tasks.requirements.prestige(required=1)', detail: undefined, hint: undefined },
    ]);
    expect(rows[3]?.progress).toBe('page.tasks.requirements.you(value=0)');
  });
  it('merges trader rows that share a requirement and current value', () => {
    const traderBlocker = (id: string, current: number): TaskBlocker => ({
      type: 'trader_level',
      trader: { id, name: id },
      current,
      required: 3,
      compareMethod: '>=',
    });
    state.blockers = [
      traderBlocker('Therapist', 1),
      { type: 'dialogue', requirementId: 'dialogue' },
      traderBlocker('Skier', 1),
      traderBlocker('Jaeger', 2),
    ];
    const { blocking, groupTraderRows } = useTaskRequirements(() => ({ id: 'target' }));
    const rows = groupTraderRows(blocking.value);
    expect(rows.map((row) => row.label)).toEqual([
      'page.tasks.requirements.trader_level_group(requirement=page.tasks.requirements.comparison_at_least(value=3), traders=Therapist, Skier)',
      'page.tasks.requirements.dialogue',
      'page.tasks.requirements.trader_level(trader=Jaeger, requirement=page.tasks.requirements.comparison_at_least(value=3))',
    ]);
    expect(rows[0]?.progress).toBe('page.tasks.requirements.you(value=1)');
    expect(rows[2]?.progress).toBe('page.tasks.requirements.you(value=2)');
  });
  it('merges met reputation rows separately from unmet ones', () => {
    const rep = (id: string, current: number): TaskBlocker => ({
      type: 'trader_reputation',
      trader: { id, name: id },
      current,
      required: 0.2,
      compareMethod: '>=',
    });
    const { blocking, groupTraderRows } = useTaskRequirements(() => ({ id: 'target' }));
    state.blockers = [rep('Fence', 0), rep('Lightkeeper', 0)];
    const unmet = blocking.value;
    const met = unmet.map((row) => ({ ...row, met: true }));
    expect(groupTraderRows([...unmet, ...met]).map((row) => [row.label, row.met])).toEqual([
      [
        'page.tasks.requirements.trader_reputation_group(requirement=page.tasks.requirements.comparison_at_least(value=0.20), traders=Fence, Lightkeeper)',
        false,
      ],
      [
        'page.tasks.requirements.trader_reputation_group(requirement=page.tasks.requirements.comparison_at_least(value=0.20), traders=Fence, Lightkeeper)',
        true,
      ],
    ]);
  });
});
