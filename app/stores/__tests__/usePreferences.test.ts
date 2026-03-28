import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingResetPreferencesSnapshot,
  getPersistedPreferencesState,
  preferencesDefaultState,
  readPendingResetPreferencesSnapshot,
  resetPreferencesStoreForSessionTransition,
  usePreferencesStore,
  type PreferencesState,
  type TaskFilterPreset,
} from '@/stores/usePreferences';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { MAP_MARKER_COLORS } from '@/utils/theme-colors';
import { serializeUserScopedStorage } from '@/utils/userScopedStorage';
import type { NeededItemsFilterType } from '@/features/neededitems/neededitems-constants';
const { currentUserId } = vi.hoisted(() => ({
  currentUserId: {
    value: null as string | null,
  },
}));
vi.mock('@/utils/userScopedStorage', async () => {
  const actual = await vi.importActual<typeof import('@/utils/userScopedStorage')>(
    '@/utils/userScopedStorage'
  );
  return {
    ...actual,
    getCurrentSupabaseUserId: () => currentUserId.value,
  };
});
describe('usePreferencesStore', () => {
  let pinia: ReturnType<typeof createPinia>;
  const createLocalStorageMock = () => {
    let store: Record<string, string> = {};
    return {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        Reflect.deleteProperty(store, key);
      }),
      clear: vi.fn(() => {
        store = {};
      }),
    };
  };
  let localStorageMock: ReturnType<typeof createLocalStorageMock>;
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    currentUserId.value = null;
    localStorageMock = createLocalStorageMock();
    clearPendingResetPreferencesSnapshot();
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('import.meta', { client: true });
  });
  describe('Default State Initialization', () => {
    it('should initialize with default state values', () => {
      const store = usePreferencesStore();
      expect(store.streamerMode).toBe(false);
      expect(store.taskTeamHideAll).toBe(false);
      expect(store.itemsTeamHideAll).toBe(false);
      expect(store.itemsTeamHideNonFIR).toBe(false);
      expect(store.itemsTeamHideHideout).toBe(false);
      expect(store.mapTeamHideAll).toBe(false);
      expect(store.teamHide).toEqual({});
    });
    it('should initialize task view defaults correctly', () => {
      const store = usePreferencesStore();
      expect(store.taskPrimaryView).toBeNull();
      expect(store.taskMapView).toBeNull();
      expect(store.taskTraderView).toBeNull();
      expect(store.taskSecondaryView).toBeNull();
      expect(store.taskUserView).toBeNull();
      expect(store.taskSortMode).toBeNull();
      expect(store.taskSortDirection).toBeNull();
      expect(store.taskSharedByAllOnly).toBe(false);
    });
    it('should initialize needed items defaults correctly', () => {
      const store = usePreferencesStore();
      expect(store.neededTypeView).toBeNull();
      expect(store.neededItemsViewMode).toBeNull();
      expect(store.neededItemsFirFilter).toBeNull();
      expect(store.neededItemsGroupByItem).toBe(false);
      expect(store.neededItemsHideNonFirSpecialEquipment).toBe(false);
      expect(store.neededItemsKappaOnly).toBe(false);
      expect(store.neededItemsSortBy).toBe('priority');
      expect(store.neededItemsSortDirection).toBe('desc');
      expect(store.neededItemsHideOwned).toBe(false);
      expect(store.neededItemsCardStyle).toBe('expanded');
    });
    it('should initialize hideout defaults correctly', () => {
      const store = usePreferencesStore();
      expect(store.hideoutPrimaryView).toBeNull();
      expect(store.hideoutCollapseCompleted).toBe(false);
      expect(store.hideoutSortReadyFirst).toBe(false);
      expect(store.hideoutRequireStationLevels).toBe(true);
      expect(store.hideoutRequireSkillLevels).toBe(true);
      expect(store.hideoutRequireTraderLoyalty).toBe(true);
    });
    it('should initialize task filter settings with correct defaults', () => {
      const store = usePreferencesStore();
      expect(store.showNonSpecialTasks).toBe(true);
      expect(store.showLightkeeperTasks).toBe(true);
      expect(store.onlyTasksWithRequiredKeys).toBe(false);
      expect(store.respectTaskFiltersForImpact).toBe(true);
    });
    it('should initialize task appearance settings with correct defaults', () => {
      const store = usePreferencesStore();
      expect(store.showRequiredLabels).toBe(true);
      expect(store.showExperienceRewards).toBe(true);
      expect(store.showNextQuests).toBe(true);
      expect(store.showPreviousQuests).toBe(true);
      expect(store.taskCardDensity).toBe('compact');
      expect(store.enableManualTaskFail).toBe(false);
      expect(store.hideCompletedTaskObjectives).toBe(true);
    });
    it('should initialize task status filters with correct defaults', () => {
      const store = usePreferencesStore();
      expect(store.showAllFilter).toBe(true);
      expect(store.showAvailableFilter).toBe(true);
      expect(store.showLockedFilter).toBe(true);
      expect(store.showCompletedFilter).toBe(true);
      expect(store.showFailedFilter).toBe(true);
    });
    it('should initialize map settings with correct defaults', () => {
      const store = usePreferencesStore();
      expect(store.showMapExtracts).toBe(true);
      expect(store.mapMarkerColors).toEqual({ ...MAP_MARKER_COLORS });
      expect(store.mapZoomSpeed).toBe(1);
      expect(store.mapPanSpeed).toBe(1);
      expect(store.pinnedTaskIds).toEqual([]);
    });
    it('should initialize other settings with correct defaults', () => {
      const store = usePreferencesStore();
      expect(store.localeOverride).toBeNull();
      expect(store.useAutomaticLevelCalculation).toBe(false);
      expect(store.dashboardNoticeDismissed).toBe(false);
      expect(store.skillSortMode).toBeNull();
      expect(store.taskFilterPresets).toEqual([]);
      expect(store.hideGlobalTasks).toBe(false);
      expect(store.hideNonKappaTasks).toBe(false);
      expect(store.hideCompletedMapObjectives).toBe(false);
      expect(store.itemsHideNonFIR).toBe(false);
    });
    it('should initialize saving state with all false values', () => {
      const store = usePreferencesStore();
      expect(store.saving).toEqual({
        streamerMode: false,
        hideGlobalTasks: false,
        hideNonKappaTasks: false,
        hideCompletedMapObjectives: false,
        itemsNeededHideNonFIR: false,
      });
    });
  });
  describe('Migration Logic', () => {
    it('serializes reactive store state without throwing', () => {
      const store = usePreferencesStore();
      store.localeOverride = 'de';
      expect(store.saving).toBeDefined();
      store.saving!.streamerMode = true;
      let persistedState: ReturnType<typeof getPersistedPreferencesState> | null = null;
      expect(() => {
        persistedState = getPersistedPreferencesState(store.$state);
      }).not.toThrow();
      expect(persistedState).toEqual(
        expect.objectContaining({
          localeOverride: 'de',
        })
      );
      expect(persistedState).not.toHaveProperty('saving');
    });
    it('drops non-serializable route state during persistence snapshots', () => {
      let persistedState: ReturnType<typeof getPersistedPreferencesState> | null = null;
      expect(() => {
        persistedState = getPersistedPreferencesState({
          neededItemsSortBy: globalThis.window as unknown as PreferencesState['neededItemsSortBy'],
          neededItemsViewMode: {
            value: 'list',
          } as unknown as PreferencesState['neededItemsViewMode'],
          taskPrimaryView: 'invalid' as unknown as PreferencesState['taskPrimaryView'],
          taskUserView: globalThis.window as unknown as PreferencesState['taskUserView'],
        });
      }).not.toThrow();
      expect(persistedState).toMatchObject({
        neededItemsViewMode: 'list',
        taskPrimaryView: null,
      });
      expect(persistedState).not.toHaveProperty('neededItemsSortBy');
      expect(persistedState).not.toHaveProperty('taskUserView');
    });
    it('should migrate onlyTasksWithSuggestedKeys to onlyTasksWithRequiredKeys', () => {
      const persistedState = {
        onlyTasksWithSuggestedKeys: true,
      };
      localStorageMock.getItem.mockReturnValue(JSON.stringify(persistedState));
      const newPinia = createPinia();
      setActivePinia(newPinia);
      const store = usePreferencesStore();
      const migratedValue = localStorageMock.setItem.mock.calls
        .filter(([key]) => key === STORAGE_KEYS.preferences)
        .map(([, value]) => JSON.parse(value))
        .at(-1);
      expect(store.onlyTasksWithRequiredKeys).toBe(true);
      expect(migratedValue?.data?.onlyTasksWithRequiredKeys).toBe(true);
      expect(migratedValue?.data?.onlyTasksWithSuggestedKeys).toBeUndefined();
    });
    it('should not override onlyTasksWithRequiredKeys if both exist', () => {
      const persistedState = {
        onlyTasksWithRequiredKeys: false,
        onlyTasksWithSuggestedKeys: true,
      };
      localStorageMock.getItem.mockReturnValue(JSON.stringify(persistedState));
      const newPinia = createPinia();
      setActivePinia(newPinia);
      const store = usePreferencesStore();
      expect(store.onlyTasksWithRequiredKeys).toBe(false);
    });
    it('should migrate neededItemsHideCollected to neededItemsHideOwned', () => {
      const persistedState = {
        neededItemsHideCollected: true,
      };
      localStorageMock.getItem.mockReturnValue(JSON.stringify(persistedState));
      const newPinia = createPinia();
      setActivePinia(newPinia);
      const store = usePreferencesStore();
      const migratedValue = localStorageMock.setItem.mock.calls
        .filter(([key]) => key === STORAGE_KEYS.preferences)
        .map(([, value]) => JSON.parse(value))
        .at(-1);
      expect(store.neededItemsHideOwned).toBe(true);
      expect(migratedValue?.data?.neededItemsHideOwned).toBe(true);
      expect(migratedValue?.data?.neededItemsHideCollected).toBeUndefined();
    });
    it('should not override neededItemsHideOwned if both keys exist', () => {
      const persistedState = {
        neededItemsHideCollected: true,
        neededItemsHideOwned: false,
      };
      localStorageMock.getItem.mockReturnValue(JSON.stringify(persistedState));
      const newPinia = createPinia();
      setActivePinia(newPinia);
      const store = usePreferencesStore();
      expect(store.neededItemsHideOwned).toBe(false);
    });
    it('persists scoped migration for neededItemsHideCollected', () => {
      localStorageMock.setItem(
        STORAGE_KEYS.preferences,
        serializeUserScopedStorage(
          {
            neededItemsHideCollected: true,
          },
          'user-1',
          1234
        )
      );
      currentUserId.value = 'user-1';
      const store = usePreferencesStore();
      const migratedValue = JSON.parse(localStorageMock.getItem(STORAGE_KEYS.preferences) || '{}');
      expect(store.neededItemsHideOwned).toBe(true);
      expect(migratedValue).toMatchObject({
        _timestamp: 1234,
        _userId: 'user-1',
        data: {
          neededItemsHideOwned: true,
        },
      });
      expect(migratedValue.data.neededItemsHideCollected).toBeUndefined();
    });
    it('should migrate untouched legacy map marker defaults', () => {
      const legacyMapMarkerColors = {
        ...MAP_MARKER_COLORS,
        SELF_OBJECTIVE: '#ef4444',
      };
      const persistedState = {
        mapMarkerColors: legacyMapMarkerColors,
      };
      localStorageMock.getItem.mockReturnValue(JSON.stringify(persistedState));
      const newPinia = createPinia();
      setActivePinia(newPinia);
      const store = usePreferencesStore();
      expect(store.mapMarkerColors.SELF_OBJECTIVE).toBe(MAP_MARKER_COLORS.SELF_OBJECTIVE);
      expect(store.mapMarkerColors.SELF_OBJECTIVE).not.toBe(legacyMapMarkerColors.SELF_OBJECTIVE);
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
    it('should not migrate map marker colors when user has customized them', () => {
      const persistedState = {
        mapMarkerColors: {
          ...MAP_MARKER_COLORS,
          SELF_OBJECTIVE: '#ef4444',
          TEAM_OBJECTIVE: '#123456',
        },
      };
      localStorageMock.getItem.mockReturnValue(JSON.stringify(persistedState));
      const newPinia = createPinia();
      setActivePinia(newPinia);
      const store = usePreferencesStore();
      expect(store.mapMarkerColors.SELF_OBJECTIVE).toBe('#ef4444');
      expect(store.mapMarkerColors.TEAM_OBJECTIVE).toBe('#123456');
    });
    it('should handle corrupted localStorage gracefully', () => {
      localStorageMock.getItem.mockReturnValue('invalid json {{{');
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const newPinia = createPinia();
      setActivePinia(newPinia);
      const store = usePreferencesStore();
      expect(store.onlyTasksWithRequiredKeys).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
    it('should handle localStorage access failures gracefully', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('Storage disabled');
      });
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const newPinia = createPinia();
      setActivePinia(newPinia);
      let store: ReturnType<typeof usePreferencesStore> | undefined;
      expect(() => {
        store = usePreferencesStore();
      }).not.toThrow();
      expect(store?.onlyTasksWithRequiredKeys).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
    it('should handle missing localStorage key gracefully', () => {
      localStorageMock.getItem.mockReturnValue(null);
      const newPinia = createPinia();
      setActivePinia(newPinia);
      const store = usePreferencesStore();
      expect(store.onlyTasksWithRequiredKeys).toBe(false);
    });
    it('ignores user-scoped preferences until the matching user is hydrated', () => {
      localStorageMock.getItem.mockReturnValue(
        serializeUserScopedStorage({ localeOverride: 'de' }, 'user-1')
      );
      const newPinia = createPinia();
      setActivePinia(newPinia);
      const store = usePreferencesStore();
      expect(store.localeOverride).toBeNull();
    });
    it('hydrates legacy preferences for authenticated users and re-scopes them', () => {
      currentUserId.value = 'user-1';
      localStorageMock.getItem.mockReturnValue(JSON.stringify({ localeOverride: 'de' }));
      const newPinia = createPinia();
      setActivePinia(newPinia);
      const store = usePreferencesStore();
      const persistedValue = localStorageMock.setItem.mock.calls
        .filter(([key]) => key === STORAGE_KEYS.preferences)
        .map(([, value]) => JSON.parse(value))
        .find((value) => value?._userId === 'user-1');
      expect(store.localeOverride).toBe('de');
      expect(persistedValue).toBeTruthy();
      expect(persistedValue).toMatchObject({
        _userId: 'user-1',
        data: {
          localeOverride: 'de',
        },
      });
    });
  });
  describe('Auth Transition Preservation', () => {
    it('preserves the prior scoped snapshot in memory after logout', () => {
      const persistedState = {
        localeOverride: 'de',
        teamHide: { teammate: true },
        mapMarkerColors: {
          ...MAP_MARKER_COLORS,
          SELF_OBJECTIVE: '#fff',
        },
      };
      localStorageMock.setItem(
        STORAGE_KEYS.preferences,
        serializeUserScopedStorage(persistedState, 'user-1')
      );
      currentUserId.value = 'user-1';
      const store = usePreferencesStore();
      expect(store.teamHide).toEqual({ teammate: true });
      expect(store.mapMarkerColors.SELF_OBJECTIVE).toBe('#fff');
      resetPreferencesStoreForSessionTransition('user-1');
      localStorageMock.setItem(STORAGE_KEYS.preferences, JSON.stringify({ localeOverride: 'fr' }));
      expect(store.teamHide).toEqual({});
      expect(store.mapMarkerColors).toEqual({ ...MAP_MARKER_COLORS });
      expect(readPendingResetPreferencesSnapshot('user-1')).toEqual(
        expect.objectContaining({
          ownerUserId: 'user-1',
          persistedAt: expect.any(Number),
          state: persistedState,
        })
      );
      clearPendingResetPreferencesSnapshot('user-1');
      expect(readPendingResetPreferencesSnapshot('user-1')).toBeNull();
    });
    it('rewrites preserved logout storage without the legacy task key', () => {
      localStorageMock.setItem(
        STORAGE_KEYS.preferences,
        serializeUserScopedStorage(
          {
            localeOverride: 'de',
            onlyTasksWithSuggestedKeys: true,
          },
          'user-1',
          1234
        )
      );
      currentUserId.value = 'user-1';
      usePreferencesStore();
      currentUserId.value = null;
      resetPreferencesStoreForSessionTransition('user-1');
      const restoredSnapshot = JSON.parse(
        localStorageMock.getItem(STORAGE_KEYS.preferences) || '{}'
      );
      expect(restoredSnapshot._timestamp).toBe(1234);
      expect(restoredSnapshot).toMatchObject({
        _userId: 'user-1',
        data: {
          localeOverride: 'de',
          onlyTasksWithRequiredKeys: true,
        },
      });
      expect(restoredSnapshot.data.onlyTasksWithSuggestedKeys).toBeUndefined();
    });
    it('rewrites preserved logout storage without the legacy needed items key', () => {
      localStorageMock.setItem(
        STORAGE_KEYS.preferences,
        serializeUserScopedStorage(
          {
            localeOverride: 'de',
            neededItemsHideCollected: true,
          },
          'user-1',
          1234
        )
      );
      currentUserId.value = 'user-1';
      usePreferencesStore();
      currentUserId.value = null;
      resetPreferencesStoreForSessionTransition('user-1');
      const restoredSnapshot = JSON.parse(
        localStorageMock.getItem(STORAGE_KEYS.preferences) || '{}'
      );
      expect(restoredSnapshot._timestamp).toBe(1234);
      expect(restoredSnapshot).toMatchObject({
        _userId: 'user-1',
        data: {
          localeOverride: 'de',
          neededItemsHideOwned: true,
        },
      });
      expect(restoredSnapshot.data.neededItemsHideCollected).toBeUndefined();
    });
    it('clears prior scoped storage during an account switch', () => {
      const persistedState = {
        localeOverride: 'de',
        teamHide: { teammate: true },
      };
      localStorageMock.setItem(
        STORAGE_KEYS.preferences,
        serializeUserScopedStorage(persistedState, 'user-1')
      );
      currentUserId.value = 'user-1';
      const store = usePreferencesStore();
      expect(store.localeOverride).toBe('de');
      currentUserId.value = 'user-2';
      resetPreferencesStoreForSessionTransition('user-1');
      expect(store.localeOverride).toBeNull();
      expect(store.teamHide).toEqual({});
      expect(localStorageMock.getItem(STORAGE_KEYS.preferences)).toBeNull();
      expect(readPendingResetPreferencesSnapshot('user-1')).toEqual(
        expect.objectContaining({
          ownerUserId: 'user-1',
          persistedAt: expect.any(Number),
          state: persistedState,
        })
      );
    });
  });
  describe('State Replacement Actions', () => {
    it('resetToDefaults fully replaces nested plain objects', () => {
      const store = usePreferencesStore();
      store.teamHide = { 'user-1': true };
      store.mapMarkerColors.SELF_OBJECTIVE = '#123456';
      (store.mapMarkerColors as Record<string, string>).LEGACY = '#000000';
      store.resetToDefaults();
      expect(store.teamHide).toEqual({});
      expect(store.mapMarkerColors).toEqual({ ...MAP_MARKER_COLORS });
      expect('LEGACY' in (store.mapMarkerColors as Record<string, string>)).toBe(false);
    });
    it('replacePersistedState fully replaces nested plain objects', () => {
      const store = usePreferencesStore();
      store.teamHide = { 'user-1': true };
      (store.mapMarkerColors as Record<string, string>).LEGACY = '#000000';
      store.replacePersistedState({
        localeOverride: 'de',
        mapMarkerColors: {
          ...MAP_MARKER_COLORS,
          SELF_OBJECTIVE: '#123456',
        },
      });
      expect(store.localeOverride).toBe('de');
      expect(store.teamHide).toEqual({});
      expect(store.mapMarkerColors).toEqual({
        ...MAP_MARKER_COLORS,
        SELF_OBJECTIVE: '#123456',
      });
      expect('LEGACY' in (store.mapMarkerColors as Record<string, string>)).toBe(false);
    });
  });
  describe('Getters - Streamer Mode', () => {
    it('should return streamer mode value', () => {
      const store = usePreferencesStore();
      expect(store.getStreamerMode).toBe(false);
      store.streamerMode = true;
      expect(store.getStreamerMode).toBe(true);
    });
    it('should handle nullish streamer mode with default false', () => {
      const store = usePreferencesStore();
      store.$patch({ streamerMode: undefined } as Partial<PreferencesState>);
      expect(store.getStreamerMode).toBe(false);
    });
  });
  describe('Getters - Team Visibility', () => {
    it('should return false for self team member visibility', () => {
      const store = usePreferencesStore();
      expect(store.teamIsHidden('self')).toBe(false);
    });
    it('should respect individual team hide setting for self', () => {
      const store = usePreferencesStore();
      store.teamHide = { self: true };
      expect(store.teamIsHidden('self')).toBe(true);
    });
    it('should return true when hide all is enabled', () => {
      const store = usePreferencesStore();
      store.taskTeamHideAll = true;
      expect(store.teamIsHidden('teammate-1')).toBe(true);
    });
    it('should return true when teammate is individually hidden', () => {
      const store = usePreferencesStore();
      store.teamHide = { 'teammate-1': true };
      expect(store.teamIsHidden('teammate-1')).toBe(true);
    });
    it('should return false when neither hide all nor individual hide is set', () => {
      const store = usePreferencesStore();
      expect(store.teamIsHidden('teammate-1')).toBe(false);
    });
    it('should prioritize hide all over individual setting', () => {
      const store = usePreferencesStore();
      store.taskTeamHideAll = true;
      store.teamHide = { 'teammate-1': false };
      expect(store.teamIsHidden('teammate-1')).toBe(true);
    });
    it('should return taskTeamHideAll state for taskTeamAllHidden', () => {
      const store = usePreferencesStore();
      expect(store.taskTeamAllHidden).toBe(false);
      store.taskTeamHideAll = true;
      expect(store.taskTeamAllHidden).toBe(true);
    });
    it('should return itemsTeamHideAll state for itemsTeamAllHidden', () => {
      const store = usePreferencesStore();
      expect(store.itemsTeamAllHidden).toBe(false);
      store.itemsTeamHideAll = true;
      expect(store.itemsTeamAllHidden).toBe(true);
    });
    it('should return combined itemsTeamNonFIRHidden when hide all is enabled', () => {
      const store = usePreferencesStore();
      store.itemsTeamHideAll = true;
      expect(store.itemsTeamNonFIRHidden).toBe(true);
    });
    it('should return combined itemsTeamNonFIRHidden when hide non-FIR is enabled', () => {
      const store = usePreferencesStore();
      store.itemsTeamHideNonFIR = true;
      expect(store.itemsTeamNonFIRHidden).toBe(true);
    });
    it('should return combined itemsTeamHideoutHidden when hide all is enabled', () => {
      const store = usePreferencesStore();
      store.itemsTeamHideAll = true;
      expect(store.itemsTeamHideoutHidden).toBe(true);
    });
    it('should return combined itemsTeamHideoutHidden when hide hideout is enabled', () => {
      const store = usePreferencesStore();
      store.itemsTeamHideHideout = true;
      expect(store.itemsTeamHideoutHidden).toBe(true);
    });
    it('should return mapTeamHideAll state for mapTeamAllHidden', () => {
      const store = usePreferencesStore();
      expect(store.mapTeamAllHidden).toBe(false);
      store.mapTeamHideAll = true;
      expect(store.mapTeamAllHidden).toBe(true);
    });
  });
  describe('Getters - Task Views', () => {
    it('should return default "all" for null taskPrimaryView', () => {
      const store = usePreferencesStore();
      expect(store.getTaskPrimaryView).toBe('all');
    });
    it('should return set taskPrimaryView value', () => {
      const store = usePreferencesStore();
      store.taskPrimaryView = 'maps';
      expect(store.getTaskPrimaryView).toBe('maps');
    });
    it('should return default "all" for null taskMapView', () => {
      const store = usePreferencesStore();
      expect(store.getTaskMapView).toBe('all');
    });
    it('should return set taskMapView value', () => {
      const store = usePreferencesStore();
      store.taskMapView = 'customs';
      expect(store.getTaskMapView).toBe('customs');
    });
    it('should return default "all" for null taskTraderView', () => {
      const store = usePreferencesStore();
      expect(store.getTaskTraderView).toBe('all');
    });
    it('should return set taskTraderView value', () => {
      const store = usePreferencesStore();
      store.taskTraderView = 'prapor';
      expect(store.getTaskTraderView).toBe('prapor');
    });
    it('should return normalized secondary view for null value', () => {
      const store = usePreferencesStore();
      expect(store.getTaskSecondaryView).toBe('available');
    });
    it('should return normalized secondary view value', () => {
      const store = usePreferencesStore();
      store.taskSecondaryView = 'available';
      expect(store.getTaskSecondaryView).toBe('available');
    });
    it('should force graph secondary view to all without mutating the stored filter', () => {
      const store = usePreferencesStore();
      store.taskPrimaryView = 'graph';
      store.taskSecondaryView = 'available';
      expect(store.getTaskSecondaryView).toBe('all');
      expect(store.taskSecondaryView).toBe('available');
    });
    it('should return default "self" for null taskUserView', () => {
      const store = usePreferencesStore();
      expect(store.getTaskUserView).toBe('self');
    });
    it('should return set taskUserView value', () => {
      const store = usePreferencesStore();
      store.taskUserView = 'all';
      expect(store.getTaskUserView).toBe('all');
    });
    it('should return normalized sort mode for null value', () => {
      const store = usePreferencesStore();
      expect(store.getTaskSortMode).toBe('impact');
    });
    it('should return normalized sort mode value', () => {
      const store = usePreferencesStore();
      store.taskSortMode = 'impact';
      expect(store.getTaskSortMode).toBe('impact');
    });
    it('should return default desc sort direction for impact mode', () => {
      const store = usePreferencesStore();
      store.taskSortMode = 'impact';
      expect(store.getTaskSortDirection).toBe('desc');
    });
    it('should return default asc sort direction for non-impact mode', () => {
      const store = usePreferencesStore();
      store.taskSortMode = 'alphabetical';
      expect(store.getTaskSortDirection).toBe('asc');
    });
    it('should return set sort direction value', () => {
      const store = usePreferencesStore();
      store.taskSortMode = 'impact';
      store.taskSortDirection = 'asc';
      expect(store.getTaskSortDirection).toBe('asc');
    });
    it('should return taskSharedByAllOnly state', () => {
      const store = usePreferencesStore();
      expect(store.getTaskSharedByAllOnly).toBe(false);
      store.taskSharedByAllOnly = true;
      expect(store.getTaskSharedByAllOnly).toBe(true);
    });
  });
  describe('Getters - Needed Items', () => {
    it('should return default "all" for null neededTypeView', () => {
      const store = usePreferencesStore();
      expect(store.getNeededTypeView).toBe('all');
    });
    it('should return set neededTypeView value', () => {
      const store = usePreferencesStore();
      store.neededTypeView = 'tasks';
      expect(store.getNeededTypeView).toBe('tasks');
    });
    it('should return default "grid" for null neededItemsViewMode', () => {
      const store = usePreferencesStore();
      expect(store.getNeededItemsViewMode).toBe('grid');
    });
    it('should return set neededItemsViewMode value', () => {
      const store = usePreferencesStore();
      store.neededItemsViewMode = 'list';
      expect(store.getNeededItemsViewMode).toBe('list');
    });
    it('should return default "all" for null neededItemsFirFilter', () => {
      const store = usePreferencesStore();
      expect(store.getNeededItemsFirFilter).toBe('all');
    });
    it('should return set neededItemsFirFilter value', () => {
      const store = usePreferencesStore();
      store.neededItemsFirFilter = 'fir';
      expect(store.getNeededItemsFirFilter).toBe('fir');
    });
    it('should return default false for neededItemsGroupByItem', () => {
      const store = usePreferencesStore();
      expect(store.getNeededItemsGroupByItem).toBe(false);
    });
    it('should return set neededItemsGroupByItem value', () => {
      const store = usePreferencesStore();
      store.neededItemsGroupByItem = true;
      expect(store.getNeededItemsGroupByItem).toBe(true);
    });
    it('should return default false for neededItemsHideNonFirSpecialEquipment', () => {
      const store = usePreferencesStore();
      expect(store.getNeededItemsHideNonFirSpecialEquipment).toBe(false);
    });
    it('should return default false for neededItemsKappaOnly', () => {
      const store = usePreferencesStore();
      expect(store.getNeededItemsKappaOnly).toBe(false);
    });
    it('should return default "priority" for neededItemsSortBy', () => {
      const store = usePreferencesStore();
      expect(store.getNeededItemsSortBy).toBe('priority');
    });
    it('should return set neededItemsSortBy value', () => {
      const store = usePreferencesStore();
      store.neededItemsSortBy = 'name';
      expect(store.getNeededItemsSortBy).toBe('name');
    });
    it('should return default "desc" for neededItemsSortDirection', () => {
      const store = usePreferencesStore();
      expect(store.getNeededItemsSortDirection).toBe('desc');
    });
    it('should return default false for neededItemsHideOwned', () => {
      const store = usePreferencesStore();
      expect(store.getNeededItemsHideOwned).toBe(false);
    });
    it('should return default "expanded" for neededItemsCardStyle', () => {
      const store = usePreferencesStore();
      expect(store.getNeededItemsCardStyle).toBe('expanded');
    });
    it('should return itemsHideNonFIR state for itemsNeededHideNonFIR', () => {
      const store = usePreferencesStore();
      expect(store.itemsNeededHideNonFIR).toBe(false);
      store.itemsHideNonFIR = true;
      expect(store.itemsNeededHideNonFIR).toBe(true);
    });
  });
  describe('Getters - Hide Settings', () => {
    it('should return hideGlobalTasks state', () => {
      const store = usePreferencesStore();
      expect(store.getHideGlobalTasks).toBe(false);
      store.hideGlobalTasks = true;
      expect(store.getHideGlobalTasks).toBe(true);
    });
    it('should return hideNonKappaTasks state', () => {
      const store = usePreferencesStore();
      expect(store.getHideNonKappaTasks).toBe(false);
      store.hideNonKappaTasks = true;
      expect(store.getHideNonKappaTasks).toBe(true);
    });
    it('should return hideCompletedMapObjectives state', () => {
      const store = usePreferencesStore();
      expect(store.getHideCompletedMapObjectives).toBe(false);
      store.hideCompletedMapObjectives = true;
      expect(store.getHideCompletedMapObjectives).toBe(true);
    });
    it('should return default "mediumCard" for null neededitemsStyle', () => {
      const store = usePreferencesStore();
      expect(store.getNeededItemsStyle).toBe('mediumCard');
    });
    it('should return set neededitemsStyle value', () => {
      const store = usePreferencesStore();
      store.neededitemsStyle = 'smallCard';
      expect(store.getNeededItemsStyle).toBe('smallCard');
    });
  });
  describe('Getters - Hideout', () => {
    it('should return default "available" for null hideoutPrimaryView', () => {
      const store = usePreferencesStore();
      expect(store.getHideoutPrimaryView).toBe('available');
    });
    it('should return set hideoutPrimaryView value', () => {
      const store = usePreferencesStore();
      store.hideoutPrimaryView = 'all';
      expect(store.getHideoutPrimaryView).toBe('all');
    });
    it('should return hideoutCollapseCompleted state', () => {
      const store = usePreferencesStore();
      expect(store.getHideoutCollapseCompleted).toBe(false);
      store.hideoutCollapseCompleted = true;
      expect(store.getHideoutCollapseCompleted).toBe(true);
    });
    it('should return hideoutSortReadyFirst state', () => {
      const store = usePreferencesStore();
      expect(store.getHideoutSortReadyFirst).toBe(false);
      store.hideoutSortReadyFirst = true;
      expect(store.getHideoutSortReadyFirst).toBe(true);
    });
    it('should return hideoutRequireStationLevels state with default true', () => {
      const store = usePreferencesStore();
      expect(store.getHideoutRequireStationLevels).toBe(true);
    });
    it('should return hideoutRequireSkillLevels state with default true', () => {
      const store = usePreferencesStore();
      expect(store.getHideoutRequireSkillLevels).toBe(true);
    });
    it('should return hideoutRequireTraderLoyalty state with default true', () => {
      const store = usePreferencesStore();
      expect(store.getHideoutRequireTraderLoyalty).toBe(true);
    });
  });
  describe('Getters - Map Settings', () => {
    it('should return mapZoomSpeed state', () => {
      const store = usePreferencesStore();
      expect(store.getMapZoomSpeed).toBe(1);
      store.mapZoomSpeed = 2;
      expect(store.getMapZoomSpeed).toBe(2);
    });
    it('should return mapPanSpeed state', () => {
      const store = usePreferencesStore();
      expect(store.getMapPanSpeed).toBe(1);
      store.mapPanSpeed = 2;
      expect(store.getMapPanSpeed).toBe(2);
    });
    it('should return normalized map marker colors', () => {
      const store = usePreferencesStore();
      const colors = store.getMapMarkerColors;
      expect(colors.SELF_OBJECTIVE).toBe(MAP_MARKER_COLORS.SELF_OBJECTIVE);
    });
    it('should return custom map marker colors when set', () => {
      const store = usePreferencesStore();
      store.mapMarkerColors = { ...MAP_MARKER_COLORS, SELF_OBJECTIVE: '#custom' };
      expect(store.getMapMarkerColors.SELF_OBJECTIVE).toBe('#custom');
    });
    it('should return showMapExtracts state', () => {
      const store = usePreferencesStore();
      expect(store.getShowMapExtracts).toBe(true);
      store.showMapExtracts = false;
      expect(store.getShowMapExtracts).toBe(false);
    });
  });
  describe('Getters - Task Filters', () => {
    it('should return showNonSpecialTasks state with default true', () => {
      const store = usePreferencesStore();
      expect(store.getShowNonSpecialTasks).toBe(true);
    });
    it('should return showLightkeeperTasks state with default true', () => {
      const store = usePreferencesStore();
      expect(store.getShowLightkeeperTasks).toBe(true);
    });
    it('should return onlyTasksWithRequiredKeys state', () => {
      const store = usePreferencesStore();
      expect(store.getOnlyTasksWithRequiredKeys).toBe(false);
      store.onlyTasksWithRequiredKeys = true;
      expect(store.getOnlyTasksWithRequiredKeys).toBe(true);
    });
    it('should return respectTaskFiltersForImpact state with default true', () => {
      const store = usePreferencesStore();
      expect(store.getRespectTaskFiltersForImpact).toBe(true);
    });
  });
  describe('Getters - Task Appearance', () => {
    it('should return showRequiredLabels state with default true', () => {
      const store = usePreferencesStore();
      expect(store.getShowRequiredLabels).toBe(true);
    });
    it('should return showExperienceRewards state with default true', () => {
      const store = usePreferencesStore();
      expect(store.getShowExperienceRewards).toBe(true);
    });
    it('should return showNextQuests state with default true', () => {
      const store = usePreferencesStore();
      expect(store.getShowNextQuests).toBe(true);
    });
    it('should return showPreviousQuests state with default true', () => {
      const store = usePreferencesStore();
      expect(store.getShowPreviousQuests).toBe(true);
    });
    it('should return taskCardDensity state with default compact', () => {
      const store = usePreferencesStore();
      expect(store.getTaskCardDensity).toBe('compact');
    });
    it('should return enableManualTaskFail state', () => {
      const store = usePreferencesStore();
      expect(store.getEnableManualTaskFail).toBe(false);
    });
    it('should return hideCompletedTaskObjectives state with default true', () => {
      const store = usePreferencesStore();
      expect(store.getHideCompletedTaskObjectives).toBe(true);
    });
  });
  describe('Getters - Task Status Filters', () => {
    it('should return showAllFilter state with default true', () => {
      const store = usePreferencesStore();
      expect(store.getShowAllFilter).toBe(true);
    });
    it('should return showAvailableFilter state with default true', () => {
      const store = usePreferencesStore();
      expect(store.getShowAvailableFilter).toBe(true);
    });
    it('should return showLockedFilter state with default true', () => {
      const store = usePreferencesStore();
      expect(store.getShowLockedFilter).toBe(true);
    });
    it('should return showCompletedFilter state with default true', () => {
      const store = usePreferencesStore();
      expect(store.getShowCompletedFilter).toBe(true);
    });
    it('should return showFailedFilter state with default true', () => {
      const store = usePreferencesStore();
      expect(store.getShowFailedFilter).toBe(true);
    });
  });
  describe('Getters - Other Settings', () => {
    it('should return localeOverride state', () => {
      const store = usePreferencesStore();
      expect(store.getLocaleOverride).toBeNull();
      store.localeOverride = 'de';
      expect(store.getLocaleOverride).toBe('de');
    });
    it('should return useAutomaticLevelCalculation state', () => {
      const store = usePreferencesStore();
      expect(store.getUseAutomaticLevelCalculation).toBe(false);
    });
    it('should return dashboardNoticeDismissed state', () => {
      const store = usePreferencesStore();
      expect(store.getDashboardNoticeDismissed).toBe(false);
    });
    it('should return pinnedTaskIds state', () => {
      const store = usePreferencesStore();
      expect(store.getPinnedTaskIds).toEqual([]);
      store.pinnedTaskIds = ['task-1', 'task-2'];
      expect(store.getPinnedTaskIds).toEqual(['task-1', 'task-2']);
    });
    it('should return taskFilterPresets state', () => {
      const store = usePreferencesStore();
      expect(store.getTaskFilterPresets).toEqual([]);
    });
    it('should return skillSortMode state with default priority', () => {
      const store = usePreferencesStore();
      expect(store.getSkillSortMode).toBe('priority');
    });
  });
  describe('Actions - Streamer Mode', () => {
    it('should set streamer mode', () => {
      const store = usePreferencesStore();
      store.setStreamerMode(true);
      expect(store.streamerMode).toBe(true);
      store.setStreamerMode(false);
      expect(store.streamerMode).toBe(false);
    });
  });
  describe('Actions - Team Visibility', () => {
    it('should toggle team member hidden state', () => {
      const store = usePreferencesStore();
      store.toggleHidden('teammate-1');
      expect(store.teamHide['teammate-1']).toBe(true);
      store.toggleHidden('teammate-1');
      expect(store.teamHide['teammate-1']).toBe(false);
    });
    it('should initialize teamHide if undefined', () => {
      const store = usePreferencesStore();
      store.$patch({ teamHide: undefined } as Partial<PreferencesState>);
      store.toggleHidden('teammate-1');
      expect(store.teamHide).toEqual({ 'teammate-1': true });
    });
    it('should set quest team hide all', () => {
      const store = usePreferencesStore();
      store.setQuestTeamHideAll(true);
      expect(store.taskTeamHideAll).toBe(true);
    });
    it('should set items team hide all', () => {
      const store = usePreferencesStore();
      store.setItemsTeamHideAll(true);
      expect(store.itemsTeamHideAll).toBe(true);
    });
    it('should set items team hide non-FIR', () => {
      const store = usePreferencesStore();
      store.setItemsTeamHideNonFIR(true);
      expect(store.itemsTeamHideNonFIR).toBe(true);
    });
    it('should set items team hide hideout', () => {
      const store = usePreferencesStore();
      store.setItemsTeamHideHideout(true);
      expect(store.itemsTeamHideHideout).toBe(true);
    });
    it('should set map team hide all', () => {
      const store = usePreferencesStore();
      store.setMapTeamHideAll(true);
      expect(store.mapTeamHideAll).toBe(true);
    });
  });
  describe('Actions - Task Views', () => {
    it('should set task primary view', () => {
      const store = usePreferencesStore();
      store.setTaskPrimaryView('maps');
      expect(store.taskPrimaryView).toBe('maps');
    });
    it('should preserve the stored task status when switching to graph', () => {
      const store = usePreferencesStore();
      store.taskSecondaryView = 'locked';
      store.setTaskPrimaryView('graph');
      expect(store.taskPrimaryView).toBe('graph');
      expect(store.taskSecondaryView).toBe('locked');
      expect(store.getTaskSecondaryView).toBe('all');
    });
    it('should set task map view', () => {
      const store = usePreferencesStore();
      store.setTaskMapView('customs');
      expect(store.taskMapView).toBe('customs');
    });
    it('should set task trader view', () => {
      const store = usePreferencesStore();
      store.setTaskTraderView('prapor');
      expect(store.taskTraderView).toBe('prapor');
    });
    it('should set task secondary view with normalization', () => {
      const store = usePreferencesStore();
      store.setTaskSecondaryView('available');
      expect(store.taskSecondaryView).toBe('available');
    });
    it('should restore the saved task status after leaving graph', () => {
      const store = usePreferencesStore();
      store.taskSecondaryView = 'locked';
      store.setTaskPrimaryView('graph');
      store.setTaskPrimaryView('all');
      expect(store.getTaskSecondaryView).toBe('locked');
    });
    it('should set task user view', () => {
      const store = usePreferencesStore();
      store.setTaskUserView('all');
      expect(store.taskUserView).toBe('all');
    });
    it('normalizes invalid task route values before storing them', () => {
      const store = usePreferencesStore();
      store.setTaskPrimaryView('invalid');
      store.setTaskMapView(globalThis.window as unknown as string);
      store.setTaskUserView(globalThis.window as unknown as string);
      expect(store.taskPrimaryView).toBe('all');
      expect(store.taskMapView).toBe('all');
      expect(store.taskUserView).toBe('self');
    });
    it('should set task sort mode with normalization', () => {
      const store = usePreferencesStore();
      store.setTaskSortMode('impact');
      expect(store.taskSortMode).toBe('impact');
    });
    it('should set task sort direction', () => {
      const store = usePreferencesStore();
      store.setTaskSortDirection('asc');
      expect(store.taskSortDirection).toBe('asc');
    });
    it('should set task shared by all only', () => {
      const store = usePreferencesStore();
      store.setTaskSharedByAllOnly(true);
      expect(store.taskSharedByAllOnly).toBe(true);
    });
  });
  describe('Actions - Needed Items', () => {
    it('should set needed type view', () => {
      const store = usePreferencesStore();
      store.setNeededTypeView('tasks');
      expect(store.neededTypeView).toBe('tasks');
    });
    it('should set needed items view mode', () => {
      const store = usePreferencesStore();
      store.setNeededItemsViewMode('list');
      expect(store.neededItemsViewMode).toBe('list');
    });
    it('should set needed items FIR filter', () => {
      const store = usePreferencesStore();
      store.setNeededItemsFirFilter('fir');
      expect(store.neededItemsFirFilter).toBe('fir');
    });
    it('should set needed items group by item', () => {
      const store = usePreferencesStore();
      store.setNeededItemsGroupByItem(true);
      expect(store.neededItemsGroupByItem).toBe(true);
    });
    it('should set needed items hide non-FIR special equipment', () => {
      const store = usePreferencesStore();
      store.setNeededItemsHideNonFirSpecialEquipment(true);
      expect(store.neededItemsHideNonFirSpecialEquipment).toBe(true);
    });
    it('should set needed items kappa only', () => {
      const store = usePreferencesStore();
      store.setNeededItemsKappaOnly(true);
      expect(store.neededItemsKappaOnly).toBe(true);
    });
    it('should set needed items sort by', () => {
      const store = usePreferencesStore();
      store.setNeededItemsSortBy('name');
      expect(store.neededItemsSortBy).toBe('name');
    });
    it('normalizes needed-items route values before storing them', () => {
      const store = usePreferencesStore();
      store.setNeededTypeView({ value: 'hideout' } as unknown as NeededItemsFilterType);
      store.setNeededItemsSortBy({ value: 'count' } as unknown as 'priority');
      store.setNeededItemsSortDirection('invalid' as unknown as 'asc');
      store.setNeededItemsCardStyle('invalid' as unknown as 'compact');
      expect(store.neededTypeView).toBe('hideout');
      expect(store.neededItemsSortBy).toBe('count');
      expect(store.neededItemsSortDirection).toBe('desc');
      expect(store.neededItemsCardStyle).toBe('expanded');
    });
    it('should set needed items sort direction', () => {
      const store = usePreferencesStore();
      store.setNeededItemsSortDirection('asc');
      expect(store.neededItemsSortDirection).toBe('asc');
    });
    it('should set needed items hide owned', () => {
      const store = usePreferencesStore();
      store.setNeededItemsHideOwned(true);
      expect(store.neededItemsHideOwned).toBe(true);
    });
    it('should set needed items card style', () => {
      const store = usePreferencesStore();
      store.setNeededItemsCardStyle('compact');
      expect(store.neededItemsCardStyle).toBe('compact');
    });
    it('should set items needed hide non-FIR with saving state', () => {
      const store = usePreferencesStore();
      store.setItemsNeededHideNonFIR(true);
      expect(store.itemsHideNonFIR).toBe(true);
      expect(store.saving?.itemsNeededHideNonFIR).toBe(true);
    });
    it('should set needed items style', () => {
      const store = usePreferencesStore();
      store.setNeededItemsStyle('smallCard');
      expect(store.neededitemsStyle).toBe('smallCard');
    });
  });
  describe('Actions - Hide Settings', () => {
    it('should set hide global tasks with saving state', () => {
      const store = usePreferencesStore();
      store.setHideGlobalTasks(true);
      expect(store.hideGlobalTasks).toBe(true);
      expect(store.saving?.hideGlobalTasks).toBe(true);
    });
    it('should set hide non-kappa tasks with saving state', () => {
      const store = usePreferencesStore();
      store.setHideNonKappaTasks(true);
      expect(store.hideNonKappaTasks).toBe(true);
      expect(store.saving?.hideNonKappaTasks).toBe(true);
    });
    it('should set hide completed map objectives with saving state', () => {
      const store = usePreferencesStore();
      store.setHideCompletedMapObjectives(true);
      expect(store.hideCompletedMapObjectives).toBe(true);
      expect(store.saving?.hideCompletedMapObjectives).toBe(true);
    });
  });
  describe('Actions - Hideout', () => {
    it('should set hideout primary view', () => {
      const store = usePreferencesStore();
      store.setHideoutPrimaryView('all');
      expect(store.hideoutPrimaryView).toBe('all');
    });
    it('should set hideout collapse completed', () => {
      const store = usePreferencesStore();
      store.setHideoutCollapseCompleted(true);
      expect(store.hideoutCollapseCompleted).toBe(true);
    });
    it('should set hideout sort ready first', () => {
      const store = usePreferencesStore();
      store.setHideoutSortReadyFirst(true);
      expect(store.hideoutSortReadyFirst).toBe(true);
    });
    it('should set hideout require station levels', () => {
      const store = usePreferencesStore();
      store.setHideoutRequireStationLevels(false);
      expect(store.hideoutRequireStationLevels).toBe(false);
    });
    it('should set hideout require skill levels', () => {
      const store = usePreferencesStore();
      store.setHideoutRequireSkillLevels(false);
      expect(store.hideoutRequireSkillLevels).toBe(false);
    });
    it('should set hideout require trader loyalty', () => {
      const store = usePreferencesStore();
      store.setHideoutRequireTraderLoyalty(false);
      expect(store.hideoutRequireTraderLoyalty).toBe(false);
    });
  });
  describe('Actions - Locale', () => {
    it('should set locale override', () => {
      const store = usePreferencesStore();
      store.setLocaleOverride('de');
      expect(store.localeOverride).toBe('de');
    });
    it('should clear locale override with null', () => {
      const store = usePreferencesStore();
      store.localeOverride = 'de';
      store.setLocaleOverride(null);
      expect(store.localeOverride).toBeNull();
    });
  });
  describe('Actions - Task Filters', () => {
    it('should set show non-special tasks', () => {
      const store = usePreferencesStore();
      store.setShowNonSpecialTasks(false);
      expect(store.showNonSpecialTasks).toBe(false);
    });
    it('should set show lightkeeper tasks', () => {
      const store = usePreferencesStore();
      store.setShowLightkeeperTasks(false);
      expect(store.showLightkeeperTasks).toBe(false);
    });
    it('should set only tasks with required keys', () => {
      const store = usePreferencesStore();
      store.setOnlyTasksWithRequiredKeys(true);
      expect(store.onlyTasksWithRequiredKeys).toBe(true);
    });
    it('should set respect task filters for impact', () => {
      const store = usePreferencesStore();
      store.setRespectTaskFiltersForImpact(false);
      expect(store.respectTaskFiltersForImpact).toBe(false);
    });
  });
  describe('Actions - Task Appearance', () => {
    it('should set show required labels', () => {
      const store = usePreferencesStore();
      store.setShowRequiredLabels(false);
      expect(store.showRequiredLabels).toBe(false);
    });
    it('should set show experience rewards', () => {
      const store = usePreferencesStore();
      store.setShowExperienceRewards(false);
      expect(store.showExperienceRewards).toBe(false);
    });
    it('should set show next quests', () => {
      const store = usePreferencesStore();
      store.setShowNextQuests(false);
      expect(store.showNextQuests).toBe(false);
    });
    it('should set show previous quests', () => {
      const store = usePreferencesStore();
      store.setShowPreviousQuests(false);
      expect(store.showPreviousQuests).toBe(false);
    });
    it('should set task card density', () => {
      const store = usePreferencesStore();
      store.setTaskCardDensity('comfortable');
      expect(store.taskCardDensity).toBe('comfortable');
    });
    it('should set enable manual task fail', () => {
      const store = usePreferencesStore();
      store.setEnableManualTaskFail(true);
      expect(store.enableManualTaskFail).toBe(true);
    });
    it('should set hide completed task objectives', () => {
      const store = usePreferencesStore();
      store.setHideCompletedTaskObjectives(false);
      expect(store.hideCompletedTaskObjectives).toBe(false);
    });
  });
  describe('Actions - Task Status Filters', () => {
    it('should set show all filter', () => {
      const store = usePreferencesStore();
      store.setShowAllFilter(false);
      expect(store.showAllFilter).toBe(false);
    });
    it('should set show available filter', () => {
      const store = usePreferencesStore();
      store.setShowAvailableFilter(false);
      expect(store.showAvailableFilter).toBe(false);
    });
    it('should set show locked filter', () => {
      const store = usePreferencesStore();
      store.setShowLockedFilter(false);
      expect(store.showLockedFilter).toBe(false);
    });
    it('should set show completed filter', () => {
      const store = usePreferencesStore();
      store.setShowCompletedFilter(false);
      expect(store.showCompletedFilter).toBe(false);
    });
    it('should set show failed filter', () => {
      const store = usePreferencesStore();
      store.setShowFailedFilter(false);
      expect(store.showFailedFilter).toBe(false);
    });
  });
  describe('Actions - XP and Level', () => {
    it('should set use automatic level calculation', () => {
      const store = usePreferencesStore();
      store.setUseAutomaticLevelCalculation(true);
      expect(store.useAutomaticLevelCalculation).toBe(true);
    });
    it('should set dashboard notice dismissed', () => {
      const store = usePreferencesStore();
      store.setDashboardNoticeDismissed(true);
      expect(store.dashboardNoticeDismissed).toBe(true);
    });
  });
  describe('Actions - Map Settings', () => {
    it('should set show map extracts', () => {
      const store = usePreferencesStore();
      store.setShowMapExtracts(false);
      expect(store.showMapExtracts).toBe(false);
    });
    it('should set map zoom speed with valid value', () => {
      const store = usePreferencesStore();
      store.setMapZoomSpeed(2);
      expect(store.mapZoomSpeed).toBe(2);
    });
    it('should clamp map zoom speed to minimum 0.5', () => {
      const store = usePreferencesStore();
      store.setMapZoomSpeed(0.1);
      expect(store.mapZoomSpeed).toBe(0.5);
    });
    it('should clamp map zoom speed to maximum 3', () => {
      const store = usePreferencesStore();
      store.setMapZoomSpeed(5);
      expect(store.mapZoomSpeed).toBe(3);
    });
    it('should reset map zoom speed to 1 for invalid values', () => {
      const store = usePreferencesStore();
      store.setMapZoomSpeed(NaN);
      expect(store.mapZoomSpeed).toBe(1);
      store.setMapZoomSpeed(Infinity);
      expect(store.mapZoomSpeed).toBe(1);
    });
    it('should set map pan speed with valid value', () => {
      const store = usePreferencesStore();
      store.setMapPanSpeed(2);
      expect(store.mapPanSpeed).toBe(2);
    });
    it('should clamp map pan speed to minimum 0.5', () => {
      const store = usePreferencesStore();
      store.setMapPanSpeed(0.1);
      expect(store.mapPanSpeed).toBe(0.5);
    });
    it('should clamp map pan speed to maximum 3', () => {
      const store = usePreferencesStore();
      store.setMapPanSpeed(5);
      expect(store.mapPanSpeed).toBe(3);
    });
    it('should reset map pan speed to 1 for invalid values', () => {
      const store = usePreferencesStore();
      store.setMapPanSpeed(NaN);
      expect(store.mapPanSpeed).toBe(1);
      store.setMapPanSpeed(Infinity);
      expect(store.mapPanSpeed).toBe(1);
    });
    it('should set map marker color', () => {
      const store = usePreferencesStore();
      store.setMapMarkerColor('SELF_OBJECTIVE', '#ff0000');
      expect(store.mapMarkerColors.SELF_OBJECTIVE).toBe('#ff0000');
    });
    it('should not set map marker color for empty string', () => {
      const store = usePreferencesStore();
      const originalColor = store.mapMarkerColors.SELF_OBJECTIVE;
      store.setMapMarkerColor('SELF_OBJECTIVE', '');
      expect(store.mapMarkerColors.SELF_OBJECTIVE).toBe(originalColor);
    });
    it('should not set map marker color for non-string value', () => {
      const store = usePreferencesStore();
      const originalColor = store.mapMarkerColors.SELF_OBJECTIVE;
      store.setMapMarkerColor('SELF_OBJECTIVE', null as unknown as string);
      expect(store.mapMarkerColors.SELF_OBJECTIVE).toBe(originalColor);
    });
    it('should trim whitespace from map marker color', () => {
      const store = usePreferencesStore();
      store.setMapMarkerColor('SELF_OBJECTIVE', '  #ff0000  ');
      expect(store.mapMarkerColors.SELF_OBJECTIVE).toBe('#ff0000');
    });
    it('should reset map marker colors to defaults', () => {
      const store = usePreferencesStore();
      store.mapMarkerColors.SELF_OBJECTIVE = '#custom';
      store.resetMapMarkerColors();
      expect(store.mapMarkerColors.SELF_OBJECTIVE).toBe(MAP_MARKER_COLORS.SELF_OBJECTIVE);
    });
  });
  describe('Actions - Pinned Tasks', () => {
    it('should add task to pinned list', () => {
      const store = usePreferencesStore();
      store.togglePinnedTask('task-1');
      expect(store.pinnedTaskIds).toContain('task-1');
    });
    it('should remove task from pinned list', () => {
      const store = usePreferencesStore();
      store.pinnedTaskIds = ['task-1'];
      store.togglePinnedTask('task-1');
      expect(store.pinnedTaskIds).not.toContain('task-1');
    });
    it('should handle multiple pinned tasks', () => {
      const store = usePreferencesStore();
      store.togglePinnedTask('task-1');
      store.togglePinnedTask('task-2');
      expect(store.pinnedTaskIds).toEqual(['task-1', 'task-2']);
    });
    it('should initialize pinnedTaskIds if null', () => {
      const store = usePreferencesStore();
      store.$patch({ pinnedTaskIds: undefined });
      store.togglePinnedTask('task-1');
      expect(store.pinnedTaskIds).toContain('task-1');
    });
  });
  describe('Actions - Task Filter Presets', () => {
    const mockPreset: TaskFilterPreset = {
      id: 'preset-1',
      name: 'My Preset',
      settings: {
        taskPrimaryView: 'maps',
        taskMapView: 'customs',
        taskTraderView: 'all',
        taskSecondaryView: 'available',
        taskUserView: 'self',
        taskSortMode: 'impact',
        taskSortDirection: 'desc',
        taskSharedByAllOnly: false,
        hideGlobalTasks: false,
        hideNonKappaTasks: false,
        showNonSpecialTasks: true,
        showLightkeeperTasks: true,
        onlyTasksWithRequiredKeys: false,
        respectTaskFiltersForImpact: true,
        showAllFilter: true,
        showAvailableFilter: true,
        showLockedFilter: true,
        showCompletedFilter: true,
        showFailedFilter: true,
      },
    };
    it('should add new task filter preset', () => {
      const store = usePreferencesStore();
      store.addTaskFilterPreset(mockPreset);
      expect(store.taskFilterPresets).toHaveLength(1);
      expect(store.taskFilterPresets[0]).toEqual(mockPreset);
    });
    it('should update existing task filter preset', () => {
      const store = usePreferencesStore();
      store.addTaskFilterPreset(mockPreset);
      const updatedPreset = { ...mockPreset, name: 'Updated Preset' };
      store.addTaskFilterPreset(updatedPreset);
      expect(store.taskFilterPresets).toHaveLength(1);
      expect(store.taskFilterPresets[0]?.name).toBe('Updated Preset');
    });
    it('should remove task filter preset', () => {
      const store = usePreferencesStore();
      store.addTaskFilterPreset(mockPreset);
      store.removeTaskFilterPreset('preset-1');
      expect(store.taskFilterPresets).toHaveLength(0);
    });
    it('should handle removing non-existent preset', () => {
      const store = usePreferencesStore();
      store.addTaskFilterPreset(mockPreset);
      store.removeTaskFilterPreset('non-existent');
      expect(store.taskFilterPresets).toHaveLength(1);
    });
    it('should handle removing preset from undefined array', () => {
      const store = usePreferencesStore();
      store.$patch({ taskFilterPresets: undefined });
      store.removeTaskFilterPreset('preset-1');
      expect(store.taskFilterPresets).toBeUndefined();
    });
    it('should initialize taskFilterPresets if undefined when adding', () => {
      const store = usePreferencesStore();
      store.$patch({ taskFilterPresets: undefined });
      store.addTaskFilterPreset(mockPreset);
      expect(store.taskFilterPresets).toHaveLength(1);
    });
  });
  describe('Actions - Skills', () => {
    it('should set skill sort mode', () => {
      const store = usePreferencesStore();
      store.setSkillSortMode('ingame');
      expect(store.skillSortMode).toBe('ingame');
    });
  });
  describe('Edge Cases - Nullish State Values', () => {
    it('should handle nullish streamerMode in getter', () => {
      const store = usePreferencesStore();
      store.$patch({ streamerMode: undefined } as Partial<PreferencesState>);
      expect(store.getStreamerMode).toBe(false);
    });
    it('should handle nullish taskTeamHideAll in getter', () => {
      const store = usePreferencesStore();
      store.$patch({ taskTeamHideAll: undefined } as Partial<PreferencesState>);
      expect(store.taskTeamAllHidden).toBe(false);
    });
    it('should handle nullish itemsTeamHideAll in getter', () => {
      const store = usePreferencesStore();
      store.$patch({ itemsTeamHideAll: undefined } as Partial<PreferencesState>);
      expect(store.itemsTeamAllHidden).toBe(false);
    });
    it('should handle nullish mapTeamHideAll in getter', () => {
      const store = usePreferencesStore();
      store.$patch({ mapTeamHideAll: undefined } as Partial<PreferencesState>);
      expect(store.mapTeamAllHidden).toBe(false);
    });
    it('should handle nullish teamHide in teamIsHidden getter', () => {
      const store = usePreferencesStore();
      store.$patch({ teamHide: undefined } as Partial<PreferencesState>);
      expect(store.teamIsHidden('teammate-1')).toBe(false);
    });
    it('should handle nullish pinnedTaskIds in getter', () => {
      const store = usePreferencesStore();
      store.$patch({ pinnedTaskIds: undefined });
      expect(store.getPinnedTaskIds).toEqual([]);
    });
    it('should handle nullish taskFilterPresets in getter', () => {
      const store = usePreferencesStore();
      store.$patch({ taskFilterPresets: undefined });
      expect(store.getTaskFilterPresets).toEqual([]);
    });
    it('should handle nullish mapMarkerColors in getter', () => {
      const store = usePreferencesStore();
      store.$patch({ mapMarkerColors: undefined });
      const colors = store.getMapMarkerColors;
      expect(colors).toEqual(MAP_MARKER_COLORS);
    });
    it('should handle invalid mapMarkerColors type in getter', () => {
      const store = usePreferencesStore();
      store.$patch({ mapMarkerColors: 'invalid' as unknown as undefined });
      const colors = store.getMapMarkerColors;
      expect(colors).toEqual(MAP_MARKER_COLORS);
    });
  });
  describe('Reactive Updates', () => {
    it('should update getter when state changes', () => {
      const store = usePreferencesStore();
      expect(store.getStreamerMode).toBe(false);
      store.streamerMode = true;
      expect(store.getStreamerMode).toBe(true);
    });
    it('should reflect team visibility changes immediately', () => {
      const store = usePreferencesStore();
      expect(store.teamIsHidden('teammate-1')).toBe(false);
      store.taskTeamHideAll = true;
      expect(store.teamIsHidden('teammate-1')).toBe(true);
    });
    it('should reflect sort direction changes based on sort mode', () => {
      const store = usePreferencesStore();
      store.taskSortMode = 'impact';
      expect(store.getTaskSortDirection).toBe('desc');
      store.taskSortMode = 'alphabetical';
      store.taskSortDirection = null;
      expect(store.getTaskSortDirection).toBe('asc');
    });
  });
  describe('preferencesDefaultState Export', () => {
    it('should export correct default state structure', () => {
      expect(preferencesDefaultState).toBeDefined();
      expect(preferencesDefaultState.streamerMode).toBe(false);
      expect(preferencesDefaultState.taskTeamHideAll).toBe(false);
      expect(preferencesDefaultState.showNonSpecialTasks).toBe(true);
      expect(preferencesDefaultState.taskCardDensity).toBe('compact');
    });
    it('should have saving state in default state', () => {
      expect(preferencesDefaultState.saving).toBeDefined();
      expect(preferencesDefaultState.saving?.streamerMode).toBe(false);
    });
  });
});
