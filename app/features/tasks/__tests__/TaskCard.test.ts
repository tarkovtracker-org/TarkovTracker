import { mountSuspended } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import TaskCard from '@/features/tasks/TaskCard.vue';
import { otherRequirementsSignature } from '@/utils/taskOtherRequirements';
import type { TaskActionPayload } from '@/composables/useTaskActions';
import type { TaskEvaluationMap } from '@/stores/taskAvailability';
import type { UserProgressData } from '@/types/progress';
import type { Task } from '@/types/tarkov';
const taskState = reactive({
  active: false,
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
  taskEvaluations: {} as TaskEvaluationMap,
  invalidTasks: {} as Record<string, Record<string, boolean>>,
  tasksCompletions: {} as Record<string, Record<string, boolean>>,
  tasksFailed: {} as Record<string, Record<string, boolean>>,
  unlockedTasks: { 'task-1': { self: true } } as Record<string, Record<string, boolean>>,
  visibleTeamStores: { self: {} } as Record<string, Record<string, never>>,
};
const tarkovStoreMock = {
  clearTaskAvailability: vi.fn(),
  getCurrentProgressData: vi.fn((): Partial<UserProgressData> => ({ taskCompletions: {} })),
  getObjectiveCount: vi.fn(() => 0),
  getPMCFaction: vi.fn(() => 'USEC'),
  getTraderLevel: vi.fn(() => 1),
  getTraderReputation: vi.fn(() => 0),
  isTaskActive: vi.fn(() => taskState.active),
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
  markTaskActive: vi.fn(),
  canMarkTaskAvailable: vi.fn(() => true),
  markTaskAvailable: vi.fn(),
  markTaskComplete: vi.fn(),
  markTaskFailed: vi.fn(),
  markTaskUncomplete: vi.fn(),
};
let mockTaskActionListener: ((payload: TaskActionPayload) => void) | undefined;
let mockTaskGetter: (() => Task) | undefined;
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
  useTaskActions: (getTask: () => Task, onAction: (payload: TaskActionPayload) => void) => {
    mockTaskGetter = getTask;
    mockTaskActionListener = onAction;
    return useTaskActionsMock;
  },
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
  props: ['task', 'traderRequirements', 'isActive'],
};
const TaskCardActionsStub = {
  props: ['state', 'size', 'isFailed'],
  emits: ['complete', 'active', 'uncomplete', 'available', 'failed'],
  template: '<div data-testid="task-card-actions" />',
};
const TaskCardBackgroundStub = {
  props: ['isComplete', 'isFailed', 'isLocked', 'isInvalid'],
  template: '<div data-testid="task-card-background" />',
};
const TaskCardRewardsStub = {
  template: '<div data-testid="task-card-rewards" />',
};
const ContextMenuStub = {
  setup: () => ({ close: vi.fn() }),
  template: '<div><slot :close="close" /></div>',
};
const ContextMenuItemStub = {
  props: ['label'],
  template: '<button>{{ label }}</button>',
};
const AppTooltipStub = {
  template: '<span><slot /></span>',
};
const QuestObjectivesStub = {
  template: '<div data-testid="task-objectives" />',
};
const mountTaskCard = async (
  taskOverrides: Partial<Task> = {},
  cardOverrides: { accentVariant?: 'default' | 'global' } = {}
) =>
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
      ...cardOverrides,
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
describe('TaskCard appearance and expansion controls', () => {
  beforeEach(() => {
    taskState.active = false;
    taskState.complete = false;
    taskState.failed = false;
    preferencesState.collapseDefault = false;
    preferencesState.hideRewards = false;
    preferencesState.primaryView = 'all';
    preferencesState.pinnedTaskIds = [];
    progressStoreMock.taskEvaluations = {};
    progressStoreMock.invalidTasks = {};
    progressStoreMock.tasksCompletions = {};
    progressStoreMock.tasksFailed = {};
    progressStoreMock.unlockedTasks = { 'task-1': { self: true } };
    vi.clearAllMocks();
    mockTaskActionListener = undefined;
    mockTaskGetter = undefined;
    metadataStoreMock.getTaskById.mockReset();
    tarkovStoreMock.getCurrentProgressData.mockReturnValue({ taskCompletions: {} });
    tarkovStoreMock.getObjectiveCount.mockReturnValue(0);
  });
  it('offers a task-local confirmation reset without touching objectives', async () => {
    const gated: Partial<Task> = {
      otherRequirements: [{ type: 'dialogue', id: 'talk', traders: ['trader'] }],
    };
    tarkovStoreMock.getCurrentProgressData.mockReturnValue({
      taskCompletions: {},
      taskAvailability: {
        'task-1': {
          requirements: otherRequirementsSignature({ id: 'task-1', ...gated } as Task)!,
          timestamp: 10,
        },
      },
    });
    const wrapper = await mountTaskCard(gated);
    const reset = wrapper
      .findAll('button')
      .find((button) => button.text() === 'page.tasks.questcard.clear_availability_confirmation');
    expect(reset).toBeDefined();
    await reset!.trigger('click');
    expect(tarkovStoreMock.clearTaskAvailability).toHaveBeenCalledWith('task-1');
    expect(tarkovStoreMock.setObjectiveCount).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('emits the failed-card class contract: dark surface with pale light-mode companions', async () => {
    // This asserts the emitted class names only; the resolved per-theme rendering is
    // covered by the browser contrast audit (systems.md §17) and the light:+token
    // wiring is guarded by tailwindTheme.test.ts.
    taskState.failed = true;
    const wrapper = await mountTaskCard();
    const classes = wrapper.get('article').classes();
    expect(classes).toContain('bg-error-950');
    // Light mode flips the shared ink tokens to dark, so the failed surface must be pale or the
    // card text lands near 1.5:1 against the dark red fill.
    expect(classes).toContain('light:bg-error-100');
    expect(classes).toContain('light:border-error-700');
    wrapper.unmount();
  });
  it('keeps a locked card usable before its evaluation snapshot is available', async () => {
    progressStoreMock.unlockedTasks = { 'task-1': { self: false } };
    const wrapper = await mountTaskCard();
    expect(wrapper.get('[data-testid="task-card-title"]').text()).toBe('Sample task');
    expect(wrapper.find('[data-testid="task-blockers"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('styles available global cards and wires accept actions', async () => {
    const wrapper = await mountTaskCard({}, { accentVariant: 'global' });
    const card = wrapper.get('article');
    expect(card.classes()).toContain('bg-info-500/5');
    expect(card.classes()).toContain('border-l-4');
    expect(card.classes()).toContain('border-l-info-400');
    const actions = wrapper.findComponent(TaskCardActionsStub);
    expect(actions.props('state')).toBe('available');
    expect(mockTaskGetter?.()).toBe(wrapper.props('task'));
    useTaskActionsMock.markTaskActive.mockImplementation(() => {
      mockTaskActionListener?.({ taskId: 'task-1', taskName: 'Sample task', action: 'active' });
    });
    actions.vm.$emit('active');
    expect(useTaskActionsMock.markTaskActive).toHaveBeenCalledOnce();
    expect(wrapper.emitted('on-task-action')).toEqual([
      [{ taskId: 'task-1', taskName: 'Sample task', action: 'active' }],
    ]);
  });
  it('gives an active global card its active action and background state', async () => {
    taskState.active = true;
    const wrapper = await mountTaskCard({}, { accentVariant: 'global' });
    expect(wrapper.get('article').classes()).toContain('border-primary-500/45');
    expect(wrapper.get('article').classes()).toContain('border-l-info-400');
    expect(wrapper.findComponent(TaskCardBadgesStub).props('isActive')).toBe(true);
    expect(wrapper.findComponent(TaskCardActionsStub).props('state')).toBe('active');
    expect(wrapper.findComponent(TaskCardBackgroundStub).props()).toEqual({
      isComplete: false,
      isFailed: false,
      isLocked: false,
      isInvalid: false,
    });
  });
  it('renders canonical blockers and evaluates reputation badges', async () => {
    progressStoreMock.unlockedTasks = { 'task-1': { self: false } };
    progressStoreMock.taskEvaluations = {
      'task-1': {
        self: { available: false, blockers: [{ type: 'player_level', current: 1, required: 20 }] },
      },
    };
    const wrapper = await mountTaskCard({
      normalizedTraderRequirements: [
        {
          id: 'rep',
          trader: { id: 'prapor', name: 'Prapor' },
          requirementType: 'reputation',
          value: 0.5,
          compareMethod: '>=',
        },
      ],
    });
    expect(wrapper.get('[data-testid="task-blockers"]').text()).not.toBe('');
    expect(wrapper.findComponent(TaskCardBadgesStub).props('traderRequirements')).toEqual([
      expect.objectContaining({ id: 'rep', met: false }),
    ]);
    wrapper.unmount();
  });
  it.each([false, true])(
    'shows pending prerequisites only without storyline progress: %s',
    async (complete) => {
      tarkovStoreMock.getCurrentProgressData.mockReturnValue({
        taskCompletions: {},
        storyChapters: { chapter: { complete } },
      });
      metadataStoreMock.getTaskById.mockReturnValue({ id: 'prior', name: 'Prior quest' });
      const wrapper = await mountTaskCard({
        parents: ['prior'],
        storyUnlocks: [{ id: 'chapter', name: 'Chapter' }],
        taskRequirements: [{ task: { id: 'prior' }, status: ['complete'] }],
      });
      expect(wrapper.text().includes('Prior quest')).toBe(!complete);
      expect(wrapper.find('a[href="/tasks?task=prior"]').exists()).toBe(!complete);
      wrapper.unmount();
    }
  );
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
  it('enables item-count reset only while progress is nonterminal', async () => {
    tarkovStoreMock.getObjectiveCount.mockReturnValue(2);
    const wrapper = await mountTaskCard({
      objectives: [{ id: 'objective-1', item: { id: 'item-1' } }],
    });
    const reset = wrapper.get('button[aria-label="Reset item counts"]');
    expect(reset.attributes('disabled')).toBeUndefined();
    taskState.complete = true;
    await wrapper.vm.$nextTick();
    expect(reset.attributes('disabled')).toBeDefined();
    taskState.complete = false;
    taskState.failed = true;
    await wrapper.vm.$nextTick();
    expect(reset.attributes('disabled')).toBeDefined();
  });
});
