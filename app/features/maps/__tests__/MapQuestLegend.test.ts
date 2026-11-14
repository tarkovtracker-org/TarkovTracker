import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import MapQuestLegend from '@/features/maps/MapQuestLegend.vue';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
const entries = [
  { task: { id: 'task-a', name: 'Task A' }, color: '#e69f00' },
  { task: { id: 'task-b', name: 'Task B' }, color: '#0072b2' },
];
const mountLegend = (props: Record<string, unknown> = {}) =>
  mount(MapQuestLegend, {
    props: { entries, highlightedTaskId: null, lockedTaskId: null, ...props },
  });
const items = (wrapper: ReturnType<typeof mountLegend>) =>
  wrapper.findAll('[data-testid="map-quest-legend-item"]');
describe('MapQuestLegend', () => {
  it('renders nothing without entries', () => {
    expect(mountLegend({ entries: [] }).find('ul').exists()).toBe(false);
  });
  it('keeps the focused entry highlighted when the pointer leaves another one', async () => {
    const wrapper = mountLegend();
    await items(wrapper)[0]!.trigger('focus');
    await items(wrapper)[1]!.trigger('mouseenter');
    await items(wrapper)[1]!.trigger('mouseleave');
    await items(wrapper)[0]!.trigger('blur');
    expect(wrapper.emitted('highlight')).toEqual([['task-a'], ['task-b'], ['task-a'], [null]]);
  });
  it('keeps a border on the locked entry while another one is highlighted', () => {
    const wrapper = mountLegend({ highlightedTaskId: 'task-b', lockedTaskId: 'task-a' });
    const [locked, hovered] = items(wrapper);
    expect(locked!.attributes('aria-pressed')).toBe('true');
    expect(locked!.classes()).toContain('border-primary-400');
    expect(hovered!.classes()).toEqual(expect.arrayContaining(['bg-white/10', 'border-white/60']));
    // Forced-colors mode keeps the outline that outline-hidden only makes transparent.
    expect(locked!.classes()).toContain('focus:outline-hidden');
  });
  it('forgets an entry that leaves the legend, so its quest does not light up on return', async () => {
    const wrapper = mountLegend();
    await items(wrapper)[0]!.trigger('focus');
    await items(wrapper)[1]!.trigger('mouseenter');
    // Task B is hidden while hovered: no mouseleave fires, and focus on task A takes over.
    await wrapper.setProps({ entries: [entries[0]!] });
    expect(wrapper.emitted('highlight')!.at(-1)).toEqual(['task-a']);
    await wrapper.setProps({ entries });
    await items(wrapper)[0]!.trigger('blur');
    expect(wrapper.emitted('highlight')!.at(-1)).toEqual([null]);
  });
  it('releases its highlight when unmounted mid-hover, and stays quiet otherwise', async () => {
    // emitted() is not kept past unmount, so listen through the prop instead.
    const onHighlight = vi.fn();
    const hovered = mountLegend({ onHighlight });
    await items(hovered)[1]!.trigger('mouseenter');
    hovered.unmount();
    expect(onHighlight.mock.calls).toEqual([['task-b'], [null]]);
    const onIdleHighlight = vi.fn();
    mountLegend({ onHighlight: onIdleHighlight }).unmount();
    expect(onIdleHighlight).not.toHaveBeenCalled();
  });
});
