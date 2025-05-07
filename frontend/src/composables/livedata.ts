import { computed, ref, watch, Ref, ComputedRef } from 'vue';
import type { Store, StateTree } from 'pinia';
import type { UserState } from '@/shared_state';

// Typed teammateStores for Pinia best practices
export const teammateStores: Ref<Record<string, Store<string, UserState>>> =
  ref({});
import { fireuser, firestore } from '@/plugins/firebase';
import {
  doc,
  collection,
  onSnapshot,
  DocumentReference,
  Unsubscribe,
  DocumentData,
  Firestore,
} from 'firebase/firestore';
import {
  defineStore,
  storeToRefs,
  _GettersTree,
  DefineStoreOptions,
  _ActionsTree,
} from 'pinia';
import {
  getters,
  actions,
  defaultState,
  UserGetters,
  UserActions,
} from '@/shared_state';
import { useUserStore } from '@/stores/user';

const firedb: Firestore = firestore;

interface SystemState extends StateTree {
  tokens?: string[];
  team?: string | null;
}

interface SystemGetters extends _GettersTree<SystemState> {
  userTokens: (state: SystemState) => string[];
  userTokenCount: (state: SystemState) => number;
  userTeam: (state: SystemState) => string | null;
  userTeamIsOwn: (state: SystemState) => boolean;
}

const useSystemStore = defineStore<string, SystemState, SystemGetters>(
  'system',
  {
    state: (): SystemState => ({}),
    getters: {
      userTokens(state) {
        return state?.tokens || [];
      },
      userTokenCount(state) {
        return state?.tokens?.length || 0;
      },
      userTeam(state) {
        // console.debug(
        //   `[livedata.ts] systemStore.userTeam GETTER CALLED. state.team is:`,
        //   state.team,
        //   `(returning: ${state?.team || null})`
        // );
        return state?.team || null;
      },
      userTeamIsOwn(state) {
        return state?.team == fireuser?.uid || false;
      },
    },
  }
);

const systemStore = useSystemStore();
const userStore = useUserStore();

const systemRef: ComputedRef<DocumentReference<DocumentData> | null> = computed(
  () => {
    if (fireuser.loggedIn) {
      return doc(collection(firedb, 'system'), fireuser.uid as string);
    } else {
      return null;
    }
  }
);

const systemUnsubscribe: Ref<Unsubscribe | null> = ref(null);

function clearState(store: Store, newState?: DocumentData | {}): void {
  try {
    const currentState = store.$state;
    const missingProperties = Object.keys(currentState).filter((key) => {
      if (typeof newState === 'undefined') return true;
      try {
        let missingKey = !Object.prototype.hasOwnProperty.call(newState, key);
        return missingKey;
      } catch (error) {
        console.error(error);
        return true;
      }
    });
    const missingPropertiesObject = missingProperties.reduce(
      (acc, key) => {
        acc[key] = null;
        return acc;
      },
      {} as { [key: string]: any }
    );
    store.$patch(missingPropertiesObject);
  } catch (error) {
    console.error(error);
  }
}

