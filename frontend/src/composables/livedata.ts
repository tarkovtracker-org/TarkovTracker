import { computed, ref, watch, Ref, ComputedRef, nextTick } from 'vue';
import type { Store, StateTree } from 'pinia';
import type { UserState } from '@/shared_state';
import { useTarkovStore } from '@/stores/tarkov';
import { fireuser, firestore } from '@/plugins/firebase';
import {
  doc,
  collection,
  onSnapshot,
  DocumentReference,
  Unsubscribe,
  DocumentData,
  Firestore,
  FirestoreError,
} from 'firebase/firestore';
import { defineStore, _GettersTree } from 'pinia';
import { getters, actions, defaultState, UserActions } from '@/shared_state';
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

const useSystemStore = defineStore<string, SystemState, SystemGetters>('system', {
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
});

const systemStore = useSystemStore();
const userStore = useUserStore();

const systemRef: ComputedRef<DocumentReference<DocumentData> | null> = computed(() => {
  if (fireuser.loggedIn) {
    return doc(collection(firedb, 'system'), fireuser.uid as string);
  } else {
    return null;
  }
});

const systemUnsubscribe: Ref<Unsubscribe | null> = ref(null);

function clearState(store: Store, newState?: DocumentData | Record<string, unknown>): void {
  try {
    const currentState = store.$state;
    const missingProperties = Object.keys(currentState).filter((key) => {
      if (typeof newState === 'undefined') return true;
      try {
        const missingKey = !Object.prototype.hasOwnProperty.call(newState, key);
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
      {} as Record<string, null>
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
          unsubscribe.value();
          clearState(store, {});
        }
        unsubscribe.value = onSnapshot(
          newRef,
          (snapshot) => {
            const snapshotData = snapshot.data();
            if (snapshotData) {
              if (store.$id === 'team') {
                console.log(
                  '[livedata][startStoreWatcher/teamStore] Snapshot received. ' +
                    'snapshotData.members:',
                  JSON.parse(JSON.stringify(snapshotData.members || null))
                );
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
                  JSON.parse(JSON.stringify(teamStateAfterPatch.members || null))
                );
                console.log(
                  '[livedata][startStoreWatcher/teamStore] teamStore.$state AFTER patch (full):',
                  JSON.parse(JSON.stringify(teamStateAfterPatch))
                );
              }
              clearState(store, snapshotData);
            } else {
              console.log(
                '[livedata][systemStore Watcher] Snapshot data is null/undefined. Clearing state.'
              );
              clearState(store, {});
            }
          },
          (error: FirestoreError) => {
            if (error.code == 'permission-denied' && unsubscribe.value) {
              unsubscribe.value();
              clearState(store, {});
            }
          }
        );
      } else {
        if (unsubscribe?.value) {
          unsubscribe.value();
        }
        clearState(store, {});
      }
    },
    { immediate: true }
  );
}

startStoreWatcher(systemStore, systemRef, systemUnsubscribe);

const teamRef: ComputedRef<DocumentReference<DocumentData> | null> = computed(() => {
  const currentSystemStateTeam = systemStore.$state.team;
  if (fireuser.loggedIn) {
    if (currentSystemStateTeam && typeof currentSystemStateTeam == 'string') {
      return doc(collection(firedb, 'team'), currentSystemStateTeam);
    } else {
      return null;
    }
  } else {
    return null;
  }
});

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
      const owner = state.owner;
      console.log(
        `[livedata.ts] teamStore.isOwner GETTER internal. owner: ${owner}, ` +
          `fireuser.uid: ${fireuser.uid}, comparison result: ${owner === fireuser.uid}`
      );
      return owner === fireuser.uid;
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
      console.log('[livedata][teammates getter] Returning:', JSON.parse(JSON.stringify(result)));
      return result;
    },
  },
});

const teamStore = useTeamStore();
startStoreWatcher(teamStore, teamRef, teamUnsubscribe);

export const teammateStores: Ref<Record<string, Store<string, UserState>>> = ref({});
const teammateUnsubscribes: Ref<{ [key: string]: Unsubscribe }> = ref({});

