// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardTraderCard from '@/features/dashboard/DashboardTraderCard.vue';
import type { Trader, TraderLoyaltyLevel } from '@/types/tarkov';
const mockState = {
  isLocked: false,
  traderLevel: 1,
  gameMode: 'pvp',
};
mockNuxtImport('useRouter', () => () => ({
  push: vi.fn(),
}));
mockNuxtImport('useI18n', () => () => ({
  t: (key: string) => key,
}));
vi.mock('@/features/dashboard/traderLockStatus', () => ({
  isTraderLocked: () => mockState.isLocked,
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    tasks: [],
  }),
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({
    setTaskTraderView: vi.fn(),
  }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getCurrentGameMode: () => mockState.gameMode,
    getTraderLevel: () => mockState.traderLevel,
    getTraderReputation: () => 0.5,
    isTaskComplete: () => false,
    setTraderLevel: vi.fn(),
  }),
}));
describe('DashboardTraderCard', () => {
  beforeEach(() => {
    mockState.isLocked = false;
    mockState.traderLevel = 1;
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
          NuxtImg: {
            props: ['src', 'alt'],
            template: '<img :src="src" :alt="alt" />',
          },
          UIcon: {
            props: ['name'],
            template: '<i :data-icon="name" />',
          },
          AppTooltip: {
            template: '<div><slot /></div>',
          },
          DashboardLoyaltyProgressBar: {
            template: '<div data-testid="loyalty-progress-bar" />',
          },
          DashboardLoyaltyPopover: {
            template: '<div data-testid="loyalty-popover" />',
          },
          ReputationInput: {
            template: '<div data-testid="reputation-input" />',
          },
        },
      },
    });
  it('renders active and inactive loyalty buttons with theme tokens', () => {
    const wrapper = createWrapper();
    const buttons = wrapper.findAll(
      'button[aria-label*="page.dashboard.traders.set_loyalty_level"]'
    );
    expect(buttons).toHaveLength(4);
    const btn1 = buttons[0]!;
    const btn2 = buttons[1]!;
    // Level 1 should be active
    expect(btn1.classes()).toContain('light:text-surface-50');
    expect(btn1.classes()).toContain('bg-surface-600');
    // Level 2 should be inactive
    expect(btn2.classes()).toContain('text-surface-300');
  });
  it('renders locked trader state', () => {
    mockState.isLocked = true;
    const wrapper = createWrapper();
    const container = wrapper.find('div');
    expect(container.classes()).toContain('bg-surface-950/80');
  });
  it('renders completed trader state', () => {
    mockState.traderLevel = 4;
    const wrapper = createWrapper({ percentage: 100 });
    const container = wrapper.find('div');
    expect(container.classes()).toContain('border-success-500/15');
  });
});
