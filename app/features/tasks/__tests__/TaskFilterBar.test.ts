import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
const UButtonStub = {
  inheritAttrs: false,
  props: ['icon'],
  emits: ['click'],
  template: '<button v-bind="$attrs" :data-icon="icon" @click="$emit(\'click\')"><slot /></button>',
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
    getShowAllFilter: boolean;
    getShowAvailableFilter: boolean;
    getShowLockedFilter: boolean;
    getShowCompletedFilter: boolean;
    getShowFailedFilter: boolean;
    getHideCompletedMapObjectives: boolean;
  }>;
  sortedTraders?: Array<{ id: string; name: string; imageLink?: string }>;
  traderCounts?: Record<string, number>;
  mapTaskTotals?: Record<string, number>;
  mapTaskTotalsHideCompleted?: Record<string, number>;
  statusCounts?: Partial<Record<'all' | 'available' | 'locked' | 'completed' | 'failed', number>>;
  drawerOpen?: boolean;
};
const setup = async (options: SetupOptions = {}) => {
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
    setTaskPrimaryView: vi.fn(),
    setTaskSecondaryView: vi.fn(),
    setTaskMapView: vi.fn(),
    setTaskTraderView: vi.fn(),
    setTaskSortMode: vi.fn(),
    setTaskSortDirection: vi.fn(),
  };
  Object.assign(preferencesStore, options.preferencesStore ?? {});
  const sortedTraders = (options.sortedTraders ?? [{ id: 'trader-1', name: 'Trader One' }]).map(
    (trader) => ({ imageLink: `/img/${trader.id}.webp`, ...trader })
  );
  const traderCounts = options.traderCounts ?? { 'trader-1': 2 };
  const mapTaskTotals = options.mapTaskTotals ?? { 'map-1': 2 };
  const mapTaskTotalsHideCompleted = options.mapTaskTotalsHideCompleted ?? { 'map-1': 1 };
  const statusCounts = {
    all: 2,
    available: 1,
    locked: 0,
    completed: 1,
    failed: 0,
    ...(options.statusCounts ?? {}),
  };
  const calculateTraderCounts = vi.fn(() => traderCounts);
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
      calculateStatusCounts: () => statusCounts,
      calculateTraderCounts,
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
  vi.doMock('vue-i18n', async () => ({
    ...(await vi.importActual<typeof import('vue-i18n')>('vue-i18n')),
    useI18n: () => ({
      t: (key: string, fallback?: string) => fallback ?? key.split('.').pop() ?? key,
    }),
  }));
  const isDrawerOpenRef = ref(options.drawerOpen ?? false);
  vi.doMock('@/composables/usePageSettingsDrawer', () => ({
    usePageSettingsDrawer: () => ({
      isOpen: isDrawerOpenRef,
      // All three mutators update the shared ref, mirroring the real composable so a
      // future test wired to open()/close() sees consistent state.
      open: vi.fn(() => {
        isDrawerOpenRef.value = true;
      }),
      close: vi.fn(() => {
        isDrawerOpenRef.value = false;
      }),
      toggle: vi.fn(() => {
        isDrawerOpenRef.value = !isDrawerOpenRef.value;
      }),
    }),
  }));
  const { default: TaskFilterBar } = await import('@/features/tasks/TaskFilterBar.vue');
  return { TaskFilterBar, calculateTraderCounts, preferencesStore };
};
const mountTaskFilterBar = (
  TaskFilterBar: Parameters<typeof mount>[0],
  isSearchActive = false,
  extraProps: Record<string, unknown> = {}
) => {
  return mount(TaskFilterBar, {
    props: { isSearchActive, ...extraProps },
    global: {
      stubs: {
        AppTooltip: { template: '<span><slot /></span>' },
        TaskTeamFilter: true,
        UBadge: true,
        UButton: UButtonStub,
        UIcon: true,
        USelectMenu: USelectMenuStub,
      },
    },
  });
};
type FilterBarWrapper = ReturnType<typeof mountTaskFilterBar>;
const findTraderButton = (wrapper: FilterBarWrapper, name: string) =>
  wrapper.findAll('button').find((button) => button.find(`img[alt="${name}"]`).exists());
