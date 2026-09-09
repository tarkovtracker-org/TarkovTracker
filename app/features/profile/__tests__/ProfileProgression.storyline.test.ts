// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref, type Ref } from 'vue';
import type { Task } from '@/types/tarkov';
const profileMetadataTasks = ref<Task[]>([]);
const profileMetadataError = ref<Error | null>(null);
const profileMetadataScopes = vi.fn();
const setStoryChapterCompleteMock = vi.fn();
const setStoryChapterUncompleteMock = vi.fn();
const setStoryObjectiveCompleteMock = vi.fn();
const setStoryObjectiveUncompleteMock = vi.fn();
const isStoryChapterCompleteMock = vi.fn(() => false);
const isStoryObjectiveCompleteMock = vi.fn(() => false);
let pvpOverrides: Record<string, unknown> = {};
let pveOverrides: Record<string, unknown> = {};
const routeState = {
  params: {} as Record<string, string | undefined>,
  query: {} as Record<string, string | undefined>,
};
const storyChaptersMetadata = [
  {
    id: 'chapter-1',
    name: 'Chapter 1',
    normalizedName: 'prologue',
    wikiLink: '',
    order: 1,
    objectives: [
      { id: 'obj-1', order: 1, type: 'main' as const, description: 'Linear' },
      {
        id: 'obj-2',
        order: 2,
        type: 'main' as const,
        description: 'Route A',
        mutuallyExclusiveWith: ['obj-3'],
      },
      {
        id: 'obj-3',
        order: 3,
        type: 'main' as const,
        description: 'Route B',
        mutuallyExclusiveWith: ['obj-2'],
      },
    ],
  },
];
const createProgressData = (overrides: Record<string, unknown> = {}) => ({
  level: 1,
  pmcFaction: 'USEC',
  displayName: null,
  xpOffset: 0,
  taskObjectives: {},
  taskCompletions: {},
  hideoutParts: {},
  hideoutModules: {},
  traders: {},
  skills: {},
  prestigeLevel: 0,
  progressEpoch: 0,
  skillOffsets: {},
  storyChapters: {},
  apiUpdateHistory: [],
  ...overrides,
});
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    isStoryChapterComplete: isStoryChapterCompleteMock,
    isStoryObjectiveComplete: isStoryObjectiveCompleteMock,
    setStoryChapterComplete: setStoryChapterCompleteMock,
    setStoryChapterUncomplete: setStoryChapterUncompleteMock,
    setStoryObjectiveComplete: setStoryObjectiveCompleteMock,
    setStoryObjectiveUncomplete: setStoryObjectiveUncompleteMock,
    getCurrentGameMode: () => 'pvp',
    getGameEdition: () => 1,
    getModeProgressData: (mode: 'pvp' | 'pve' | 'seasonal') =>
      createProgressData(mode === 'pvp' ? pvpOverrides : mode === 'pve' ? pveOverrides : {}),
    getPvPProgressData: () => createProgressData(pvpOverrides),
    getPvEProgressData: () => createProgressData(pveOverrides),
    getDisplayName: () => 'User',
    getTarkovUid: () => null,
  }),
}));
vi.mock('@/composables/useProfileTaskMetadata', () => ({
  useProfileTaskMetadata: (mode: Ref<string>, language: Ref<string>) => {
    profileMetadataScopes(mode, language);
    return {
      tasks: profileMetadataTasks,
      duplicateObjectiveIds: ref(new Map()),
      chapters: ref(storyChaptersMetadata),
      prestige: ref([]),
      error: profileMetadataError,
      loading: ref(false),
    };
  },
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    storyChapters: [],
    tasks: [],
    hideoutStations: [],
    loading: false,
    languageCode: 'en',
    editions: [],
  }),
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({
    getTasksRequireTraderLevels: true,
    getUseAutomaticLevelCalculation: false,
    getProfileSharePvpPublic: false,
    getProfileSharePvePublic: false,
  }),
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({
    getLevel: () => 1,
    tasksCompletions: {},
    tasksFailed: {},
  }),
}));
vi.mock('@/utils/editionHelpers', () => ({
  isTaskAvailableForEdition: () => true,
}));
vi.mock('@/utils/formatters', () => ({
  calculatePercentageNum: () => 0,
  useLocaleNumberFormatter: () => (n: number) => String(n),
}));
vi.mock('@/utils/tarkovDevProfileUrl', () => ({
  buildTarkovDevProfileUrl: () => undefined,
}));
vi.mock('@/utils/taskTypeFilters', () => ({
  filterTasksByTypeSettings: (tasks: Task[]) => tasks,
}));
vi.mock('@/utils/progressInvalidation', () => ({
  computeInvalidProgress: () => ({ invalidTasks: [], invalidObjectives: [] }),
}));
vi.mock('@/composables/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({ copyToClipboard: vi.fn() }),
}));
const translate = (key: string, fallbackOrParams?: string | Record<string, unknown>) => {
  if (typeof fallbackOrParams === 'string') {
    return fallbackOrParams;
  }
  return key;
};
mockNuxtImport('useRoute', () => () => routeState);
mockNuxtImport('useRouter', () => () => ({ replace: vi.fn() }));
mockNuxtImport('useI18n', () => () => ({
  t: translate,
  locale: { value: 'en' },
}));
mockNuxtImport('useSeoMeta', () => () => {});
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    user: { loggedIn: false, id: null },
    client: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      },
      from: () => ({ upsert: vi.fn() }),
    },
  },
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: translate,
    locale: { value: 'en' },
  }),
}));
const createWrapper = async () => {
  const { default: ProfileProgression } = await import('@/features/profile/ProfileProgression.vue');
  return mount(ProfileProgression, {
    global: {
      plugins: [createPinia()],
      stubs: {
        ProfileOverviewTab: {
          props: ['kappaProjection'],
          template: '<div data-testid="overview-tab" :data-state="kappaProjection.state" />',
        },
        ProfileTasksTab: {
          name: 'ProfileTasksTab',
          props: ['countedTasks', 'isTaskLocked', 'objectiveCompletions'],
          template:
            '<div data-testid="tasks-tab"><span v-for="task in countedTasks" :key="task.id" :data-task="task.id" :data-locked="String(isTaskLocked(task.id))" /></div>',
        },
        ProfileHideoutTab: { template: '<div data-testid="hideout-tab" />' },
        ProfileStorylineTab: {
          name: 'ProfileStorylineTab',
          props: ['readOnly'],
          emits: ['toggle-chapter', 'toggle-objective'],
          template:
            '<div data-testid="storyline-tab" :data-read-only="String(readOnly)"><button data-testid="toggle-chapter" @click="$emit(\'toggle-chapter\', \'chapter-1\')" /></div>',
        },
        UTabs: {
          props: ['items', 'modelValue'],
          emits: ['update:model-value'],
          template:
            '<div data-testid="tabs"><button data-testid="select-tasks-tab" @click="$emit(\'update:model-value\', 1)" /><button data-testid="select-storyline-tab" @click="$emit(\'update:model-value\', 3)" /></div>',
        },
        UAlert: true,
        UBadge: { template: '<span><slot /></span>' },
        UButton: { template: '<button><slot /></button>' },
        UIcon: true,
        NuxtLink: { template: '<a><slot /></a>' },
      },
    },
  });
};
const expectNoStoryStoreWrites = () => {
  expect(setStoryChapterCompleteMock).not.toHaveBeenCalled();
  expect(setStoryChapterUncompleteMock).not.toHaveBeenCalled();
  expect(setStoryObjectiveCompleteMock).not.toHaveBeenCalled();
  expect(setStoryObjectiveUncompleteMock).not.toHaveBeenCalled();
};
describe('ProfileProgression storyline chapter toggle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    profileMetadataTasks.value = [];
    profileMetadataError.value = null;
    pvpOverrides = {};
    pveOverrides = {};
    routeState.params = {};
    routeState.query = {};
    isStoryChapterCompleteMock.mockReturnValue(false);
    isStoryObjectiveCompleteMock.mockReturnValue(false);
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockResolvedValue({
        data: createProgressData(),
        gameEdition: 1,
      })
    );
  });
  it('renders legacy progress without objective or trader records as incomplete', async () => {
    pvpOverrides = { taskObjectives: undefined, traders: undefined };
    profileMetadataTasks.value = [
      {
        id: 'legacy',
        name: 'Legacy task',
        objectives: [{ id: 'objective', type: 'shoot', count: 1 }],
        normalizedTraderRequirements: [
          {
            id: 'loyalty',
            trader: { id: 'prapor', name: 'Prapor' },
            requirementType: 'level',
            value: 2,
            compareMethod: '>=',
          },
        ],
      },
    ];
    const wrapper = await createWrapper();
    await wrapper.get('[data-testid="select-tasks-tab"]').trigger('click');
    expect(wrapper.get('[data-task="legacy"]').attributes('data-locked')).toBe('true');
    expect(
      wrapper.findComponent({ name: 'ProfileTasksTab' }).props('objectiveCompletions')
    ).toEqual({});
    wrapper.unmount();
  });
  it('uses isolated profile requirements to label available and locked tasks', async () => {
    profileMetadataTasks.value = [
      { id: 'ready', name: 'Ready', factionName: 'Any', objectives: [] },
      { id: 'locked', name: 'Locked', minPlayerLevel: 20, objectives: [] },
      { id: 'wrong-faction', name: 'BEAR', factionName: 'BEAR', objectives: [] },
    ];
    const wrapper = await createWrapper();
    await wrapper.get('[data-testid="select-tasks-tab"]').trigger('click');
    expect(wrapper.get('[data-task="ready"]').attributes('data-locked')).toBe('false');
    expect(wrapper.get('[data-task="locked"]').attributes('data-locked')).toBe('true');
    expect(wrapper.find('[data-task="wrong-faction"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('passes the selected profile mode and language to the isolated metadata loader', async () => {
    routeState.query = { mode: 'pve' };
    const wrapper = await createWrapper();
    const [mode, language] = profileMetadataScopes.mock.calls.at(-1)!;
    expect(mode.value).toBe('pve');
    expect(language.value).toBe('en');
    wrapper.unmount();
  });
  it('projects remaining Kappa progress using the isolated task graph', async () => {
    const now = Date.UTC(2026, 8, 8);
    vi.spyOn(Date, 'now').mockReturnValue(now);
    profileMetadataTasks.value = Array.from({ length: 4 }, (_, index) => ({
      id: `kappa-${index}`,
      name: `Kappa ${index}`,
      kappaRequired: true,
      objectives: [],
    }));
    pvpOverrides = {
      taskCompletions: Object.fromEntries(
        [0, 1, 2].map((index) => [
          `kappa-${index}`,
          { complete: true, timestamp: now - (4 - index) * 86400000 },
        ])
      ),
    };
    const wrapper = await createWrapper();
    expect(wrapper.get('[data-testid="overview-tab"]').attributes('data-state')).toBe('projected');
    wrapper.unmount();
  });
  it('shows a metadata error while keeping profile controls available', async () => {
    profileMetadataError.value = new Error('Catalog unavailable');
    const wrapper = await createWrapper();
    expect(wrapper.find('u-alert-stub').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tabs"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('toggles an objective from the isolated chapter catalog', async () => {
    const wrapper = await createWrapper();
    await wrapper.get('[data-testid="select-storyline-tab"]').trigger('click');
    wrapper
      .findComponent({ name: 'ProfileStorylineTab' })
      .vm.$emit('toggle-objective', 'chapter-1', 'obj-1');
    expect(setStoryObjectiveCompleteMock).toHaveBeenCalledWith('chapter-1', 'obj-1');
    wrapper.unmount();
  });
  it('delegates chapter toggle to store and auto-completes non-route objectives', async () => {
    const wrapper = await createWrapper();
    await wrapper.get('[data-testid="select-storyline-tab"]').trigger('click');
    await wrapper.get('[data-testid="toggle-chapter"]').trigger('click');
    expect(setStoryChapterCompleteMock).toHaveBeenCalledWith('chapter-1');
    expect(setStoryObjectiveCompleteMock).toHaveBeenCalledWith('chapter-1', 'obj-1');
    expect(setStoryObjectiveCompleteMock).not.toHaveBeenCalledWith('chapter-1', 'obj-2');
    expect(setStoryObjectiveCompleteMock).not.toHaveBeenCalledWith('chapter-1', 'obj-3');
    wrapper.unmount();
  });
  it('delegates chapter uncomplete to store and auto-uncompletes non-route objectives', async () => {
    pvpOverrides = {
      storyChapters: {
        'chapter-1': {
          complete: true,
          timestamp: 1000,
          objectives: {
            'obj-1': { complete: true, timestamp: 1000 },
          },
        },
      },
    };
    const wrapper = await createWrapper();
    await wrapper.get('[data-testid="select-storyline-tab"]').trigger('click');
    await wrapper.get('[data-testid="toggle-chapter"]').trigger('click');
    expect(setStoryChapterUncompleteMock).toHaveBeenCalledWith('chapter-1');
    expect(setStoryObjectiveUncompleteMock).toHaveBeenCalledWith('chapter-1', 'obj-1');
    wrapper.unmount();
  });
  it('does not mutate store when viewing a shared profile', async () => {
    routeState.params = { userId: '11111111-1111-4111-8111-111111111111', mode: 'pvp' };
    const wrapper = await createWrapper();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="tabs"]').exists()).toBe(true);
    });
    await wrapper.get('[data-testid="select-storyline-tab"]').trigger('click');
    expect(wrapper.get('[data-testid="storyline-tab"]').attributes('data-read-only')).toBe('true');
    await wrapper.get('[data-testid="toggle-chapter"]').trigger('click');
    expectNoStoryStoreWrites();
    wrapper.unmount();
  });
  it('does not mutate store when selected mode differs from current game mode', async () => {
    routeState.query = { mode: 'pve' };
    const wrapper = await createWrapper();
    await wrapper.get('[data-testid="select-storyline-tab"]').trigger('click');
    expect(wrapper.get('[data-testid="storyline-tab"]').attributes('data-read-only')).toBe('true');
    await wrapper.get('[data-testid="toggle-chapter"]').trigger('click');
    expectNoStoryStoreWrites();
    wrapper.unmount();
  });
});
