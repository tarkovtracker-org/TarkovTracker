import { flushPromises, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import SetupManualReview from '@/features/setup/SetupManualReview.vue';
import SetupQuestPicker from '@/features/setup/SetupQuestPicker.vue';
import { TASK_ID_REGISTRY } from '@/utils/constants';
import type { UserProgressData } from '@/types/progress';
import type { Task } from '@/types/tarkov';
const state = vi.hoisted(() => ({
  tasks: [] as Task[],
  taskCompletions: {} as UserProgressData['taskCompletions'],
  confirmTaskAvailability: vi.fn(),
  setStoryObjectiveComplete: vi.fn(),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    tasks: state.tasks,
    tasksCoreGameMode: 'pvp',
    tasksObjectivesHydrated: true,
    tasksRewardsHydrated: true,
    hideoutStations: [{ id: 'station', name: 'Station', levels: [] }],
  }),
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({ hideoutLevels: {} }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getCurrentGameMode: () => 'pvp',
    getCurrentProgressData: () => ({ taskCompletions: state.taskCompletions }),
    getPMCFaction: () => 'USEC',
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
});
