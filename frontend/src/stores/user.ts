import { fireuser } from '@/plugins/firebase'; // Assuming fireuser has appropriate types or use any
import { defineStore, type StoreDefinition } from 'pinia';
import { watch } from 'vue';
import pinia from '@/plugins/pinia'; // Assuming pinia export is typed correctly

// Define the state structure
interface UserState {
  allTipsHidden: boolean;
  hideTips: Record<string, boolean>; // Map of tipKey to hidden status
  streamerMode: boolean;
  teamHide: Record<string, boolean>; // Map of teamId to hidden status
  taskTeamHideAll: boolean;
  itemsTeamHideAll: boolean;
  itemsTeamHideNonFIR: boolean;
  itemsTeamHideHideout: boolean;
  mapTeamHideAll: boolean;
  taskPrimaryView: string | null; // Assuming view types are strings, adjust if needed
  taskMapView: string | null;
  taskTraderView: string | null;
  taskSecondaryView: string | null;
  taskUserView: string | null;
  neededTypeView: string | null;
  itemsHideNonFIR: boolean;
  hideGlobalTasks: boolean;
  hideNonKappaTasks: boolean;
  neededitemsStyle: string | null; // Assuming style is a string, adjust if needed
  hideoutPrimaryView?: string | null; // Added optional hideoutPrimaryView based on getter/setter
}

// Export the default state with type annotation
export const defaultState: UserState = {
  allTipsHidden: false,
  hideTips: {},
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
  neededTypeView: null,
  itemsHideNonFIR: false,
  hideGlobalTasks: false,
  hideNonKappaTasks: false,
  neededitemsStyle: null,
  hideoutPrimaryView: null, // Initialize the optional property
};

// Define getter types (adjust return types as needed)
type UserGetters = {
  showTip: (state: UserState) => (tipKey: string) => boolean;
  hiddenTipCount: (state: UserState) => number;
  hideAllTips: (state: UserState) => boolean;
  getStreamerMode: (state: UserState) => boolean;
  teamIsHidden: (state: UserState) => (teamId: string) => boolean;
  taskTeamAllHidden: (state: UserState) => boolean;
  itemsTeamAllHidden: (state: UserState) => boolean;
  itemsTeamNonFIRHidden: (state: UserState) => boolean;
  itemsTeamHideoutHidden: (state: UserState) => boolean;
  mapTeamAllHidden: (state: UserState) => boolean;
  getTaskPrimaryView: (state: UserState) => string;
  getTaskMapView: (state: UserState) => string;
  getTaskTraderView: (state: UserState) => string;
  getTaskSecondaryView: (state: UserState) => string;
  getTaskUserView: (state: UserState) => string;
  getNeededTypeView: (state: UserState) => string;
  itemsNeededHideNonFIR: (state: UserState) => boolean;
  getHideGlobalTasks: (state: UserState) => boolean;
  getHideNonKappaTasks: (state: UserState) => boolean;
  getNeededItemsStyle: (state: UserState) => string;
  getHideoutPrimaryView: (state: UserState) => string;
};

// Define action types
type UserActions = {
  hideTip(tipKey: string): void;
  unhideTips(): void;
  enableHideAllTips(): void;
  setStreamerMode(mode: boolean): void;
  toggleHidden(teamId: string): void;
  setQuestTeamHideAll(hide: boolean): void;
  setItemsTeamHideAll(hide: boolean): void;
  setItemsTeamHideNonFIR(hide: boolean): void;
  setItemsTeamHideHideout(hide: boolean): void;
  setMapTeamHideAll(hide: boolean): void;
  setTaskPrimaryView(view: string): void;
  setTaskMapView(view: string): void;
  setTaskTraderView(view: string): void;
  setTaskSecondaryView(view: string): void;
  setTaskUserView(view: string): void;
  setNeededTypeView(view: string): void;
  setItemsNeededHideNonFIR(hide: boolean): void;
  setHideGlobalTasks(hide: boolean): void;
  setHideNonKappaTasks(hide: boolean): void;
  setNeededItemsStyle(style: string): void;
  setHideoutPrimaryView(view: string): void;
};

// Define the Fireswap configuration type
interface FireswapConfig {
  path: string;
  document: string;
  debouncems: number;
  localKey: string;
}