watch(
  () => teamStore.$state,
  async (newState, oldState) => {
    await nextTick();
    const newFireUID = fireuser?.uid;
    const newTeammatesArray =
      newState.members?.filter((member: string) => member !== newFireUID) || [];
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

    for (const teammate of Object.keys(teammateStores.value)) {
      if (!newTeammatesArray.includes(teammate)) {
        console.debug('Removing teammate', teammate);
        if (teammateUnsubscribes.value[teammate]) {
          teammateUnsubscribes.value[teammate]();
          delete teammateUnsubscribes.value[teammate];
        }
        delete teammateStores.value[teammate];
      }
    }
    try {
      if (Array.isArray(newTeammatesArray)) {
        for (const teammate of newTeammatesArray) {
          if (!teammateStores.value[teammate]) {
            console.debug('Adding teammate', teammate);
            const storeDefinition = defineStore<
              `teammate-${string}`,
              UserState,
              typeof getters,
              UserActions
            >(`teammate-${teammate}`, {
              state: (): UserState => JSON.parse(JSON.stringify(defaultState)),
              getters: getters,
              actions: actions as UserActions,
            });
            teammateStores.value[teammate] = storeDefinition();
            teammateUnsubscribes.value[teammate] = onSnapshot(
              doc(firedb, 'progress', teammate),
              (memberDocSnapshot) => {
                const storeId = teammateStores.value[teammate]?.$id;
                const teammateStoreInstance = teammateStores.value[teammate];
                if (!teammateStoreInstance) {
                  console.warn(
                    `[livedata][teammateStore:${teammate}] Store instance not found ` +
                      `during snapshot for progress/${teammate}. This should not happen ` +
                      `if store was just created.`
                  );
                  return;
                }
                const firestoreDocData = memberDocSnapshot.data();
                const docExists = memberDocSnapshot.exists();
                console.log(
                  `[livedata][${storeId}] SNAPSHOT for progress/${teammate}. ` +
                    `Exists: ${docExists}. Raw Firestore Data:`,
                  JSON.parse(JSON.stringify(firestoreDocData || {}))
                );
                console.log(
                  `[livedata][${storeId}] Store state BEFORE patch:`,
                  JSON.parse(JSON.stringify(teammateStoreInstance.$state))
                );
                if (docExists && firestoreDocData) {
                  teammateStoreInstance.$patch(firestoreDocData);
                } else if (docExists && !firestoreDocData) {
                  console.warn(
                    `[livedata][${storeId}] Document progress/${teammate} exists ` +
                      `but data is empty. Patching defaultState.`
                  );
                  teammateStoreInstance.$patch(JSON.parse(JSON.stringify(defaultState)));
                } else {
                  console.log(
                    `[livedata][${storeId}] Document progress/${teammate} ` +
                      `does not exist. Patching defaultState.`
                  );
                  teammateStoreInstance.$patch(JSON.parse(JSON.stringify(defaultState)));
                }
                console.log(
                  `[livedata][${storeId}] Store state AFTER patch:`,
                  JSON.parse(JSON.stringify(teammateStoreInstance.$state))
                );
              },
              (error: FirestoreError) => {
                if (error.code == 'permission-denied' && teammateUnsubscribes.value[teammate]) {
                  console.debug(
                    'Unsubscribing from',
                    teammateStores.value[teammate]?.$id,
                    'due to permission denied'
                  );
                  teammateUnsubscribes.value[teammate]();
                  delete teammateUnsubscribes.value[teammate];
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

const getTarkovStore = () => {
  return useTarkovStore();
};

const tarkovStore = getTarkovStore();

const useProgressStore = defineStore('progress', () => {
  const teamStoresComputed = computed(() => {
    const stores: { [key: string]: Store<string, UserState> } = {};
    stores['self'] = getTarkovStore() as Store<string, UserState>;
    for (const teammate of Object.keys(teammateStores.value)) {
      if (teammateStores.value[teammate]) {
        stores[teammate] = teammateStores.value[teammate];
      }
    }
    return stores;
  });

  const visibleTeamStores = computed(() => {
    const visibleStores: { [key: string]: Store<string, UserState> } = {};
    Object.entries(teamStoresComputed.value).forEach(([teamId, store]) => {
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
    const store = teamStoresComputed.value[storeKey];
    const displayNameFromStore = store?.$state?.displayName;

    console.log(
      `[livedata][getDisplayName] For teamId: ${teamId} (storeKey: ${storeKey})`,
      `Store found: ${!!store}`,
      `Store $state: ${JSON.stringify(store?.$state)}`,
      `DisplayName from store: ${displayNameFromStore}`
    );

    if (!displayNameFromStore) {
      console.warn(
        `[livedata][getDisplayName] DisplayName for ${teamId} (storeKey: ${storeKey}) ` +
          `is FALSY ('${displayNameFromStore}'). Falling back to UID substring. ` +
          `Store $state was: ${JSON.stringify(store?.$state)}`
      );
      return teamId.substring(0, 6);
    }
    return displayNameFromStore;
  };

  const getLevel = (teamId: string): number => {
    const storeKey = getTeamIndex(teamId);
    const store = teamStoresComputed.value[storeKey];
    return store?.$state?.level ?? 1;
  };

  const getTeammateStore = (
    teamId: string,
    _teamStores?: Ref<Record<string, Store<string, UserState>>>
  ): Store<string, UserState> | null => {
    const localTeamStores = _teamStores || teammateStores;
    return localTeamStores.value[teamId] || null;
  };

  return {
    teamStores: teamStoresComputed,
    visibleTeamStores,
    getDisplayName,
    getTeamIndex,
    getLevel,
    getTeammateStore,
    getTarkovStore,
  };
});

export function useLiveData() {
  return {
    useTeamStore,
    useSystemStore,
    useProgressStore,
    teammateStores,
    tarkovStore,
  };
}
