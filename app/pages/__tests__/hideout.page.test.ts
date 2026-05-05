import { mountSuspended } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import HideoutPage from '@/pages/hideout.vue';
import type { HideoutStation } from '@/types/tarkov';
const { breakpointState, hideoutSettingsDrawerState, useInfiniteScrollMock } = vi.hoisted(() => ({
  breakpointState: { value: true },
  hideoutSettingsDrawerState: { value: false },
  useInfiniteScrollMock: vi.fn(() => ({ checkAndLoadMore: vi.fn() })),
}));
const UButtonStub = {
  template: '<button><slot /></button>',
};
const HideoutSettingsDrawerStub = {
  props: ['mode'],
  template: '<div data-testid="hideout-settings-drawer">{{ mode }}</div>',
};
const UPopoverStub = {
  template: '<div><slot /><slot name="content" /></div>',
};
/**
 * Deep freezes an object and all nested objects/arrays to prevent accidental mutation.
 * Uses a WeakSet to protect against circular references.
 */
const deepFreeze = <T extends object>(obj: T, seen = new WeakSet<object>()): Readonly<T> => {
  if (seen.has(obj)) return obj as Readonly<T>;
  seen.add(obj);
  Object.keys(obj).forEach((key) => {
    const value = (obj as Record<string, unknown>)[key];
    if (value && typeof value === 'object') {
      deepFreeze(value as object, seen);
    }
  });
  return Object.freeze(obj);
};
const station: Readonly<HideoutStation> = deepFreeze({
  id: 'station-1',
  name: 'Workbench',
  levels: [
    {
      id: 'station-1-1',
      level: 1,
      description: 'Level 1',
      constructionTime: 0,
      itemRequirements: [],
      stationLevelRequirements: [],
      skillRequirements: [],
      traderRequirements: [],
      crafts: [],
    },
  ],
});
vi.mock('@/composables/useHideoutFiltering', () => ({
  useHideoutFiltering: () => ({
    activePrimaryView: ref('available'),
    isStoreLoading: ref(false),
    visibleStations: ref([station]),
    stationCounts: ref({ available: 1, maxed: 0, locked: 0, all: 1 }),
  }),
}));
vi.mock('@/composables/useInfiniteScroll', () => ({
  useInfiniteScroll: useInfiniteScrollMock,
}));
vi.mock('@vueuse/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vueuse/core')>()),
  useBreakpoints: () => ({
    greaterOrEqual: () => breakpointState,
    smaller: () => ({ value: !breakpointState.value }),
  }),
  breakpointsTailwind: {},
}));
vi.mock('@/composables/useHideoutStationStatus', () => ({
  useHideoutStationStatus: () => ({
    getStationStatus: () => 'available',
  }),
}));
vi.mock('@/composables/usePageSettingsDrawer', () => ({
  usePageSettingsDrawer: () => ({
    isOpen: hideoutSettingsDrawerState,
    open: vi.fn(),
    close: vi.fn(),
    toggle: vi.fn(),
  }),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    hideoutStations: ref([station]),
  }),
}));
vi.mock('pinia', async () => {
  const actualPinia = await vi.importActual('pinia');
  const { isRef, ref, computed } = await import('vue');
  return {
    ...actualPinia,
    storeToRefs: vi.fn((store: Record<string, unknown>) => {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(store)) {
        if (isRef(value)) {
          result[key] = value;
        } else if (typeof value === 'function') {
          result[key] = computed(value as () => unknown);
        } else {
          result[key] = ref(value);
        }
      }
      return result;
    }),
  };
});
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({
    hideoutCollapseCompleted: false,
    hideoutSortReadyFirst: false,
    hideoutRequireStationLevels: false,
    hideoutRequireSkillLevels: false,
    hideoutRequireTraderLoyalty: false,
    setHideoutRequireStationLevels: vi.fn(),
    setHideoutRequireSkillLevels: vi.fn(),
    setHideoutRequireTraderLoyalty: vi.fn(),
  }),
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({
    hideoutLevels: { 'station-1': { self: 1 } },
  }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    enforceHideoutPrereqsNow: vi.fn(),
  }),
}));
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === 'string' ? fallback : key,
  }),
}));
describe('hideout page', () => {
  beforeEach(() => {
    breakpointState.value = true;
    hideoutSettingsDrawerState.value = false;
  });
  it('uses ready auto-loading for infinite scroll', async () => {
    useInfiniteScrollMock.mockClear();
    await mountSuspended(HideoutPage, {
      global: {
        stubs: {
          UBadge: true,
          HideoutCard: { template: '<div data-testid="hideout-card" />' },
          RefreshButton: true,
          UAlert: true,
          UButton: true,
          UIcon: true,
          UModal: true,
        },
      },
    });
    const options = (useInfiniteScrollMock.mock.calls[0] as unknown[])?.[2];
    expect(options).toMatchObject({ autoLoadOnReady: true });
  });
  it('renders hideout cards', async () => {
    const wrapper = await mountSuspended(HideoutPage, {
      global: {
        stubs: {
          UBadge: true,
          HideoutCard: { template: '<div data-testid="hideout-card" />' },
          RefreshButton: true,
          UAlert: true,
          UButton: true,
          UIcon: true,
          UModal: true,
        },
      },
    });
    expect(wrapper.find('[data-testid="hideout-card"]').exists()).toBe(true);
  });
  it('does not render a redundant hideout header summary block', async () => {
    const wrapper = await mountSuspended(HideoutPage, {
      global: {
        stubs: {
          UBadge: true,
          HideoutCard: { template: '<div data-testid="hideout-card" />' },
          RefreshButton: true,
          UAlert: true,
          UButton: true,
          UIcon: true,
          UModal: true,
        },
      },
    });
    expect(wrapper.text()).not.toContain('page.hideout.summary');
  });
  it('keeps page actions separate from the primary view switcher', async () => {
    const wrapper = await mountSuspended(HideoutPage, {
      global: {
        stubs: {
          UBadge: true,
          UButton: UButtonStub,
          UCheckbox: true,
          HideoutCard: { template: '<div data-testid="hideout-card" />' },
          RefreshButton: true,
          UAlert: true,
          UIcon: true,
          UModal: true,
          UPopover: UPopoverStub,
        },
      },
    });
    expect(wrapper.text()).not.toContain('page.needed_items.title');
    expect(wrapper.get('[data-testid="hideout-view-switcher"]').text()).toContain(
      'PAGE.HIDEOUT.PRIMARY_VIEWS.AVAILABLE'
    );
    expect(wrapper.get('[data-testid="hideout-filter-actions"]').text()).toContain('SETTINGS');
  });
  it('renders the settings drawer as a docked side rail on desktop', async () => {
    breakpointState.value = true;
    hideoutSettingsDrawerState.value = true;
    const wrapper = await mountSuspended(HideoutPage, {
      global: {
        stubs: {
          HideoutSettingsDrawer: HideoutSettingsDrawerStub,
          HideoutCard: { template: '<div data-testid="hideout-card" />' },
          RefreshButton: true,
          UAlert: true,
          UButton: UButtonStub,
          UIcon: true,
          UModal: true,
          teleport: true,
        },
      },
    });
    expect(wrapper.get('[data-testid="hideout-settings-drawer"]').text()).toContain('docked');
  });
  it('renders the settings drawer as an overlay on mobile', async () => {
    breakpointState.value = false;
    hideoutSettingsDrawerState.value = true;
    const wrapper = await mountSuspended(HideoutPage, {
      global: {
        stubs: {
          HideoutSettingsDrawer: HideoutSettingsDrawerStub,
          HideoutCard: { template: '<div data-testid="hideout-card" />' },
          RefreshButton: true,
          UAlert: true,
          UButton: UButtonStub,
          UIcon: true,
          UModal: true,
          teleport: true,
        },
      },
    });
    expect(wrapper.get('[data-testid="hideout-settings-drawer"]').text()).toContain('overlay');
  });
});
