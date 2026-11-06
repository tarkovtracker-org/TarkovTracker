import { readFileSync } from 'node:fs';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import TaskCard from '@/features/tasks/TaskCard.vue';
import { otherRequirementsSignature } from '@/utils/taskOtherRequirements';
import type { TaskEvaluationMap } from '@/stores/taskAvailability';
import type { UserProgressData } from '@/types/progress';
import type { StoryChapter, Task } from '@/types/tarkov';
const en = JSON.parse(readFileSync('app/locales/en.json', 'utf8'));
const resolveEn = (key: string): unknown =>
  key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)?.[part], en);
const taskState = reactive({
  complete: false,
  failed: false,
});
const preferencesState = reactive({
  collapseDefault: false,
  hideRewards: false,
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
  storyChapters: [] as StoryChapter[],
  storyChaptersGameMode: null as string | null,
  tasks: [] as Task[],
  tasksObjectivesHydrated: true,
  tasksObjectivesPending: false,
  traders: [],
};
const taskFilteringMock = {
  isGlobalTask: vi.fn(() => false),
};
const useTaskActionsMock = {
  canMarkTaskAvailable: vi.fn(() => true),
  markTaskAvailable: vi.fn(),
  markTaskComplete: vi.fn(),
  markTaskFailed: vi.fn(),
  markTaskUncomplete: vi.fn(),
};
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
    getHideCompletedTaskObjectives: false,
    get getHideTaskRewards() {
      return preferencesState.hideRewards;
    },
    getPinnedTaskIds: preferencesState.pinnedTaskIds,
    getHiddenTaskIds: [] as string[],
    getRespectTaskFiltersForImpact: false,
    getShowRequiredLabels: true,
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
      if (typeof fallback === 'string') return fallback;
      const template = resolveEn(key);
      if (typeof template !== 'string') return key;
      const params = (args[0] ?? {}) as Record<string, unknown>;
      return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? name));
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
  props: ['showFail'],
  emits: ['markFailed'],
  template:
    '<div data-testid="task-card-actions" :data-show-fail="String(!!showFail)"><button v-if="showFail" data-testid="task-card-fail-stub" @click="$emit(\'markFailed\')" /></div>',
};
const TaskCardBackgroundStub = {
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
describe('TaskCard appearance and expansion controls', () => {
  beforeEach(() => {
    taskState.complete = false;
    taskState.failed = false;
    preferencesState.collapseDefault = false;
    preferencesState.hideRewards = false;
    preferencesState.manualFail = false;
    preferencesState.primaryView = 'all';
    preferencesState.pinnedTaskIds = [];
    progressStoreMock.taskEvaluations = {};
    progressStoreMock.invalidTasks = {};
    progressStoreMock.tasksCompletions = {};
    progressStoreMock.tasksFailed = {};
    progressStoreMock.unlockedTasks = { 'task-1': { self: true } };
    vi.clearAllMocks();
    metadataStoreMock.getTaskById.mockReset();
    metadataStoreMock.storyChapters = [];
    metadataStoreMock.storyChaptersGameMode = null;
    tarkovStoreMock.getCurrentProgressData.mockReturnValue({ taskCompletions: {} });
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
  it('keeps a locked card usable before its evaluation snapshot is available', async () => {
    progressStoreMock.unlockedTasks = { 'task-1': { self: false } };
    const wrapper = await mountTaskCard();
    expect(wrapper.get('[data-testid="task-card-title"]').text()).toBe('Sample task');
    expect(wrapper.find('[data-testid="task-requirements-blocking"]').exists()).toBe(false);
    wrapper.unmount();
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
    await summary.get('button').trigger('click');
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
    await summary.get('button').trigger('click');
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
    await summary.get('button').trigger('click');
    const rows = summary.findAll('li').map((item) => item.text());
    expect(rows).toEqual([
      expect.stringMatching(/^Met:\s*Story objective: Goal \(Chapter\)/),
      expect.stringMatching(/^Met:\s*Additional in-game progression required/),
      expect.stringMatching(/^Not met:\s*Requires an in-game trader conversation/),
    ]);
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
    expect(wrapper.get('[data-testid="task-requirement-chip"]').text()).toContain(
      'Use Mark available only if this task is available in-game.'
    );
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
    expect(wrapper.get('[data-testid="task-requirements-blocking"]').text()).toContain(
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
    await wrapper.get('[data-testid="task-requirement-chip"] button').trigger('click');
    expect(wrapper.get('[data-testid="task-pool-details"]').text()).toContain('Contributor task');
    expect(
      wrapper.get('[data-testid="task-requirements-summary"] button').attributes('aria-expanded')
    ).toBe('true');
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
});
