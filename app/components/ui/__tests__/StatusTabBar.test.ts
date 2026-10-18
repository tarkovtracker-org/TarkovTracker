import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import StatusTabBar from '@/components/ui/StatusTabBar.vue';
import type { StatusTabItem } from '@/utils/statusTones';
type View = 'all' | 'available' | 'locked' | 'completed';
const UButtonStub = {
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
};
const TABS: StatusTabItem<View>[] = [
  { value: 'available', label: 'Available', icon: 'i-a', count: 3, tone: 'info' },
  { value: 'locked', label: 'Locked', icon: 'i-l', count: 2, tone: 'locked' },
  { value: 'completed', label: 'Completed', icon: 'i-c', count: 0, tone: 'success' },
  {
    value: 'all',
    label: 'All',
    icon: 'i-all',
    count: 5,
    tone: 'neutral',
    helpTarget: 'tour-all',
  },
];
interface BarProps {
  tabs?: StatusTabItem<View>[];
  modelValue?: View;
  inertWhenSelected?: boolean;
  tabsHelpTarget?: string;
}
const mountBar = (props: BarProps = {}) =>
  mount(StatusTabBar, {
    props: { tabs: TABS, modelValue: 'all', groupLabel: 'Task status', ...props },
    attrs: { 'data-testid': 'bar' },
    slots: { actions: '<button data-testid="settings">Settings</button>' },
    global: { stubs: { UButton: UButtonStub, UIcon: true } },
  });
const tabButton = (wrapper: ReturnType<typeof mountBar>, label: string) =>
  wrapper
    .get('[role="group"]')
    .findAll('button')
    .find((button) => button.get('.sr-only').text() === label)!;
describe('StatusTabBar', () => {
  it('leads with All, sets it apart with a divider, and keeps actions on the same bar', () => {
    const wrapper = mountBar();
    const group = wrapper.get('[role="group"]');
    expect(group.attributes('aria-label')).toBe('Task status');
    expect(group.findAll('button').map((button) => button.get('.sr-only').text())).toEqual([
      'All',
      'Available',
      'Locked',
      'Completed',
    ]);
    const divider = group.get('[data-testid="status-tab-divider"]');
    expect(divider.element.previousElementSibling).toBe(tabButton(wrapper, 'All').element);
    expect(wrapper.attributes('data-testid')).toBe('bar');
    expect(wrapper.find('[data-testid="settings"]').exists()).toBe(true);
  });
  it.each([
    ['there is no All tab', TABS.filter((tab) => tab.value !== 'all')],
    ['All is the only tab', TABS.filter((tab) => tab.value === 'all')],
  ])('drops the divider when %s', (_, tabs) => {
    const wrapper = mountBar({ tabs, modelValue: tabs[0]!.value });
    expect(wrapper.find('[data-testid="status-tab-divider"]').exists()).toBe(false);
  });
  it('colors each badge by status, with Locked distinct from the grey All', () => {
    const wrapper = mountBar();
    const badge = (label: string) => tabButton(wrapper, label).get('.rounded-full');
    expect(badge('All').classes()).toContain('bg-surface-500');
    expect(badge('Available').classes()).toContain('bg-info-600');
    expect(badge('Locked').classes()).toContain('bg-locked-600');
    expect(
      badge('Locked')
        .classes()
        .some((name) => name.startsWith('bg-surface-'))
    ).toBe(false);
    // An empty status dims its badge whatever its color.
    expect(badge('Completed').classes()).toContain('bg-surface-600');
    expect(badge('Completed').classes()).not.toContain('bg-success-700');
  });
  it('outlines idle tabs as buttons and gives the selected tab its status color', () => {
    const wrapper = mountBar({ modelValue: 'locked' });
    expect(tabButton(wrapper, 'Locked').classes()).toContain('border-locked-500/45');
    expect(tabButton(wrapper, 'All').classes()).toContain('border-white/10');
    // White outlines vanish on the light theme, so idle tabs swap to its border token.
    expect(tabButton(wrapper, 'All').classes()).toContain('light:border-surface-600');
    expect(tabButton(wrapper, 'All').classes()).not.toContain('border-white/15');
  });
  it('keeps the selected tab focusable and pressed while ignoring clicks by default', async () => {
    const wrapper = mountBar();
    const all = tabButton(wrapper, 'All');
    expect(all.attributes('aria-pressed')).toBe('true');
    expect(all.classes()).toContain('cursor-default!');
    expect(tabButton(wrapper, 'Locked').classes()).not.toContain('cursor-default!');
    expect(all.attributes('disabled')).toBeUndefined();
    document.body.appendChild(wrapper.element);
    (all.element as HTMLButtonElement).focus();
    expect(document.activeElement).toBe(all.element);
    expect((all.element as HTMLButtonElement).tabIndex).toBe(0);
    await all.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(tabButton(wrapper, 'Locked').attributes('aria-pressed')).toBe('false');
    await tabButton(wrapper, 'Locked').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['locked']]);
    wrapper.unmount();
  });
  it('keeps the selected tab clickable when the page re-picks it', async () => {
    const wrapper = mountBar({ inertWhenSelected: false, tabsHelpTarget: 'tour-tabs' });
    const all = tabButton(wrapper, 'All');
    expect(all.classes()).not.toContain('cursor-default!');
    expect(all.attributes('disabled')).toBeUndefined();
    await all.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['all']]);
    expect(all.attributes('data-help-target')).toBe('tour-all');
    expect(wrapper.get('[role="group"]').attributes('data-help-target')).toBe('tour-tabs');
  });
  it('hides tab labels visually on phones but keeps them for screen readers', () => {
    const label = tabButton(mountBar(), 'Locked').get('.sr-only');
    expect(label.classes()).toContain('sm:not-sr-only');
  });
});
