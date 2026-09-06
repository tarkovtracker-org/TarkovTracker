import { mountSuspended } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import TaskCard from '@/features/tasks/TaskCard.vue';
import type { Task } from '@/types/tarkov';
const taskState = reactive({
  complete: false,
  failed: false,
});
const preferencesState = reactive({
  collapseDefault: false,
  hideRewards: false,
  primaryView: 'all',
  pinnedTaskIds: [] as string[],
});
const progressStoreMock = {
  invalidTasks: {} as Record<string, Record<string, boolean>>,
  tasksCompletions: {} as Record<string, Record<string, boolean>>,
  tasksFailed: {} as Record<string, Record<string, boolean>>,
  unlockedTasks: { 'task-1': { self: true } } as Record<string, Record<string, boolean>>,
  visibleTeamStores: { self: {} } as Record<string, Record<string, never>>,
};
const tarkovStoreMock = {
  getCurrentProgressData: vi.fn(() => ({ taskCompletions: {} })),
  getObjectiveCount: vi.fn(() => 0),
  getPMCFaction: vi.fn(() => 'USEC'),
  getTraderLevel: vi.fn(() => 1),
  getTraderReputation: vi.fn(() => 0),
  isTaskComplete: vi.fn(() => taskState.complete),
  isTaskFailed: vi.fn(() => taskState.failed),
  isTaskObjectiveComplete: vi.fn(() => false),
  playerLevel: vi.fn(() => 1),
  setObjectiveCount: vi.fn(),
};
const metadataStoreMock = {
  alternativeTaskSources: {} as Record<string, string[]>,
  editions: [],
  getTaskById: vi.fn(),
  mapsWithSvg: [],
  tasks: [] as Task[],
  tasksObjectivesHydrated: true,
  tasksObjectivesPending: false,
  traders: [],
};
const taskFilteringMock = {
  isGlobalTask: vi.fn(() => false),
};
const useTaskActionsMock = {
  markTaskAvailable: vi.fn(),
  markTaskComplete: vi.fn(),
  markTaskFailed: vi.fn(),
  markTaskUncomplete: vi.fn(),
};
const useTaskCardLinksMock = {
  copyTaskLink: vi.fn(),
  openItemOnTarkovDev: vi.fn(),
  openItemOnWiki: vi.fn(),
  openTaskDataIssue: vi.fn(),
  setSelectedItem: vi.fn(),
};
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => metadataStoreMock,
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({
    getEnableManualTaskFail: false,
    getHideCompletedTaskObjectives: false,
    get getHideTaskRewards() {
      return preferencesState.hideRewards;
    },
    getPinnedTaskIds: preferencesState.pinnedTaskIds,
    getRespectTaskFiltersForImpact: false,
    getShowRequiredLabels: true,
    getTaskCollapseDefault: preferencesState.collapseDefault,
    getTaskMapView: 'all',
    getTaskPrimaryView: preferencesState.primaryView,
    getTaskUserView: 'self',
    togglePinnedTask: vi.fn(),
  }),
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => progressStoreMock,
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => tarkovStoreMock,
}));
vi.mock('@/composables/useTaskActions', () => ({
  useTaskActions: () => useTaskActionsMock,
}));
vi.mock('@/composables/useTaskCardLinks', () => ({
  useTaskCardLinks: () => useTaskCardLinksMock,
}));
vi.mock('@/composables/useTaskFiltering', () => ({
  useTaskFiltering: () => taskFilteringMock,
}));
vi.mock('@/composables/useSharedBreakpoints', () => ({
  useSharedBreakpoints: () => ({ xs: { value: false } }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, ...args: unknown[]) => {
      const fallback = args.at(-1);
      return typeof fallback === 'string' ? fallback : key;
    },
  }),
}));
const UCardStub = {
  inheritAttrs: false,
  template: '<article v-bind="$attrs"><slot name="default" /><slot name="footer" /></article>',
};
const UButtonStub = {
  inheritAttrs: false,
  props: ['disabled'],
  emits: ['click'],
  template:
    '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
};
const TaskCardHeaderStub = {
  template: '<div data-testid="task-card-title">{{ task.name }}</div>',
  props: ['task'],
};
const TaskCardBadgesStub = {
  template: '<div data-testid="task-card-badges"><slot name="actions" /></div>',
  props: ['task'],
};
const TaskCardActionsStub = {
  template: '<div data-testid="task-card-actions" />',
};
const TaskCardBackgroundStub = {
  template: '<div data-testid="task-card-background" />',
};
const TaskCardRewardsStub = {
  template: '<div data-testid="task-card-rewards" />',
};
const ContextMenuStub = {
  template: '<div><slot /></div>',
};
const ContextMenuItemStub = {
  template: '<button><slot /></button>',
};
const AppTooltipStub = {
  template: '<span><slot /></span>',
};
const QuestObjectivesStub = {
  template: '<div data-testid="task-objectives" />',
};
const mountTaskCard = async (taskOverrides: Partial<Task> = {}) =>
  mountSuspended(TaskCard, {
    props: {
      task: {
        id: 'task-1',
        name: 'Sample task',
        factionName: 'Any',
        objectives: [],
        taskRequirements: [],
        ...taskOverrides,
      },
    },
    global: {
      stubs: {
        AppTooltip: AppTooltipStub,
        ContextMenu: ContextMenuStub,
        ContextMenuItem: ContextMenuItemStub,
        NuxtImg: true,
        QuestObjectives: QuestObjectivesStub,
        QuestObjectivesSkeleton: QuestObjectivesStub,
        TaskCardActions: TaskCardActionsStub,
        TaskCardBackground: TaskCardBackgroundStub,
        TaskCardBadges: TaskCardBadgesStub,
        TaskCardHeader: TaskCardHeaderStub,
        TaskCardRewards: TaskCardRewardsStub,
        UButton: UButtonStub,
        UCard: UCardStub,
        UIcon: true,
      },
    },
  });
