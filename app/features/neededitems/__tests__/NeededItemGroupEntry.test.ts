import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed } from 'vue';
import { createI18n } from 'vue-i18n';
import NeededItemGroupEntry from '@/features/neededitems/NeededItemGroupEntry.vue';
import type { GroupedNeededItem, NeededItemTaskObjective } from '@/types/tarkov';
import { createTestLocaleMessages } from '#tests/test-helpers/i18nMessages';
const progress = vi.hoisted(() => ({
  count: 0,
  increase: vi.fn(),
  decrease: vi.fn(),
  toggle: vi.fn(),
  setCount: vi.fn(),
}));
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
vi.mock('@/features/neededitems/useNeededItemProgress', () => ({
  neededCountOf: (need: { count?: number }) => need.count || 1,
  useNeededItemProgress: () => ({
    storedCountOf: () => progress.count,
    increase: progress.increase,
    decrease: progress.decrease,
    toggle: progress.toggle,
    setCount: progress.setCount,
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
  messages: createTestLocaleMessages({
    common: { tasks: 'Tasks', hideout: 'Hideout', fir: 'FIR' },
    needed_items: {
      view_requirements_for: '{requirements} for {name}',
      remaining_count: '{count} remaining',
      view_requirements: 'View {count} requirement | View {count} requirements',
      aria: { increase_count: 'Add one' },
    },
  }),
});
const need = { id: 'objective', needType: 'taskObjective', count: 4 } as NeededItemTaskObjective;
const mountEntry = (props: Partial<InstanceType<typeof NeededItemGroupEntry>['$props']> = {}) =>
  mount(NeededItemGroupEntry, {
    props: { group, needs: [need, { ...need, id: 'other' }], layout: 'row', ...props },
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
    progress.count = 0;
    completion.done = false;
    vi.clearAllMocks();
  });
  it.each(['row', 'tile'] as const)(
    'opens the details from its named button in the %s layout',
    async (layout) => {
      const wrapper = mountEntry({ layout });
      const open = wrapper
        .findAll('button')
        .find((button) => button.text() === 'View 2 requirements');
      expect(open).toBeDefined();
      expect(open!.attributes('aria-label')).toBe('View 2 requirements for Bolts');
      expect(wrapper.text()).toContain('6 remaining');
      await open!.trigger('click');
      expect(wrapper.emitted('open')).toEqual([['item']]);
    }
  );
  it.each(['row', 'tile'] as const)(
    'updates the remaining quantity without showing negative amounts in the %s layout',
    async (layout) => {
      const wrapper = mountEntry({ layout });
      await wrapper.setProps({ group: { ...group, currentCount: 8 } });
      expect(wrapper.text()).toContain('1 remaining');
      await wrapper.setProps({ group: { ...group, currentCount: 12 } });
      expect(wrapper.text()).toContain('0 remaining');
      expect(wrapper.text()).not.toContain('-3 remaining');
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
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('3');
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuemax')).toBe('9');
  });
  it('tracks an item with a single need in place instead of a total', async () => {
    progress.count = 1;
    const wrapper = mountEntry({ needs: [need] });
    expect(wrapper.get('button[aria-label="View 1 requirement for Bolts"]').text()).toBe(
      'View 1 requirement'
    );
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('1/4');
    await wrapper.get('button[aria-label="Add one"]').trigger('click');
    expect(progress.increase).toHaveBeenCalledWith(need);
    expect(wrapper.emitted('open')).toBeUndefined();
  });
  it('shows a finished single need read-only, as Needs mode does', () => {
    completion.done = true;
    const wrapper = mountEntry({ needs: [need] });
    expect(wrapper.text()).toContain('4/4');
    expect(wrapper.find('button[aria-label="Add one"]').exists()).toBe(false);
  });
  it('opens the details when the thumbnail is clicked', async () => {
    const wrapper = mountEntry();
    const thumb = wrapper.get('[data-testid="thumb"]').element.parentElement!;
    thumb.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(wrapper.emitted('open')).toEqual([['item']]);
  });
});