// Define the store type including the fireswap property
interface UserStoreDefinition
  extends StoreDefinition<
    'swapUser',
    UserState,
    UserGetters,
    UserActions & { fireswap?: FireswapConfig[] } // Add fireswap here
  > {
  fireswap?: FireswapConfig[];
}

export const useUserStore: UserStoreDefinition = defineStore('swapUser', {
  state: (): UserState => JSON.parse(JSON.stringify(defaultState)),
  getters: {
    showTip: (state) => {
      return (tipKey: string): boolean =>
        !state.allTipsHidden && !state.hideTips?.[tipKey];
    },
    hiddenTipCount: (state) => {
      // Ensure hideTips exists before getting keys
      return state.hideTips ? Object.keys(state.hideTips).length : 0;
    },
    hideAllTips: (state) => {
      return state.allTipsHidden ?? false; // Use nullish coalescing
    },
    getStreamerMode(state) {
      return state.streamerMode ?? false;
    },
    teamIsHidden: (state) => {
      return (teamId: string): boolean =>
        state.taskTeamHideAll || state.teamHide?.[teamId] || false;
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
      return state.taskSecondaryView ?? 'available';
    },
    getTaskUserView: (state) => {
      return state.taskUserView ?? 'all';
    },
    getNeededTypeView: (state) => {
      return state.neededTypeView ?? 'all';
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
    getNeededItemsStyle: (state) => {
      return state.neededitemsStyle ?? 'mediumCard';
    },
    getHideoutPrimaryView: (state) => {
      // Use optional chaining and nullish coalescing for safety
      return state.hideoutPrimaryView ?? 'available';
    },
  },
  actions: {
    // Implement actions matching UserActions type
    hideTip(tipKey: string) {
      // Ensure hideTips object exists
      if (!this.hideTips) {
        this.hideTips = {};
      }
      this.hideTips[tipKey] = true;
    },
    unhideTips() {
      this.hideTips = {};
      this.allTipsHidden = false;
    },
    enableHideAllTips() {
      this.allTipsHidden = true;
    },
    setStreamerMode(mode: boolean) {
      this.streamerMode = mode;
    },
    toggleHidden(teamId: string) {
      if (!this.teamHide) {
        this.teamHide = {};
      }
      // Toggle the boolean value
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
    setTaskMapView(view: string) {
      this.taskMapView = view;
    },
    setTaskTraderView(view: string) {
      this.taskTraderView = view;
    },
    setTaskSecondaryView(view: string) {
      this.taskSecondaryView = view;
    },
    setTaskUserView(view: string) {
      this.taskUserView = view;
    },
    setNeededTypeView(view: string) {
      this.neededTypeView = view;
    },
    setItemsNeededHideNonFIR(hide: boolean) {
      this.itemsHideNonFIR = hide;
    },
    setHideGlobalTasks(hide: boolean) {
      this.hideGlobalTasks = hide;
    },
    setHideNonKappaTasks(hide: boolean) {
      this.hideNonKappaTasks = hide;
    },
    setNeededItemsStyle(style: string) {
      this.neededitemsStyle = style;
    },
    setHideoutPrimaryView(view: string) {
      this.hideoutPrimaryView = view;
    },
  },
}) as UserStoreDefinition;

// Add fireswap config after definition
useUserStore.fireswap = [
  {
    path: '.',
    document: 'user/{uid}',
    debouncems: 250,
    localKey: 'user',
  },
];

// Watch for fireuser state changing and bind/unbind
watch(
  () => fireuser.loggedIn,
  (newValue: boolean) => {
    try {
      // Ensure pinia instance is available and correctly typed
      const userStore = useUserStore(pinia);

      // Check if firebindAll/fireunbindAll exist before calling
      const canBind = typeof (userStore as any).firebindAll === 'function';
      const canUnbind = typeof (userStore as any).fireunbindAll === 'function';

      if (newValue) {
        if (canBind) {
          (userStore as any).firebindAll();
        } else {
        }
      } else {
        if (canUnbind) {
          (userStore as any).fireunbindAll();
        }
      }
    } catch (error) {
      // Handle cases where pinia or userStore might not be ready
    }
  },
  { immediate: true }
);
