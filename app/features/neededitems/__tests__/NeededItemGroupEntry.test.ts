import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed } from 'vue';
import { createI18n } from 'vue-i18n';
import NeededItemGroupEntry from '@/features/neededitems/NeededItemGroupEntry.vue';
import en from '@/locales/en.json';
import { useTarkovStore } from '@/stores/useTarkov';
import type { GroupedNeededItem } from '@/types/tarkov';
import { createTestLocaleMessages } from '#tests/test-helpers/i18nMessages';
const craft = vi.hoisted(() => ({ go: vi.fn() }));
const completion = vi.hoisted(() => ({ done: false }));
vi.mock('@/features/neededitems/useNeedSelfCompletion', () => ({
  useNeedSelfCompletion: () => ({ isSelfCompleted: () => completion.done }),
}));
vi.mock('@/composables/useCraftableItem', () => ({
  useCraftableItem: () => ({
    isCraftable: computed(() => true),
    craftableTitle: computed(() => 'Craft'),
    craftableIconClass: computed(() => ''),
    goToCraftStation: craft.go,
  }),
}));
vi.mock('@/composables/useItemDistribution', () => ({
  useItemDistribution: () => ({
    sortTaskObjectives: (needs: unknown[]) => needs,
    sortHideoutModules: (needs: unknown[]) => needs,
  }),
}));
vi.mock('@/utils/formatters', () => ({ useLocaleNumberFormatter: () => String }));
const group: GroupedNeededItem = {
  item: { id: 'item', name: 'Bolts', backgroundColor: 'blue', iconLink: 'bolts.webp' },
  taskFir: 3,
  taskFirCurrent: 1,
  taskNonFir: 2,
  taskNonFirCurrent: 2,
  hideoutFir: 0,
  hideoutFirCurrent: 0,
  hideoutNonFir: 4,
  hideoutNonFirCurrent: 0,
  total: 9,
  currentCount: 3,
};
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: createTestLocaleMessages(en),
});
const needs = [
  { id: 'fir', taskId: 'fir', needType: 'taskObjective', count: 3, foundInRaid: true },
  { id: 'regular', taskId: 'regular', needType: 'taskObjective', count: 2 },
  { id: 'part', needType: 'hideoutModule', count: 4 },
] as InstanceType<typeof NeededItemGroupEntry>['$props']['needs'];
const mountEntry = (props: Partial<InstanceType<typeof NeededItemGroupEntry>['$props']> = {}) =>
  mount(NeededItemGroupEntry, {
    props: { group, needs, layout: 'row', ...props },
    global: {
      plugins: [i18n],
      stubs: {
        AppTooltip: { template: '<span><slot /></span>' },
        GameItem: { template: '<span data-testid="thumb" />' },
        UIcon: true,
      },
    },
  });
describe('NeededItemGroupEntry', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const store = useTarkovStore();
    store.setObjectiveCount('fir', 1);
    store.setObjectiveCount('regular', 2);
    completion.done = false;
    vi.clearAllMocks();
  });
  it.each(['row', 'tile'] as const)(
    'opens the details from its named button in the %s layout',
    async (layout) => {
      const wrapper = mountEntry({ layout });
      const open = wrapper
        .findAll('button')
        .find((button) => button.text() === 'See where it’s needed (3)');
      expect(open).toBeDefined();
      expect(open!.attributes('aria-label')).toBe('See where it’s needed (3) for Bolts');
      expect(wrapper.text()).toContain('6 remaining');
      await open!.trigger('click');
      expect(wrapper.emitted('open')).toEqual([['item']]);
    }
  );
  it('keeps the craft shortcut separate from opening the details', async () => {
    const wrapper = mountEntry();
    await wrapper.get('button[aria-label="Craft"]').trigger('click');
    expect(craft.go).toHaveBeenCalledOnce();
    expect(wrapper.emitted('open')).toBeUndefined();
  });
  it('splits FIR from non-FIR needs and omits empty sources', () => {
    const wrapper = mountEntry();
    const sections = wrapper.findAll('li .sr-only').map((section) => section.text());
    expect(sections).toEqual(['Tasks FIR 1/3', 'Tasks 2/2', 'Hideout 0/4']);
    expect(wrapper.get('[role="group"][aria-label="Track Bolts (FIR)"]').text()).toContain('1/3');
    expect(wrapper.get('[role="group"][aria-label="Track Bolts (Non-FIR)"]').text()).toContain(
      '2/6'
    );
  });
  it.each(['row', 'tile'] as const)(
    'edits multi-use counts inline in the %s layout without opening details',
    async (layout) => {
      const wrapper = mountEntry({ layout });
      const counter = wrapper.get('[role="group"][aria-label="Track Bolts (Non-FIR)"]');
      await counter.get('button[aria-label="Increase Track Bolts (Non-FIR)"]').trigger('click');
      expect(useTarkovStore().getHideoutPartCount('part')).toBe(1);
      expect(useTarkovStore().getObjectiveCount('regular')).toBe(2);
      expect(wrapper.emitted('open')).toBeUndefined();
      expect(wrapper.text()).toContain('5 remaining');
      await counter.get('button[aria-label="Track Bolts (Non-FIR)"]').trigger('click');
      const input = counter.get('input');
      await input.setValue(4);
      await input.trigger('keydown.enter');
      expect(useTarkovStore().getHideoutPartCount('part')).toBe(2);
      expect(wrapper.emitted('open')).toBeUndefined();
    }
  );
  it('keeps completed parents read-only', () => {
    completion.done = true;
    const wrapper = mountEntry();
    expect(wrapper.text()).toContain('0 remaining');
    expect(
      wrapper
        .findAll('[role="group"] button')
        .every((button) => button.attributes('disabled') !== undefined)
    ).toBe(true);
  });
  it('opens the details when the thumbnail is clicked', async () => {
    const wrapper = mountEntry();
    const thumb = wrapper.get('[data-testid="thumb"]').element.parentElement!;
    thumb.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(wrapper.emitted('open')).toEqual([['item']]);
  });
});