function startStoreWatcher(
  store: Store,
  refToWatch: ComputedRef<DocumentReference<DocumentData> | null>,
  unsubscribe: Ref<Unsubscribe | null>
): () => void {
  return watch(
    refToWatch,
    async (newRef) => {
      if (newRef) {
        if (unsubscribe?.value) {
          // console.debug('Unsubscribing from', store.$id);
          unsubscribe.value();
          clearState(store, {});
        }
        // console.debug(`Ref changed to ${newRef.path} for ${store.$id}`);
        unsubscribe.value = onSnapshot(
          newRef,
          (snapshot) => {
            // console.debug(
            //   `[livedata.ts] ${store.$id} data changed. Raw snapshot data:`,
            //   JSON.parse(JSON.stringify(snapshot.data() || {}))
            // );
            const snapshotData = snapshot.data();
            if (snapshotData) {
              if (store.$id === 'team') {
                console.log(
                  '[livedata][startStoreWatcher/teamStore] Snapshot received. snapshotData.members:',
                  JSON.parse(JSON.stringify(snapshotData.members || null))
                );
                // It's tricky to get $state reliably before patch for a specific sub-property
                // if the store.$state itself might be initially undefined or different structure.
                // Let's log the whole state.
                console.log(
                  '[livedata][startStoreWatcher/teamStore] teamStore.$state BEFORE patch:',
                  JSON.parse(JSON.stringify(store.$state))
                );
              }
              store.$patch(snapshotData);
              if (store.$id === 'team') {
                const teamStateAfterPatch = store.$state as TeamState;
                console.log(
                  '[livedata][startStoreWatcher/teamStore] teamStore.$state.members AFTER patch:',
                  JSON.parse(
                    JSON.stringify(teamStateAfterPatch.members || null)
                  )
                );
                console.log(
                  '[livedata][startStoreWatcher/teamStore] teamStore.$state AFTER patch (full):',
                  JSON.parse(JSON.stringify(teamStateAfterPatch))
                );
              }
              clearState(store, snapshotData);
            } else {
              // console.debug(
              //   `[livedata.ts] ${store.$id} received empty snapshot data.`
              // );
              clearState(store, {});
            }
          },
          (error: any) => {
            // Consider using a more specific error type if available
            if (error.code == 'permission-denied' && unsubscribe.value) {
              // console.debug(
              //   'Unsubscribing from',
              //   store.$id,
              //   'due to permission denied'
              // );
              unsubscribe.value();
              clearState(store, {});
            }
          }
        );
      } else {
        if (unsubscribe?.value) {
          // console.debug('Unsubscribing from', store.$id);
          unsubscribe.value();
        }
        // console.debug(`Ref changed to null for ${store.$id}`);
        clearState(store, {});
      }
    },
    { immediate: true }
  );
}

startStoreWatcher(systemStore, systemRef, systemUnsubscribe);

const teamRef: ComputedRef<DocumentReference<DocumentData> | null> = computed(
  () => {
    const currentSystemStateTeam = systemStore.$state.team; // Read raw state
    // console.debug(
    //   '[livedata.ts] teamRef computed. fireuser.loggedIn:',
    //   fireuser.loggedIn,
    //   'systemStore.$state.team:',
    //   currentSystemStateTeam
    // );
    if (fireuser.loggedIn) {
      if (currentSystemStateTeam && typeof currentSystemStateTeam == 'string') {
        // Use raw state
        // console.debug(
        //   '[livedata.ts] Team ref now points to team:' + currentSystemStateTeam
        // );
        return doc(collection(firedb, 'team'), currentSystemStateTeam);
      } else {
        // console.debug(
        //   '[livedata.ts] Team ref now null (no currentSystemStateTeam or not a string).'
        // );
        return null;
      }
    } else {
      // console.debug('[livedata.ts] Team ref now null (user not logged in).');
      return null;
    }
  }
);

const teamUnsubscribe: Ref<Unsubscribe | null> = ref(null);

interface TeamState extends StateTree {
  owner?: string | null;
  password?: string | null;
  members?: string[];
}

interface TeamGetters extends _GettersTree<TeamState> {
  teamOwner: (state: TeamState) => string | null;
  isOwner: (state: TeamState) => boolean;
  teamPassword: (state: TeamState) => string | null;
  teamMembers: (state: TeamState) => string[];
  teammates: (state: TeamState) => string[];
}

const useTeamStore = defineStore<string, TeamState, TeamGetters>('team', {
  state: (): TeamState => {
    return {};
  },
  getters: {
    teamOwner(state) {
      return state?.owner || null;
    },
    isOwner(state) {
      return state?.owner == fireuser?.uid || false;
    },
    teamPassword(state) {
      return state?.password || null;
    },
    teamMembers(state) {
      const members = state?.members || [];
      return members;
    },
    teammates(state) {
      const currentMembers = state?.members;
      const currentFireUID = fireuser?.uid;
      console.log(
        '[livedata][teammates getter] Called. state.members:',
        JSON.parse(JSON.stringify(currentMembers || [])),
        'fireuser.uid:',
        currentFireUID
      );

      let result: string[];
      if (currentMembers) {
        result = currentMembers.filter((member) => member !== currentFireUID);
      } else {
        result = [];
      }
      console.log(
        '[livedata][teammates getter] Returning:',
        JSON.parse(JSON.stringify(result))
      );
      return result;
    },
  },
});

