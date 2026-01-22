import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
const UButtonStub = {
  props: ['icon'],
  emits: ['click'],
  template: '<button :data-icon="icon" @click="$emit(\'click\')"><slot /></button>',
};
const UInputStub = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
};
const USelectMenuStub = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<select @change="$emit(\'update:modelValue\', $event.target.value)"></select>',
};
const setup = async () => {
  const preferencesStore = {
    getTaskPrimaryView: 'all',
    getTaskSecondaryView: 'available',
    getTaskUserView: 'self',
    getTaskMapView: 'all',
    getTaskTraderView: 'all',
    getTaskSortMode: 'none',
    getTaskSortDirection: 'asc',
    getHideGlobalTasks: false,
    getHideNonKappaTasks: false,
    getTaskSharedByAllOnly: false,
    setTaskPrimaryView: vi.fn(),
    setTaskSecondaryView: vi.fn(),
    setTaskUserView: vi.fn(),
    setTaskMapView: vi.fn(),
    setTaskTraderView: vi.fn(),
    setTaskSortMode: vi.fn(),
    setTaskSortDirection: vi.fn(),
  };
  vi.resetModules();
  vi.doMock('@/composables/useTaskFiltering', () => ({
    useTaskFiltering: () => ({
      calculateMapTaskTotals: () => ({ 'map-1': 2 }),
      calculateStatusCounts: () => ({
        all: 2,
        available: 1,
        locked: 0,
        completed: 1,
        failed: 0,
      }),
      calculateTraderCounts: () => ({ 'trader-1': 2 }),
    }),
  }));
  vi.doMock('@/stores/useMetadata', () => ({
    useMetadataStore: () => ({
      tasks: [{ id: 'task-1' }],
      mapsWithSvg: [{ id: 'map-1', name: 'Map One' }],
      sortedTraders: [{ id: 'trader-1', name: 'Trader One' }],
    }),
  }));
  vi.doMock('@/stores/usePreferences', () => ({
    usePreferencesStore: () => preferencesStore,
  }));
  vi.doMock('@/stores/useProgress', () => ({
    useProgressStore: () => ({
      getDisplayName: () => 'Self',
    }),
  }));
  vi.doMock('@/stores/useTeamStore', () => ({
    useTeamStore: () => ({
      teammates: [],
    }),
  }));
  vi.doMock('vue-i18n', () => ({
    useI18n: () => ({
      t: (key: string, fallback?: string) => fallback ?? key.split('.').pop() ?? key,
    }),
  }));
  const { default: TaskFilterBar } = await import('@/features/tasks/TaskFilterBar.vue');
  return { TaskFilterBar, preferencesStore };
};
const mountTaskFilterBar = (TaskFilterBar: Parameters<typeof mount>[0], searchQuery = '') => {
  return mount(TaskFilterBar, {
    props: { searchQuery },
    global: {
      stubs: {
        TaskSettingsModal: true,
        UBadge: true,
        UButton: UButtonStub,
        UIcon: true,
        UInput: UInputStub,
        USelectMenu: USelectMenuStub,
      },
    },
  });
};
describe('TaskFilterBar', () => {
  it('emits search updates and toggles primary view', async () => {
    const { TaskFilterBar, preferencesStore } = await setup();
    const wrapper = mountTaskFilterBar(TaskFilterBar);
    await wrapper.find('input').setValue('propane');
    expect(wrapper.emitted('update:searchQuery')).toEqual([['propane']]);
    const mapButton = wrapper.findAll('button').find((button) => button.text().includes('MAPS'));
    expect(mapButton).toBeTruthy();
    await mapButton!.trigger('click');
    expect(preferencesStore.setTaskPrimaryView).toHaveBeenCalledWith('maps');
    expect(preferencesStore.setTaskMapView).toHaveBeenCalledWith('map-1');
  });
  it('toggles sort direction', async () => {
    const { TaskFilterBar, preferencesStore } = await setup();
    const wrapper = mountTaskFilterBar(TaskFilterBar);
    await wrapper.find('button[data-icon="i-mdi-sort-ascending"]').trigger('click');
    expect(preferencesStore.setTaskSortDirection).toHaveBeenCalledWith('desc');
  });
});
