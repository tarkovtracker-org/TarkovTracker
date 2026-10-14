import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
const UButtonStub = {
  inheritAttrs: false,
  props: ['icon'],
  emits: ['click'],
  template: '<button v-bind="$attrs" :data-icon="icon" @click="$emit(\'click\')"><slot /></button>',
};
const UPopoverStub = { template: '<div><slot /><slot name="content" /></div>' };
type SetupOptions = {
  userView?: string;
  taskTeamAllHidden?: boolean;
  teammates?: string[];
  teamMembers?: string[];
  hiddenTeammates?: Record<string, boolean>;
  displayNames?: Record<string, string>;
  hasSystemInitiallyLoaded?: boolean;
  hasTeam?: boolean;
};
const setup = async (options: SetupOptions = {}) => {
  const preferencesStore = {
    getTaskUserView: options.userView ?? 'self',
    taskTeamAllHidden: options.taskTeamAllHidden ?? false,
    teamHide: { ...(options.hiddenTeammates ?? {}) } as Record<string, boolean>,
    teamIsHidden: vi.fn(
      (teamId: string) =>
        teamId !== 'self' &&
        (preferencesStore.taskTeamAllHidden || preferencesStore.teamHide[teamId] === true)
    ),
    setTaskUserView: vi.fn(),
    toggleHidden: vi.fn((teamId: string) => {
      preferencesStore.teamHide[teamId] = !preferencesStore.teamHide[teamId];
    }),
  };
  const displayNames: Record<string, string> = { self: 'Self', ...(options.displayNames ?? {}) };
  const teammates = options.teammates ?? [];
  const teamMembers = options.teamMembers ?? ['self', ...teammates];
  vi.resetModules();
  vi.doMock('@/stores/usePreferences', () => ({
    usePreferencesStore: () => preferencesStore,
  }));
  vi.doMock('@/stores/useProgress', () => ({
    useProgressStore: () => ({
      getDisplayName: (teamId: string) => displayNames[teamId] ?? teamId,
    }),
  }));
  vi.doMock('@/stores/useTeamStore', () => ({
    useTeamStore: () => ({ teammates, teamMembers }),
  }));
  vi.doMock('@/stores/useSystemStore', () => ({
    useSystemStoreWithSupabase: () => ({
      hasInitiallyLoaded: { value: options.hasSystemInitiallyLoaded ?? true },
      hasTeam: () => options.hasTeam ?? false,
    }),
  }));
  vi.doMock('vue-i18n', async () => ({
    ...(await vi.importActual<typeof import('vue-i18n')>('vue-i18n')),
    useI18n: () => ({
      t: (key: string, fallback?: string) =>
        typeof fallback === 'string' ? fallback : (key.split('.').pop() ?? key),
    }),
  }));
  const { default: TaskTeamFilter } = await import('@/features/tasks/TaskTeamFilter.vue');
  const wrapper = mount(TaskTeamFilter, {
    global: {
      stubs: { UBadge: true, UButton: UButtonStub, UIcon: true, UPopover: UPopoverStub },
    },
  });
  return { wrapper, preferencesStore };
};
const findRow = (wrapper: Awaited<ReturnType<typeof setup>>['wrapper'], label: string) =>
  wrapper.findAll('button[type="button"]').find((button) => button.text().includes(label));
describe('TaskTeamFilter', () => {
  it('renders nothing without teammates', async () => {
    const { wrapper } = await setup();
    expect(wrapper.find('button').exists()).toBe(false);
  });
  it('keeps persisted teammate view while roster is still loading', async () => {
    const { preferencesStore } = await setup({
      userView: 'teammate-1',
      teamMembers: [],
      hasTeam: true,
    });
    expect(preferencesStore.setTaskUserView).not.toHaveBeenCalled();
  });
  it('falls back to self view when persisted teammate is missing and no teammates remain', async () => {
    const { preferencesStore } = await setup({
      userView: 'teammate-1',
      teamMembers: ['self'],
      hasTeam: true,
    });
    expect(preferencesStore.setTaskUserView).toHaveBeenCalledWith('self');
  });
  it('toggles teammate visibility', async () => {
    const { wrapper, preferencesStore } = await setup({
      teammates: ['teammate-1'],
      displayNames: { 'teammate-1': 'Alpha' },
      userView: 'all',
    });
    await wrapper.find('button[data-icon="i-mdi-eye"]').trigger('click');
    expect(preferencesStore.toggleHidden).toHaveBeenCalledWith('teammate-1');
  });
  it('does not toggle teammate visibility under hide-all', async () => {
    const { wrapper, preferencesStore } = await setup({
      teammates: ['teammate-1'],
      userView: 'all',
      taskTeamAllHidden: true,
    });
    await wrapper.find('button[data-icon="i-mdi-eye-off"]').trigger('click');
    expect(preferencesStore.toggleHidden).not.toHaveBeenCalled();
  });
  it('falls back to all view when hiding the selected teammate', async () => {
    const { wrapper, preferencesStore } = await setup({
      teammates: ['teammate-1'],
      userView: 'teammate-1',
    });
    await wrapper.find('button[data-icon="i-mdi-eye"]').trigger('click');
    expect(preferencesStore.setTaskUserView).toHaveBeenCalledWith('all');
  });
  it('unhides a teammate when selecting them', async () => {
    const { wrapper, preferencesStore } = await setup({
      teammates: ['teammate-1'],
      hiddenTeammates: { 'teammate-1': true },
      displayNames: { 'teammate-1': 'Alpha' },
      userView: 'all',
    });
    await findRow(wrapper, 'Alpha')!.trigger('click');
    expect(preferencesStore.toggleHidden).toHaveBeenCalledWith('teammate-1');
    expect(preferencesStore.setTaskUserView).toHaveBeenCalledWith('teammate-1');
  });
  it('does not toggle individual hide when selecting a teammate under hide-all', async () => {
    const { wrapper, preferencesStore } = await setup({
      teammates: ['teammate-1'],
      userView: 'all',
      taskTeamAllHidden: true,
    });
    await findRow(wrapper, 'teammate-1')!.trigger('click');
    expect(preferencesStore.toggleHidden).not.toHaveBeenCalled();
    expect(preferencesStore.setTaskUserView).toHaveBeenCalledWith('teammate-1');
  });
  it('selects the whole team and marks it pressed', async () => {
    const { wrapper, preferencesStore } = await setup({
      teammates: ['teammate-1'],
      userView: 'self',
    });
    const wholeTeam = findRow(wrapper, 'whole_team')!;
    expect(wholeTeam.attributes('aria-pressed')).toBe('false');
    expect(findRow(wrapper, 'Self')!.attributes('aria-pressed')).toBe('true');
    await wholeTeam.trigger('click');
    expect(preferencesStore.setTaskUserView).toHaveBeenCalledWith('all');
  });
});