const teamStore = useTeamStore();
startStoreWatcher(teamStore, teamRef, teamUnsubscribe);

const teammateUnsubscribes: Ref<{ [key: string]: Unsubscribe }> = ref({});
// teammateStores is now declared and exported at the top of the file for global use

const { teammates } = storeToRefs(teamStore);

watch(
  () => teamStore.$state, // Watch the entire $state object
  async (newState, oldState) => {
    // Parameters change to reflect watching $state
    // We need to manually get the newTeammates from newState.members
    const newFireUID = fireuser?.uid;
    const newTeammatesArray =
      newState.members?.filter((member: string) => member !== newFireUID) || [];
    const oldTeammatesArray =
      oldState?.members?.filter((member: string) => member !== newFireUID) ||
      [];

    console.log(
      '[livedata] teammates watcher (watching $state) triggered. New state members:',
      JSON.parse(JSON.stringify(newState.members || [])),
      'Old state members:',
      JSON.parse(JSON.stringify(oldState?.members || [])),
      'Derived newTeammatesArray:',
      JSON.parse(JSON.stringify(newTeammatesArray)),
      'Current teammateStores keys:',
      JSON.parse(JSON.stringify(Object.keys(teammateStores.value)))
    );

    // Remove any teammates that are no longer in the team
    for (const teammate of Object.keys(teammateStores.value)) {
      if (!newTeammatesArray.includes(teammate)) {
        console.debug('Removing teammate', teammate);
        if (teammateUnsubscribes.value[teammate]) {
          teammateUnsubscribes.value[teammate]();
          delete teammateUnsubscribes.value[teammate]; // Clean up unsubscribe ref
        }
        delete teammateStores.value[teammate];
      }
    }
    // Add any new teammates
    try {
      if (Array.isArray(newTeammatesArray)) {
        for (const teammate of newTeammatesArray) {
          // Check if teammate store already exists before creating
          if (!teammateStores.value[teammate]) {
            console.debug('Adding teammate', teammate);
            // Use imported types for defineStore
            const storeDefinition = defineStore<
              `teammate-${string}`,
              UserState,
              UserGetters,
              UserActions
            >(`teammate-${teammate}`, {
              state: (): UserState => JSON.parse(JSON.stringify(defaultState)),
              getters: getters, // Use imported getters directly
              actions: actions, // Use imported actions directly
            });
            // Instantiate the store and add it to the ref
            teammateStores.value[teammate] = storeDefinition();

            teammateUnsubscribes.value[teammate] = onSnapshot(
              doc(firedb, 'progress', teammate),
              (memberDocSnapshot) => {
                const storeId = teammateStores.value[teammate]?.$id; // e.g., teammate-UID
                const teammateStoreInstance = teammateStores.value[teammate];

                if (!teammateStoreInstance) {
                  console.warn(
                    `[livedata][teammateStore:${teammate}] Store instance not found during snapshot for progress/${teammate}. This should not happen if store was just created.`
                  );
                  return;
                }

                const firestoreDocData = memberDocSnapshot.data();
                const docExists = memberDocSnapshot.exists();

                console.log(
                  // Using console.log for higher visibility
                  `[livedata][${storeId}] SNAPSHOT for progress/${teammate}. Exists: ${docExists}. Raw Firestore Data:`,
                  JSON.parse(JSON.stringify(firestoreDocData || {}))
                );
                console.log(
                  `[livedata][${storeId}] Store state BEFORE patch:`,
                  JSON.parse(JSON.stringify(teammateStoreInstance.$state))
                );

                if (docExists && firestoreDocData) {
                  // Document exists and has data
                  teammateStoreInstance.$patch(firestoreDocData);
                } else if (docExists && !firestoreDocData) {
                  // Document exists but data() returned undefined/null (edge case, Firestore usually returns {} for empty doc if it exists)
                  console.warn(
                    `[livedata][${storeId}] Document progress/${teammate} exists but data is empty. Patching defaultState.`
                  );
                  teammateStoreInstance.$patch(
                    JSON.parse(JSON.stringify(defaultState))
                  );
                } else {
                  // Document does not exist
                  console.log(
                    `[livedata][${storeId}] Document progress/${teammate} does not exist. Patching defaultState.`
                  );
                  teammateStoreInstance.$patch(
                    JSON.parse(JSON.stringify(defaultState))
                  );
                }

                console.log(
                  `[livedata][${storeId}] Store state AFTER patch:`,
                  JSON.parse(JSON.stringify(teammateStoreInstance.$state))
                );
              },
              (error: any) => {
                // Consider using a more specific error type
                if (
                  error.code == 'permission-denied' &&
                  teammateUnsubscribes.value[teammate]
                ) {
                  console.debug(
                    'Unsubscribing from',
                    teammateStores.value[teammate]?.$id,
                    'due to permission denied'
                  );
                  teammateUnsubscribes.value[teammate]();
                  delete teammateUnsubscribes.value[teammate]; // Clean up unsubscribe ref
                  // Optionally remove the store as well if unsubscribed due to permissions
                  // delete teammateStores.value[teammate];
                }
              }
            );
          }
        }
      }
    } catch (error) {
      console.error(error);
    }
  },
  {
    immediate: true,
    deep: true,
  }
);

