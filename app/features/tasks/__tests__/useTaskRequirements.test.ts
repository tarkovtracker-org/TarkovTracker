import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskRequirements } from '@/features/tasks/composables/useTaskRequirements';
import { buildTaskEvaluations } from '@/stores/taskAvailability';
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
  useMetadataStore: () => ({ tasks: [], storyChapters: [] }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
describe('task requirement summary server gates', () => {
  beforeEach(() => {
    state.missing = false;
    state.blockers = undefined;
    state.data = { completions: {}, faction: 'USEC', level: 50, mode: 'pvp', traders: {} };
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
      expect(storyOnly[0]?.label).toBe('page.tasks.requirements.story_objective');
      state.data.confirmations = {
        target: { requirements: otherRequirementsSignature(task)!, timestamp: 2 },
      };
      expect(useTaskRequirements(() => task).summary.value.map((row) => row.met)).toEqual([
        true,
        true,
      ]);
    }
  );
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
});
