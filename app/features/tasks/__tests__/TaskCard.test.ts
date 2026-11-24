import { readFileSync } from 'node:fs';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { DOMWrapper, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import TaskCard from '@/features/tasks/TaskCard.vue';
import TaskCardAlternatives from '@/features/tasks/TaskCardAlternatives.vue';
import { otherRequirementsSignature } from '@/utils/taskOtherRequirements';
import type { TaskActionPayload } from '@/composables/useTaskActions';
import type { TaskEvaluationMap } from '@/stores/taskAvailability';
import type { UserProgressData } from '@/types/progress';
import type { StoryChapter, Task } from '@/types/tarkov';
const en = JSON.parse(readFileSync('app/locales/en.json', 'utf8'));
const resolveEn = (key: string): unknown =>
  key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)?.[part], en);
const taskState = reactive({
  active: false,
  complete: false,
  failed: false,
});
const preferencesState = reactive({
  collapseDefault: false,
  hideRewards: false,
  showPrevious: true,
  showNext: true,
  hideCompletedObjectives: false,
  manualFail: false,
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
  $state: { currentGameMode: 'pvp' },
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
const metadataStoreMock = reactive({
  alternativeTasks: {} as Record<string, string[]>,
  alternativeTaskSources: {} as Record<string, string[]>,
  editions: [],
  fetchTaskObjectivesData: vi.fn<() => Promise<void>>(),
  getTaskById: vi.fn(),
  mapsWithSvg: [],
  storyChapters: [] as StoryChapter[],
  storyChaptersGameMode: null as string | null,
  tasks: [] as Task[],
  tasksObjectivesError: null as Error | null,
  tasksObjectivesHydrated: true,
  tasksObjectivesPending: false,
  traders: [],
});
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
  setSelectedItem: vi.fn(),
};
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => metadataStoreMock,
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({
    get getEnableManualTaskFail() {
      return preferencesState.manualFail;
    },
    get getHideCompletedTaskObjectives() {
      return preferencesState.hideCompletedObjectives;
    },
    get getHideTaskRewards() {
      return preferencesState.hideRewards;
    },
    getPinnedTaskIds: preferencesState.pinnedTaskIds,
    getHiddenTaskIds: [] as string[],
    getRespectTaskFiltersForImpact: false,
    getShowRequiredLabels: true,
    get getShowPreviousQuests() {
      return preferencesState.showPrevious;
    },
    get getShowNextQuests() {
      return preferencesState.showNext;
    },
    getTaskCollapseDefault: preferencesState.collapseDefault,
    getTaskMapView: 'all',
    getTaskPrimaryView: preferencesState.primaryView,
    getTaskUserView: 'self',
    togglePinnedTask: vi.fn(),
    toggleHiddenTask: vi.fn(),
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
      if (typeof fallback === 'string') return fallback;
      const template = resolveEn(key);
      if (typeof template !== 'string') return key;
      const params = (args[0] ?? {}) as Record<string, unknown>;
      const [singular, plural = singular] = template.split(' | ');
      const message = (params.count === 1 ? singular : plural) ?? template;
      return message.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? name));
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
  template:
    '<div data-testid="task-card-badges"><slot name="alternatives" /><slot name="actions" /></div>',
  props: ['task', 'isActive'],
};
const TaskCardActionsStub = {
  props: ['state', 'size', 'isFailed', 'showFail'],
  emits: ['complete', 'active', 'uncomplete', 'available', 'failed', 'markFailed'],
  template:
    '<div data-testid="task-card-actions" :data-show-fail="String(!!showFail)"><button v-if="showFail" data-testid="task-card-fail-stub" @click="$emit(\'markFailed\')" /></div>',
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
  props: ['objectives'],
  template:
    '<div data-testid="task-objectives">{{ objectives.map((objective) => objective.id).join(",") }}</div>',
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
    preferencesState.showPrevious = true;
    preferencesState.showNext = true;
    preferencesState.hideCompletedObjectives = false;
    preferencesState.manualFail = false;
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
    metadataStoreMock.alternativeTasks = {};
    metadataStoreMock.alternativeTaskSources = {};
    metadataStoreMock.getTaskById.mockReset();
    metadataStoreMock.fetchTaskObjectivesData.mockReset().mockResolvedValue();
    metadataStoreMock.storyChapters = [];
    metadataStoreMock.storyChaptersGameMode = null;
    metadataStoreMock.tasks = [];
    metadataStoreMock.tasksObjectivesError = null;
    metadataStoreMock.tasksObjectivesHydrated = true;
    metadataStoreMock.tasksObjectivesPending = false;
    tarkovStoreMock.getCurrentProgressData.mockReturnValue({ taskCompletions: {} });
    tarkovStoreMock.getObjectiveCount.mockReturnValue(0);
  });
  it('shows counted groups of name-only quest links from a compact chip on a collapsed card', async () => {
    preferencesState.collapseDefault = true;
    metadataStoreMock.alternativeTasks = {
      'task-1': ['mutual', 'same-name', 'outgoing', 'missing'],
    };
    metadataStoreMock.alternativeTaskSources = { 'task-1': ['mutual', 'same-name', 'incoming'] };
    metadataStoreMock.tasks = [
      { id: 'mutual', name: 'Mutual choice' },
      { id: 'same-name', name: 'Mutual choice', trader: { name: 'Skier' } },
      { id: 'outgoing', name: 'Quest this one fails' },
      { id: 'incoming', name: 'Quest that fails this one' },
    ] as Task[];
    metadataStoreMock.getTaskById.mockImplementation((id) =>
      metadataStoreMock.tasks.find((task) => task.id === id)
    );
    const wrapper = await mountTaskCard();
    expect(wrapper.find('#task-content-task-1').exists()).toBe(false);
    const chip = wrapper.get('[data-testid="task-card-badges"] button[aria-label="Quest links"]');
    expect(chip.text()).toBe('Quest links');
    const overlays = new DOMWrapper(document.body);
    expect(overlays.find('[data-testid="task-alternatives"]').exists()).toBe(false);
    expect(chip.attributes('aria-expanded')).toBe('false');
    await chip.trigger('click');
    await flushPromises();
    expect(chip.attributes('aria-expanded')).toBe('true');
    const alternatives = overlays.get('[data-testid="task-alternatives"]');
    expect(alternatives.get('h3').text()).toBe('Quest links');
    expect(alternatives.text()).toContain('4 linked quests');
    expect(alternatives.text()).toContain('Completing either quest fails the other.');
    expect(alternatives.findAll('h4').map((label) => label.text())).toEqual([
      'Mutually exclusive',
      'Completing this quest fails',
      'Completing any of these fails this quest',
    ]);
    expect(
      alternatives.findAll('section > div > span[aria-hidden="true"]').map((count) => count.text())
    ).toEqual(['2', '1', '1']);
    expect(alternatives.findAll('ul').map((group) => group.findAll('li').length)).toEqual([
      2, 1, 1,
    ]);
    expect(alternatives.findAll('a').map((link) => [link.text(), link.attributes('href')])).toEqual(
      [
        ['Mutual choice', '/tasks?task=mutual'],
        ['Mutual choice', '/tasks?task=same-name'],
        ['Quest this one fails', '/tasks?task=outgoing'],
        ['Quest that fails this one', '/tasks?task=incoming'],
      ]
    );
    expect(alternatives.text()).not.toMatch(/Skier|same-name/);
    const { alternativeTasks, alternativeTaskSources } = metadataStoreMock;
    metadataStoreMock.alternativeTasks = {};
    metadataStoreMock.alternativeTaskSources = {};
    await flushPromises();
    expect(overlays.find('[data-testid="task-alternatives"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="task-alternatives-trigger"]').exists()).toBe(false);
    metadataStoreMock.alternativeTasks = alternativeTasks;
    metadataStoreMock.alternativeTaskSources = alternativeTaskSources;
    await flushPromises();
    expect(
      wrapper.get('[data-testid="task-alternatives-trigger"]').attributes('aria-expanded')
    ).toBe('false');
    expect(overlays.find('[data-testid="task-alternatives"]').exists()).toBe(false);
    await wrapper.setProps({ task: { id: 'unrelated', name: 'Unrelated quest' } });
    expect(wrapper.find('[data-testid="task-alternatives-trigger"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('offers a retry when objectives fail and shows the hydrated objectives afterward', async () => {
    metadataStoreMock.tasksObjectivesHydrated = false;
    metadataStoreMock.tasksObjectivesPending = true;
    metadataStoreMock.getTaskById.mockImplementation((id) =>
      metadataStoreMock.tasks.find((task) => task.id === id)
    );
    const wrapper = await mountTaskCard();
    const skeleton = () => wrapper.find('#objectives-content-task-1 > [aria-hidden="true"]');
    expect(skeleton().exists()).toBe(true);
    metadataStoreMock.tasksObjectivesPending = false;
    metadataStoreMock.tasksObjectivesError = new Error('offline');
    await nextTick();
    expect(skeleton().exists()).toBe(false);
    expect(wrapper.get('[role="status"]').text()).toBe('Could not load objectives.');
    const retry = Promise.withResolvers<undefined>();
    metadataStoreMock.fetchTaskObjectivesData.mockImplementationOnce(() => {
      metadataStoreMock.tasksObjectivesError = null;
      metadataStoreMock.tasksObjectivesPending = true;
      return retry.promise;
    });
    await wrapper.get('[data-testid="retry-task-objectives"]').trigger('click');
    expect(metadataStoreMock.fetchTaskObjectivesData).toHaveBeenCalledExactlyOnceWith();
    expect(skeleton().exists()).toBe(true);
    expect(wrapper.find('[data-testid="retry-task-objectives"]').exists()).toBe(false);
    metadataStoreMock.tasks = [
      { id: 'task-1', objectives: [{ id: 'objective-1', type: 'visit', count: 1 }] } as Task,
    ];
    metadataStoreMock.tasksObjectivesHydrated = true;
    metadataStoreMock.tasksObjectivesPending = false;
    retry.resolve(undefined);
    await nextTick();
    expect(wrapper.get('[data-testid="task-objectives"]').text()).toBe('objective-1');
    expect(skeleton().exists()).toBe(false);
    wrapper.unmount();
  });
  it('keeps loaded objectives visible after a refresh failure', async () => {
    metadataStoreMock.tasksObjectivesHydrated = false;
    metadataStoreMock.tasksObjectivesError = new Error('offline');
    const wrapper = await mountTaskCard({
      objectives: [{ id: 'objective-1', type: 'visit', count: 1 }],
    });
    expect(wrapper.find('[data-testid="task-objectives"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="retry-task-objectives"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('discloses completed objectives manually and responds to preference and completion changes', async () => {
    taskState.complete = true;
    preferencesState.hideCompletedObjectives = true;
    const wrapper = await mountTaskCard({
      objectives: [{ id: 'objective-1', type: 'visit', count: 1 }],
    });
    const toggle = wrapper.get('[data-testid="task-objectives-header"] button');
    expect(toggle.attributes('aria-controls')).toBe('objectives-content-task-1');
    const expectDisclosure = (expanded: boolean) => {
      expect(toggle.attributes('aria-expanded')).toBe(String(expanded));
      expect(wrapper.find('#objectives-content-task-1').exists()).toBe(expanded);
      expect(wrapper.find('[data-testid="task-objectives"]').exists()).toBe(expanded);
    };
    expectDisclosure(false);
    await toggle.trigger('click');
    expectDisclosure(true);
    await toggle.trigger('click');
    expectDisclosure(false);
    preferencesState.hideCompletedObjectives = false;
    await nextTick();
    expectDisclosure(true);
    await toggle.trigger('click');
    expectDisclosure(false);
    await toggle.trigger('click');
    expectDisclosure(true);
    preferencesState.hideCompletedObjectives = true;
    await nextTick();
    expectDisclosure(false);
    taskState.complete = false;
    await nextTick();
    expectDisclosure(true);
    taskState.complete = true;
    await nextTick();
    expectDisclosure(false);
    wrapper.unmount();
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
      .find((button) => button.text() === en.page.tasks.questcard.clear_availability_confirmation);
    expect(reset).toBeDefined();
    await reset!.trigger('click');
    expect(tarkovStoreMock.clearTaskAvailability).toHaveBeenCalledWith('task-1');
    expect(tarkovStoreMock.setObjectiveCount).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('shows the inline clear-confirmation control only for confirmed tasks', async () => {
    const gated: Partial<Task> = {
      otherRequirements: [{ type: 'dialogue', id: 'talk', traders: ['trader'] }],
    };
    const unconfirmed = await mountTaskCard(gated);
    expect(unconfirmed.find('[data-testid="task-clear-availability"]').exists()).toBe(false);
    unconfirmed.unmount();
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
    const clear = wrapper.get('[data-testid="task-clear-availability"]');
    expect(clear.attributes('aria-label')).toBe(
      en.page.tasks.questcard.clear_availability_confirmation
    );
    await clear.trigger('click');
    expect(tarkovStoreMock.clearTaskAvailability).toHaveBeenCalledWith('task-1');
    wrapper.unmount();
  });
  it('offers the inline fail action only when manual failing is enabled', async () => {
    const off = await mountTaskCard();
    expect(off.get('[data-testid="task-card-actions"]').attributes('data-show-fail')).toBe('false');
    expect(off.find('[data-testid="task-card-fail-stub"]').exists()).toBe(false);
    off.unmount();
    preferencesState.manualFail = true;
    const wrapper = await mountTaskCard();
    expect(wrapper.get('[data-testid="task-card-actions"]').attributes('data-show-fail')).toBe(
      'true'
    );
    expect(wrapper.text()).toContain(en.page.tasks.questcard.mark_failed);
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const originalConfirm = window.confirm;
    window.confirm = confirm;
    try {
      const fail = wrapper.get('[data-testid="task-card-fail-stub"]');
      await fail.trigger('click');
      expect(useTaskActionsMock.markTaskFailed).not.toHaveBeenCalled();
      await fail.trigger('click');
      expect(confirm).toHaveBeenCalledTimes(2);
      expect(useTaskActionsMock.markTaskFailed).toHaveBeenCalledTimes(1);
    } finally {
      window.confirm = originalConfirm;
    }
    wrapper.unmount();
  });
  it('shows the stated time-gate delay only for delayed, unfinished tasks', async () => {
    const normal = await mountTaskCard();
    expect(normal.find('[data-testid="task-time-gate"]').exists()).toBe(false);
    normal.unmount();
    const fixed = await mountTaskCard({
      availableDelaySecondsMin: 36000,
      availableDelaySecondsMax: 36000,
    });
    expect(fixed.get('[data-testid="task-time-gate"]').text()).toBe(
      'Unlocks 10h after prerequisites are complete'
    );
    fixed.unmount();
    const ranged = await mountTaskCard({
      availableDelaySecondsMin: 1800,
      availableDelaySecondsMax: 2100,
    });
    expect(ranged.get('[data-testid="task-time-gate"]').text()).toBe(
      'Unlocks 30m–35m after prerequisites are complete'
    );
    ranged.unmount();
    taskState.complete = true;
    const completed = await mountTaskCard({ availableDelaySecondsMax: 36000 });
    expect(completed.find('[data-testid="task-time-gate"]').exists()).toBe(false);
    completed.unmount();
    taskState.complete = false;
    taskState.failed = true;
    const failed = await mountTaskCard({ availableDelaySecondsMax: 36000 });
    expect(failed.find('[data-testid="task-time-gate"]').exists()).toBe(false);
    failed.unmount();
  });
  it('renders no overflow menu button', async () => {
    const wrapper = await mountTaskCard();
    expect(wrapper.find('[aria-label="More"]').exists()).toBe(false);
    expect(wrapper.find('[icon="i-mdi-dots-horizontal"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Report data issue');
    wrapper.unmount();
  });
  it('emits the failed-card class contract: dark surface with pale light-mode companions', async () => {
    // This asserts the emitted class names only; the resolved per-theme rendering is
    // covered by the browser contrast audit (docs/systems/frontend.md (light/dark theme)) and the light:+token
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
  it('puts follow-up and remaining previous links in Quest links and respects their preferences', async () => {
    metadataStoreMock.getTaskById.mockImplementation((id) =>
      id === 'follow-up' ? { id } : { id, name: id }
    );
    const wrapper = await mountTaskCard({
      parents: ['visible-prerequisite', 'other-previous'],
      children: ['follow-up'],
      taskRequirements: [{ task: { id: 'visible-prerequisite' }, status: ['complete'] }],
    });
    const chip = wrapper.get('button[aria-label="Quest links"]');
    await chip.trigger('click');
    await flushPromises();
    const panel = new DOMWrapper(document.body).get('[data-testid="task-alternatives"]');
    expect(panel.findAll('h4').map((heading) => heading.text())).toEqual([
      'Unlocks next',
      'Previous tasks',
    ]);
    expect(panel.findAll('a').map((link) => link.text())).toEqual(['follow-up', 'other-previous']);
    expect(wrapper.get('[data-testid="task-requirements-summary"] a').text()).toContain(
      'visible-prerequisite'
    );
    preferencesState.showPrevious = false;
    await nextTick();
    expect(panel.findAll('a').map((link) => link.text())).toEqual(['follow-up']);
    preferencesState.showNext = false;
    await nextTick();
    expect(wrapper.find('button[aria-label="Quest links"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('keeps met prerequisites in Quest links while the Requirements list is collapsed', async () => {
    metadataStoreMock.getTaskById.mockImplementation((id) => ({ id, name: id }));
    tarkovStoreMock.getCurrentProgressData.mockReturnValue({
      taskCompletions: { prior: { complete: true, timestamp: 1 } },
    });
    const wrapper = await mountTaskCard({
      parents: ['prior'],
      taskRequirements: [{ task: { id: 'prior' }, status: ['complete'] }],
    });
    const header = wrapper.get('[data-testid="task-requirements-header"] button');
    expect(header.attributes('aria-expanded')).toBe('false');
    await wrapper.get('button[aria-label="Quest links"]').trigger('click');
    await flushPromises();
    const panel = new DOMWrapper(document.body).get('[data-testid="task-alternatives"]');
    expect(panel.findAll('a').map((link) => link.text())).toEqual(['prior']);
    await header.trigger('click');
    expect(wrapper.get('[data-testid="task-requirements-summary"] a').text()).toContain('prior');
    expect(wrapper.find('button[aria-label="Quest links"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('keeps downstream impact available by keyboard with or without visible quest links', async () => {
    preferencesState.showNext = false;
    const wrapper = await mountSuspended(TaskCardAlternatives, {
      props: { taskId: 'task-1', impactCount: 3, nextTasks: [{ id: 'next' }], previousTasks: [] },
      global: { stubs: { AppTooltip: AppTooltipStub, UIcon: true } },
    });
    expect(wrapper.get('[tabindex="0"]').text()).toContain('Impact: 3');
    expect(wrapper.find('button[aria-label="Quest links"]').exists()).toBe(false);
    preferencesState.showNext = true;
    await nextTick();
    await wrapper.get('button[aria-label="Quest links"]').trigger('click');
    await flushPromises();
    const popup = new DOMWrapper(document.body).get('[data-testid="task-alternatives"]');
    expect(popup.findAll('[tabindex="0"]').some((element) => element.text() === 'Impact: 3')).toBe(
      true
    );
    wrapper.unmount();
  });
  it('keeps previous links available while hidden behind the compact blocker limit', async () => {
    preferencesState.collapseDefault = true;
    const ids = ['first', 'second', 'third', 'fourth'];
    const taskRequirements = ids.map((id) => ({ task: { id }, status: ['complete'] }));
    metadataStoreMock.getTaskById.mockImplementation((id) => ({ id, name: id }));
    progressStoreMock.unlockedTasks = { 'task-1': { self: false } };
    progressStoreMock.taskEvaluations = {
      'task-1': {
        self: {
          available: false,
          blockers: [{ type: 'prerequisite', requirements: taskRequirements }],
        },
      },
    };
    const wrapper = await mountTaskCard({ parents: ids, taskRequirements });
    const compact = wrapper.get('[data-testid="task-requirements-blocking"]');
    expect(compact.findAll('a')).toHaveLength(3);
    await wrapper.get('button[aria-label="Quest links"]').trigger('click');
    await flushPromises();
    const links = new DOMWrapper(document.body).get('[data-testid="task-alternatives"]');
    expect(links.findAll('a').map((link) => link.text())).toEqual(['fourth']);
    await compact.get('button').trigger('click');
    expect(compact.findAll('a')).toHaveLength(4);
    expect(wrapper.find('button[aria-label="Quest links"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('keeps a locked card usable before its evaluation snapshot is available', async () => {
    progressStoreMock.unlockedTasks = { 'task-1': { self: false } };
    const wrapper = await mountTaskCard();
    expect(wrapper.get('[data-testid="task-card-title"]').text()).toBe('Sample task');
    expect(wrapper.find('[data-testid="task-requirements-blocking"]').exists()).toBe(false);
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
  it('lists each unmet requirement once, in plain language, under the header', async () => {
    progressStoreMock.unlockedTasks = { 'task-1': { self: false } };
    progressStoreMock.taskEvaluations = {
      'task-1': {
        self: {
          available: false,
          blockers: [
            { type: 'player_level', current: 1, required: 20, compareMethod: '>=' },
            {
              type: 'trader_reputation',
              trader: { id: 'prapor', name: 'Prapor' },
              current: 0,
              required: 0.5,
              compareMethod: '>=',
            },
          ],
        },
      },
    };
    const wrapper = await mountTaskCard({
      minPlayerLevel: 20,
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
    const summary = wrapper.get('[data-testid="task-requirements-summary"]');
    expect(summary.findAll('li').map((row) => row.text())).toEqual([
      expect.stringContaining('Level 20+'),
      expect.stringContaining('Prapor reputation 0.50+'),
    ]);
    expect(wrapper.find('[data-testid="task-requirements-blocking"]').exists()).toBe(false);
    await wrapper.get('button[aria-label="Collapse task"]').trigger('click');
    expect(wrapper.find('[data-testid="task-requirements-summary"]').exists()).toBe(false);
    const chips = wrapper
      .findAll('[data-testid="task-requirement-chip"]')
      .map((chip) => chip.text());
    expect(chips).toEqual([
      expect.stringContaining('Level 20+'),
      expect.stringContaining('Prapor reputation 0.50+'),
    ]);
    expect(chips[0]).toContain('you: 1');
    expect(wrapper.text()).not.toMatch(/[<>]=|!=/);
    expect(wrapper.get('[data-testid="task-card-badges"]').attributes()).not.toHaveProperty(
      'trader-requirements'
    );
    wrapper.unmount();
  });
  it('keeps met requirements out of the header of an available card', async () => {
    tarkovStoreMock.playerLevel.mockReturnValue(30);
    progressStoreMock.taskEvaluations = {
      'task-1': {
        self: {
          available: false,
          blockers: [
            {
              type: 'trader_level',
              trader: { id: 'prapor', name: 'Prapor' },
              current: 1,
              required: 2,
            },
          ],
        },
      },
    };
    const wrapper = await mountTaskCard({ minPlayerLevel: 20 });
    expect(wrapper.find('[data-testid="task-requirements-blocking"]').exists()).toBe(false);
    const summary = wrapper.get('[data-testid="task-requirements-summary"]');
    expect(summary.text()).toContain('1 of 1 met');
    const header = summary.get('[data-testid="task-requirements-header"] button');
    expect(header.attributes('aria-expanded')).toBe('false');
    expect(summary.text()).not.toContain('Level 20+');
    await header.trigger('click');
    expect(summary.text()).toContain('Level 20+');
    tarkovStoreMock.playerLevel.mockReturnValue(1);
    wrapper.unmount();
  });
  const storyRouteSummary = async () => {
    metadataStoreMock.getTaskById.mockReturnValue({ id: 'prior', name: 'Prior quest' });
    const wrapper = await mountTaskCard({
      parents: ['prior'],
      storyUnlocks: [{ id: 'chapter', name: 'Chapter' }],
      taskRequirements: [{ task: { id: 'prior' }, status: ['complete'] }],
    });
    const summary = wrapper.get('[data-testid="task-requirements-summary"]');
    return { wrapper, rows: summary.findAll('li').map((item) => item.text()) };
  };
  it.each([
    [false, 'Not met'],
    [true, 'Met'],
  ])('reports storyline progress as its own route: %s', async (complete, status) => {
    tarkovStoreMock.getCurrentProgressData.mockReturnValue({
      taskCompletions: {},
      storyChapters: { chapter: { complete } },
    });
    const { wrapper, rows } = await storyRouteSummary();
    expect(rows[0]).toMatch(/^Not met:\s*Complete Prior quest/);
    expect(rows[1]).toMatch(new RegExp(`^${status}:\\s*Or progress a story chapter: Chapter`));
    wrapper.unmount();
  });
  it('counts automatic story objectives toward the storyline route', async () => {
    metadataStoreMock.storyChapters = [
      {
        id: 'chapter',
        objectives: { intro: { id: 'intro', completionPolicy: 'tutorial' } },
      } as unknown as StoryChapter,
    ];
    metadataStoreMock.storyChaptersGameMode = 'pvp';
    const { wrapper, rows } = await storyRouteSummary();
    expect(rows[1]).toMatch(/^Met:\s*Or progress a story chapter/);
    wrapper.unmount();
  });
  it('lists satisfied server-side requirements as met', async () => {
    progressStoreMock.taskEvaluations = {
      'task-1': {
        self: { available: false, blockers: [{ type: 'dialogue', requirementId: 'talk' }] },
      },
    };
    const wrapper = await mountTaskCard({
      otherRequirements: [
        { type: 'dialogue', id: 'talk', traders: ['trader'] },
        {
          type: 'storyObjective',
          id: 'story',
          storyChapter: { id: 'chapter', name: 'Chapter' },
          objective: { id: 'goal', name: 'Goal' },
        },
        { type: 'globalVariable', id: 'var', variableId: 'v', compareMethod: '>=', value: 3 },
      ],
    });
    const summary = wrapper.get('[data-testid="task-requirements-summary"]');
    const rows = summary.findAll('li').map((item) => item.text());
    expect(rows).toEqual([
      expect.stringMatching(/^Not met:\s*Trader conversation$/),
      expect.stringMatching(/^Met:\s*Story: Goal$/),
      expect.stringMatching(/^Met:\s*Additional in-game progression$/),
    ]);
    const details = summary.findAll('[data-testid="task-requirement-detail"]');
    expect(details.map((detail) => detail.attributes('aria-label'))).toEqual([
      'Story chapter: Chapter',
    ]);
    expect(summary.get('p').text()).toContain('Use Mark available');
    wrapper.unmount();
  });
  it('retains the confirmation warning for an unmapped unknown scalar gate', async () => {
    progressStoreMock.unlockedTasks = { 'task-1': { self: false } };
    progressStoreMock.taskEvaluations = {
      'task-1': {
        self: {
          available: false,
          blockers: [{ type: 'global_variable_unknown', requirementId: 'scalar' }],
        },
      },
    };
    const wrapper = await mountTaskCard({
      otherRequirements: [
        { type: 'globalVariable', id: 'scalar', variableId: 'v', compareMethod: '>=', value: 3 },
      ],
    });
    const summary = wrapper.get('[data-testid="task-requirements-summary"]');
    expect(summary.text()).toContain('Additional in-game progression');
    expect(summary.text()).toContain('Use Mark available once the task is available in-game.');
    wrapper.unmount();
  });
  it('shows unresolved-pool confirmation guidance before opening contributors', async () => {
    progressStoreMock.unlockedTasks = { 'task-1': { self: false } };
    progressStoreMock.taskEvaluations = {
      'task-1': {
        self: {
          available: false,
          blockers: [{ type: 'global_variable_unknown', requirementId: 'pool-gate' }],
        },
      },
    };
    const wrapper = await mountTaskCard({
      otherRequirements: [
        {
          type: 'globalVariable',
          id: 'pool-gate',
          variableId: 'v',
          compareMethod: '>=',
          value: 3,
          taskPool: {
            traderId: 'mechanic',
            loyaltyLevel: 2,
            verification: 'unresolved',
            coverage: 'partial',
            derivation: { type: 'distinctTaskCompletions', taskIds: ['contributor'] },
          },
        },
      ],
    });
    expect(wrapper.find('[data-testid="task-pool-details"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="task-requirements-summary"]').text()).toContain(
      'If this task is already available in-game, use Mark available.'
    );
    wrapper.unmount();
  });
  it('opens pool contributors from a chip even when the task body starts collapsed', async () => {
    preferencesState.collapseDefault = true;
    progressStoreMock.unlockedTasks = { 'task-1': { self: false } };
    progressStoreMock.taskEvaluations = {
      'task-1': {
        self: {
          available: false,
          blockers: [{ type: 'task_counter', requirementId: 'pool-gate', current: 0, required: 1 }],
        },
      },
    };
    metadataStoreMock.getTaskById.mockImplementation((id) => ({ id, name: 'Contributor task' }));
    const wrapper = await mountTaskCard({
      otherRequirements: [
        {
          type: 'globalVariable',
          id: 'pool-gate',
          variableId: 'v',
          compareMethod: '>=',
          value: 1,
          counter: { type: 'distinctTaskCompletions', taskIds: ['contributor'] },
        },
      ],
    });
    expect(wrapper.find('[data-testid="task-requirements-summary"]').exists()).toBe(false);
    await wrapper.get('[data-testid="task-requirement-chip"] button').trigger('click');
    expect(wrapper.get('[data-testid="task-pool-details"]').text()).toContain('Contributor task');
    await wrapper
      .get('button[aria-controls="task-requirements-task-1-pool-gate"]')
      .trigger('click');
    expect(wrapper.find('[data-testid="task-pool-details"]').exists()).toBe(false);
    await wrapper.get('button[aria-label="Collapse task"]').trigger('click');
    await wrapper.get('button[aria-label="Expand task"]').trigger('click');
    expect(wrapper.find('[data-testid="task-pool-details"]').exists()).toBe(false);
    await wrapper
      .get('button[aria-controls="task-requirements-task-1-pool-gate"]')
      .trigger('click');
    expect(wrapper.get('[data-testid="task-pool-details"]').text()).toContain('Contributor task');
    wrapper.unmount();
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
