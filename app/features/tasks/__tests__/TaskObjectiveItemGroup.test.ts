import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, ref } from 'vue';
import { isMapViewKey, trackTaskProgressInteractionKey } from '@/features/tasks/task-context';
import TaskObjectiveItemGroup from '@/features/tasks/TaskObjectiveItemGroup.vue';
import type { TaskObjective } from '@/types/tarkov';
let currentCount = 1;
const isObjectiveComplete = ref(false);
const metadataStoreMock = {
  objectives: [] as TaskObjective[],
};
const preferencesStoreMock = {
  getTaskSecondaryView: 'available',
};
const tarkovStoreMock = {
  getObjectiveCount: vi.fn((objectiveId: string) => (objectiveId === 'obj-1' ? currentCount : 0)),
  isTaskComplete: vi.fn(() => false),
  isTaskFailed: vi.fn(() => false),
  isTaskObjectiveComplete: vi.fn((objectiveId: string) =>
    objectiveId === 'obj-1' ? isObjectiveComplete.value : false
  ),
  setObjectiveCount: vi.fn(),
  setTaskObjectiveComplete: vi.fn(() => {
    isObjectiveComplete.value = true;
  }),
  setTaskObjectiveUncomplete: vi.fn(() => {
    isObjectiveComplete.value = false;
  }),
};
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    locale: ref('en'),
    t: (key: string, ...args: unknown[]) => {
      const lastArg = args[args.length - 1];
      return typeof lastArg === 'string' ? lastArg : key;
    },
  }),
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => metadataStoreMock,
}));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => preferencesStoreMock,
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => tarkovStoreMock,
}));
const ObjectiveCountControlsStub = defineComponent({
  props: ['currentCount', 'neededCount'],
  emits: ['decrease', 'increase', 'set-count', 'toggle'],
  template: `
    <div>
      <output>{{ currentCount }}/{{ neededCount }}</output>
      <button data-testid="decrease" @click="$emit('decrease')" />
      <button data-testid="increase" @click="$emit('increase')" />
      <button data-testid="toggle" @click="$emit('toggle')" />
      <button data-testid="set-count" @click="$emit('set-count', 2)" />
    </div>
  `,
});
const mountComponent = (trackTaskProgressInteraction = vi.fn()) => {
  return mount(TaskObjectiveItemGroup, {
    props: {
      iconName: 'mdi-package-variant-closed',
      objectives: metadataStoreMock.objectives,
      title: 'Hand over',
    },
    global: {
      provide: {
        [isMapViewKey as symbol]: ref(false),
        [trackTaskProgressInteractionKey as symbol]: trackTaskProgressInteraction,
      },
      stubs: {
        AppTooltip: { template: '<span><slot /><slot name="content" /></span>' },
        ObjectiveCountControls: ObjectiveCountControlsStub,
        ObjectiveRequiredItems: true,
        UIcon: true,
      },
    },
  });
};
describe('TaskObjectiveItemGroup', () => {
  beforeEach(() => {
    currentCount = 1;
    isObjectiveComplete.value = false;
    metadataStoreMock.objectives = [
      {
        count: 3,
        id: 'obj-1',
        item: { id: 'item-1', name: 'Item 1' },
        taskId: 'task-1',
        type: 'giveItem',
      } as TaskObjective,
    ];
    vi.clearAllMocks();
  });
  it('shows the full handover count while checked and restores partial progress on undo', async () => {
    const wrapper = mountComponent();
    const toggle = wrapper.get('[data-testid="toggle"]');
    expect(wrapper.get('output').text()).toBe('1/3');
    await toggle.trigger('click');
    expect(wrapper.get('output').text()).toBe('3/3');
    await toggle.trigger('click');
    expect(wrapper.get('output').text()).toBe('1/3');
    expect(tarkovStoreMock.setObjectiveCount).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('does not cue another turn-in when only the paired find objective is pending', () => {
    const handover = metadataStoreMock.objectives[0]!;
    metadataStoreMock.objectives.push({ ...handover, id: 'find-1', type: 'findItem' });
    isObjectiveComplete.value = true;
    const wrapper = mountComponent();
    expect(wrapper.get('output').text()).toBe('3/3');
    expect(wrapper.text()).not.toContain('Ready to hand over');
    wrapper.unmount();
  });
  it.each([
    ['decrease', 'setObjectiveCount'],
    ['increase', 'setObjectiveCount'],
    ['set-count', 'setObjectiveCount'],
    ['toggle', 'setTaskObjectiveComplete'],
  ] as const)(
    'tracks grouped objective progress on %s interactions',
    async (eventName, storeMethod) => {
      const trackTaskProgressInteraction = vi.fn();
      const wrapper = mountComponent(trackTaskProgressInteraction);
      await wrapper.get(`[data-testid="${eventName}"]`).trigger('click');
      expect(tarkovStoreMock[storeMethod]).toHaveBeenCalled();
      expect(trackTaskProgressInteraction).toHaveBeenCalledWith('task-1', 'objective_progress');
    }
  );
});
