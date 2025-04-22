// These functions are used in both the Pinia store and API to access the store, and ensure that both systems update the store in the same way.

// Define interfaces for the state structure
interface TaskObjective {
  count?: number;
  complete?: boolean;
  timestamp?: number;
}

interface TaskCompletion {
  complete?: boolean;
  failed?: boolean;
  timestamp?: number;
}

interface HideoutPart {
  count?: number;
  complete?: boolean;
  timestamp?: number;
}

interface HideoutModule {
  complete?: boolean;
  timestamp?: number;
}

export interface UserState {
  level: number;
  gameEdition: number; // Assuming number represents edition ID
  pmcFaction: 'USEC' | 'BEAR'; // Use union type for specific factions
  displayName: string | null;
  taskObjectives: { [objectiveId: string]: TaskObjective };
  taskCompletions: { [taskId: string]: TaskCompletion };
  hideoutParts: { [objectiveId: string]: HideoutPart };
  hideoutModules: { [hideoutId: string]: HideoutModule };
}

// The default state to use for new stores
export const defaultState: UserState = {
  level: 1,
  gameEdition: 1,
  pmcFaction: 'USEC',
  displayName: null,
  taskObjectives: {},
  taskCompletions: {},
  hideoutParts: {},
  hideoutModules: {},
};

// Type definition for Getter functions (State as first arg, returns specific type)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Getter<S, R = any, Args extends any[] = any[]> = (
  state: S
) => (...args: Args) => R;
// Type definition for Action functions (this context is State, accepts args, returns void)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Action<S, Args extends any[] = any[]> = (this: S, ...args: Args) => void;

// Define types for the specific getters and actions based on UserState
export interface UserGetters {
  // Add index signature to satisfy _GettersTree
  [key: string]: Getter<UserState, any, any>;

  // Existing specific getters
  playerLevel: Getter<UserState, number>;
  getGameEdition: Getter<UserState, number>;
  getPMCFaction: Getter<UserState, 'USEC' | 'BEAR'>;
  getDisplayName: Getter<UserState, string | null>;
  getObjectiveCount: Getter<UserState, number, [string]>;
  getHideoutPartCount: Getter<UserState, number, [string]>;
  isTaskComplete: Getter<UserState, boolean, [string]>;
  isTaskFailed: Getter<UserState, boolean, [string]>;
  isTaskObjectiveComplete: Getter<UserState, boolean, [string]>;
  isHideoutPartComplete: Getter<UserState, boolean, [string]>;
  isHideoutModuleComplete: Getter<UserState, boolean, [string]>;
}

export interface UserActions {
  incrementLevel: Action<UserState>;
  decrementLevel: Action<UserState>;
  setLevel: Action<UserState, [number]>;
  setGameEdition: Action<UserState, [number]>;
  setPMCFaction: Action<UserState, ['USEC' | 'BEAR']>;
  setDisplayName: Action<UserState, [string | null]>;
  setObjectiveCount: Action<UserState, [string, number]>;
  setHideoutPartCount: Action<UserState, [string, number]>;
  setTaskComplete: Action<UserState, [string]>;
  setTaskFailed: Action<UserState, [string]>;
  setTaskUncompleted: Action<UserState, [string]>;
  setTaskObjectiveComplete: Action<UserState, [string]>;
  setTaskObjectiveUncomplete: Action<UserState, [string]>;
  toggleTaskObjectiveComplete: Action<UserState, [string]>;
  setHideoutPartComplete: Action<UserState, [string]>;
  setHideoutPartUncomplete: Action<UserState, [string]>; // Added missing uncomplete action
  toggleHideoutPartComplete: Action<UserState, [string]>; // Added missing toggle action
  setHideoutModuleComplete: Action<UserState, [string]>;
  setHideoutModuleUncomplete: Action<UserState, [string]>;
  toggleHideoutModuleComplete: Action<UserState, [string]>; // Added missing toggle action
}

// Getters are for reading store state in a uniform manner
export const getters: UserGetters = {
  // State getters
  playerLevel(state) {
    return () => state.level ?? 1;
  },

  getGameEdition(state) {
    return () => state.gameEdition ?? 1;
  },

  getPMCFaction(state) {
    return () => state.pmcFaction ?? 'USEC';
  },

  getDisplayName(state) {
    // If an empty string, return null
    return () =>
      state.displayName === '' ? null : (state.displayName ?? null);
  },

  getObjectiveCount(state) {
    return (objectiveId) => state?.taskObjectives?.[objectiveId]?.count ?? 0;
  },

  getHideoutPartCount(state) {
    return (objectiveId) => state?.hideoutParts?.[objectiveId]?.count ?? 0;
  },

  // Check if a specific task is completed
  isTaskComplete(state) {
    return (taskId) => state?.taskCompletions?.[taskId]?.complete ?? false;
  },

  isTaskFailed(state) {
    return (taskId) => state?.taskCompletions?.[taskId]?.failed ?? false;
  },

  // Check if a specific task objective is completed
  isTaskObjectiveComplete(state) {
    return (objectiveId) =>
      state?.taskObjectives?.[objectiveId]?.complete ?? false;
  },

  // Check if a specific hideout part is completed
  isHideoutPartComplete(state) {
    return (objectiveId) =>
      state?.hideoutParts?.[objectiveId]?.complete ?? false;
  },

  // Check if a specific hideout objective is completed
  isHideoutModuleComplete(state) {
    return (hideoutId) => state?.hideoutModules?.[hideoutId]?.complete ?? false;
  },
};

