import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import {
  createDefaultNeededItemContext,
  neededItemKey,
  type NeededItemContext,
} from '@/features/neededitems/neededitem-keys';
import NeededItemEntry from '@/features/neededitems/NeededItemEntry.vue';
import type { NeededItemHideoutModule, NeededItemTaskObjective, TarkovItem } from '@/types/tarkov';
import { createTestLocaleMessages } from '#tests/test-helpers/i18nMessages';
const store = vi.hoisted(() => ({ objectiveComplete: false }));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    isTaskObjectiveComplete: () => store.objectiveComplete,
    playerLevel: () => 5,
  }),
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({ getDisplayName: (user: string) => `name-${user}` }),
}));
vi.mock('@/utils/formatters', () => ({ useLocaleNumberFormatter: () => String }));
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: createTestLocaleMessages({
    common: { lvl_level: 'Lvl {level}', item: 'Item', ready_to_hand_over: 'Ready to hand over' },
    needed_items: {
      for_teammates: 'For teammates',
      locked_before: '{count} before',
      hidden_for_you: 'Hidden for you',
      handed_over: 'Handed over',
      collect: 'Collect',
      collected: 'Collected',
      mark_collected: 'Mark as collected',
      aria: { increase_count: 'Add one', decrease_count: 'Remove one' },
    },
  }),
});
const taskNeed = {
  id: 'objective',
  taskId: 'task',
  needType: 'taskObjective',
  count: 3,
  foundInRaid: true,
} as NeededItemTaskObjective;
const hideoutNeed = {
  id: 'part',
  needType: 'hideoutModule',
  count: 3,
  hideoutModule: { id: 'module', stationId: 'station', level: 2 },
} as NeededItemHideoutModule;
const value = <T>(v: T) => computed(() => v);
function context(overrides: Partial<Record<keyof NeededItemContext, unknown>> = {}) {
  const base = createDefaultNeededItemContext();
  const values: Partial<Record<keyof NeededItemContext, unknown>> = {
    item: { id: 'bolts', name: 'Bolts' } as TarkovItem,
    imageItem: { iconLink: 'icon.webp', backgroundColor: 'blue' },
    relatedTask: { id: 'task', name: 'Gunsmith', trader: { imageLink: 'mechanic.webp' } },
    relatedStation: { id: 'station', name: 'Workbench', imageLink: 'workbench.webp' },
    currentCount: 1,
    neededCount: 3,
    ...overrides,
  };
  // Values become computeds like the real provider; functions (actions) pass through as-is.
  const wrap = (entry: unknown) => (typeof entry === 'function' ? entry : value(entry));
  return Object.fromEntries(
    Object.entries({ ...base }).map(([key, fallback]) =>
      key in values ? [key, wrap(values[key as keyof NeededItemContext])] : [key, fallback]
    )
  ) as NeededItemContext;
}
const mountEntry = (
  need: NeededItemTaskObjective | NeededItemHideoutModule,
  layout: 'row' | 'tile',
  overrides: Partial<Record<keyof NeededItemContext, unknown>> = {}
) =>
  mount(NeededItemEntry, {
    props: { need, layout },
    global: {
      plugins: [i18n],
      provide: { [neededItemKey as symbol]: context(overrides) },
      stubs: {
        AppTooltip: { template: '<span><slot /></span>' },
        AcceptedItemsPopover: true,
        GameItem: { template: '<span data-testid="thumb" />' },
        NuxtLink: { props: ['to'], template: '<a :data-to="JSON.stringify(to)"><slot /></a>' },
        UIcon: true,
      },
    },
  });
