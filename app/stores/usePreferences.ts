import { defineStore } from 'pinia';
import 'pinia-plugin-persistedstate';
import { logger } from '@/utils/logger';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import { normalizeSecondaryView, normalizeSortMode } from '@/utils/taskFilterNormalization';
import {
  MAP_MARKER_COLORS,
  normalizeMapMarkerColors,
  type MapMarkerColorKey,
  type MapMarkerColors,
} from '@/utils/theme-colors';
import type {
  NeededItemsFirFilter,
  NeededItemsFilterType,
} from '@/features/neededitems/neededitems-constants';
import type { TaskPrimaryView, TaskSecondaryView } from '@/types/taskFilter';
import type { TaskSortDirection, TaskSortMode } from '@/types/taskSort';
import type { SkillSortMode } from '@/utils/constants';
export type TaskFilterSettings = {
  taskPrimaryView: TaskPrimaryView | null;
  taskMapView: string | null;
  taskTraderView: string | null;
  taskSecondaryView: TaskSecondaryView | null;
  taskUserView: string | null;
  taskSortMode: TaskSortMode | null;
  taskSortDirection: TaskSortDirection | null;
  taskSharedByAllOnly: boolean;
  hideGlobalTasks: boolean;
  hideNonKappaTasks: boolean;
  showNonSpecialTasks: boolean;
  showLightkeeperTasks: boolean;
  onlyTasksWithRequiredKeys: boolean;
  respectTaskFiltersForImpact: boolean;
  showAllFilter: boolean;
  showAvailableFilter: boolean;
  showLockedFilter: boolean;
  showCompletedFilter: boolean;
  showFailedFilter: boolean;
};
export type TaskFilterPreset = {
  id: string;
  name: string;
  settings: TaskFilterSettings;
};
// Define the state structure
export interface PreferencesState {
  streamerMode: boolean;
  teamHide: Record<string, boolean>;
  taskTeamHideAll: boolean;
  itemsTeamHideAll: boolean;
  itemsTeamHideNonFIR: boolean;
  itemsTeamHideHideout: boolean;
  mapTeamHideAll: boolean;
  taskPrimaryView: string | null;
  taskMapView: string | null;
  taskTraderView: string | null;
  taskSecondaryView: string | null;
  taskUserView: string | null;
  taskSortMode: TaskSortMode | null;
  taskSortDirection: TaskSortDirection | null;
  taskSharedByAllOnly: boolean;
  neededTypeView: NeededItemsFilterType | null;
  neededItemsViewMode: 'list' | 'grid' | null;
  neededItemsFirFilter: NeededItemsFirFilter | null;
  neededItemsGroupByItem: boolean;
  neededItemsHideNonFirSpecialEquipment: boolean;
  neededItemsKappaOnly: boolean;
  neededItemsSortBy: 'priority' | 'name' | 'category' | 'count' | null;
  neededItemsSortDirection: 'asc' | 'desc' | null;
  neededItemsHideOwned: boolean;
  neededItemsCardStyle: 'compact' | 'expanded' | null;
  itemsHideNonFIR: boolean;
  hideGlobalTasks: boolean;
  hideNonKappaTasks: boolean;
  hideCompletedMapObjectives: boolean;
  neededitemsStyle: string | null;
  hideoutPrimaryView?: string | null;
  hideoutCollapseCompleted: boolean;
  hideoutSortReadyFirst: boolean;
  hideoutRequireStationLevels: boolean;
  hideoutRequireSkillLevels: boolean;
  hideoutRequireTraderLoyalty: boolean;
  localeOverride: string | null;
  // Task filter settings
  showNonSpecialTasks: boolean;
  showLightkeeperTasks: boolean;
  onlyTasksWithRequiredKeys: boolean;
  respectTaskFiltersForImpact: boolean;
  // Task appearance settings
  showRequiredLabels: boolean;
  showExperienceRewards: boolean;
  showNextQuests: boolean;
  showPreviousQuests: boolean;
  taskCardDensity: 'comfortable' | 'compact';
  enableManualTaskFail: boolean;
  hideCompletedTaskObjectives: boolean;
  showAllFilter: boolean;
  showAvailableFilter: boolean;
  showLockedFilter: boolean;
  showCompletedFilter: boolean;
  showFailedFilter: boolean;
  // XP and Level settings
  useAutomaticLevelCalculation: boolean;
  dashboardNoticeDismissed: boolean;
  // Map display settings
  showMapExtracts: boolean;
  mapMarkerColors: MapMarkerColors;
  mapZoomSpeed: number;
  mapPanSpeed: number;
  pinnedTaskIds: string[];
  // Skills settings
  skillSortMode: SkillSortMode | null;
  taskFilterPresets: TaskFilterPreset[];
  saving?: {
    streamerMode: boolean;
    hideGlobalTasks: boolean;
    hideNonKappaTasks: boolean;
    hideCompletedMapObjectives: boolean;
    itemsNeededHideNonFIR: boolean;
  };
}
// Export the default state with type annotation
export const preferencesDefaultState: PreferencesState = {
  streamerMode: false,
  teamHide: {},
  taskTeamHideAll: false,
  itemsTeamHideAll: false,
  itemsTeamHideNonFIR: false,
  itemsTeamHideHideout: false,
  mapTeamHideAll: false,
  taskPrimaryView: null,
  taskMapView: null,
  taskTraderView: null,
  taskSecondaryView: null,
  taskUserView: null,
  taskSortMode: null,
  taskSortDirection: null,
  taskSharedByAllOnly: false,
  neededTypeView: null,
  neededItemsViewMode: null,
  neededItemsFirFilter: null,
  neededItemsGroupByItem: false,
  neededItemsHideNonFirSpecialEquipment: false,
  neededItemsKappaOnly: false,
  neededItemsSortBy: 'priority',
  neededItemsSortDirection: 'desc',
  neededItemsHideOwned: false,
  neededItemsCardStyle: 'expanded',
  itemsHideNonFIR: false,
  hideGlobalTasks: false,
  hideNonKappaTasks: false,
  hideCompletedMapObjectives: false,
  neededitemsStyle: null,
  hideoutPrimaryView: null,
  hideoutCollapseCompleted: false,
  hideoutSortReadyFirst: false,
  hideoutRequireStationLevels: true,
  hideoutRequireSkillLevels: true,
  hideoutRequireTraderLoyalty: true,
  localeOverride: null,
  // Task filter settings (all shown by default)
  showNonSpecialTasks: true,
  showLightkeeperTasks: true,
  onlyTasksWithRequiredKeys: false,
  respectTaskFiltersForImpact: true,
  // Task appearance settings
  showRequiredLabels: true,
  showExperienceRewards: true,
  showNextQuests: true,
  showPreviousQuests: true,
  taskCardDensity: 'compact',
  enableManualTaskFail: false,
  hideCompletedTaskObjectives: true,
  showAllFilter: true,
  showAvailableFilter: true,
  showLockedFilter: true,
  showCompletedFilter: true,
  showFailedFilter: true,
  // XP and Level settings
  useAutomaticLevelCalculation: false,
  dashboardNoticeDismissed: false,
  // Map display settings
  showMapExtracts: true,
  mapMarkerColors: { ...MAP_MARKER_COLORS },
  mapZoomSpeed: 1,
  mapPanSpeed: 1,
  pinnedTaskIds: [],
  // Skills settings
  skillSortMode: null,
  taskFilterPresets: [],
  saving: {
    streamerMode: false,
    hideGlobalTasks: false,
    hideNonKappaTasks: false,
    hideCompletedMapObjectives: false,
    itemsNeededHideNonFIR: false,
  },
};
// Per-toggle saving state (not persisted)
const initialSavingState = {
  streamerMode: false,
  hideGlobalTasks: false,
  hideNonKappaTasks: false,
  hideCompletedMapObjectives: false,
  itemsNeededHideNonFIR: false,
};
export const usePreferencesStore = defineStore('preferences', {
  state: (): PreferencesState => {
    const state = structuredClone(preferencesDefaultState);
    if (import.meta.client) {
      try {
        const rawPersistedState = localStorage.getItem(STORAGE_KEYS.preferences);
        if (rawPersistedState) {
          const persistedState = JSON.parse(rawPersistedState) as Record<string, unknown>;
          if (
            typeof persistedState.onlyTasksWithRequiredKeys !== 'boolean' &&
            typeof persistedState.onlyTasksWithSuggestedKeys === 'boolean'
          ) {
            state.onlyTasksWithRequiredKeys = persistedState.onlyTasksWithSuggestedKeys;
          }
        }
      } catch (_error) {
        logger.warn('[PreferencesStore] Failed to migrate local required keys preference:', _error);
      }
    }
    // Always reset saving state on store creation
    state.saving = { ...initialSavingState };
    return state;
  },
  getters: {
    getStreamerMode(state) {
      return state.streamerMode ?? false;
    },
    teamIsHidden: (state) => {
      return (teamId: string): boolean => {
        // Always show self unless explicitly hidden (though self shouldn't be hidden usually)
        // But definitely don't let "Hide All" hide self
        if (teamId === 'self') {
          return state.teamHide?.[teamId] || false;
        }
        const isHidden = state.taskTeamHideAll || state.teamHide?.[teamId] || false;
        if (isHidden) {
          logger.debug('[PreferencesStore] Teammate is hidden:', {
            teamId,
            taskTeamHideAll: state.taskTeamHideAll,
            individuallyHidden: state.teamHide?.[teamId],
          });
        }
        return isHidden;
      };
    },
    taskTeamAllHidden: (state) => {
      return state.taskTeamHideAll ?? false;
    },
    itemsTeamAllHidden: (state) => {
      return state.itemsTeamHideAll ?? false;
    },
    itemsTeamNonFIRHidden: (state) => {
      return state.itemsTeamHideAll || state.itemsTeamHideNonFIR || false;
    },
    itemsTeamHideoutHidden: (state) => {
      return state.itemsTeamHideAll || state.itemsTeamHideHideout || false;
    },
    mapTeamAllHidden: (state) => {
      return state.mapTeamHideAll ?? false;
    },
    // Add default values for views using nullish coalescing
    getTaskPrimaryView: (state) => {
      return state.taskPrimaryView ?? 'all';
    },
    getTaskMapView: (state) => {
      return state.taskMapView ?? 'all';
    },
    getTaskTraderView: (state) => {
      return state.taskTraderView ?? 'all';
    },
    getTaskSecondaryView: (state) => {
      return normalizeSecondaryView(state.taskSecondaryView ?? 'available');
    },
    getTaskUserView: (state) => {
      return state.taskUserView ?? 'self';
    },
    getTaskSortMode: (state) => {
      return normalizeSortMode(state.taskSortMode ?? 'impact');
    },
    getTaskSortDirection: (state) => {
      const sortMode = state.taskSortMode ?? 'impact';
      return state.taskSortDirection ?? (sortMode === 'impact' ? 'desc' : 'asc');
    },
    getTaskSharedByAllOnly: (state) => {
      return state.taskSharedByAllOnly ?? false;
    },
    getNeededTypeView: (state) => {
      return state.neededTypeView ?? 'all';
    },
    getNeededItemsViewMode: (state) => {
      return state.neededItemsViewMode ?? 'grid';
    },
    getNeededItemsFirFilter: (state) => {
      return state.neededItemsFirFilter ?? 'all';
    },
    getNeededItemsGroupByItem: (state) => {
      return state.neededItemsGroupByItem ?? false;
    },
    getNeededItemsHideNonFirSpecialEquipment: (state) => {
      return state.neededItemsHideNonFirSpecialEquipment ?? false;
    },
    getNeededItemsKappaOnly: (state) => {
      return state.neededItemsKappaOnly ?? false;
    },
    getNeededItemsSortBy: (state) => {
      return state.neededItemsSortBy ?? 'priority';
    },
    getNeededItemsSortDirection: (state) => {
      return state.neededItemsSortDirection ?? 'desc';
    },
    getNeededItemsHideOwned: (state) => {
      return state.neededItemsHideOwned ?? false;
    },
    getNeededItemsCardStyle: (state) => {
      return state.neededItemsCardStyle ?? 'expanded';
    },
    itemsNeededHideNonFIR: (state) => {
      return state.itemsHideNonFIR ?? false;
    },
    getHideGlobalTasks: (state) => {
      return state.hideGlobalTasks ?? false;
    },
    getHideNonKappaTasks: (state) => {
      return state.hideNonKappaTasks ?? false;
    },
    getHideCompletedMapObjectives: (state) => {
      return state.hideCompletedMapObjectives ?? false;
    },
    getNeededItemsStyle: (state) => {
      return state.neededitemsStyle ?? 'mediumCard';
    },
    getHideoutPrimaryView: (state) => {
      return state.hideoutPrimaryView ?? 'available';
    },
    getHideoutCollapseCompleted: (state) => {
      return state.hideoutCollapseCompleted ?? false;
    },
    getHideoutSortReadyFirst: (state) => {
      return state.hideoutSortReadyFirst ?? false;
    },
    getHideoutRequireStationLevels: (state) => {
      return state.hideoutRequireStationLevels ?? true;
    },
    getHideoutRequireSkillLevels: (state) => {
      return state.hideoutRequireSkillLevels ?? true;
    },
    getHideoutRequireTraderLoyalty: (state) => {
      return state.hideoutRequireTraderLoyalty ?? true;
    },
    getMapZoomSpeed: (state) => {
      return state.mapZoomSpeed ?? 1;
    },
    getMapPanSpeed: (state) => {
      return state.mapPanSpeed ?? 1;
    },
    getLocaleOverride: (state) => {
      return state.localeOverride ?? null;
    },
    // Task filter getters
    getShowNonSpecialTasks: (state) => {
      return state.showNonSpecialTasks ?? true;
    },
    getShowLightkeeperTasks: (state) => {
      return state.showLightkeeperTasks ?? true;
    },
    getOnlyTasksWithRequiredKeys: (state) => {
      return state.onlyTasksWithRequiredKeys ?? false;
    },
    getRespectTaskFiltersForImpact: (state) => {
      return state.respectTaskFiltersForImpact ?? true;
    },
    // Task appearance getters
    getShowRequiredLabels: (state) => {
      return state.showRequiredLabels ?? true;
    },
    getShowExperienceRewards: (state) => {
      return state.showExperienceRewards ?? true;
    },
    getShowNextQuests: (state) => {
      return state.showNextQuests ?? true;
    },
    getShowPreviousQuests: (state) => {
      return state.showPreviousQuests ?? true;
    },
    getTaskCardDensity: (state) => {
      return state.taskCardDensity ?? 'compact';
    },
    getEnableManualTaskFail: (state) => {
      return state.enableManualTaskFail ?? false;
    },
    getHideCompletedTaskObjectives: (state) => {
      return state.hideCompletedTaskObjectives ?? true;
    },
    getShowAllFilter: (state) => {
      return state.showAllFilter ?? true;
    },
    getShowAvailableFilter: (state) => {
      return state.showAvailableFilter ?? true;
    },
    getShowLockedFilter: (state) => {
      return state.showLockedFilter ?? true;
    },
    getShowCompletedFilter: (state) => {
      return state.showCompletedFilter ?? true;
    },
    getShowFailedFilter: (state) => {
      return state.showFailedFilter ?? true;
    },
    getUseAutomaticLevelCalculation: (state) => {
      return state.useAutomaticLevelCalculation ?? false;
    },
    getDashboardNoticeDismissed: (state) => {
      return state.dashboardNoticeDismissed ?? false;
    },
    // Map display getters
    getShowMapExtracts: (state) => {
      return state.showMapExtracts ?? true;
    },
    getMapMarkerColors: (state) => {
      return normalizeMapMarkerColors(state.mapMarkerColors);
    },
    getPinnedTaskIds: (state) => {
      return state.pinnedTaskIds ?? [];
    },
    getTaskFilterPresets: (state) => {
      return state.taskFilterPresets ?? [];
    },
    // Skills getters
    getSkillSortMode: (state) => {
      return state.skillSortMode ?? 'priority';
    },
  },
  actions: {
    setStreamerMode(mode: boolean) {
      this.streamerMode = mode;
    },
    toggleHidden(teamId: string) {
      if (!this.teamHide) {
        this.teamHide = {};
      }
      this.teamHide[teamId] = !this.teamHide[teamId];
    },
    setQuestTeamHideAll(hide: boolean) {
      this.taskTeamHideAll = hide;
    },
    setItemsTeamHideAll(hide: boolean) {
      this.itemsTeamHideAll = hide;
    },
    setItemsTeamHideNonFIR(hide: boolean) {
      this.itemsTeamHideNonFIR = hide;
    },
    setItemsTeamHideHideout(hide: boolean) {
      this.itemsTeamHideHideout = hide;
    },
    setMapTeamHideAll(hide: boolean) {
      this.mapTeamHideAll = hide;
    },
    setTaskPrimaryView(view: string) {
      this.taskPrimaryView = view;
    },
    setMapZoomSpeed(speed: number) {
      if (!Number.isFinite(speed)) {
        this.mapZoomSpeed = 1;
        return;
      }
      const clamped = Math.min(3, Math.max(0.5, speed));
      this.mapZoomSpeed = clamped;
    },
    setMapPanSpeed(speed: number) {
      if (!Number.isFinite(speed)) {
        this.mapPanSpeed = 1;
        return;
      }
      const clamped = Math.min(3, Math.max(0.5, speed));
      this.mapPanSpeed = clamped;
    },
    setTaskMapView(view: string) {
      this.taskMapView = view;
    },
    setTaskTraderView(view: string) {
      this.taskTraderView = view;
    },
    setTaskSecondaryView(view: string) {
      this.taskSecondaryView = normalizeSecondaryView(view);
    },
    setTaskUserView(view: string) {
      this.taskUserView = view;
    },
    setTaskSortMode(mode: TaskSortMode) {
      this.taskSortMode = normalizeSortMode(mode);
    },
    setTaskSortDirection(direction: TaskSortDirection) {
      this.taskSortDirection = direction;
    },
    setTaskSharedByAllOnly(enabled: boolean) {
      this.taskSharedByAllOnly = enabled;
    },
    setNeededTypeView(view: NeededItemsFilterType) {
      this.neededTypeView = view;
    },
    setNeededItemsViewMode(mode: 'list' | 'grid') {
      this.neededItemsViewMode = mode;
    },
    setNeededItemsFirFilter(filter: NeededItemsFirFilter) {
      this.neededItemsFirFilter = filter;
    },
    setNeededItemsGroupByItem(groupBy: boolean) {
      this.neededItemsGroupByItem = groupBy;
    },
    setNeededItemsHideNonFirSpecialEquipment(hide: boolean) {
      this.neededItemsHideNonFirSpecialEquipment = hide;
    },
    setNeededItemsKappaOnly(kappaOnly: boolean) {
      this.neededItemsKappaOnly = kappaOnly;
    },
    setNeededItemsSortBy(sortBy: 'priority' | 'name' | 'category' | 'count') {
      this.neededItemsSortBy = sortBy;
    },
    setNeededItemsSortDirection(direction: 'asc' | 'desc') {
      this.neededItemsSortDirection = direction;
    },
    setNeededItemsHideOwned(hide: boolean) {
      this.neededItemsHideOwned = hide;
    },
    setNeededItemsCardStyle(style: 'compact' | 'expanded') {
      this.neededItemsCardStyle = style;
    },
    setItemsNeededHideNonFIR(hide: boolean) {
      this.itemsHideNonFIR = hide;
      // Persistence handled automatically by plugin
      this.saving = this.saving ?? { ...initialSavingState };
      this.saving.itemsNeededHideNonFIR = true;
    },
    setHideGlobalTasks(hide: boolean) {
      this.hideGlobalTasks = hide;
      // Persistence handled automatically by plugin
      this.saving = this.saving ?? { ...initialSavingState };
      this.saving.hideGlobalTasks = true;
    },
    setHideNonKappaTasks(hide: boolean) {
      this.hideNonKappaTasks = hide;
      // Persistence handled automatically by plugin
      this.saving = this.saving ?? { ...initialSavingState };
      this.saving.hideNonKappaTasks = true;
    },
    setHideCompletedMapObjectives(hide: boolean) {
      this.hideCompletedMapObjectives = hide;
      // Persistence handled automatically by plugin
      this.saving = this.saving ?? { ...initialSavingState };
      this.saving.hideCompletedMapObjectives = true;
    },
    setNeededItemsStyle(style: string) {
      this.neededitemsStyle = style;
    },
    setHideoutPrimaryView(view: string) {
      this.hideoutPrimaryView = view;
    },
    setHideoutCollapseCompleted(enabled: boolean) {
      this.hideoutCollapseCompleted = enabled;
    },
    setHideoutSortReadyFirst(enabled: boolean) {
      this.hideoutSortReadyFirst = enabled;
    },
    setHideoutRequireStationLevels(enabled: boolean) {
      this.hideoutRequireStationLevels = enabled;
    },
    setHideoutRequireSkillLevels(enabled: boolean) {
      this.hideoutRequireSkillLevels = enabled;
    },
    setHideoutRequireTraderLoyalty(enabled: boolean) {
      this.hideoutRequireTraderLoyalty = enabled;
    },
    setLocaleOverride(locale: string | null) {
      this.localeOverride = locale;
    },
    // Task filter actions
    setShowNonSpecialTasks(show: boolean) {
      this.showNonSpecialTasks = show;
    },
    setShowLightkeeperTasks(show: boolean) {
      this.showLightkeeperTasks = show;
    },
    setOnlyTasksWithRequiredKeys(onlyWithRequiredKeys: boolean) {
      this.onlyTasksWithRequiredKeys = onlyWithRequiredKeys;
    },
    setRespectTaskFiltersForImpact(enabled: boolean) {
      this.respectTaskFiltersForImpact = enabled;
    },
    // Task appearance actions
    setShowRequiredLabels(show: boolean) {
      this.showRequiredLabels = show;
    },
    setShowExperienceRewards(show: boolean) {
      this.showExperienceRewards = show;
    },
    setShowNextQuests(show: boolean) {
      this.showNextQuests = show;
    },
    setShowPreviousQuests(show: boolean) {
      this.showPreviousQuests = show;
    },
    setTaskCardDensity(density: 'comfortable' | 'compact') {
      this.taskCardDensity = density;
    },
    setEnableManualTaskFail(enable: boolean) {
      this.enableManualTaskFail = enable;
    },
    setHideCompletedTaskObjectives(hide: boolean) {
      this.hideCompletedTaskObjectives = hide;
    },
    setShowAllFilter(show: boolean) {
      this.showAllFilter = show;
    },
    setShowAvailableFilter(show: boolean) {
      this.showAvailableFilter = show;
    },
    setShowLockedFilter(show: boolean) {
      this.showLockedFilter = show;
    },
    setShowCompletedFilter(show: boolean) {
      this.showCompletedFilter = show;
    },
    setShowFailedFilter(show: boolean) {
      this.showFailedFilter = show;
    },
    setUseAutomaticLevelCalculation(use: boolean) {
      this.useAutomaticLevelCalculation = use;
    },
    setDashboardNoticeDismissed(dismissed: boolean) {
      this.dashboardNoticeDismissed = dismissed;
    },
    // Map display actions
    setShowMapExtracts(show: boolean) {
      this.showMapExtracts = show;
    },
    setMapMarkerColor(key: MapMarkerColorKey, color: string) {
      if (typeof color !== 'string' || color.trim().length === 0) return;
      this.mapMarkerColors = {
        ...this.getMapMarkerColors,
        [key]: color.trim(),
      };
    },
    resetMapMarkerColors() {
      this.mapMarkerColors = { ...MAP_MARKER_COLORS };
    },
    togglePinnedTask(taskId: string) {
      const current = this.pinnedTaskIds ?? [];
      const index = current.indexOf(taskId);
      if (index === -1) {
        this.pinnedTaskIds = [...current, taskId];
      } else {
        this.pinnedTaskIds = current.filter((id) => id !== taskId);
      }
    },
    addTaskFilterPreset(preset: TaskFilterPreset) {
      this.taskFilterPresets ??= [];
      const existingIndex = this.taskFilterPresets.findIndex(
        (existing) => existing.id === preset.id
      );
      if (existingIndex !== -1) {
        this.taskFilterPresets = this.taskFilterPresets.map((existing) =>
          existing.id === preset.id ? preset : existing
        );
        return;
      }
      this.taskFilterPresets = [...this.taskFilterPresets, preset];
    },
    removeTaskFilterPreset(id: string) {
      if (!this.taskFilterPresets) return;
      this.taskFilterPresets = this.taskFilterPresets.filter((p) => p.id !== id);
    },
    // Skills actions
    setSkillSortMode(mode: SkillSortMode) {
      this.skillSortMode = mode;
    },
  },
  // Enable automatic localStorage persistence
  persist: {
    key: STORAGE_KEYS.preferences, // LocalStorage key for user preference data
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    // Use serializer instead of paths for selective persistence
    serializer: {
      serialize: JSON.stringify,
      deserialize: JSON.parse,
    },
    // Pick specific properties to persist (excluding transient state)
    pick: [
      'streamerMode',
      'teamHide',
      'taskTeamHideAll',
      'itemsTeamHideAll',
      'itemsTeamHideNonFIR',
      'itemsTeamHideHideout',
      'mapTeamHideAll',
      'taskPrimaryView',
      'taskMapView',
      'taskTraderView',
      'taskSecondaryView',
      'taskUserView',
      'taskSortMode',
      'taskSortDirection',
      'taskSharedByAllOnly',
      'neededTypeView',
      'neededItemsViewMode',
      'neededItemsFirFilter',
      'neededItemsGroupByItem',
      'neededItemsHideNonFirSpecialEquipment',
      'neededItemsKappaOnly',
      'neededItemsSortBy',
      'neededItemsSortDirection',
      'neededItemsHideOwned',
      'neededItemsCardStyle',
      'itemsHideNonFIR',
      'hideGlobalTasks',
      'hideNonKappaTasks',
      'hideCompletedMapObjectives',
      'neededitemsStyle',
      'hideoutPrimaryView',
      'localeOverride',
      // Task filter settings
      'showNonSpecialTasks',
      'showLightkeeperTasks',
      'onlyTasksWithRequiredKeys',
      'respectTaskFiltersForImpact',
      // Task appearance settings
      'showRequiredLabels',
      'showExperienceRewards',
      'showNextQuests',
      'showPreviousQuests',
      'taskCardDensity',
      'enableManualTaskFail',
      'hideCompletedTaskObjectives',
      'showAllFilter',
      'showAvailableFilter',
      'showLockedFilter',
      'showCompletedFilter',
      'showFailedFilter',
      'useAutomaticLevelCalculation',
      'dashboardNoticeDismissed',
      'hideoutCollapseCompleted',
      'hideoutSortReadyFirst',
      'hideoutRequireStationLevels',
      'hideoutRequireSkillLevels',
      'hideoutRequireTraderLoyalty',
      'showMapExtracts',
      'mapMarkerColors',
      'mapZoomSpeed',
      'mapPanSpeed',
      'pinnedTaskIds',
      'taskFilterPresets',
      'skillSortMode',
    ],
  },
});
export type PreferencesStore = ReturnType<typeof usePreferencesStore>;
export type { TaskSortDirection, TaskSortMode } from '@/types/taskSort';