// Actions are for mutations and setters
export const actions: UserActions = {
  incrementLevel() {
    if (this.level) {
      this.level++;
    } else {
      this.level = 2;
    }
  },

  decrementLevel() {
    if (this.level && this.level > 1) {
      // Ensure level doesn't go below 1
      this.level--;
    } else {
      this.level = 1;
    }
  },

  setLevel(level) {
    this.level = level > 0 ? level : 1; // Ensure level is positive
  },

  setGameEdition(edition) {
    this.gameEdition = edition;
  },

  setPMCFaction(faction) {
    this.pmcFaction = faction;
  },

  setDisplayName(name) {
    if (typeof name === 'string') {
      this.displayName = name;
    } else {
      this.displayName = null;
    }
  },

  setObjectiveCount(objectiveId, count) {
    if (!this.taskObjectives) {
      this.taskObjectives = {};
    }
    this.taskObjectives[objectiveId] = {
      ...(this.taskObjectives[objectiveId] || {}), // Preserve existing properties if any
      count: count >= 0 ? count : 0, // Ensure count is non-negative
    };
  },

  setHideoutPartCount(objectiveId, count) {
    if (!this.hideoutParts) {
      this.hideoutParts = {};
    }
    this.hideoutParts[objectiveId] = {
      ...(this.hideoutParts[objectiveId] || {}), // Preserve existing properties
      count: count >= 0 ? count : 0, // Ensure count is non-negative
    };
  },

  // Set a task as complete
  setTaskComplete(taskId) {
    if (!this.taskCompletions) {
      this.taskCompletions = {};
    }
    this.taskCompletions[taskId] = {
      ...(this.taskCompletions[taskId] || {}), // Preserve existing properties
      complete: true,
      failed: false, // Ensure failed is false when completing
      timestamp: Date.now(),
    };
  },

  setTaskFailed(taskId) {
    if (!this.taskCompletions) {
      this.taskCompletions = {};
    }
    this.taskCompletions[taskId] = {
      ...(this.taskCompletions[taskId] || {}), // Preserve existing properties
      complete: true, // Typically failed tasks are also considered 'complete' in terms of progression
      failed: true,
      timestamp: Date.now(),
    };
  },

  setTaskUncompleted(taskId) {
    if (!this.taskCompletions) {
      this.taskCompletions = {};
    }
    this.taskCompletions[taskId] = {
      ...(this.taskCompletions[taskId] || {}),
      complete: false,
      failed: false,
      // Consider whether to keep or remove timestamp
    };
  },

  // Set a task objective as complete
  setTaskObjectiveComplete(objectiveId) {
    if (!this.taskObjectives) {
      this.taskObjectives = {};
    }
    this.taskObjectives[objectiveId] = {
      ...(this.taskObjectives[objectiveId] || {}),
      complete: true,
      timestamp: Date.now(),
    };
  },

  setTaskObjectiveUncomplete(objectiveId) {
    if (!this.taskObjectives) {
      this.taskObjectives = {};
    }
    this.taskObjectives[objectiveId] = {
      ...(this.taskObjectives[objectiveId] || {}),
      complete: false,
    };
  },

  toggleTaskObjectiveComplete(objectiveId) {
    // Need to use the getter function correctly - getters return functions
    const objectiveCompleteGetter = getters.isTaskObjectiveComplete(this);
    if (objectiveCompleteGetter(objectiveId)) {
      // Call action explicitly, passing the correct 'this' context
      actions.setTaskObjectiveUncomplete.call(this, objectiveId);
    } else {
      actions.setTaskObjectiveComplete.call(this, objectiveId);
    }
  },

  // Set a hideout part as complete
  setHideoutPartComplete(objectiveId) {
    if (!this.hideoutParts) {
      this.hideoutParts = {};
    }
    this.hideoutParts[objectiveId] = {
      ...(this.hideoutParts[objectiveId] || {}),
      complete: true,
      timestamp: Date.now(),
    };
  },

  // Added missing action
  setHideoutPartUncomplete(objectiveId) {
    if (!this.hideoutParts) {
      this.hideoutParts = {};
    }
    this.hideoutParts[objectiveId] = {
      ...(this.hideoutParts[objectiveId] || {}),
      complete: false,
    };
  },

  // Added missing action
  toggleHideoutPartComplete(objectiveId) {
    const partCompleteGetter = getters.isHideoutPartComplete(this);
    if (partCompleteGetter(objectiveId)) {
      // Call action explicitly, passing the correct 'this' context
      actions.setHideoutPartUncomplete.call(this, objectiveId);
    } else {
      actions.setHideoutPartComplete.call(this, objectiveId);
    }
  },

  // Set a hideout module as complete
  setHideoutModuleComplete(hideoutId) {
    if (!this.hideoutModules) {
      this.hideoutModules = {};
    }
    this.hideoutModules[hideoutId] = {
      ...(this.hideoutModules[hideoutId] || {}),
      complete: true,
      timestamp: Date.now(),
    };
  },

  setHideoutModuleUncomplete(hideoutId) {
    if (!this.hideoutModules) {
      this.hideoutModules = {};
    }
    this.hideoutModules[hideoutId] = {
      ...(this.hideoutModules[hideoutId] || {}),
      complete: false,
    };
  },

  // Added missing action
  toggleHideoutModuleComplete(hideoutId) {
    const moduleCompleteGetter = getters.isHideoutModuleComplete(this);
    if (moduleCompleteGetter(hideoutId)) {
      // Call action explicitly, passing the correct 'this' context
      actions.setHideoutModuleUncomplete.call(this, hideoutId);
    } else {
      actions.setHideoutModuleComplete.call(this, hideoutId);
    }
  },
};