describe.each(['row', 'tile'] as const)('NeededItemEntry %s', (layout) => {
  afterEach(() => {
    store.objectiveComplete = false;
  });
  it('links the station once with its level', () => {
    const wrapper = mountEntry(hideoutNeed, layout);
    const links = wrapper.findAll('a');
    expect(links).toHaveLength(1);
    expect(links[0]!.text()).toBe('Workbench');
    expect(JSON.parse(links[0]!.attributes('data-to')!)).toEqual({
      path: '/hideout',
      query: { station: 'station', module: 'module' },
    });
    expect(wrapper.text().match(/Lvl 2/g)).toHaveLength(1);
  });
  it('steps a counted need and reports each action', async () => {
    const wrapper = mountEntry(taskNeed, layout);
    expect(wrapper.text()).toContain('Gunsmith');
    await wrapper.get('button[aria-label="Add one"]').trigger('click');
    await wrapper.get('button[aria-label="Remove one"]').trigger('click');
    expect(wrapper.emitted('increaseCount')).toHaveLength(1);
    expect(wrapper.emitted('decreaseCount')).toHaveLength(1);
  });
  it('collects a single item with one toggle', async () => {
    const wrapper = mountEntry({ ...taskNeed, count: 1 }, layout, {
      neededCount: 1,
      currentCount: 0,
    });
    const toggle = wrapper.get('button[aria-label="Mark as collected"]');
    expect(toggle.attributes('aria-pressed')).toBe('false');
    expect(toggle.text()).toBe(layout === 'tile' ? 'Collect' : '');
    await toggle.trigger('click');
    expect(wrapper.emitted('toggleCount')).toHaveLength(1);
    expect(wrapper.find('button[aria-label="Add one"]').exists()).toBe(false);
  });
  it('shows a finished need as read-only', () => {
    const wrapper = mountEntry(taskNeed, layout, { selfCompletedNeed: true, currentCount: 3 });
    expect(wrapper.text()).toContain('3/3');
    expect(wrapper.text()).toContain('Handed over');
    expect(wrapper.findAll('button')).toHaveLength(0);
  });
  it('lists a hidden task for teammates without own controls', () => {
    const wrapper = mountEntry({ ...taskNeed, hiddenForSelf: true }, layout, {
      hiddenForSelf: true,
      hiddenForSelfHint: 'Kept for name-friend (1/3)',
      teamNeeds: [{ user: 'friend', count: 1 }],
    });
    expect(wrapper.text()).toContain('For teammates');
    expect(wrapper.text()).toContain('Hidden for you');
    expect(wrapper.text()).toContain('name-friend');
    expect(wrapper.text()).toContain('Kept for name-friend (1/3)');
    expect(wrapper.find('button[aria-label="Add one"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-pressed]').exists()).toBe(false);
  });
  it('marks an objective handed over once the tracker records it', () => {
    store.objectiveComplete = true;
    const wrapper = mountEntry(taskNeed, layout, { currentCount: 3 });
    expect(wrapper.text()).toContain('Handed over');
  });
  it('cues the hand-in once a quest item is collected', () => {
    const wrapper = mountEntry(taskNeed, layout, { currentCount: 3 });
    expect(wrapper.text()).toContain('Ready to hand over');
    expect(mountEntry(hideoutNeed, layout, { currentCount: 3 }).text()).not.toContain(
      'Ready to hand over'
    );
  });
  it('explains level and quest locks only when they apply', () => {
    const locked = mountEntry(taskNeed, layout, { levelRequired: 15, lockedBefore: 2 });
    expect(locked.text()).toContain('Lvl 15');
    expect(locked.text()).toContain('2 before');
    const open = mountEntry(taskNeed, layout, { levelRequired: 5, lockedBefore: 0 });
    expect(open.text()).not.toContain('Lvl 5');
    expect(open.text()).not.toContain('before');
  });
  it('keeps the teammate note when an alternative quest already finished it', () => {
    const wrapper = mountEntry({ ...taskNeed, hiddenForSelf: true }, layout, {
      hiddenForSelf: true,
      selfCompletedNeed: true,
      currentCount: 3,
    });
    expect(wrapper.text()).toContain('For teammates');
    expect(wrapper.text()).not.toContain('3/3');
  });
  it('pauses item cycling while the accepted items list is open', async () => {
    const setCyclingPaused = vi.fn();
    const wrapper = mountEntry(taskNeed, layout, {
      hasAlternativeItems: true,
      acceptedItems: [{ id: 'a' }, { id: 'b' }],
      setCyclingPaused,
    });
    const popover = wrapper.findComponent({ name: 'AcceptedItemsPopover' });
    popover.vm.$emit('update:open', true);
    await nextTick();
    popover.vm.$emit('update:open', false);
    await nextTick();
    expect(setCyclingPaused.mock.calls).toEqual([[true], [false]]);
  });
});
