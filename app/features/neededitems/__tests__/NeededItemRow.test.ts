import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, ref } from 'vue';
import {
  createDefaultNeededItemContext,
  neededItemKey,
  type NeededItemContext,
} from '@/features/neededitems/neededitem-keys';
import NeededItemRow from '@/features/neededitems/NeededItemRow.vue';
import type { NeededItemHideoutModule, NeededItemTaskObjective } from '@/types/tarkov';
const belowMd = ref(false);
vi.mock('@/composables/useSharedBreakpoints', () => ({
  useSharedBreakpoints: () => ({ belowMd }),
}));
vi.mock('@/composables/useItemRowIntersection', () => ({
  useItemRowIntersection: () => ({ isVisible: ref(true) }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({ playerLevel: () => 10, isTaskObjectiveComplete: () => false }),
}));
vi.mock('@/features/hideout/StationLink.vue', () => ({
  __esModule: true,
  default: {
    props: ['station', 'moduleId'],
    template: '<a class="station-link">{{ station.name }}</a>',
  },
}));
vi.mock('@/features/tasks/TaskLink.vue', () => ({
  __esModule: true,
  default: { props: ['task'], template: '<a class="task-link">{{ task.name }}</a>' },
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ locale: ref('en'), t: (key: string) => key }),
}));
const translate = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;
const passthrough = (name: string) =>
  defineComponent({ name, template: '<div><slot /><slot name="content" /></div>' });
const hideoutNeed = {
  id: 'need-1',
  needType: 'hideoutModule',
  count: 3,
  foundInRaid: false,
  hideoutModule: { id: 'module-1', level: 2 },
} as unknown as NeededItemHideoutModule;
const taskNeed = {
  id: 'obj-1',
  needType: 'taskObjective',
  taskId: 'task-1',
  count: 3,
  hiddenForSelf: true,
} as unknown as NeededItemTaskObjective;
function mountRow(
  need: NeededItemHideoutModule | NeededItemTaskObjective = hideoutNeed,
  overrides: Partial<NeededItemContext> = {}
) {
  const context = {
    ...createDefaultNeededItemContext(),
    neededCount: computed(() => 3),
    levelRequired: computed(() => 15),
    lockedBefore: computed(() => 2),
    relatedStation: computed(() => ({ id: 'station-1', name: 'Workbench' })),
    ...overrides,
  };
  return mount(NeededItemRow, {
    props: { need },
    global: {
      mocks: { $t: translate },
      provide: { [neededItemKey as symbol]: context },
      stubs: {
        AppTooltip: { props: ['text'], template: '<div :data-tooltip="text"><slot /></div>' },
        GameItem: true,
        ItemIndicators: true,
        AcceptedItemsPopover: true,
        TeamNeedsDisplay: true,
        ItemCountControls: true,
        UIcon: true,
        UButton: passthrough('UButton'),
        UModal: passthrough('UModal'),
        UCard: passthrough('UCard'),
      },
    },
  });
}
const levelLabel = translate('common.lvl_level', { level: 2 });
describe('NeededItemRow hideout needs', () => {
  it('shows one station link with its level on desktop', async () => {
    belowMd.value = false;
    const wrapper = mountRow();
    await flushPromises();
    expect(wrapper.findAll('.station-link')).toHaveLength(1);
    expect(wrapper.text()).toContain(levelLabel);
    expect(wrapper.text()).toContain(translate('common.lvl_level', { level: 15 }));
    expect(wrapper.text()).toContain(translate('needed_items.locked_before', { count: 2 }));
  });
  it('shows one station link with its level in each mobile section', async () => {
    belowMd.value = true;
    const wrapper = mountRow();
    await flushPromises();
    expect(wrapper.findAll('.station-link')).toHaveLength(2);
    expect(wrapper.text().split(levelLabel)).toHaveLength(3);
  });
});
describe('NeededItemRow hidden-for-you needs', () => {
  const hiddenContext = {
    hiddenForSelf: computed(() => true),
    relatedTask: computed(() => ({ id: 'task-1', name: 'Task One' }) as never),
    teamNeeds: computed(() => [{ user: 'team-1', count: 1 }]),
    hiddenForSelfHint: computed(() => 'hint: Alex (1/3)'),
  };
  it.each([false, true])(
    "shows only teammates' needs and no own count controls (mobile: %s)",
    async (mobile) => {
      belowMd.value = mobile;
      const wrapper = mountRow(taskNeed, hiddenContext);
      await flushPromises();
      expect(wrapper.text()).toContain('needed_items.hidden_for_you');
      expect(wrapper.text()).not.toContain('needed_items.not_collected');
      expect(wrapper.get('.sr-only').text()).toBe('hint: Alex (1/3)');
      expect(wrapper.get('[data-tooltip]').attributes('data-tooltip')).toBe('hint: Alex (1/3)');
      expect(wrapper.findComponent({ name: 'ItemCountControls' }).exists()).toBe(false);
      expect(wrapper.findComponent({ name: 'TeamNeedsDisplay' }).exists()).toBe(true);
    }
  );
  it.each([false, true])(
    'keeps teammates when an alternative task completed the objective (mobile: %s)',
    async (mobile) => {
      belowMd.value = mobile;
      const wrapper = mountRow(taskNeed, {
        ...hiddenContext,
        selfCompletedNeed: computed(() => true),
        currentCount: computed(() => 3),
      });
      await flushPromises();
      expect(wrapper.findComponent({ name: 'TeamNeedsDisplay' }).exists()).toBe(true);
      expect(wrapper.text()).not.toContain('3/3');
    }
  );
  it('names the mobile hidden-for-you control from the hint', async () => {
    belowMd.value = true;
    const wrapper = mountRow(taskNeed, hiddenContext);
    await flushPromises();
    expect(wrapper.find('[aria-label="hint: Alex (1/3)"]').exists()).toBe(true);
  });
  it('shows own count controls when the task is not hidden', async () => {
    belowMd.value = false;
    const wrapper = mountRow(taskNeed, { ...hiddenContext, hiddenForSelf: computed(() => false) });
    await flushPromises();
    expect(wrapper.text()).not.toContain('needed_items.hidden_for_you');
    expect(wrapper.findComponent({ name: 'ItemCountControls' }).exists()).toBe(true);
  });
});
