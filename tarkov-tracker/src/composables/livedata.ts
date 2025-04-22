import { computed, ref, watch, Ref, ComputedRef } from 'vue';
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
  Store,
  StateTree,
  _GettersTree,
  DefineStoreOptions,
  _ActionsTree,
} from 'pinia';
import {
  getters,
  actions,
  defaultState,
  UserState,
  UserGetters,
  UserActions,
} from '@/shared_state';
import { useTarkovStore } from '@/stores/tarkov';
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
          console.debug('Unsubscribing from', store.$id);
          unsubscribe.value();
          clearState(store, {});
        }
        console.debug(`Ref changed to ${newRef.path} for ${store.$id}`);
        unsubscribe.value = onSnapshot(
          newRef,
          (snapshot) => {
            console.debug(`${store.$id} data changed`);
            const snapshotData = snapshot.data();
            if (snapshotData) {
              store.$patch(snapshotData);
              clearState(store, snapshotData);
            } else {
              clearState(store, {});
            }
          },
          (error: any) => {
            // Consider using a more specific error type if available
            if (error.code == 'permission-denied' && unsubscribe.value) {
              console.debug(
                'Unsubscribing from',
                store.$id,
                'due to permission denied'
              );
              unsubscribe.value();
              clearState(store, {});
            }
          }
        );
      } else {
        if (unsubscribe?.value) {
          console.debug('Unsubscribing from', store.$id);
          unsubscribe.value();
        }
        console.debug(`Ref changed to null for ${store.$id}`);
        clearState(store, {});
      }
    },
    { immediate: true }
  );
}

startStoreWatcher(systemStore, systemRef, systemUnsubscribe);

const teamRef: ComputedRef<DocumentReference<DocumentData> | null> = computed(
  () => {
    if (fireuser.loggedIn) {
      if (systemStore.userTeam && typeof systemStore.userTeam == 'string') {
        console.debug('Team ref now ' + systemStore.userTeam);
        return doc(collection(firedb, 'team'), systemStore.userTeam);
      } else {
        console.debug('Team ref now null');
        return null;
      }
    } else {
      console.debug('Team ref now null');
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
      return state?.members || [];
    },
    teammates(state) {
      if (state?.members) {
        return state.members.filter((member) => {
          return member != fireuser?.uid;
        });
      } else {
        return [];
      }
    },
  },
});

const teamStore = useTeamStore();
startStoreWatcher(teamStore, teamRef, teamUnsubscribe);

const teammateUnsubscribes: Ref<{ [key: string]: Unsubscribe }> = ref({});
const teammateStores: Ref<{
  [key: string]: Store<string, UserState, UserGetters, UserActions>;
}> = ref({});

const { teammates } = storeToRefs(teamStore);

watch(
  teammates,
  async (newTeammates: string[], oldTeammates: string[] | undefined) => {
    // Remove any teammates that are no longer in the team
    for (const teammate of Object.keys(teammateStores.value)) {
      if (!newTeammates.includes(teammate)) {
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
      if (Array.isArray(newTeammates)) {
        for (const teammate of newTeammates) {
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
              (snapshot) => {
                console.debug(
                  `${teammateStores.value[teammate]?.$id} data changed`
                );
                const snapshotData = snapshot.data();
                const teammateStoreInstance = teammateStores.value[teammate];
                if (teammateStoreInstance && snapshotData) {
                  teammateStoreInstance.$patch(snapshotData);
                  clearState(teammateStoreInstance, snapshotData);
                } else if (teammateStoreInstance) {
                  clearState(teammateStoreInstance, {});
                }
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
  { immediate: true }
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

const useProgressStore = defineStore('progress', () => {
  const tarkovStore = useTarkovStore(); // Get the main store instance

  const teamStores = computed(() => {
    let stores: { [key: string]: Store<string, UserState, any, any> } = {};
    stores['self'] = tarkovStore as Store<string, UserState>; // Cast the main store to the correct type
    for (const teammate of Object.keys(teammateStores.value)) {
      // Make sure the store instance exists before accessing it
      if (teammateStores.value[teammate]) {
        stores[teammate] = teammateStores.value[teammate];
      }
    }
    return stores;
  });

  const visibleTeamStores = computed(() => {
    let visibleStores: { [key: string]: Store<string, UserState, any, any> } =
      {};
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

// We keep the state outside of the function so that it acts as a singleton
export function useLiveData() {
  return {
    useTeamStore,
    useSystemStore,
    useProgressStore,
    teammateStores, // Exposing the Ref directly
  };
}
