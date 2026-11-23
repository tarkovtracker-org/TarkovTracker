// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import DashboardTraderCard from '@/features/dashboard/DashboardTraderCard.vue';
import DashboardTraderEditor from '@/features/dashboard/DashboardTraderEditor.vue';
import type { Trader, TraderLoyaltyLevel } from '@/types/tarkov';
const mockState = reactive({
  traderLevel: 1,
  reputation: 0,
  locale: 'en',
});
const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
const setTraderLevel = vi.fn((_id: string, value: number) => {
  mockState.traderLevel = value;
});
const setTraderReputation = vi.fn((_id: string, value: number) => {
  mockState.reputation = value;
});
mockNuxtImport('useRouter', () => () => ({
  push: pushMock,
}));
mockNuxtImport('useI18n', () => () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    [
      mockState.locale === 'en' ? key : `${mockState.locale} ${key}`,
      ...Object.values(params ?? {}),
    ].join(' '),
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({
    setTaskPrimaryView: vi.fn(),
    setTaskTraderView: vi.fn(),
  }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getTraderLevel: () => mockState.traderLevel,
    getTraderReputation: () => mockState.reputation,
    setTraderLevel,
    setTraderReputation,
  }),
}));
const mockTheme = {
  themeMode: 'dark',
};
vi.mock('@/composables/useTheme', () => ({
  useTheme: () => ({
    themeMode: { value: mockTheme.themeMode },
    isLightTheme: { value: mockTheme.themeMode === 'light' },
    setThemeMode: vi.fn(),
    toggleThemeMode: vi.fn(),
  }),
}));
describe('DashboardTraderCard', () => {
  beforeEach(() => {
    mockState.traderLevel = 1;
    mockState.reputation = 0;
    mockState.locale = 'en';
    mockTheme.themeMode = 'dark';
    document.documentElement.removeAttribute('data-theme');
    vi.clearAllMocks();
  });
  const baseTrader: Trader & { levels: TraderLoyaltyLevel[] } = {
    id: 'prapor',
    name: 'Prapor',
    normalizedName: 'prapor',
    imageLink: 'https://example.com/prapor.jpg',
    levels: [
      {
        id: 'prapor-1',
        level: 1,
        requiredPlayerLevel: 1,
        requiredReputation: 0,
        requiredCommerce: 0,
      },
      {
        id: 'prapor-2',
        level: 2,
        requiredPlayerLevel: 15,
        requiredReputation: 0.2,
        requiredCommerce: 750000,
      },
      {
        id: 'prapor-3',
        level: 3,
        requiredPlayerLevel: 26,
        requiredReputation: 0.35,
        requiredCommerce: 1500000,
      },
      {
        id: 'prapor-4',
        level: 4,
        requiredPlayerLevel: 36,
        requiredReputation: 0.5,
        requiredCommerce: 2300000,
      },
    ],
  };
  const createWrapper = (props = {}) =>
    mount(DashboardTraderCard, {
      props: {
        trader: baseTrader,
        completedTasks: 5,
        totalTasks: 20,
        percentage: 25,
        ...props,
      },
      global: {
        mocks: {
          $t: (key: string) => key,
        },
        stubs: {
          UButton: true,
          NuxtLink: {
            props: ['to'],
            template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
          },
          RouterLink: {
            props: ['to'],
            template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
          },
          NuxtImg: {
            props: ['src', 'alt'],
            template: '<img :src="src" :alt="alt" />',
          },
          UIcon: {
            props: ['name'],
            template: '<i :data-icon="name" />',
          },
        },
      },
    });
  it('shows loyalty, reputation and task progress before the editor is opened', async () => {
    const wrapper = createWrapper();
    const summary = wrapper.get('button');
    expect(summary.attributes('aria-expanded')).toBe('false');
    expect(summary.text()).toContain('loyalty_short 1');
    expect(summary.text()).toContain('reputation_short 0.00');
    expect(summary.text()).toContain('5/20');
    await summary.trigger('click');
    expect(wrapper.emitted('toggle')).toHaveLength(1);
    expect(pushMock).not.toHaveBeenCalled();
  });
  it('renders a storyline requirement for a story-locked trader', () => {
    const wrapper = createWrapper({
      unlock: {
        kind: 'story',
        chapter: { id: 'tour', name: 'Tour' },
        objective: { id: 'talk-to-prapor', name: 'Talk to Prapor' },
      },
    });
    const requirement = wrapper.get('[data-testid="trader-unlock-requirement"]');
    expect(requirement.text()).toContain('Talk to Prapor');
    expect(JSON.parse(requirement.attributes('data-to')!)).toEqual({
      path: '/storyline',
      query: { chapter: 'tour', objective: 'talk-to-prapor' },
    });
  });
  it('opens the tasks view directly for a trader without standing controls', async () => {
    const wrapper = createWrapper({ trader: { ...baseTrader, normalizedName: 'lightkeeper' } });
    await wrapper.get('[aria-label="page.dashboard.traders.view_tasks"]').trigger('click');
    expect(pushMock).toHaveBeenCalledWith({ path: '/tasks/traders', query: { trader: 'prapor' } });
  });
  it('links a task-locked trader to its unlock task', () => {
    const wrapper = createWrapper({
      unlock: { kind: 'task', task: { id: 'task-1', name: 'Getting Acquainted' } },
    });
    const requirement = wrapper.get('[data-testid="trader-unlock-requirement"]');
    expect(requirement.text()).toContain('Prapor');
    expect(requirement.text()).toContain('common.locked');
    expect(requirement.text()).toContain('Getting Acquainted');
    expect(JSON.parse(requirement.attributes('data-to')!)).toEqual({
      path: '/tasks',
      query: { task: 'task-1' },
    });
  });
  it('shows an unlinked warning when the unlock requirement is unconfirmed', () => {
    const wrapper = createWrapper({ unlock: { kind: 'unknown' } });
    const requirement = wrapper.get('[data-testid="trader-unlock-requirement"]');
    expect(requirement.element.tagName).toBe('DIV');
    expect(requirement.text()).toContain('page.dashboard.traders.unlock_unconfirmed');
  });
  it('shows a neutral status when unlock data is unavailable', () => {
    const wrapper = createWrapper({ unlock: { kind: 'pending' } });
    const requirement = wrapper.get('[data-testid="trader-unlock-requirement"]');
    expect(requirement.element.tagName).toBe('DIV');
    expect(requirement.text()).toContain('page.dashboard.traders.unlock_unavailable');
  });
  it('hides progress and loyalty controls while locked', () => {
    const wrapper = createWrapper({
      unlock: { kind: 'task', task: { id: 'task-1', name: 'Getting Acquainted' } },
    });
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.find('.tabular-nums').exists()).toBe(false);
  });
  it('shows no requirement for an open trader', () => {
    const wrapper = createWrapper({ unlock: null });
    expect(wrapper.find('[data-testid="trader-unlock-requirement"]').exists()).toBe(false);
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(true);
  });
  it('renders completed trader state', () => {
    mockState.traderLevel = 4;
    const wrapper = createWrapper({ percentage: 100 });
    const container = wrapper.get('button');
    expect(container.classes()).toContain('border-success-500/15');
  });
  const createEditor = (trader: Trader = baseTrader) =>
    mount(DashboardTraderEditor, {
      props: { trader },
      global: {
        mocks: { $t: (key: string) => key },
        stubs: { UButton: true },
      },
    });
  it('commits loyalty immediately and raises reputation before applying the new level', async () => {
    const editor = createEditor();
    const summary = createWrapper();
    await editor.get('select').setValue('2');
    expect(setTraderReputation).toHaveBeenCalledWith('prapor', 0.2);
    expect(setTraderLevel).toHaveBeenCalledWith('prapor', 2);
    expect(setTraderReputation.mock.invocationCallOrder[0]).toBeLessThan(
      setTraderLevel.mock.invocationCallOrder[0]!
    );
    expect(summary.get('button').text()).toContain('reputation_short 0.20');
    expect(editor.get('[role="status"]').text()).toContain('rep_raised 0.20');
  });
  it('preserves sufficient reputation when changing loyalty and rejects lower edits on blur', async () => {
    mockState.reputation = 0.6;
    const editor = createEditor();
    await editor.get('select').setValue('3');
    expect(setTraderReputation).not.toHaveBeenCalled();
    const rep = editor.get('input');
    await rep.setValue('0.34');
    await rep.trigger('blur');
    expect(rep.attributes('aria-invalid')).toBe('true');
    expect(setTraderReputation).not.toHaveBeenCalled();
    await rep.setValue('0,42');
    await rep.trigger('blur');
    expect(setTraderReputation).toHaveBeenCalledWith('prapor', 0.42);
    expect(rep.attributes('aria-invalid')).toBe('false');
  });
  it('supports signed Scav Karma without a loyalty selector', async () => {
    const editor = createEditor({ ...baseTrader, id: 'fence', normalizedName: 'fence' });
    expect(editor.find('select').exists()).toBe(false);
    const karma = editor.get('input');
    await karma.setValue('-0.25');
    await karma.trigger('blur');
    expect(setTraderReputation).toHaveBeenCalledWith('fence', -0.25);
  });
  it('updates an untouched focused field when reputation syncs and skips the blur write', async () => {
    const editor = createEditor();
    const rep = editor.get('input');
    await rep.trigger('focus');
    mockState.reputation = 0.5;
    await editor.vm.$nextTick();
    expect(rep.element.value).toBe('0.50');
    await rep.trigger('blur');
    expect(setTraderReputation).not.toHaveBeenCalled();
  });
  it('preserves a changed draft through sync and commits it when focus leaves', async () => {
    const editor = createEditor();
    const rep = editor.get('input');
    await rep.trigger('focus');
    await rep.setValue('0.70');
    mockState.reputation = 0.5;
    await editor.vm.$nextTick();
    expect(rep.element.value).toBe('0.70');
    await rep.trigger('blur');
    expect(setTraderReputation).toHaveBeenCalledExactlyOnceWith('prapor', 0.7);
  });
  it('avoids a write for equivalent input, even when reputation synced during editing', async () => {
    mockState.reputation = 0.2;
    const editor = createEditor();
    const rep = editor.get('input');
    await rep.setValue('0,2');
    mockState.reputation = 0.5;
    await editor.vm.$nextTick();
    await rep.trigger('blur');
    expect(setTraderReputation).not.toHaveBeenCalled();
    expect(rep.element.value).toBe('0.50');
    await rep.setValue('0.5');
    await rep.trigger('blur');
    expect(setTraderReputation).not.toHaveBeenCalled();
    expect(rep.element.value).toBe('0.50');
  });
  it('retranslates the current update feedback when the locale changes', async () => {
    const editor = createEditor();
    const status = editor.get('[role="status"]');
    await editor.get('select').setValue('2');
    expect(status.text()).toBe('page.dashboard.traders.rep_raised 0.20');
    mockState.locale = 'de';
    await editor.vm.$nextTick();
    expect(status.text()).toBe('de page.dashboard.traders.rep_raised 0.20');
    const rep = editor.get('input');
    await rep.setValue('0.50');
    await rep.trigger('blur');
    expect(status.text()).toBe('de page.dashboard.traders.standing_saved');
    mockState.locale = 'en';
    await editor.vm.$nextTick();
    expect(status.text()).toBe('page.dashboard.traders.standing_saved');
  });
});
