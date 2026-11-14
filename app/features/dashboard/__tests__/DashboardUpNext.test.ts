import { mountSuspended } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { UpNextItem, UpNextState } from '@/features/dashboard/upNext';
import type { StorylineNextStep } from '@/features/storyline/nextStep';
const { useDashboardUpNextMock, trackRecommendationClickMock, clearRecommendationAttributionMock } =
  vi.hoisted(() => ({
    useDashboardUpNextMock: vi.fn(),
    trackRecommendationClickMock: vi.fn(),
    clearRecommendationAttributionMock: vi.fn(),
  }));
vi.mock('@/composables/useDashboardUpNext', () => ({
  useDashboardUpNext: useDashboardUpNextMock,
}));
vi.mock('@/composables/useDashboardFocusAnalytics', () => ({
  useDashboardFocusAnalytics: () => ({
    trackRecommendationClick: trackRecommendationClickMock,
    clearRecommendationAttribution: clearRecommendationAttributionMock,
  }),
}));
vi.mock('@/composables/useTaskBlockerText', () => ({
  useTaskBlockerText: () => (blocker: { type: string; required?: number }) =>
    `${blocker.type}:${blocker.required}`,
}));
const translations: Record<string, string> = {
  'page.dashboard.up_next.title': 'Up next',
  'page.dashboard.up_next.blocked_title': 'Closest unlocks',
  'page.dashboard.up_next.filtered_badge': 'Filtered',
  'page.dashboard.up_next.left_one': '1 left',
  'page.dashboard.up_next.left_other': '{count} left',
  'page.dashboard.up_next.turn_in': 'Turn in',
  'page.dashboard.up_next.hidden_other': '{count} available tasks are hidden by your filters',
  'page.dashboard.up_next.complete': 'Every visible task is done.',
  'page.dashboard.up_next.reason.opens_other': 'Opens {count} tasks',
  'page.dashboard.up_next.reason.unlock_trader': 'Unlocks {trader}',
  'page.dashboard.up_next.reason.ready': 'Ready',
  'page.dashboard.up_next.storyline.chapter': 'Storyline · {chapter}',
  'page.dashboard.up_next.storyline.objective_hint':
    'Next tracked step · Check Storyline for requirements',
  'page.dashboard.up_next.storyline.unlocks': 'Unlocks {unlock}',
  'page.tasks.no_available_tasks': 'No available tasks right now',
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
const item = (overrides: Partial<UpNextItem> = {}): UpNextItem => ({
  taskId: 'task-1',
  taskName: 'Task 1',
  reason: 'ready',
  score: 10,
  progress: { completed: 0, remaining: 3, total: 3 },
  opens: 0,
  ...overrides,
});
const mountWith = async (
  state: UpNextState,
  items: UpNextItem[] = [],
  extra: {
    filtersActive?: boolean;
    hiddenAvailableCount?: number;
    storyStep?: StorylineNextStep;
    inTaskList?: boolean;
  } = {}
) => {
  useDashboardUpNextMock.mockReturnValue({
    filtersActive: ref(extra.filtersActive ?? false),
    hiddenAvailableCount: ref(extra.hiddenAvailableCount ?? 0),
    items: ref(items),
    state: ref(state),
    storyStep: ref(extra.storyStep),
  });
  const { default: DashboardUpNext } = await import('@/features/dashboard/DashboardUpNext.vue');
  return mountSuspended(DashboardUpNext, {
    props: { inTaskList: extra.inTaskList },
    global: {
      stubs: {
        NuxtLink: {
          props: ['to'],
          template:
            '<a :href="typeof to === \'string\' ? to : to.path" :data-query="JSON.stringify(to.query)" :data-task="typeof to === \'string\' ? \'\' : to?.query?.task"><slot /></a>',
        },
        UIcon: true,
      },
    },
  });
};
describe('DashboardUpNext', () => {
  beforeEach(() => {
    useDashboardUpNextMock.mockReset();
    trackRecommendationClickMock.mockReset();
    clearRecommendationAttributionMock.mockReset();
  });
  it('renders ranked rows that link to their task', async () => {
    const wrapper = await mountWith('actionable', [
      item({ taskId: 'mole', taskName: 'Saving the Mole', reason: 'opens', opens: 6 }),
      item({
        taskId: 'intro',
        taskName: 'Introduction',
        reason: 'unlock-trader',
        traderName: 'Jaeger',
        progress: { completed: 1, remaining: 0, total: 1 },
      }),
    ]);
    expect(wrapper.text()).toContain('Up next');
    const rows = wrapper.findAll('[data-testid^="up-next-item-"]');
    expect(rows.map((row) => row.attributes('data-task'))).toEqual(['mole', 'intro']);
    expect(rows[0]?.text()).toContain('Opens 6 tasks');
    expect(rows[0]?.text()).toContain('3 left');
    expect(rows[1]?.text()).toContain('Unlocks Jaeger');
    expect(rows[1]?.text()).toContain('Turn in');
  });
  it('tracks clicks with primary and secondary variants', async () => {
    const wrapper = await mountWith('actionable', [
      item({ taskId: 'a', reason: 'kappa' }),
      item({ taskId: 'b' }),
    ]);
    await wrapper.find('[data-testid="up-next-item-a"]').trigger('click');
    await wrapper.find('[data-testid="up-next-item-b"]').trigger('click');
    expect(trackRecommendationClickMock.mock.calls).toEqual([
      [{ recommendationId: 'available-a', reason: 'kappa', taskId: 'a', variant: 'primary' }],
      [{ recommendationId: 'available-b', reason: 'ready', taskId: 'b', variant: 'secondary' }],
    ]);
  });
  it('shows blocker text for closest unlocks', async () => {
    const wrapper = await mountWith('blocked', [
      item({ reason: 'blocked', blocker: { type: 'player_level', required: 15 } }),
    ]);
    expect(wrapper.text()).toContain('Closest unlocks');
    expect(wrapper.find('[data-testid="up-next-reason"]').text()).toBe('player_level:15');
    expect(wrapper.text()).not.toContain('3 left');
  });
  it('points to the task list when filters hide everything', async () => {
    const wrapper = await mountWith('filtered', [], {
      filtersActive: true,
      hiddenAvailableCount: 4,
    });
    expect(wrapper.find('[data-testid="up-next-filter-badge"]').exists()).toBe(true);
    const link = wrapper.find('[data-testid="up-next-filtered"]');
    expect(link.attributes('href')).toBe('/tasks');
    expect(link.text()).toContain('4 available tasks are hidden by your filters');
  });
  it('shows a muted line when everything is complete', async () => {
    const wrapper = await mountWith('complete');
    expect(wrapper.find('[data-testid="up-next-message"]').text()).toBe(
      'Every visible task is done.'
    );
  });
  it('renders nothing when there is no task data', async () => {
    const wrapper = await mountWith('empty');
    expect(wrapper.find('[data-testid="dashboard-up-next"]').exists()).toBe(false);
  });
  const storyStep: StorylineNextStep = {
    chapterId: 'tour',
    chapterName: 'Tour',
    kind: 'objective',
    objectiveId: 'talk',
    description: 'Talk to Therapist',
    unlocks: ['Therapist'],
    opens: 2,
  };
  it('puts the next tracked Storyline step before available tasks with an exact deep link', async () => {
    const wrapper = await mountWith('actionable', [item()], { storyStep });
    const rows = wrapper.findAll('ol > li');
    expect(rows[0]?.text()).toContain('Talk to Therapist');
    expect(rows[0]?.text()).toContain('Next tracked step');
    expect(rows[0]?.text()).toContain('Unlocks Therapist · Opens 2 tasks');
    expect(rows[0]?.get('a').attributes('data-query')).toBe(
      JSON.stringify({ chapter: 'tour', objective: 'talk' })
    );
    expect(rows[1]?.text()).toContain('Task 1');
  });
  it('keeps Storyline guidance when ordinary tasks are complete or absent', async () => {
    for (const state of ['complete', 'empty'] as const) {
      const wrapper = await mountWith(state, [], { storyStep });
      expect(wrapper.get('[data-testid="up-next-storyline"]').text()).toContain(
        'Talk to Therapist'
      );
      expect(wrapper.find('[data-testid="up-next-message"]').exists()).toBe(false);
    }
  });
  it('keeps the hidden-task explanation beside Storyline guidance', async () => {
    const wrapper = await mountWith('filtered', [], {
      storyStep,
      filtersActive: true,
      hiddenAvailableCount: 4,
    });
    expect(wrapper.get('[data-testid="up-next-filtered"]').text()).toContain('4 available tasks');
  });
  it('links known Storyline blockers directly without recording task-list clicks as dashboard analytics', async () => {
    const wrapper = await mountWith(
      'blocked',
      [item({ reason: 'blocked', storylineTarget: { chapter: 'tour', objective: 'talk' } })],
      { inTaskList: true }
    );
    expect(wrapper.text()).toContain('No available tasks right now');
    const link = wrapper.get('[data-testid="up-next-item-task-1"]');
    expect(link.attributes('href')).toBe('/storyline');
    expect(link.attributes('data-query')).toBe(
      JSON.stringify({ chapter: 'tour', objective: 'talk' })
    );
    await link.trigger('click');
    expect(trackRecommendationClickMock).not.toHaveBeenCalled();
  });
  it('records dashboard Storyline blocker clicks without task-funnel attribution', async () => {
    const wrapper = await mountWith('blocked', [
      item({ reason: 'blocked', storylineTarget: { chapter: 'tour', objective: 'talk' } }),
    ]);
    await wrapper.get('[data-testid="up-next-item-task-1"]').trigger('click');
    expect(trackRecommendationClickMock).toHaveBeenCalledWith({
      recommendationId: 'blocked-task-1',
      reason: 'blocked',
      taskId: undefined,
      variant: 'primary',
    });
  });
  it('clears previous task attribution when opening the dashboard Storyline step', async () => {
    const wrapper = await mountWith('actionable', [item()], { storyStep });
    await wrapper.get('[data-testid="up-next-storyline"]').trigger('click');
    expect(clearRecommendationAttributionMock).toHaveBeenCalledOnce();
    expect(trackRecommendationClickMock).not.toHaveBeenCalled();
  });
  it('leaves dashboard analytics untouched when opening a task-list Storyline step', async () => {
    const wrapper = await mountWith('blocked', [], { storyStep, inTaskList: true });
    await wrapper.get('[data-testid="up-next-storyline"]').trigger('click');
    expect(clearRecommendationAttributionMock).not.toHaveBeenCalled();
    expect(trackRecommendationClickMock).not.toHaveBeenCalled();
  });
});
