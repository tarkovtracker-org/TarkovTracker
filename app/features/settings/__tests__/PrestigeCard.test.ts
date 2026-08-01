import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive, ref } from 'vue';
import PrestigeCard from '@/features/settings/PrestigeCard.vue';
import type { PrestigeRunRecord } from '@/stores/useTarkov';
const {
  deletePrestigeRunMock,
  fetchPrestigeRunsMock,
  prestigePvPMock,
  syncPvpPrestigeLevelMock,
  toastAddMock,
} = vi.hoisted(() => ({
  deletePrestigeRunMock: vi.fn(async (_runId: string, _mode: 'pvp' | 'pve') => undefined),
  fetchPrestigeRunsMock: vi.fn(async (): Promise<PrestigeRunRecord[]> => []),
  prestigePvPMock: vi.fn(async () => undefined),
  syncPvpPrestigeLevelMock: vi.fn(async (_level: number) => undefined),
  toastAddMock: vi.fn(),
}));
const mockSupabaseUser = reactive({
  id: 'user-1' as string | null,
  loggedIn: true,
});
const mockLocale = ref('en-US');
const mockState = reactive({
  currentGameMode: 'pvp' as 'pvp' | 'pve',
  prestigeLevel: 4,
  level: 20,
});
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: {
    user: mockSupabaseUser,
  },
  $config: {
    public: {
      i18n: {},
    },
  },
  _payloadRevivers: {},
  _route: {
    sync: vi.fn(() => Promise.resolve()),
  },
  deferHydration: () => () => {},
  isHydrating: false,
  runWithContext: (fn: () => unknown) => fn(),
  hooks: {
    hookOnce: vi.fn(),
    callHookWith: vi.fn(() => Promise.resolve()),
    callHook: vi.fn(() => Promise.resolve()),
  },
}));
mockNuxtImport('useToast', () => () => ({
  add: toastAddMock,
}));
mockNuxtImport('useRouter', () => () => ({
  replace: vi.fn(() => Promise.resolve()),
  resolve: vi.fn(() => ({ href: '/' })),
  beforeEach: vi.fn(),
  beforeResolve: vi.fn(),
  onError: vi.fn(),
  afterEach: vi.fn(),
}));
mockNuxtImport('useRuntimeConfig', () => () => ({
  app: {
    baseURL: '/',
  },
  public: {
    i18n: {},
  },
}));
vi.mock('@/stores/useMetadata', () => ({
  useMetadataStore: () => ({
    getEditionByValue: () => ({
      defaultCultistCircleLevel: 0,
      defaultStashLevel: 0,
    }),
    hideoutStations: [],
    prestigeLevels: [
      {
        id: 'prestige-5',
        prestigeLevel: 5,
        conditions: [
          {
            type: 'playerLevel',
            id: 'player-level',
            playerLevel: 47,
          },
        ],
      },
    ],
    storyChapters: [],
    tasks: [],
  }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    get currentGameMode() {
      return mockState.currentGameMode;
    },
    deletePrestigeRun: deletePrestigeRunMock,
    fetchPrestigeRuns: fetchPrestigeRunsMock,
    getGameEdition: () => 1,
    getPvPProgressData: () => ({
      hideoutModules: {},
      level: mockState.level,
      prestigeLevel: mockState.prestigeLevel,
      skillOffsets: {},
      storyChapters: {},
      taskCompletions: {},
    }),
    prestigePvP: vi.fn(async () => {
      await prestigePvPMock();
      mockState.prestigeLevel += 1;
    }),
    syncPvpPrestigeLevel: vi.fn(async (level: number) => {
      await syncPvpPrestigeLevelMock(level);
      mockState.prestigeLevel = level;
    }),
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    locale: mockLocale,
    t: (key: string, params?: Record<string, unknown> | string) =>
      params && typeof params === 'object' ? `${key}:${Object.values(params).join('|')}` : key,
  }),
}));
const UAlert = {
  template: '<div><slot />{{ title }}</div>',
  props: ['title'],
};
const UButton = {
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  props: ['disabled', 'loading'],
  emits: ['click'],
};
const UInput = {
  template:
    '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  props: ['modelValue'],
  emits: ['update:modelValue'],
};
const UModal = {
  template:
    '<div v-if="open"><slot name="header" /><slot name="body" /><slot name="footer" :close="close" /></div>',
  props: ['open'],
  emits: ['update:open', 'close'],
  setup(
    _props: unknown,
    { emit }: { emit: (event: 'update:open' | 'close', value?: false) => void }
  ) {
    const close = () => {
      emit('update:open', false);
      emit('close');
    };
    return { close };
  },
};
const SelectMenuFixed = {
  template:
    '<select :value="modelValue" @change="$emit(\'update:modelValue\', Number($event.target.value))"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>',
  props: ['items', 'modelValue'],
  emits: ['update:modelValue'],
};
const createPrestigeRun = (id: string): PrestigeRunRecord => ({
  createdAt: '2026-03-01T00:00:00.000Z',
  id,
  mode: 'pvp',
  prestigeFrom: 3,
  prestigeTo: 4,
  summary: {
    completedHideoutModules: 1,
    completedHideoutParts: 1,
    completedObjectives: 2,
    completedStoryChapters: 1,
    completedTasks: 3,
    failedTasks: 0,
    firstActionAt: 1,
    lastActionAt: 2,
    level: 15,
    prestigeLevel: 4,
  },
});
const findButtonByText = (wrapper: ReturnType<typeof mount>, text: string) => {
  return wrapper.findAll('button').find((button) => button.text().includes(text));
};
describe('PrestigeCard', () => {
  beforeEach(() => {
    fetchPrestigeRunsMock.mockReset();
    fetchPrestigeRunsMock.mockResolvedValue([]);
    deletePrestigeRunMock.mockReset();
    deletePrestigeRunMock.mockResolvedValue(undefined);
    prestigePvPMock.mockReset();
    prestigePvPMock.mockResolvedValue(undefined);
    syncPvpPrestigeLevelMock.mockReset();
    syncPvpPrestigeLevelMock.mockResolvedValue(undefined);
    toastAddMock.mockReset();
    mockSupabaseUser.loggedIn = true;
    mockSupabaseUser.id = 'user-1';
    mockLocale.value = 'en-US';
    mockState.currentGameMode = 'pvp';
    mockState.prestigeLevel = 4;
    mockState.level = 20;
  });
  const createWrapper = () =>
    mount(PrestigeCard, {
      global: {
        mocks: {
          $t: (key: string) => key,
        },
        stubs: {
          'i18n-t': {
            template: '<span><slot /><slot name="word" /></span>',
          },
          GenericCard: {
            template: '<div><slot name="content" /></div>',
          },
          SelectMenuFixed,
          UAlert,
          UButton,
          UIcon: true,
          UInput,
          UModal,
          UTooltip: {
            template: '<span><slot /></span>',
          },
        },
      },
    });
  it('syncs current prestige without archiving the run', async () => {
    const wrapper = createWrapper();
    await flushPromises();
    await wrapper.find('select').setValue('2');
    const syncButton = findButtonByText(wrapper, 'settings.prestige.set_current');
    expect(syncButton).toBeTruthy();
    await syncButton!.trigger('click');
    await flushPromises();
    expect(syncPvpPrestigeLevelMock).toHaveBeenCalledWith(2);
    expect(prestigePvPMock).not.toHaveBeenCalled();
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'success',
        title: 'settings.prestige.sync_success_title',
      })
    );
  });
  it('uses the prestige update failure title when sync fails', async () => {
    syncPvpPrestigeLevelMock.mockRejectedValueOnce(new Error('sync failed'));
    const wrapper = createWrapper();
    await flushPromises();
    await wrapper.find('select').setValue('2');
    const syncButton = findButtonByText(wrapper, 'settings.prestige.set_current');
    expect(syncButton).toBeTruthy();
    await syncButton!.trigger('click');
    await flushPromises();
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'error',
        title: 'settings.prestige.sync_error_title',
      })
    );
  });
  it('shows a warning when lowering tracker prestige', async () => {
    const wrapper = createWrapper();
    await flushPromises();
    await wrapper.find('select').setValue('2');
    expect(wrapper.text()).toContain('settings.prestige.lowering_warning');
  });
  it('loads archived runs only after login', async () => {
    mockSupabaseUser.loggedIn = false;
    mockSupabaseUser.id = null;
    fetchPrestigeRunsMock.mockResolvedValue([createPrestigeRun('run-1')]);
    const wrapper = createWrapper();
    await flushPromises();
    expect(fetchPrestigeRunsMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('settings.prestige.login_required');
    mockSupabaseUser.loggedIn = true;
    mockSupabaseUser.id = 'user-1';
    await nextTick();
    await flushPromises();
    expect(fetchPrestigeRunsMock).toHaveBeenCalledTimes(1);
  });
  it('formats history dates with the active i18n locale', async () => {
    mockLocale.value = 'fr-FR';
    const run = createPrestigeRun('run-1');
    fetchPrestigeRunsMock.mockResolvedValue([run]);
    const wrapper = createWrapper();
    await flushPromises();
    const expected = new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(Date.parse(run.createdAt));
    const fallback = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(Date.parse(run.createdAt));
    expect(wrapper.text()).toContain(expected);
    expect(wrapper.text()).not.toContain(fallback);
  });
  it('shows a PvP-only notice and skips history loading in PvE mode', async () => {
    mockState.currentGameMode = 'pve';
    fetchPrestigeRunsMock.mockResolvedValue([createPrestigeRun('run-1')]);
    const wrapper = createWrapper();
    await flushPromises();
    expect(fetchPrestigeRunsMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('settings.prestige.pvp_only_title');
    expect(wrapper.text()).toContain('settings.prestige.pvp_only');
    expect(wrapper.text()).not.toContain('settings.prestige.set_current');
  });
  it('archives a run only after explicit confirmation', async () => {
    const wrapper = createWrapper();
    await flushPromises();
    const openButton = findButtonByText(wrapper, 'settings.prestige.archive_cta');
    expect(openButton).toBeTruthy();
    await openButton!.trigger('click');
    const input = wrapper.find('input');
    await input.setValue('settings.prestige.confirm_word');
    const archiveButtons = wrapper
      .findAll('button')
      .filter((button) => button.text().includes('settings.prestige.archive_cta'));
    const confirmButton = archiveButtons[archiveButtons.length - 1];
    expect(confirmButton).toBeTruthy();
    await confirmButton!.trigger('click');
    await flushPromises();
    expect(prestigePvPMock).toHaveBeenCalledTimes(1);
    expect(syncPvpPrestigeLevelMock).not.toHaveBeenCalled();
  });
  it('uses the prestige archive failure title when archiving fails', async () => {
    prestigePvPMock.mockRejectedValueOnce(new Error('archive failed'));
    const wrapper = createWrapper();
    await flushPromises();
    const openButton = findButtonByText(wrapper, 'settings.prestige.archive_cta');
    expect(openButton).toBeTruthy();
    await openButton!.trigger('click');
    await wrapper.find('input').setValue('settings.prestige.confirm_word');
    const archiveButtons = wrapper
      .findAll('button')
      .filter((button) => button.text().includes('settings.prestige.archive_cta'));
    await archiveButtons[archiveButtons.length - 1]!.trigger('click');
    await flushPromises();
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'error',
        title: 'settings.prestige_pvp.error_title',
      })
    );
  });
  it('deletes the selected archived run without changing current progress', async () => {
    fetchPrestigeRunsMock.mockResolvedValue([
      createPrestigeRun('run-1'),
      createPrestigeRun('run-2'),
    ]);
    const wrapper = createWrapper();
    await flushPromises();
    const openDeleteButton = findButtonByText(wrapper, 'settings.prestige.delete_history_cta');
    expect(openDeleteButton).toBeTruthy();
    await openDeleteButton!.trigger('click');
    const deleteButtons = wrapper
      .findAll('button')
      .filter((button) => button.text().includes('common.delete_archived_run'));
    const confirmDeleteButton = deleteButtons[deleteButtons.length - 1];
    expect(confirmDeleteButton).toBeTruthy();
    await confirmDeleteButton!.trigger('click');
    await flushPromises();
    expect(deletePrestigeRunMock).toHaveBeenCalledWith('run-1', 'pvp');
    expect(syncPvpPrestigeLevelMock).not.toHaveBeenCalled();
    expect(prestigePvPMock).not.toHaveBeenCalled();
    expect(wrapper.findAll('select')[1]!.findAll('option')).toHaveLength(1);
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'success',
        title: 'settings.prestige.delete_history_success_title',
      })
    );
  });
  it('uses the delete failure title when deleting history fails', async () => {
    fetchPrestigeRunsMock.mockResolvedValue([createPrestigeRun('run-1')]);
    deletePrestigeRunMock.mockRejectedValueOnce(new Error('delete failed'));
    const wrapper = createWrapper();
    await flushPromises();
    const openDeleteButton = findButtonByText(wrapper, 'settings.prestige.delete_history_cta');
    expect(openDeleteButton).toBeTruthy();
    await openDeleteButton!.trigger('click');
    const deleteButtons = wrapper
      .findAll('button')
      .filter((button) => button.text().includes('common.delete_archived_run'));
    await deleteButtons[deleteButtons.length - 1]!.trigger('click');
    await flushPromises();
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({
        color: 'error',
        title: 'settings.prestige.delete_history_error_title',
      })
    );
  });
});
