import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import {
  createDefaultNeededItemContext,
  neededItemKey,
  type NeededItemContext,
} from '@/features/neededitems/neededitem-keys';
import NeededItemSmallCard from '@/features/neededitems/NeededItemSmallCard.vue';
import type { NeededItemsCardStyle } from '@/features/neededitems/neededItemsFilterNormalization';
import type { NeededItemTaskObjective } from '@/types/tarkov';
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({ playerLevel: () => 10 }),
}));
vi.mock('@/features/tasks/TaskLink.vue', () => ({
  __esModule: true,
  default: { props: ['task'], template: '<a class="task-link">{{ task.name }}</a>' },
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ locale: ref('en'), t: (key: string) => key }),
}));
const taskNeed = {
  id: 'obj-1',
  needType: 'taskObjective',
  taskId: 'task-1',
  count: 3,
  hiddenForSelf: true,
} as unknown as NeededItemTaskObjective;
const hiddenContext: Partial<NeededItemContext> = {
  hiddenForSelf: computed(() => true),
  hiddenForSelfHint: computed(() => 'hint: Alex (1/3)'),
  item: computed(() => ({ id: 'item-1', name: 'Bolts' }) as never),
  neededCount: computed(() => 3),
  currentCount: computed(() => 2),
  relatedTask: computed(() => ({ id: 'task-1', name: 'Task One' }) as never),
  teamNeeds: computed(() => [{ user: 'team-1', count: 1 }]),
};
function mountCard(cardStyle: NeededItemsCardStyle, overrides: Partial<NeededItemContext> = {}) {
  return mount(NeededItemSmallCard, {
    props: { need: taskNeed, cardStyle },
    global: {
      mocks: { $t: (key: string) => key },
      provide: {
        [neededItemKey as symbol]: {
          ...createDefaultNeededItemContext(),
          ...hiddenContext,
          ...overrides,
        },
      },
      stubs: {
        AppTooltip: { props: ['text'], template: '<div :data-tooltip="text"><slot /></div>' },
        GameItem: true,
        ItemIndicators: true,
        AcceptedItemsPopover: true,
        RequirementInfo: true,
        TeamNeedsDisplay: true,
        ItemCountControls: true,
        UIcon: true,
      },
    },
  });
}
describe('NeededItemSmallCard hidden-for-you needs', () => {
  it.each<NeededItemsCardStyle>(['expanded', 'compact'])(
    'replaces own count and controls with the hint (%s)',
    async (cardStyle) => {
      const wrapper = mountCard(cardStyle);
      await flushPromises();
      expect(wrapper.text()).toContain('needed_items.hidden_for_you');
      expect(wrapper.text()).not.toContain('2/3');
      expect(wrapper.findComponent({ name: 'ItemCountControls' }).exists()).toBe(false);
    }
  );
  it.each<NeededItemsCardStyle>(['expanded', 'compact'])(
    'explains the hint and counts teammates (%s)',
    async (cardStyle) => {
      const wrapper = mountCard(cardStyle);
      await flushPromises();
      expect(wrapper.get('[data-tooltip]').attributes('data-tooltip')).toBe('hint: Alex (1/3)');
      expect(wrapper.get('.sr-only').text()).toBe('hint: Alex (1/3)');
      expect(wrapper.text()).toMatch(/hidden_for_you\s*1/);
    }
  );
  it("shows teammates' needs on the expanded card", async () => {
    const wrapper = mountCard('expanded');
    await flushPromises();
    expect(wrapper.findComponent({ name: 'TeamNeedsDisplay' }).exists()).toBe(true);
  });
  it('is not collectable by click', async () => {
    const wrapper = mountCard('expanded', { neededCount: computed(() => 1) });
    await flushPromises();
    await wrapper.find('[class*="rounded-lg"]').trigger('click');
    expect(wrapper.emitted('toggleCount')).toBeUndefined();
  });
  it('shows own count and controls when the task is not hidden', async () => {
    const wrapper = mountCard('expanded', { hiddenForSelf: computed(() => false) });
    await flushPromises();
    expect(wrapper.text()).toContain('2/3');
    expect(wrapper.find('[data-tooltip]').attributes('data-tooltip')).toBe('');
    expect(wrapper.findComponent({ name: 'ItemCountControls' }).exists()).toBe(true);
  });
});