const traderButtonNames = (wrapper: FilterBarWrapper) =>
  wrapper.findAll('button img').map((image) => image.attributes('alt'));
describe('TaskFilterBar', () => {
  it('lands the maps route on the first map when none is picked', async () => {
    const { TaskFilterBar, preferencesStore } = await setup({
      preferencesStore: { getTaskPrimaryView: 'maps' },
    });
    mountTaskFilterBar(TaskFilterBar);
    expect(preferencesStore.setTaskMapView).toHaveBeenCalledWith('map-1');
  });
  it('shows no trader strip on the list or maps routes', async () => {
    for (const view of ['all', 'maps']) {
      const { TaskFilterBar } = await setup({ preferencesStore: { getTaskPrimaryView: view } });
      const wrapper = mountTaskFilterBar(TaskFilterBar);
      expect(traderButtonNames(wrapper)).toEqual([]);
    }
  });
  it('lays out every trader with tasks left and its count on the traders route', async () => {
    const { TaskFilterBar } = await setup({
      preferencesStore: { getTaskPrimaryView: 'traders', getTaskTraderView: 'trader-1' },
      sortedTraders: [
        { id: 'trader-1', name: 'Trader One' },
        { id: 'trader-2', name: 'Trader Two' },
        { id: 'trader-3', name: 'Trader Three' },
      ],
      traderCounts: { 'trader-1': 2, 'trader-2': 0, 'trader-3': 5 },
    });
    const wrapper = mountTaskFilterBar(TaskFilterBar);
    expect(traderButtonNames(wrapper)).toEqual(['Trader One', 'Trader Three']);
    const selected = findTraderButton(wrapper, 'Trader One')!;
    expect(selected.attributes('aria-pressed')).toBe('true');
    expect(selected.text()).toContain('2');
    expect(findTraderButton(wrapper, 'Trader Three')!.text()).toContain('5');
  });
  it('switches the shown trader from the strip', async () => {
    const { TaskFilterBar, preferencesStore } = await setup({
      preferencesStore: { getTaskPrimaryView: 'traders', getTaskTraderView: 'trader-1' },
      sortedTraders: [
        { id: 'trader-1', name: 'Trader One' },
        { id: 'trader-2', name: 'Trader Two' },
      ],
      traderCounts: { 'trader-1': 2, 'trader-2': 1 },
    });
    const wrapper = mountTaskFilterBar(TaskFilterBar);
    await findTraderButton(wrapper, 'Trader Two')!.trigger('click');
    expect(preferencesStore.setTaskTraderView).toHaveBeenCalledWith('trader-2');
    expect(preferencesStore.setTaskPrimaryView).not.toHaveBeenCalled();
  });
  it.each(['traders', 'graph'])(
    'moves the %s view to the first trader when the current one has no tasks',
    async (view) => {
      const { TaskFilterBar, preferencesStore } = await setup({
        preferencesStore: { getTaskPrimaryView: view, getTaskTraderView: 'trader-2' },
        sortedTraders: [
          { id: 'trader-1', name: 'Trader One' },
          { id: 'trader-2', name: 'Trader Two' },
        ],
        traderCounts: { 'trader-1': 3, 'trader-2': 0 },
      });
      const wrapper = mountTaskFilterBar(TaskFilterBar);
      expect(preferencesStore.setTaskTraderView).toHaveBeenCalledWith('trader-1');
      expect(traderButtonNames(wrapper)).toEqual(['Trader One']);
    }
  );
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
  it('shows per-status search counts and highlights the effective status while searching', async () => {
    const { TaskFilterBar } = await setup();
    const wrapper = mountTaskFilterBar(TaskFilterBar, true, {
      activeStatusView: 'all',
      searchStatusCounts: { all: 1, available: 0, completed: 0, failed: 0, locked: 1 },
    });
    const findStatusButton = (label: string) =>
      wrapper.findAll('button').find((button) => button.text().startsWith(label));
    expect(findStatusButton('available')!.text()).toBe('available0');
    expect(findStatusButton('locked')!.text()).toBe('locked1');
    expect(findStatusButton('all')!.attributes('aria-pressed')).toBe('true');
    expect(findStatusButton('available')!.attributes('aria-pressed')).toBe('false');
  });
  it('pins a status picked during search without saving it', async () => {
    const { TaskFilterBar, preferencesStore } = await setup();
    const wrapper = mountTaskFilterBar(TaskFilterBar, true, {
      activeStatusView: 'all',
      searchStatusCounts: { all: 1, available: 0, completed: 0, failed: 0, locked: 1 },
    });
    const lockedButton = wrapper
      .findAll('button')
      .find((button) => button.text().startsWith('locked'));
    await lockedButton!.trigger('click');
    expect(wrapper.emitted('pin-status')).toEqual([['locked']]);
    expect(preferencesStore.setTaskSecondaryView).not.toHaveBeenCalled();
  });
  it('saves a status picked with no search active', async () => {
    const { TaskFilterBar, preferencesStore } = await setup();
    const wrapper = mountTaskFilterBar(TaskFilterBar, false, { activeStatusView: 'available' });
    const lockedButton = wrapper
      .findAll('button')
      .find((button) => button.text().startsWith('locked'));
    await lockedButton!.trigger('click');
    expect(wrapper.emitted('pin-status')).toEqual([['locked']]);
    expect(preferencesStore.setTaskSecondaryView).toHaveBeenCalledWith('locked');
  });
  it('keeps All clickable during an all-status search', async () => {
    const { TaskFilterBar, preferencesStore } = await setup();
    const wrapper = mountTaskFilterBar(TaskFilterBar, true, {
      activeStatusView: 'all',
      searchStatusCounts: { all: 1, available: 0, completed: 0, failed: 0, locked: 1 },
    });
    const allButton = wrapper.findAll('button').find((button) => button.text().startsWith('all'));
    expect(allButton!.attributes('disabled')).toBeUndefined();
    await allButton!.trigger('click');
    expect(wrapper.emitted('pin-status')).toEqual([['all']]);
    expect(preferencesStore.setTaskSecondaryView).not.toHaveBeenCalled();
  });
  it('keeps the current tab clickable while the typed query is still debouncing', async () => {
    const { TaskFilterBar } = await setup();
    const wrapper = mountTaskFilterBar(TaskFilterBar, true, { activeStatusView: 'available' });
    const availableButton = wrapper
      .findAll('button')
      .find((button) => button.text().startsWith('available'));
    expect(availableButton!.attributes('disabled')).toBeUndefined();
    await availableButton!.trigger('click');
    expect(wrapper.emitted('pin-status')).toEqual([['available']]);
  });
  it('counts traders for the status the list is showing', async () => {
    const { TaskFilterBar, calculateTraderCounts } = await setup({
      preferencesStore: { getTaskPrimaryView: 'traders' },
    });
    mountTaskFilterBar(TaskFilterBar, true, { activeStatusView: 'all' });
    expect(calculateTraderCounts).toHaveBeenLastCalledWith('self', 'all');
  });
  it('applies stronger selected styling to the active status view', async () => {
    const { TaskFilterBar } = await setup({
      preferencesStore: {
        getTaskPrimaryView: 'all',
        getTaskSecondaryView: 'all',
      },
    });
    const wrapper = mountTaskFilterBar(TaskFilterBar);
    const allStatusButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('all2'));
    const availableButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('available'));
    // All is neutral grey, so it never borrows a status color.
    expect(allStatusButton?.classes()).toContain('border-white/15');
    expect(allStatusButton?.classes()).toContain('ring-white/10');
    expect(allStatusButton?.classes()).not.toContain('border-primary-500/45');
    expect(availableButton?.classes()).not.toContain('border-info-500/45');
    expect(availableButton?.classes()).toContain('border-white/10');
  });
  it('keeps completed and failed filters mounted when enabled, even with zero counts', async () => {
    const { TaskFilterBar } = await setup({
      statusCounts: {
        completed: 0,
        failed: 0,
      },
    });
    const wrapper = mountTaskFilterBar(TaskFilterBar);
    const buttonTexts = wrapper.findAll('button').map((button) => button.text());
    expect(buttonTexts.some((text) => text.includes('completed0'))).toBe(true);
    expect(buttonTexts.some((text) => text.includes('failed0'))).toBe(true);
  });
  it('forces graph view to show only the all status filter', async () => {
    const { TaskFilterBar } = await setup({
      preferencesStore: {
        getTaskPrimaryView: 'graph',
        getTaskSecondaryView: 'available',
        getShowAllFilter: false,
      },
    });
    const wrapper = mountTaskFilterBar(TaskFilterBar);
    const buttonTexts = wrapper.findAll('button').map((button) => button.text());
    expect(buttonTexts.some((text) => text.includes('available'))).toBe(false);
    expect(buttonTexts.some((text) => text.includes('locked'))).toBe(false);
    expect(buttonTexts.some((text) => text.includes('completed'))).toBe(false);
    expect(buttonTexts.some((text) => text.includes('failed'))).toBe(false);
    expect(buttonTexts.some((text) => text.includes('all2'))).toBe(true);
  });
  it('drops the list-only sort control from the graph view', async () => {
    const sortDirection = '[data-icon="i-mdi-sort-ascending"]';
    for (const [view, hasSort] of [
      ['traders', true],
      ['maps', true],
      ['graph', false],
    ] as const) {
      const { TaskFilterBar } = await setup({ preferencesStore: { getTaskPrimaryView: view } });
      const wrapper = mountTaskFilterBar(TaskFilterBar);
      expect(wrapper.find(sortDirection).exists()).toBe(hasSort);
    }
  });
  it('moves off a hidden active status filter', async () => {
    const { TaskFilterBar, preferencesStore } = await setup({
      preferencesStore: {
        getTaskSecondaryView: 'available',
        getShowAvailableFilter: false,
      },
    });
    mountTaskFilterBar(TaskFilterBar);
    expect(preferencesStore.setTaskSecondaryView).toHaveBeenCalledWith('all');
  });
  it('uses the first visible status filter when all is hidden too', async () => {
    const { TaskFilterBar, preferencesStore } = await setup({
      preferencesStore: {
        getTaskSecondaryView: 'available',
        getShowAllFilter: false,
        getShowAvailableFilter: false,
      },
    });
    mountTaskFilterBar(TaskFilterBar);
    expect(preferencesStore.setTaskSecondaryView).toHaveBeenCalledWith('locked');
  });
  it('renders settings drawer button with theme classes when open, and toggles closed', async () => {
    const { TaskFilterBar } = await setup({
      drawerOpen: true,
    });
    const wrapper = mountTaskFilterBar(TaskFilterBar);
    const settingsButton = wrapper.find('button[data-icon="i-mdi-tune-variant"]');
    expect(settingsButton.exists()).toBe(true);
    expect(settingsButton.attributes('aria-expanded')).toBe('true');
    expect(settingsButton.classes()).toContain('light:text-surface-50');
    expect(settingsButton.classes()).toContain('light:bg-surface-700/70');
    // Exercise the drawer toggle so the mocked toggle() and the off state are covered
    // (and so the shared drawer state is left closed for later tests in this file).
    await settingsButton.trigger('click');
    expect(settingsButton.attributes('aria-expanded')).toBe('false');
  });
  it('renders neutral badge class when available count is zero', async () => {
    const { TaskFilterBar } = await setup({
      statusCounts: { available: 0 },
    });
    const wrapper = mountTaskFilterBar(TaskFilterBar);
    const availableButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('available'));
    expect(availableButton).toBeTruthy();
    const badge = availableButton!.find('.rounded-full');
    expect(badge.exists()).toBe(true);
    expect(badge.classes()).toContain('bg-surface-600');
    expect(badge.classes()).toContain('light:text-surface-50');
  });
});
