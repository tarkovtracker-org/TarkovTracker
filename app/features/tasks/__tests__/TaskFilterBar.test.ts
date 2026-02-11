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
type SetupOptions = {
  preferencesStore?: Partial<{
    getTaskPrimaryView: string;
    getTaskSecondaryView: string;
    getTaskUserView: string;
    getTaskMapView: string;
    getTaskTraderView: string;
    getHideCompletedMapObjectives: boolean;
    taskTeamAllHidden: boolean;
  }>;
  sortedTraders?: Array<{ id: string; name: string }>;
  traderCounts?: Record<string, number>;
  mapTaskTotals?: Record<string, number>;
  mapTaskTotalsHideCompleted?: Record<string, number>;
  teammates?: string[];
  teamMembers?: string[];
  hiddenTeammates?: Record<string, boolean>;
  displayNames?: Record<string, string>;
  hasSystemInitiallyLoaded?: boolean;
  hasTeam?: boolean;
};
const setup = async (options: SetupOptions = {}) => {
  const hiddenTeammates = { ...(options.hiddenTeammates ?? {}) };
  const preferencesStore = {
    getTaskPrimaryView: 'all',
    getTaskSecondaryView: 'available',
    getTaskUserView: 'self',
    getTaskMapView: 'all',
    getTaskTraderView: 'all',
    getTaskSortMode: 'none',
    getTaskSortDirection: 'asc',
    getShowAllFilter: true,
    getShowAvailableFilter: true,
    getShowLockedFilter: true,
    getShowCompletedFilter: true,
    getShowFailedFilter: true,
    getHideGlobalTasks: false,
    getHideCompletedMapObjectives: false,
    getHideNonKappaTasks: false,
    getTaskSharedByAllOnly: false,
    taskTeamAllHidden: false,
    teamHide: hiddenTeammates,
    teamIsHidden: vi.fn(
      (teamId: string) =>
        teamId !== 'self' &&
        (preferencesStore.taskTeamAllHidden || preferencesStore.teamHide?.[teamId] === true)
    ),
    setTaskPrimaryView: vi.fn(),
    setTaskSecondaryView: vi.fn(),
    setTaskUserView: vi.fn(),
    setTaskMapView: vi.fn(),
    setTaskTraderView: vi.fn(),
    setTaskSortMode: vi.fn(),
    setTaskSortDirection: vi.fn(),
    toggleHidden: vi.fn((teamId: string) => {
      preferencesStore.teamHide[teamId] = !preferencesStore.teamHide[teamId];
    }),
  };
  Object.assign(preferencesStore, options.preferencesStore ?? {});
  const sortedTraders = options.sortedTraders ?? [{ id: 'trader-1', name: 'Trader One' }];
  const traderCounts = options.traderCounts ?? { 'trader-1': 2 };
  const mapTaskTotals = options.mapTaskTotals ?? { 'map-1': 2 };
  const mapTaskTotalsHideCompleted = options.mapTaskTotalsHideCompleted ?? { 'map-1': 1 };
  const displayNames: Record<string, string> = {
    self: 'Self',
    ...(options.displayNames ?? {}),
  };
  const teammates = options.teammates ?? [];
  const teamMembers = options.teamMembers ?? ['self', ...teammates];
  vi.resetModules();
  vi.doMock('@/composables/useTaskFiltering', () => ({
    useTaskFiltering: () => ({
      calculateMapTaskTotals: (
        _mergedMaps: unknown,
        _tasks: unknown,
        _hideGlobalTasks: boolean,
        _activeUserView: string,
        _secondaryView: string,
        hideCompletedMapObjectives = false
      ) => (hideCompletedMapObjectives ? mapTaskTotalsHideCompleted : mapTaskTotals),
      calculateStatusCounts: () => ({
        all: 2,
        available: 1,
        locked: 0,
        completed: 1,
        failed: 0,
      }),
      calculateTraderCounts: () => traderCounts,
    }),
  }));
  vi.doMock('@/stores/useMetadata', () => ({
    useMetadataStore: () => ({
      tasks: [{ id: 'task-1' }],
      mapsWithSvg: [{ id: 'map-1', name: 'Map One' }],
      sortedTraders,
    }),
  }));
  vi.doMock('@/stores/usePreferences', () => ({
    usePreferencesStore: () => preferencesStore,
  }));
  vi.doMock('@/stores/useProgress', () => ({
    useProgressStore: () => ({
      getDisplayName: (teamId: string) => displayNames[teamId] ?? teamId,
    }),
  }));
  vi.doMock('@/stores/useTeamStore', () => ({
    useTeamStore: () => ({
      teammates,
      teamMembers,
    }),
  }));
  vi.doMock('@/stores/useSystemStore', () => ({
    useSystemStoreWithSupabase: () => ({
      hasInitiallyLoaded: { value: options.hasSystemInitiallyLoaded ?? true },
      hasTeam: () => options.hasTeam ?? false,
    }),
  }));
  vi.doMock('vue-i18n', () => ({
    useI18n: () => ({
      t: (key: string, fallback?: string) => fallback ?? key.split('.').pop() ?? key,
    }),
  }));
  vi.doMock('@/composables/useTaskSettingsDrawer', () => ({
    useTaskSettingsDrawer: () => ({
      isOpen: { value: false },
      open: vi.fn(),
      close: vi.fn(),
      toggle: vi.fn(),
    }),
  }));
  const { default: TaskFilterBar } = await import('@/features/tasks/TaskFilterBar.vue');
  return { TaskFilterBar, preferencesStore };
};
const mountTaskFilterBar = (
  TaskFilterBar: Parameters<typeof mount>[0],
  searchQuery = '',
  extraProps: Record<string, unknown> = {}
) => {
  return mount(TaskFilterBar, {
    props: { searchQuery, ...extraProps },
    global: {
      stubs: {
        AppTooltip: { template: '<span><slot /></span>' },
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
  it('hides completed map objectives from map counts when the preference is enabled', async () => {
    const { TaskFilterBar } = await setup({
      preferencesStore: {
        getTaskPrimaryView: 'maps',
        getHideCompletedMapObjectives: true,
      },
      mapTaskTotals: {
        'map-1': 4,
      },
      mapTaskTotalsHideCompleted: {
        'map-1': 1,
      },
    });
    const wrapper = mountTaskFilterBar(TaskFilterBar);
    const mapButton = wrapper.findAll('button').find((button) => button.text().includes('Map One'));
    expect(mapButton).toBeTruthy();
    expect(mapButton!.text()).toContain('1');
    expect(mapButton!.text()).not.toContain('4');
  });
  it('shows only traders with non-zero task counts for the active filter', async () => {
    const { TaskFilterBar } = await setup({
      preferencesStore: {
        getTaskPrimaryView: 'traders',
      },
      sortedTraders: [
        { id: 'trader-1', name: 'Trader One' },
        { id: 'trader-2', name: 'Trader Two' },
      ],
      traderCounts: {
        'trader-1': 2,
        'trader-2': 0,
      },
    });
    const wrapper = mountTaskFilterBar(TaskFilterBar);
    const buttonTexts = wrapper.findAll('button').map((button) => button.text());
    expect(buttonTexts.some((text) => text.includes('Trader One'))).toBe(true);
    expect(buttonTexts.some((text) => text.includes('Trader Two'))).toBe(false);
  });
  it('keeps traders visible when the current filter has tasks for them', async () => {
    const { TaskFilterBar } = await setup({
      preferencesStore: {
        getTaskPrimaryView: 'traders',
        getTaskSecondaryView: 'all',
      },
      sortedTraders: [
        { id: 'trader-1', name: 'Trader One' },
        { id: 'trader-2', name: 'Trader Two' },
      ],
      traderCounts: {
        'trader-1': 2,
        'trader-2': 1,
      },
    });
    const wrapper = mountTaskFilterBar(TaskFilterBar);
    const buttonTexts = wrapper.findAll('button').map((button) => button.text());
    expect(buttonTexts.some((text) => text.includes('Trader One'))).toBe(true);
    expect(buttonTexts.some((text) => text.includes('Trader Two'))).toBe(true);
  });
  it('auto-selects first visible trader when current selection has no tasks', async () => {
    const { TaskFilterBar, preferencesStore } = await setup({
      preferencesStore: {
        getTaskPrimaryView: 'traders',
        getTaskTraderView: 'trader-2',
      },
      sortedTraders: [
        { id: 'trader-1', name: 'Trader One' },
        { id: 'trader-2', name: 'Trader Two' },
      ],
      traderCounts: {
        'trader-1': 3,
        'trader-2': 0,
      },
    });
    mountTaskFilterBar(TaskFilterBar);
    expect(preferencesStore.setTaskTraderView).toHaveBeenCalledWith('trader-1');
  });
  it('shows active secondary tab count from search results while search is active', async () => {
    const { TaskFilterBar } = await setup();
    const wrapper = mountTaskFilterBar(TaskFilterBar, 'easy', {
      activeSearchCount: 0,
      isSearchActive: true,
    });
    const availableButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('AVAILABLE'));
    expect(availableButton).toBeTruthy();
    expect(availableButton!.text()).toContain('0');
    expect(availableButton!.text()).not.toContain('1');
  });
  it('keeps persisted teammate view while roster is still loading', async () => {
    const { TaskFilterBar, preferencesStore } = await setup({
      preferencesStore: {
        getTaskUserView: 'teammate-1',
      },
      teammates: [],
      teamMembers: [],
      hasSystemInitiallyLoaded: true,
      hasTeam: true,
    });
    mountTaskFilterBar(TaskFilterBar);
    expect(preferencesStore.setTaskUserView).not.toHaveBeenCalledWith('all');
  });
  it('falls back to self view when persisted teammate is missing and no teammates remain', async () => {
    const { TaskFilterBar, preferencesStore } = await setup({
      preferencesStore: {
        getTaskUserView: 'teammate-1',
      },
      teammates: [],
      teamMembers: ['self'],
      hasSystemInitiallyLoaded: true,
      hasTeam: true,
    });
    mountTaskFilterBar(TaskFilterBar);
    expect(preferencesStore.setTaskUserView).toHaveBeenCalledWith('self');
  });
  it('toggles teammate visibility from the task filter bar', async () => {
    const { TaskFilterBar, preferencesStore } = await setup({
      teammates: ['teammate-1'],
      displayNames: { 'teammate-1': 'Alpha' },
      preferencesStore: {
        getTaskUserView: 'all',
      },
    });
    const wrapper = mountTaskFilterBar(TaskFilterBar);
    await wrapper.find('button[data-icon="i-mdi-eye"]').trigger('click');
    expect(preferencesStore.toggleHidden).toHaveBeenCalledWith('teammate-1');
  });
  it('does not toggle teammate visibility from the task filter bar under hide-all', async () => {
    const { TaskFilterBar, preferencesStore } = await setup({
      teammates: ['teammate-1'],
      displayNames: { 'teammate-1': 'Alpha' },
      preferencesStore: {
        getTaskUserView: 'all',
        taskTeamAllHidden: true,
      },
    });
    const wrapper = mountTaskFilterBar(TaskFilterBar);
    await wrapper.find('button[data-icon="i-mdi-eye-off"]').trigger('click');
    expect(preferencesStore.toggleHidden).not.toHaveBeenCalled();
  });
  it('falls back to all view when hiding the selected teammate', async () => {
    const { TaskFilterBar, preferencesStore } = await setup({
      teammates: ['teammate-1'],
      displayNames: { 'teammate-1': 'Alpha' },
      preferencesStore: {
        getTaskUserView: 'teammate-1',
      },
    });
    const wrapper = mountTaskFilterBar(TaskFilterBar);
    await wrapper.find('button[data-icon="i-mdi-eye"]').trigger('click');
    expect(preferencesStore.setTaskUserView).toHaveBeenCalledWith('all');
  });
  it('unhides teammate when selecting them from user view buttons', async () => {
    const { TaskFilterBar, preferencesStore } = await setup({
      teammates: ['teammate-1'],
      hiddenTeammates: { 'teammate-1': true },
      displayNames: { 'teammate-1': 'Alpha' },
      preferencesStore: {
        getTaskUserView: 'all',
      },
    });
    const wrapper = mountTaskFilterBar(TaskFilterBar);
    const teammateButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('ALPHA'));
    expect(teammateButton).toBeTruthy();
    await teammateButton!.trigger('click');
    expect(preferencesStore.toggleHidden).toHaveBeenCalledWith('teammate-1');
    expect(preferencesStore.setTaskUserView).toHaveBeenCalledWith('teammate-1');
  });
  it('does not toggle individual hide when selecting teammate under hide-all', async () => {
    const { TaskFilterBar, preferencesStore } = await setup({
      teammates: ['teammate-1'],
      preferencesStore: {
        getTaskUserView: 'all',
        taskTeamAllHidden: true,
      },
    });
    const wrapper = mountTaskFilterBar(TaskFilterBar);
    const teammateButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('TEAMMATE-1'));
    expect(teammateButton).toBeTruthy();
    await teammateButton!.trigger('click');
    expect(preferencesStore.toggleHidden).not.toHaveBeenCalled();
    expect(preferencesStore.setTaskUserView).toHaveBeenCalledWith('teammate-1');
  });
});
