import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const setup = async () => {
  vi.doMock('@/stores/useMetadata', () => ({
    useMetadataStore: () => ({
      objectives: [
        { id: 'obj-zone', taskId: 'task-zone', description: 'Survive in the area' },
        { id: 'obj-point', taskId: 'task-point', description: 'Mark the car' },
      ],
      tasks: [
        { id: 'task-zone', name: 'Area Task' },
        { id: 'task-point', name: 'Point Task' },
      ],
    }),
  }));
  vi.doMock('@/stores/usePreferences', () => ({
    usePreferencesStore: () => ({ getMapTooltipDensity: 'default' }),
  }));
  const { default: LeafletObjectiveStack } =
    await import('@/features/maps/LeafletObjectiveStack.vue');
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const wrapper = mount(LeafletObjectiveStack, {
    props: {
      objectiveIds: ['obj-point', 'obj-zone'],
      t: ((key: string) => key) as never,
      onSelect,
      onClose,
    },
    global: { stubs: { UIcon: true } },
  });
  return { wrapper, onSelect, onClose };
};
describe('LeafletObjectiveStack', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  it('lists every stacked objective with its task name', async () => {
    const { wrapper } = await setup();
    const entries = wrapper.findAll('li button');
    expect(entries).toHaveLength(2);
    expect(entries[0]!.text()).toContain('Point Task');
    expect(entries[0]!.text()).toContain('Mark the car');
    expect(entries[1]!.text()).toContain('Area Task');
  });
  it('selects the clicked objective', async () => {
    const { wrapper, onSelect } = await setup();
    await wrapper.findAll('li button')[1]!.trigger('click');
    expect(onSelect).toHaveBeenCalledWith('obj-zone');
  });
  it('uses fallback labels when objective metadata is unavailable', async () => {
    const { wrapper } = await setup();
    await wrapper.setProps({ objectiveIds: ['obj-missing'] });
    const entry = wrapper.find('li button');
    expect(entry.text()).toContain('common.task');
    expect(entry.text()).not.toContain('undefined');
  });
  it('closes from the close button and Escape', async () => {
    const { wrapper, onClose } = await setup();
    await wrapper.get('button[aria-label="common.close"]').trigger('click');
    await wrapper.trigger('keydown', { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it('focuses its first entry only after the popup content is attached', async () => {
    const { wrapper } = await setup();
    const firstEntry = wrapper.findAll('li button')[0]!.element as HTMLButtonElement;
    const focus = vi.spyOn(firstEntry, 'focus');
    const focusFirstEntry = (wrapper.vm as unknown as { focusFirstEntry: () => void })
      .focusFirstEntry;
    focusFirstEntry();
    expect(focus).not.toHaveBeenCalled();
    document.body.appendChild(wrapper.element);
    focusFirstEntry();
    expect(document.activeElement).toBe(firstEntry);
    wrapper.unmount();
  });
  it('keeps objective descriptions visible for duplicate task names in compact mode', async () => {
    vi.doMock('@/stores/useMetadata', () => ({
      useMetadataStore: () => ({
        objectives: [
          { id: 'obj-one', taskId: 'same-task', description: 'First objective' },
          { id: 'obj-two', taskId: 'same-task', description: 'Second objective' },
        ],
        tasks: [{ id: 'same-task', name: 'Shared task' }],
      }),
    }));
    vi.doMock('@/stores/usePreferences', () => ({
      usePreferencesStore: () => ({ getMapTooltipDensity: 'compact' }),
    }));
    const { default: LeafletObjectiveStack } =
      await import('@/features/maps/LeafletObjectiveStack.vue');
    const wrapper = mount(LeafletObjectiveStack, {
      props: {
        objectiveIds: ['obj-one', 'obj-two'],
        t: ((key: string) => key) as never,
      },
      global: { stubs: { UIcon: true } },
    });
    const entries = wrapper.findAll('li button');
    expect(entries).toHaveLength(2);
    expect(entries[0]!.text()).toContain('First objective');
    expect(entries[1]!.text()).toContain('Second objective');
  });
  it('hides compact descriptions when task names already distinguish entries', async () => {
    vi.doMock('@/stores/useMetadata', () => ({
      useMetadataStore: () => ({
        objectives: [
          { id: 'obj-one', taskId: 'task-one', description: 'First objective' },
          { id: 'obj-two', taskId: 'task-two', description: 'Second objective' },
        ],
        tasks: [
          { id: 'task-one', name: 'First task' },
          { id: 'task-two', name: 'Second task' },
        ],
      }),
    }));
    vi.doMock('@/stores/usePreferences', () => ({
      usePreferencesStore: () => ({ getMapTooltipDensity: 'compact' }),
    }));
    const { default: LeafletObjectiveStack } =
      await import('@/features/maps/LeafletObjectiveStack.vue');
    const wrapper = mount(LeafletObjectiveStack, {
      props: {
        objectiveIds: ['obj-one', 'obj-two'],
        t: ((key: string) => key) as never,
      },
      global: { stubs: { UIcon: true } },
    });
    const entries = wrapper.findAll('li button');
    expect(entries).toHaveLength(2);
    expect(entries[0]!.text()).toContain('First task');
    expect(entries[0]!.text()).not.toContain('First objective');
    expect(entries[1]!.text()).toContain('Second task');
    expect(entries[1]!.text()).not.toContain('Second objective');
    wrapper.unmount();
  });
});
