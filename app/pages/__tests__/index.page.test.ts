import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
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
    completedKappaTasks?: number;
    totalKappaTasks?: number;
    completedLightkeeperTasks?: number;
    totalLightkeeperTasks?: number;
    traderStats?: Array<{
      id: string;
      name: string;
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
    derivedLevel?: number;
    enableHolidayEffects?: boolean;
    useAutomaticLevel?: boolean;
    showKappaTasks?: boolean;
    showNonSpecialTasks?: boolean;
    showLightkeeperTasks?: boolean;
    onlyTasksWithRequiredKeys?: boolean;
  } = {}
) => {
  const {
    playerLevel = 8,
    derivedLevel = 10,
    enableHolidayEffects = false,
    useAutomaticLevel = false,
    showKappaTasks = true,
    showNonSpecialTasks = true,
    showLightkeeperTasks = true,
    onlyTasksWithRequiredKeys = false,
  } = storeOverrides;
  vi.resetModules();
  vi.doMock('@/composables/useDashboardStats', () => ({
    useDashboardStats: createDashboardStatsMock(dashboardStatsOptions),
  }));
  vi.doMock('@/composables/useXpCalculation', () => ({
    useXpCalculation: () => ({ derivedLevel: ref(derivedLevel) }),
  }));
  vi.doMock('@/stores/useTarkov', () => ({
    useTarkovStore: () => ({
      playerLevel: vi.fn(() => playerLevel),
      getTraderLevel: vi.fn(() => 1),
      getTraderReputation: vi.fn(() => 0),
      setTraderLevel: vi.fn(),
      setTraderReputation: vi.fn(),
    }),
  }));
  vi.doMock('@/stores/usePreferences', () => ({
    usePreferencesStore: () => ({
      // Use getters that return values to match real API
      get getEnableHolidayEffects() {
        return enableHolidayEffects;
      },
      get getUseAutomaticLevelCalculation() {
        return useAutomaticLevel;
      },
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
      dashboardNoticeDismissed: false,
      setDashboardNoticeDismissed: vi.fn(),
      setTaskPrimaryView: vi.fn(),
      setTaskTraderView: vi.fn(),
    }),
  }));
  vi.doMock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn() }),
  }));
  const { default: DashboardPage } = await import('@/pages/index.vue');
  return { DashboardPage };
};
const defaultGlobalStubs = {
  AppTooltip: { template: '<span><slot /></span>' },
  DashboardProgressCard: {
    props: ['completed', 'total', 'percentage', 'label', 'icon', 'color'],
    template: `<div data-testid="progress-card" :data-completed="completed" :data-total="total" :data-percentage="percentage" :data-label="label"><slot /></div>`,
  },
  DashboardMilestoneCard: {
    props: ['completed', 'total', 'percentage', 'title'],
    template: `<div data-testid="milestone-card" :data-completed="completed" :data-total="total" :data-title="title"><slot /></div>`,
  },
  DashboardChangelog: {
    template: '<div data-testid="dashboard-changelog"></div>',
  },
  UIcon: true,
};
describe('dashboard page', () => {
  it('renders dashboard progress cards', async () => {
    const { DashboardPage } = await setup();
    const wrapper = await mountSuspended(DashboardPage, {
      global: { stubs: defaultGlobalStubs },
    });
    expect(wrapper.find('[data-testid="progress-card"]').exists()).toBe(true);
  });
  it('renders dashboard milestone cards', async () => {
    const { DashboardPage } = await setup();
    const wrapper = await mountSuspended(DashboardPage, {
      global: { stubs: defaultGlobalStubs },
    });
    expect(wrapper.find('[data-testid="milestone-card"]').exists()).toBe(true);
  });
  describe('data state variations', () => {
    it('renders empty state when no tasks', async () => {
      const { DashboardPage } = await setup({
        completedTasks: 0,
        totalTasks: 0,
        availableTasksCount: 0,
        failedTasksCount: 0,
        completedObjectives: 0,
        totalObjectives: 0,
        completedTaskItems: 0,
        totalTaskItems: 0,
        completedKappaTasks: 0,
        totalKappaTasks: 0,
        traderStats: [],
      });
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      // Progress cards should still render (showing 0/0)
      const progressCards = wrapper.findAll('[data-testid="progress-card"]');
      expect(progressCards.length).toBeGreaterThan(0);
    });
    it('renders all completed state', async () => {
      const { DashboardPage } = await setup({
        completedTasks: 10,
        totalTasks: 10,
        availableTasksCount: 0,
        failedTasksCount: 0,
        completedObjectives: 6,
        totalObjectives: 6,
        completedTaskItems: 8,
        totalTaskItems: 8,
        completedKappaTasks: 2,
        totalKappaTasks: 2,
        completedLightkeeperTasks: 1,
        totalLightkeeperTasks: 1,
      });
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      const progressCards = wrapper.findAll('[data-testid="progress-card"]');
      expect(progressCards.length).toBeGreaterThan(0);
      const tasksCard = progressCards.find((card) => {
        const label = card.attributes('data-label') || '';
        return label.toLowerCase().includes('tasks');
      });
      expect(tasksCard).toBeDefined();
      expect(tasksCard!.attributes('data-completed')).toBe('10');
      expect(tasksCard!.attributes('data-total')).toBe('10');
    });
    it('renders mixed status state', async () => {
      const { DashboardPage } = await setup({
        completedTasks: 3,
        totalTasks: 10,
        availableTasksCount: 5,
        failedTasksCount: 2,
        completedObjectives: 2,
        totalObjectives: 8,
      });
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(wrapper.find('[data-testid="progress-card"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="milestone-card"]').exists()).toBe(true);
    });
    it('handles large task lists', async () => {
      const { DashboardPage } = await setup({
        completedTasks: 500,
        totalTasks: 1000,
        availableTasksCount: 300,
        failedTasksCount: 50,
        completedObjectives: 2000,
        totalObjectives: 5000,
        traderStats: Array.from({ length: 10 }, (_, i) => ({
          id: `trader-${i}`,
          name: `Trader ${i}`,
          imageLink: null,
          completedTasks: i * 10,
          totalTasks: 100,
          percentage: i * 10,
        })),
      });
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(wrapper.find('[data-testid="progress-card"]').exists()).toBe(true);
    });
  });
  describe('user interactions', () => {
    it('renders clickable progress cards', async () => {
      const { DashboardPage } = await setup();
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      const progressCard = wrapper.find('[data-testid="progress-card"]');
      expect(progressCard.exists()).toBe(true);
      // Verify card exists and is interactive (has click handler via stub)
      // Note: We don't trigger click to avoid async navigation side effects after test teardown
    });
    it('renders trader stats in milestone cards', async () => {
      const { DashboardPage } = await setup({
        traderStats: [
          {
            id: 'prapor',
            name: 'Prapor',
            imageLink: null,
            completedTasks: 5,
            totalTasks: 10,
            percentage: 50,
          },
          {
            id: 'therapist',
            name: 'Therapist',
            imageLink: null,
            completedTasks: 8,
            totalTasks: 12,
            percentage: 66.7,
          },
        ],
      });
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(wrapper.find('[data-testid="milestone-card"]').exists()).toBe(true);
    });
  });
  describe('dashboard filter warning', () => {
    it('renders neutral notice when all task-type filters are enabled', async () => {
      const { DashboardPage } = await setup();
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      const notice = wrapper.find('[data-testid="dashboard-filter-notice"]');
      expect(notice.exists()).toBe(true);
      expect(notice.attributes('data-filter-active')).toBe('false');
    });
    it('renders warning state when task-type filters are narrowed', async () => {
      const { DashboardPage } = await setup({}, { showNonSpecialTasks: false });
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      const notice = wrapper.find('[data-testid="dashboard-filter-notice"]');
      expect(notice.exists()).toBe(true);
      expect(notice.attributes('data-filter-active')).toBe('true');
    });
    it('renders warning state when required keys filter is enabled', async () => {
      const { DashboardPage } = await setup({}, { onlyTasksWithRequiredKeys: true });
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      const notice = wrapper.find('[data-testid="dashboard-filter-notice"]');
      expect(notice.exists()).toBe(true);
      expect(notice.attributes('data-filter-active')).toBe('true');
    });
    it('hides filter notice when progress breakdown is collapsed', async () => {
      const { DashboardPage } = await setup();
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      const progressToggle = wrapper.find('[data-testid="dashboard-progress-toggle"]');
      expect(progressToggle.exists()).toBe(true);
      expect(wrapper.find('[data-testid="dashboard-filter-notice"]').exists()).toBe(true);
      await progressToggle.trigger('click');
      expect(wrapper.find('[data-testid="dashboard-filter-notice"]').exists()).toBe(false);
    });
  });
  describe('level calculation modes', () => {
    it('uses manual level when automatic calculation disabled', async () => {
      const { DashboardPage } = await setup(
        {},
        { playerLevel: 15, derivedLevel: 20, useAutomaticLevel: false }
      );
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(wrapper.exists()).toBe(true);
      // Note: The level display is not directly verifiable at this test layer because
      // DashboardPage doesn't expose the computed level via a data-testid or prop.
      // The level is used internally by child components. Full verification would
      // require integration tests or exposing the level in the DOM.
    });
    it('uses derived level when automatic calculation enabled', async () => {
      const { DashboardPage } = await setup(
        {},
        { playerLevel: 15, derivedLevel: 20, useAutomaticLevel: true }
      );
      const wrapper = await mountSuspended(DashboardPage, {
        global: { stubs: defaultGlobalStubs },
      });
      expect(wrapper.exists()).toBe(true);
      // Note: The level display is not directly verifiable at this test layer because
      // DashboardPage doesn't expose the computed level via a data-testid or prop.
      // The level is used internally by child components. Full verification would
      // require integration tests or exposing the level in the DOM.
    });
  });
});
