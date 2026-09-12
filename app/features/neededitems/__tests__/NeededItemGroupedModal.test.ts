// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NeededItemGroupedModal from '@/features/neededitems/NeededItemGroupedModal.vue';
import type {
  GroupedItemInfo,
  NeededItemHideoutModule,
  NeededItemTaskObjective,
} from '@/types/tarkov';
mockNuxtImport('useI18n', () => () => ({
  t: (key: string) => key,
}));
mockNuxtImport('useToast', () => () => ({
  add: vi.fn(),
}));
vi.mock('@/composables/useItemDistribution', () => ({
  useItemDistribution: () => ({
    distributeItems: vi.fn(),
    applyDistribution: vi.fn(),
    resetObjectives: vi.fn(),
    sortTaskObjectives: <T>(list: T[]): T[] => list,
    sortHideoutModules: <T>(list: T[]): T[] => list,
  }),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    getTaskById: () => ({ name: 'Debut', kappaRequired: true }),
    getStationById: () => ({ name: 'Workbench' }),
  }),
}));
const mockCounts = {
  objectiveCount: 1,
  hideoutCount: 2,
};
const mockSetObjectiveCount = vi.fn();
const mockSetHideoutPartCount = vi.fn();
const mockSetHideoutPartComplete = vi.fn();
const mockSetHideoutPartUncomplete = vi.fn();
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getObjectiveCount: () => mockCounts.objectiveCount,
    getHideoutPartCount: () => mockCounts.hideoutCount,
    isTaskComplete: () => false,
    isHideoutModuleComplete: () => false,
    setObjectiveCount: mockSetObjectiveCount,
    setHideoutPartCount: mockSetHideoutPartCount,
    setHideoutPartComplete: mockSetHideoutPartComplete,
    setHideoutPartUncomplete: mockSetHideoutPartUncomplete,
    isTaskObjectiveComplete: () => false,
  }),
}));
describe('NeededItemGroupedModal', () => {
  beforeEach(() => {
    mockCounts.objectiveCount = 1;
    mockCounts.hideoutCount = 2;
    vi.clearAllMocks();
  });
  const mockItemInfo: GroupedItemInfo = {
    id: 'item-1',
    name: 'Salewa',
    image512pxLink: 'https://example.com/salewa.png',
    wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Salewa',
    link: 'https://tarkov.dev/item/salewa',
  };
  const mockTaskObjective = {
    id: 'obj-1',
    taskId: 'task-1',
    objectiveId: 'obj-1',
    count: 3,
    foundInRaid: true,
  } as unknown as NeededItemTaskObjective;
  const mockHideoutModule = {
    id: 'module-1',
    hideoutModule: {
      id: 'module-1',
      stationId: 'station-1',
      level: 1,
    },
    count: 2,
  } as unknown as NeededItemHideoutModule;
  const createWrapper = (props = {}) =>
    mount(NeededItemGroupedModal, {
      props: {
        open: true,
        itemInfo: mockItemInfo,
        taskObjectives: [mockTaskObjective],
        hideoutModules: [mockHideoutModule],
        ...props,
      },
      global: {
        mocks: {
          $t: (key: string) => key,
        },
        stubs: {
          UBadge: { template: '<span><slot /></span>' },
          UModal: {
            props: ['open'],
            template: '<div v-if="open"><slot name="content" /></div>',
          },
          GameItem: {
            template: '<div data-testid="game-item" />',
          },
          UIcon: {
            props: ['name'],
            template: '<i :data-icon="name" />',
          },
          UButton: {
            template: '<button><slot /></button>',
          },
          NuxtLink: {
            template: '<a><slot /></a>',
          },
          RouterLink: {
            template: '<a><slot /></a>',
          },
          NeededItemGroupedInputControls: {
            template: '<div data-testid="input-controls" />',
          },
        },
      },
    });
  it('renders task objective and hideout counts with theme-aware text classes', () => {
    mockCounts.objectiveCount = 1;
    mockCounts.hideoutCount = 1;
    const wrapper = createWrapper();
    const countBadges = wrapper.findAll('.font-semibold.border-x');
    expect(countBadges.length).toBeGreaterThanOrEqual(2);
    expect(countBadges[0]!.classes()).toContain('light:text-surface-50');
    expect(countBadges[1]!.classes()).toContain('light:text-surface-50');
    const closeBtn = wrapper.find('button[aria-label="common.close"]');
    expect(closeBtn.classes()).toContain('light:hover:text-surface-50');
  });
  it('renders completed count classes when objective and hideout counts meet requirement', () => {
    mockCounts.objectiveCount = 3;
    mockCounts.hideoutCount = 2;
    const wrapper = createWrapper();
    const countBadges = wrapper.findAll('.font-semibold.border-x');
    expect(countBadges.length).toBeGreaterThanOrEqual(2);
    expect(countBadges[0]!.classes()).toContain('text-success-400');
    expect(countBadges[1]!.classes()).toContain('text-success-400');
  });
  it('calls store setters when clicking objective increment button', async () => {
    mockCounts.objectiveCount = 1;
    const wrapper = createWrapper();
    const increaseBtn = wrapper.find(
      'button[aria-label*="needed_items.aria.increase_objective_count"]'
    );
    expect(increaseBtn.exists()).toBe(true);
    expect(increaseBtn.classes()).toContain('light:hover:text-surface-50');
    await increaseBtn.trigger('click');
    expect(mockSetObjectiveCount).toHaveBeenCalledWith('obj-1', 2);
  });
  it('calls store setters when clicking hideout increment button', async () => {
    mockCounts.hideoutCount = 1;
    const wrapper = createWrapper();
    const increaseBtn = wrapper.find(
      'button[aria-label*="needed_items.aria.increase_hideout_count"]'
    );
    expect(increaseBtn.exists()).toBe(true);
    expect(increaseBtn.classes()).toContain('light:hover:text-surface-50');
    await increaseBtn.trigger('click');
    expect(mockSetHideoutPartCount).toHaveBeenCalledWith('module-1', 2);
    expect(mockSetHideoutPartComplete).toHaveBeenCalledWith('module-1');
  });
});