describe('TaskCard expansion controls', () => {
  beforeEach(() => {
    taskState.complete = false;
    taskState.failed = false;
    preferencesState.collapseDefault = false;
    preferencesState.hideRewards = false;
    preferencesState.primaryView = 'all';
    preferencesState.pinnedTaskIds = [];
    progressStoreMock.invalidTasks = {};
    progressStoreMock.tasksCompletions = {};
    progressStoreMock.tasksFailed = {};
    progressStoreMock.unlockedTasks = { 'task-1': { self: true } };
    vi.clearAllMocks();
  });
  it('renders a dedicated toggle button in compact mode without making the header interactive', async () => {
    const wrapper = await mountTaskCard();
    const header = wrapper.get('[data-testid="task-card-header"]');
    const toggle = wrapper.get('[aria-label="Collapse task"]');
    expect(header.attributes('role')).toBeUndefined();
    expect(header.attributes('tabindex')).toBeUndefined();
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(toggle.attributes('aria-controls')).toBe('task-content-task-1');
  });
  it('collapses compact content and expands it again from the dedicated toggle', async () => {
    const wrapper = await mountTaskCard();
    const toggle = wrapper.get('button[aria-label="Collapse task"]');
    expect(wrapper.find('#task-content-task-1').exists()).toBe(true);
    await toggle.trigger('click');
    expect(wrapper.find('#task-content-task-1').exists()).toBe(false);
    const expandToggle = wrapper.get('button[aria-label="Expand task"]');
    expect(expandToggle.attributes('aria-expanded')).toBe('false');
    await expandToggle.trigger('click');
    expect(wrapper.find('#task-content-task-1').exists()).toBe(true);
  });
  it('starts compact cards collapsed when the preference is enabled', async () => {
    preferencesState.collapseDefault = true;
    const wrapper = await mountTaskCard();
    expect(wrapper.find('#task-content-task-1').exists()).toBe(false);
    expect(wrapper.get('button[aria-label="Expand task"]').attributes('aria-expanded')).toBe(
      'false'
    );
  });
  it('hides rewards only when compact cards are expanded and the preference is enabled', async () => {
    preferencesState.hideRewards = true;
    const wrapper = await mountTaskCard();
    expect(wrapper.find('[data-testid="task-card-rewards"]').exists()).toBe(false);
    preferencesState.hideRewards = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="task-card-rewards"]').exists()).toBe(true);
  });
  it('keeps map cards expanded while still exposing the toggle control', async () => {
    preferencesState.primaryView = 'maps';
    const wrapper = await mountTaskCard();
    expect(wrapper.find('#task-content-task-1').exists()).toBe(true);
    expect(wrapper.get('button[aria-label="Collapse task"]')).toBeDefined();
  });
  it('keeps the objectives disclosure and reset controls separate', async () => {
    const wrapper = await mountTaskCard({
      objectives: [{ id: 'objective-1', item: { id: 'item-1' } }],
    });
    const disclosure = wrapper.get('button[aria-controls="objectives-content-task-1"]');
    const reset = wrapper.get('button[aria-label="Reset item counts"]');
    expect(disclosure.element.contains(reset.element)).toBe(false);
    expect(disclosure.find('button').exists()).toBe(false);
  });
});
