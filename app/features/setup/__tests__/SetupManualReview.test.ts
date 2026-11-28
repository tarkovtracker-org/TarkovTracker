import { flushPromises, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import SetupManualReview from '@/features/setup/SetupManualReview.vue';
import SetupQuestPicker from '@/features/setup/SetupQuestPicker.vue';
import SetupTradersPicker from '@/features/setup/SetupTradersPicker.vue';
import { TASK_ID_REGISTRY } from '@/utils/constants';
import type { UserProgressData } from '@/types/progress';
import type { Task } from '@/types/tarkov';
const state = vi.hoisted(() => ({
  tasks: [] as Task[],
  taskCompletions: {} as UserProgressData['taskCompletions'],
  confirmTaskAvailability: vi.fn(),
  setStoryObjectiveComplete: vi.fn(),
  setTraderReputation: vi.fn(),
  setLevel: vi.fn(),
  requireTraderLevels: true,
  rewardsHydrated: true,
  setTraderLevel: vi.fn(),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    tasks: state.tasks,
    tasksCoreGameMode: 'pvp',
    tasksObjectivesHydrated: true,
    tasksRewardsHydrated: state.rewardsHydrated,
    fetchTaskObjectivesData: vi.fn().mockResolvedValue(undefined),
    fetchTaskRewardsData: vi.fn().mockResolvedValue(undefined),
    hideoutStations: [{ id: 'station', name: 'Station', levels: [] }],
  }),
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({ hideoutLevels: {} }),
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({ getTasksRequireTraderLevels: state.requireTraderLevels }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getCurrentGameMode: () => 'pvp',
    getCurrentProgressData: () => ({ taskCompletions: state.taskCompletions }),
    getPMCFaction: () => 'USEC',
    playerLevel: () => 1,
    setLevel: state.setLevel,
    getTraderReputation: () => 0,
    getTraderLevel: () => 1,
    setTraderLevel: state.setTraderLevel,
    setTraderReputation: state.setTraderReputation,
    isHideoutModuleComplete: () => false,
    setTaskUncompleted: (id: string) => {
      state.taskCompletions[id] = { complete: false, timestamp: 200 };
    },
    confirmTaskAvailability: state.confirmTaskAvailability,
    isStoryObjectiveComplete: () => false,
    setStoryObjectiveComplete: state.setStoryObjectiveComplete,
    saveProgressNow: vi.fn().mockResolvedValue(true),
  }),
}));
vi.mock('@/stores/tarkov/hideoutPrereqs', () => ({
  describeBlockedHideoutTiers: () => [],
}));
vi.mock(import('@/stores/tarkov/localStorage'), async (importOriginal) => ({
  ...(await importOriginal()),
  flushActiveProgressWrites: vi.fn().mockResolvedValue(undefined),
}));
const { CUT_DOWN_TO_THE_ROOT, PRESERVE_A_VALUABLE_PIECE } = TASK_ID_REGISTRY;
const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false });
async function saveActiveQuests(...ids: string[]) {
  const wrapper = shallowMount(SetupManualReview, {
    global: {
      plugins: [i18n],
      stubs: { UButton: { template: '<button><slot /></button>' } },
    },
  });
  for (const id of ids) wrapper.getComponent(SetupQuestPicker).vm.$emit('change', id, 'active');
  await wrapper.vm.$nextTick();
  const save = wrapper.findAll('button').find((button) => button.text() === 'setup.save_changes');
  await save!.trigger('click');
  await flushPromises();
  expect(wrapper.emitted('saved')).toHaveLength(1);
  wrapper.unmount();
}
describe('SetupManualReview active quests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.taskCompletions = {};
    state.rewardsHydrated = true;
  });
  it('blocks trader-only writes while quest reward details are unavailable', async () => {
    state.rewardsHydrated = false;
    const wrapper = shallowMount(SetupManualReview, {
      global: {
        plugins: [i18n],
        stubs: { UButton: { template: '<button><slot /></button>' } },
      },
    });
    wrapper.getComponent(SetupTradersPicker).vm.$emit('selectLevel', { id: 'prapor', level: 2 });
    await wrapper.vm.$nextTick();
    const save = wrapper.findAll('button').find((button) => button.text() === 'setup.save_changes');
    expect(save?.attributes('disabled')).toBeDefined();
    await save!.trigger('click');
    expect(state.setTraderLevel).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('binds acceptance to the predecessor status written in the same draft', async () => {
    state.tasks = [
      { id: CUT_DOWN_TO_THE_ROOT },
      {
        id: PRESERVE_A_VALUABLE_PIECE,
        taskRequirements: [{ task: { id: CUT_DOWN_TO_THE_ROOT }, status: ['active'] }],
      },
    ] as Task[];
    await saveActiveQuests(PRESERVE_A_VALUABLE_PIECE, CUT_DOWN_TO_THE_ROOT);
    expect(state.confirmTaskAvailability).toHaveBeenCalledWith(
      PRESERVE_A_VALUABLE_PIECE,
      JSON.stringify([['in-game-acceptance', CUT_DOWN_TO_THE_ROOT, 200]])
    );
  });
  it('records implied story progress when the story objective is the only gate', async () => {
    state.tasks = [
      {
        id: 'story-quest',
        otherRequirements: [
          {
            id: 'story-gate',
            type: 'storyObjective',
            storyChapter: { id: 'tour', name: 'Tour' },
            objective: { id: 'talk', name: 'Talk' },
          },
        ],
      },
    ] as Task[];
    await saveActiveQuests('story-quest');
    expect(state.confirmTaskAvailability).not.toHaveBeenCalled();
    expect(state.setStoryObjectiveComplete).toHaveBeenCalledWith('tour', 'talk');
  });
  it.each([true, false])(
    'restores the level and honors the trader requirements preference (%s)',
    async (requireTraderLevels) => {
      state.requireTraderLevels = requireTraderLevels;
      state.tasks = [
        {
          id: 'trader-quest',
          minPlayerLevel: 12,
          traderRequirements: [
            {
              id: 'reputation-gate',
              requirementType: 'reputation',
              trader: { id: 'prapor', name: 'Prapor' },
              value: 0.25,
            },
          ],
        },
      ] as Task[];
      await saveActiveQuests('trader-quest');
      expect(state.setLevel).toHaveBeenCalledWith(12);
      expect(state.setTraderReputation.mock.calls).toEqual(
        requireTraderLevels ? [['prapor', 0.25]] : []
      );
    }
  );
});
