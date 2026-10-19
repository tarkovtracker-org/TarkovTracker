import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref } from 'vue';
import { TASK_ID_REGISTRY } from '@/utils/constants';
/**
 * Creates dashboard stats mock with configurable data states
 */
const createDashboardStatsMock = (
  options: {
    completedTasks?: number;
    totalTasks?: number;
    availableTasksCount?: number;
    failedTasksCount?: number;
    completedObjectives?: number;
    totalObjectives?: number;
    completedTaskItems?: number;
    totalTaskItems?: number;
    completedHideoutItems?: number;
    totalHideoutItems?: number;
    completedKappaTasks?: number;
    totalKappaTasks?: number;
    completedLightkeeperTasks?: number;
    totalLightkeeperTasks?: number;
    traderStats?: Array<{
      id: string;
      name: string;
      normalizedName?: string;
      imageLink: string | null;
      completedTasks: number;
      totalTasks: number;
      percentage: number;
    }>;
  } = {}
) => {
  const {
    completedTasks = 5,
    totalTasks = 10,
    availableTasksCount = 2,
    failedTasksCount = 1,
    completedObjectives = 3,
    totalObjectives = 6,
    completedTaskItems = 4,
    totalTaskItems = 8,
    completedHideoutItems = 2,
    totalHideoutItems = 5,
    completedKappaTasks = 1,
    totalKappaTasks = 2,
    completedLightkeeperTasks = 0,
    totalLightkeeperTasks = 1,
    traderStats = [
      {
        id: 'trader-1',
        name: 'Trader One',
        imageLink: null,
        completedTasks: 2,
        totalTasks: 4,
        percentage: 50,
      },
    ],
  } = options;
  return () => ({
    completedTasks: computed(() => completedTasks),
    totalTasks: computed(() => totalTasks),
    availableTasksCount: computed(() => availableTasksCount),
    failedTasksCount: computed(() => failedTasksCount),
    completedObjectives: computed(() => completedObjectives),
    totalObjectives: computed(() => totalObjectives),
    completedTaskItems: computed(() => completedTaskItems),
    totalTaskItems: computed(() => totalTaskItems),
    completedHideoutItems: computed(() => completedHideoutItems),
    totalHideoutItems: computed(() => totalHideoutItems),
    completedKappaTasks: computed(() => completedKappaTasks),
    totalKappaTasks: computed(() => totalKappaTasks),
    completedLightkeeperTasks: computed(() => completedLightkeeperTasks),
    totalLightkeeperTasks: computed(() => totalLightkeeperTasks),
    traderStats: ref(traderStats),
  });
};
const setup = async (
  dashboardStatsOptions: Parameters<typeof createDashboardStatsMock>[0] = {},
  storeOverrides: {
    playerLevel?: number;
    showKappaTasks?: boolean;
    showNonSpecialTasks?: boolean;
    showLightkeeperTasks?: boolean;
    onlyTasksWithRequiredKeys?: boolean;
    traderSortMode?: 'default' | 'progress' | 'level';
    traderSortDirection?: 'asc' | 'desc';
  } = {},
  metadata: { tasks?: unknown[]; storyChapters?: unknown[]; storyChaptersGameMode?: string } = {},
  tarkovOverrides: Record<string, unknown> = {}
) => {
  const {
    playerLevel = 8,
    showKappaTasks = true,
    showNonSpecialTasks = true,
    showLightkeeperTasks = true,
    onlyTasksWithRequiredKeys = false,
    traderSortMode = 'default',
    traderSortDirection = 'desc',
  } = storeOverrides;
  vi.resetModules();
  const setTraderSortMode = vi.fn();
  const setTraderSortDirection = vi.fn();
  vi.doMock('@/composables/useDashboardStats', () => ({
    useDashboardStats: createDashboardStatsMock(dashboardStatsOptions),
  }));
  vi.doMock('@/stores/useTarkov', () => ({
    useTarkovStore: () => ({
      playerLevel: vi.fn(() => playerLevel),
      getTraderLevel: vi.fn(() => 1),
      getTraderReputation: vi.fn(() => 0),
      setTraderLevel: vi.fn(),
      setTraderReputation: vi.fn(),
      isTaskComplete: vi.fn(() => false),
      getCurrentGameMode: vi.fn(() => 'pvp'),
      isStoryObjectiveComplete: vi.fn(() => false),
      isStoryChapterComplete: vi.fn(() => false),
      ...tarkovOverrides,
    }),
  }));
  vi.doMock('@/stores/useMetadata', () => ({
    useMetadataStore: () => ({
      tasks: metadata.tasks ?? [],
      storyChapters: metadata.storyChapters ?? [],
      storyChaptersGameMode: metadata.storyChaptersGameMode ?? 'pvp',
    }),
  }));
  vi.doMock('@/stores/usePreferences', () => ({
    usePreferencesStore: () => ({
      get getHideNonKappaTasks() {
        return !showKappaTasks;
      },
      get getShowNonSpecialTasks() {
        return showNonSpecialTasks;
      },
      get getShowLightkeeperTasks() {
        return showLightkeeperTasks;
      },
      get getOnlyTasksWithRequiredKeys() {
        return onlyTasksWithRequiredKeys;
      },
      get getTraderSortMode() {
        return traderSortMode;
      },
      get getTraderSortDirection() {
        return traderSortDirection;
      },
      setTraderSortMode,
      setTraderSortDirection,
      dashboardNoticeDismissed: false,
      setTaskPrimaryView: vi.fn(),
      setTaskTraderView: vi.fn(),
    }),
  }));
  vi.doMock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn() }),
  }));
  const { default: DashboardPage } = await import('@/pages/index.vue');
  return { DashboardPage, setTraderSortMode, setTraderSortDirection };
};
const defaultGlobalStubs = {
  AppTooltip: { template: '<span><slot /></span>' },
  DashboardUpNext: {
    template: '<div data-testid="dashboard-up-next"></div>',
  },
  DashboardMigrationBanner: {
    template: '<div data-testid="dashboard-migration-banner"></div>',
  },
  DashboardProgressSummary: {
    template: '<div data-testid="dashboard-progress-summary"><slot name="actions" /></div>',
  },
  DashboardChangelog: {
    template: '<div data-testid="dashboard-changelog"></div>',
  },
  DashboardTraderCard: {
    props: ['trader', 'completedTasks', 'totalTasks', 'percentage', 'unlock'],
    template:
      '<div data-testid="trader-card" :data-id="trader.id" :data-unlock="unlock?.kind ?? \'none\'">{{ trader.name }}</div>',
  },
  SelectMenuFixed: {
    name: 'SelectMenuFixed',
    props: ['modelValue', 'items', 'valueKey'],
    emits: ['update:modelValue'],
    template: '<div data-testid="sort-select"></div>',
  },
  UIcon: true,
};
describe('dashboard page', () => {
  it('renders the up next list', async () => {
    const { DashboardPage } = await setup();
    const wrapper = await mountSuspended(DashboardPage, {
      global: { stubs: defaultGlobalStubs },
    });
    expect(wrapper.find('[data-testid="dashboard-up-next"]').exists()).toBe(true);
  });
  it('renders the migration guide banner', async () => {
    const { DashboardPage } = await setup();
    const wrapper = await mountSuspended(DashboardPage, {
      global: { stubs: defaultGlobalStubs },
    });
    expect(wrapper.find('[data-testid="dashboard-migration-banner"]').exists()).toBe(true);
  });
  it('replaces the progress breakdown with the summary strip', async () => {
    const { DashboardPage } = await setup();
    const wrapper = await mountSuspended(DashboardPage, {
      global: { stubs: defaultGlobalStubs },
    });
    expect(wrapper.find('[data-testid="dashboard-progress-summary"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dashboard-progress-toggle"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Milestones');
  });
  describe('locked traders', () => {
    const traders = [
      {
        id: 'lightkeeper-id',
        name: 'Lightkeeper',
        normalizedName: 'lightkeeper',
        imageLink: null,
        completedTasks: 0,
        totalTasks: 5,
        percentage: 0,
      },
      {
        id: 'ragman-id',
        name: 'Ragman',
        normalizedName: 'ragman',
        imageLink: null,
        completedTasks: 0,
        totalTasks: 5,
        percentage: 0,
      },
      {
        id: 'prapor-id',
        name: 'Prapor',
        normalizedName: 'prapor',
        imageLink: null,
        completedTasks: 0,
        totalTasks: 5,
        percentage: 0,
      },
      {
        id: 'jaeger-id',
        name: 'Jaeger',
        normalizedName: 'jaeger',
        imageLink: null,
        completedTasks: 0,
        totalTasks: 5,
        percentage: 0,
      },
    ];
    const metadata = {
      tasks: [
        { id: TASK_ID_REGISTRY.GETTING_ACQUAINTED, name: 'Getting Acquainted' },
        {
          id: 'ragman-task',
          name: 'Only Business',
          trader: { id: 'ragman-id' },
          otherRequirements: [
            {
              id: 'overlay.talk-to-ragman',
              type: 'storyObjective',
              storyChapter: { id: 'tour', name: 'Tour' },
              objective: { id: 'talk-to-ragman', name: 'Talk to Ragman' },
            },
          ],
        },
      ],
      storyChapters: [
        { id: 'tour', name: 'Tour', traderUnlocks: [{ id: 'ragman-id', name: 'Ragman' }] },
      ],
    };
    const renderedCards = (wrapper: {
      findAll: (s: string) => Array<{ attributes: (a: string) => string | undefined }>;
    }) =>
      wrapper
        .findAll('[data-testid="trader-card"]')
        .map((node) => `${node.attributes('data-id')}:${node.attributes('data-unlock')}`);
    const praporGateMetadata = {
      ...metadata,
      storyChapters: [
        {
          ...metadata.storyChapters[0],
          objectives: {
            'open-prapor': {
              id: 'open-prapor',
              order: 1,
              type: 'main',
              description: 'Hand over weapons to Mechanic',
              unlocks: [{ type: 'trader', id: 'prapor-id', name: 'Prapor' }],
            },
          },
        },
      ],
    };
    it('renders Prapor locked until his explicit storyline objective is complete', async () => {
      const complete = ref(false);
      const { DashboardPage } = await setup({ traderStats: traders }, {}, praporGateMetadata, {
        getTraderReputation: () => 0.2,
        isStoryObjectiveComplete: (_chapter: string, objective: string) =>
          objective === 'open-prapor' && complete.value,
      });
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(renderedCards(wrapper)).toContain('prapor-id:story');
      complete.value = true;
      await nextTick();
      expect(renderedCards(wrapper)).toContain('prapor-id:none');
    });
    it('reuses the gate map for progress changes and rebuilds it after mode changes', async () => {
      const complete = ref(false);
      const mode = ref('pvp');
      const objective = praporGateMetadata.storyChapters[0]!.objectives['open-prapor'];
      const readUnlocks = vi.fn(() => objective.unlocks);
      const catalog = {
        ...praporGateMetadata,
        storyChapters: [
          {
            ...praporGateMetadata.storyChapters[0],
            objectives: {
              'open-prapor': {
                ...objective,
                get unlocks() {
                  return readUnlocks();
                },
              },
            },
          },
        ],
      };
      const { DashboardPage } = await setup({ traderStats: traders }, {}, catalog, {
        getCurrentGameMode: () => mode.value,
        isStoryObjectiveComplete: () => complete.value,
      });
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(renderedCards(wrapper)).toContain('prapor-id:story');
      expect(readUnlocks).toHaveBeenCalledTimes(1);
      complete.value = true;
      await nextTick();
      expect(renderedCards(wrapper)).toContain('prapor-id:none');
      expect(readUnlocks).toHaveBeenCalledTimes(1);
      complete.value = false;
      mode.value = 'pve';
      await nextTick();
      expect(renderedCards(wrapper)).toContain('prapor-id:none');
      mode.value = 'pvp';
      await nextTick();
      expect(renderedCards(wrapper)).toContain('prapor-id:story');
      expect(readUnlocks).toHaveBeenCalledTimes(2);
    });
    it('does not borrow trader gates from the previous mode catalog', async () => {
      const { DashboardPage } = await setup({ traderStats: traders }, {}, praporGateMetadata, {
        getCurrentGameMode: () => 'pve',
      });
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(renderedCards(wrapper)).toContain('prapor-id:none');
    });
    it('renders every trader in one grid with locked traders last', async () => {
      const { DashboardPage } = await setup({ traderStats: traders }, {}, metadata);
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(renderedCards(wrapper)).toEqual([
        'prapor-id:none',
        'jaeger-id:none',
        'ragman-id:story',
        'lightkeeper-id:task',
      ]);
      expect(wrapper.find('[data-testid="dashboard-locked-traders-toggle"]').exists()).toBe(false);
    });
    it('unlocks a story-gated trader once its objective is recorded', async () => {
      const { DashboardPage } = await setup({ traderStats: traders }, {}, metadata, {
        isStoryObjectiveComplete: (chapterId: string, objectiveId: string) =>
          chapterId === 'tour' && objectiveId === 'talk-to-ragman',
      });
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(renderedCards(wrapper)).toEqual([
        'prapor-id:none',
        'ragman-id:none',
        'jaeger-id:none',
        'lightkeeper-id:task',
      ]);
    });
    it('unlocks a story-gated trader with a completed task hidden by dashboard filters', async () => {
      // traderStats counts only filtered tasks, so Ragman reports 0 completed here.
      const { DashboardPage } = await setup({ traderStats: traders }, {}, metadata, {
        isTaskComplete: (id: string) => id === 'ragman-task',
      });
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(renderedCards(wrapper)).toContain('ragman-id:none');
    });
  });
  describe('trader sorting', () => {
    const sortableTraders = [
      {
        id: 'prapor',
        name: 'Prapor',
        normalizedName: 'prapor',
        imageLink: null,
        completedTasks: 3,
        totalTasks: 10,
        percentage: 30,
      },
      {
        id: 'therapist',
        name: 'Therapist',
        normalizedName: 'therapist',
        imageLink: null,
        completedTasks: 8,
        totalTasks: 10,
        percentage: 80,
      },
      {
        id: 'skier',
        name: 'Skier',
        normalizedName: 'skier',
        imageLink: null,
        completedTasks: 5,
        totalTasks: 10,
        percentage: 50,
      },
    ];
    const renderedTraderOrder = (wrapper: {
      findAll: (s: string) => Array<{ attributes: (a: string) => string | undefined }>;
    }) =>
      wrapper
        .findAll('[id^="dashboard-trader-"]')
        .map((node) => node.attributes('id')?.replace('dashboard-trader-', ''));
    it('renders traders in canonical order for default sort mode', async () => {
      const { DashboardPage } = await setup(
        { traderStats: sortableTraders },
        { traderSortMode: 'default' }
      );
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(renderedTraderOrder(wrapper)).toEqual(['prapor', 'therapist', 'skier']);
    });
    it('sorts traders by progress descending', async () => {
      const { DashboardPage } = await setup(
        { traderStats: sortableTraders },
        { traderSortMode: 'progress', traderSortDirection: 'desc' }
      );
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(renderedTraderOrder(wrapper)).toEqual(['therapist', 'skier', 'prapor']);
    });
    it('sorts traders by progress ascending', async () => {
      const { DashboardPage } = await setup(
        { traderStats: sortableTraders },
        { traderSortMode: 'progress', traderSortDirection: 'asc' }
      );
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(renderedTraderOrder(wrapper)).toEqual(['prapor', 'skier', 'therapist']);
    });
    it('persists sort mode changes through the preferences store', async () => {
      const { DashboardPage, setTraderSortMode } = await setup(
        { traderStats: sortableTraders },
        { traderSortMode: 'default' }
      );
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      const select = wrapper.findComponent({ name: 'SelectMenuFixed' });
      expect(select.exists()).toBe(true);
      select.vm.$emit('update:modelValue', 'progress');
      await wrapper.vm.$nextTick();
      expect(setTraderSortMode).toHaveBeenCalledWith('progress');
    });
  });
});
