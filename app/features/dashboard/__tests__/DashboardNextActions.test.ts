import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type {
  DashboardRecommendation,
  DashboardRecommendationMode,
} from '@/composables/useDashboardRecommendations';
const { useDashboardRecommendationsMock } = vi.hoisted(() => ({
  useDashboardRecommendationsMock: vi.fn(),
}));
const { trackRecommendationClickMock } = vi.hoisted(() => ({
  trackRecommendationClickMock: vi.fn(),
}));
mockNuxtImport('useDashboardRecommendations', () => useDashboardRecommendationsMock);
vi.mock('@/composables/useDashboardFocusAnalytics', () => ({
  useDashboardFocusAnalytics: () => ({
    trackRecommendationClick: trackRecommendationClickMock,
  }),
}));
const translations: Record<string, string> = {
  'page.dashboard.focus.badge.based_on_filters': 'Based on current filters',
  'page.dashboard.focus.cta.open_task': 'Open task',
  'page.dashboard.focus.cta.open_tasks': 'Open task list',
  'page.dashboard.focus.heading.closest_unlock': 'Closest unlock: {task}',
  'page.dashboard.focus.heading.continue': 'Continue {task}',
  'page.dashboard.focus.heading.start': 'Start {task}',
  'page.dashboard.focus.proof.blocked_level_one': 'Closest unlock: only 1 level away.',
  'page.dashboard.focus.proof.blocked_level_other': 'Closest unlock: only {count} levels away.',
  'page.dashboard.focus.proof.blocked_trader_unlock':
    'Closest unlock: finish {task} to unlock {trader}.',
  'page.dashboard.focus.proof.complete': 'No visible work remains in this dashboard scope.',
  'page.dashboard.focus.proof.impact_one': 'Highest payoff: opens 1 follow-up task.',
  'page.dashboard.focus.proof.impact_other': 'Highest payoff: opens {count} follow-up tasks.',
  'page.dashboard.focus.reason.complete': 'Everything visible is complete',
  'page.dashboard.focus.reason.filters': 'Current filters are hiding viable tasks',
  'page.dashboard.focus.reason.impact_one': 'Opens 1 follow-up task',
  'page.dashboard.focus.reason.impact_other': 'Opens {count} follow-up tasks',
  'page.dashboard.focus.stat.secondary': 'Other good options',
  'page.dashboard.focus.stat.secondary_empty': 'This is the clearest next step right now.',
  'page.dashboard.focus.stat.status': 'Status',
  'page.dashboard.focus.stat.why': 'Why it won',
  'page.dashboard.focus.status.level_other': 'Reach level {required} ({count} more levels to go).',
  'page.dashboard.focus.status.ready_other': 'Ready now. {count} objectives left.',
  'page.dashboard.focus.status.trader_unlock': 'Complete {task} to unlock {trader}.',
  'page.dashboard.focus.summary.blocked_trader_unlock':
    '{task} is blocked until a trader unlock is complete.',
  'page.dashboard.focus.summary.blocked_level_other':
    '{task} is your closest unlock, but you still need {count} more levels.',
  'page.dashboard.focus.summary.impact':
    '{task} has the biggest downstream payoff in your current queue.',
  'page.dashboard.focus.title.blocked': 'Nothing is ready right now',
  'page.dashboard.focus.title.default': 'What should I do next?',
};
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, values: Record<string, string | number> = {}) =>
      (translations[key] ?? key).replaceAll(/\{(\w+)\}/g, (_, token) =>
        String(values[token] ?? `{${token}}`)
      ),
  }),
}));
const createRecommendation = (
  overrides: Partial<DashboardRecommendation> = {}
): DashboardRecommendation => ({
  action: overrides.action ?? {
    path: '/tasks',
    query: { task: overrides.taskId ?? 'task-1' },
  },
  blockers: [{ type: 'ready' }],
  id: 'available-task-1',
  impact: 0,
  isKappa: false,
  isLightkeeper: false,
  kind: 'task',
  progress: {
    completed: 0,
    remaining: 3,
    total: 3,
  },
  reason: 'default',
  score: 10,
  taskId: 'task-1',
  taskName: 'Task 1',
  tone: 'primary',
  ...overrides,
});
const mountWithRecommendation = async (
  primaryRecommendation: DashboardRecommendation,
  mode: DashboardRecommendationMode
) => {
  useDashboardRecommendationsMock.mockReturnValue({
    availableActionCount: ref(mode === 'actionable' ? 1 : 0),
    filtersActive: ref(false),
    hasMultipleStrongOptions: ref(false),
    hiddenAvailableCount: ref(0),
    mode: ref(mode),
    primaryRecommendation: ref(primaryRecommendation),
    secondaryRecommendations: ref([]),
  });
  const { default: DashboardNextActions } =
    await import('@/features/dashboard/DashboardNextActions.vue');
  return mountSuspended(DashboardNextActions, {
    global: {
      stubs: {
        NuxtLink: {
          props: ['to'],
          template:
            "<a :href=\"typeof to === 'string' ? to : to.path\" :data-task=\"typeof to === 'string' ? '' : to?.query?.task\"><slot /></a>",
        },
        UButton: {
          props: ['to'],
          template:
            "<button :data-to=\"typeof to === 'string' ? to : to?.path\" :data-task=\"typeof to === 'string' ? '' : to?.query?.task\"><slot /></button>",
        },
        UIcon: true,
      },
    },
  });
};
describe('DashboardNextActions', () => {
  beforeEach(() => {
    useDashboardRecommendationsMock.mockReset();
    trackRecommendationClickMock.mockReset();
  });
  it('renders an impact proof line for the top-ranked actionable task', async () => {
    const wrapper = await mountWithRecommendation(
      createRecommendation({
        impact: 6,
        progress: {
          completed: 0,
          remaining: 3,
          total: 3,
        },
        reason: 'impact',
        score: 720,
        taskName: 'Saving the Mole',
        tone: 'primary',
      }),
      'actionable'
    );
    expect(wrapper.text()).toContain('Why it won');
    expect(wrapper.text()).toContain('Highest payoff: opens 6 follow-up tasks.');
    expect(wrapper.text()).toContain('Start Saving the Mole');
  });
  it('renders a closest-unlock proof line for blocked recommendations', async () => {
    const wrapper = await mountWithRecommendation(
      createRecommendation({
        blockers: [
          {
            count: 2,
            required: 15,
            type: 'level',
          },
        ],
        progress: {
          completed: 0,
          remaining: 1,
          total: 1,
        },
        reason: 'blocked-level',
        score: -8,
        taskName: 'Wet Job - Part 1',
        tone: 'warning',
      }),
      'blocked'
    );
    expect(wrapper.text()).toContain('Why it won');
    expect(wrapper.text()).toContain('Closest unlock: only 2 levels away.');
    expect(wrapper.text()).toContain('Closest unlock: Wet Job - Part 1');
  });
  it('tracks primary recommendation clicks', async () => {
    const wrapper = await mountWithRecommendation(
      createRecommendation({
        impact: 2,
        reason: 'impact',
        taskId: 'task-impact',
        taskName: 'Impact Task',
      }),
      'actionable'
    );
    await wrapper.get('button[data-task="task-impact"]').trigger('click');
    expect(trackRecommendationClickMock).toHaveBeenCalledWith({
      recommendationId: 'available-task-1',
      reason: 'impact',
      taskId: 'task-impact',
      variant: 'primary',
    });
  });
  it('makes the primary recommendation surface itself navigable', async () => {
    const wrapper = await mountWithRecommendation(
      createRecommendation({
        impact: 2,
        reason: 'impact',
        taskId: 'task-impact',
        taskName: 'Impact Task',
      }),
      'actionable'
    );
    const primarySurfaceLink = wrapper.get('a[data-task="task-impact"]');
    expect(primarySurfaceLink.text()).toContain('Impact Task');
  });
  it('uses blocker priority instead of insertion order for blocked cards', async () => {
    const wrapper = await mountWithRecommendation(
      createRecommendation({
        blockers: [
          {
            count: 2,
            required: 15,
            type: 'level',
          },
          {
            taskName: 'Getting Acquainted',
            traderName: 'Lightkeeper',
            type: 'trader-unlock',
          },
        ],
        progress: {
          completed: 0,
          remaining: 1,
          total: 1,
        },
        reason: 'blocked-trader-unlock',
        score: -12,
        taskName: 'Top Secret',
        tone: 'warning',
      }),
      'blocked'
    );
    expect(wrapper.text()).toContain('Top Secret is blocked until a trader unlock is complete.');
    expect(wrapper.text()).toContain(
      'Closest unlock: finish Getting Acquainted to unlock Lightkeeper.'
    );
    expect(wrapper.text()).toContain('Complete Getting Acquainted to unlock Lightkeeper.');
    expect(wrapper.text()).not.toContain('only 2 levels away');
    expect(wrapper.text()).not.toContain('Reach level 15');
  });
});