interface ProgressGetters extends _GettersTree<any> {
  // Define more specific state if possible
  getDisplayName: (state: any) => (teamId: string) => string;
  getLevel: (state: any) => (teamId: string) => number;
  getTeamIndex: (state: any) => (teamId: string) => string;
}

interface ProgressState extends StateTree {
  // Define state properties if needed, otherwise use 'any' or '{}'
}

const getTarkovStore = () => {
  return require('@/stores/tarkov').useTarkovStore();
};

const useProgressStore = defineStore('progress', () => {
  // Use getTarkovStore instead of direct import
  const teamStores = computed(() => {
    let stores: { [key: string]: Store<string, UserState> } = {};
    stores['self'] = getTarkovStore() as Store<string, UserState>; // Use the function
    for (const teammate of Object.keys(teammateStores.value)) {
      if (teammateStores.value[teammate]) {
        stores[teammate] = teammateStores.value[teammate];
      }
    }
    return stores;
  });

  const visibleTeamStores = computed(() => {
    let visibleStores: { [key: string]: Store<string, UserState> } = {};
    Object.entries(teamStores.value).forEach(([teamId, store]) => {
      // Assuming userStore has a method teamIsHidden
      if (!userStore.teamIsHidden(teamId)) {
        visibleStores[teamId] = store;
      }
    });
    return visibleStores;
  });

  const getTeamIndex = (teamId: string): string => {
    if (teamId == fireuser?.uid) {
      return 'self';
    } else {
      return teamId;
    }
  };

  const getDisplayName = (teamId: string): string => {
    const storeKey = getTeamIndex(teamId);
    const store = teamStores.value[storeKey];
    // Use optional chaining and nullish coalescing safely
    // Accessing $state.displayName is now type-safe due to UserState
    return store?.$state?.displayName ?? teamId.substring(0, 6);
  };

  const getLevel = (teamId: string): number => {
    const storeKey = getTeamIndex(teamId);
    const store = teamStores.value[storeKey];
    // Use optional chaining and nullish coalescing safely
    // Accessing $state.level is now type-safe due to UserState (assuming level is the correct property)
    return store?.$state?.level ?? 1; // Changed from playerLevel to level based on UserState
  };

  // Return the state, getters, and actions
  // Note: Pinia setup stores typically return an object with state properties,
  // computed refs, and methods directly.
  return {
    // Expose computed properties and methods
    teamStores,
    visibleTeamStores,
    getDisplayName,
    getTeamIndex,
    getLevel,
    // No explicit state properties defined here, relies on computed/methods
  };
});

export function useLiveData() {
  return {
    useTeamStore,
    useSystemStore,
    useProgressStore,
    teammateStores, // Exposing the Ref directly
  };
}
