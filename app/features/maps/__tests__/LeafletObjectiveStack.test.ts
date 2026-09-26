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
  it('closes from the close button and Escape', async () => {
    const { wrapper, onClose } = await setup();
    await wrapper.get('button[aria-label="common.close"]').trigger('click');
    await wrapper.trigger('keydown', { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
