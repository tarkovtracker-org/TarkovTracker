<template>
  <fitted-card
    icon="mdi-account-supervisor"
    icon-color="white"
    highlight-color="secondary"
  >
    <template #title>
      {{ $t('page.team.card.myteam.title') }}
    </template>
    <template #content>
      <template v-if="localUserTeam == null">
        <v-row align="center" no-gutters>
          <v-col cols="12">
            {{ $t('page.team.card.myteam.no_team') }}
          </v-col>
        </v-row>
      </template>
      <template v-else>
        <v-container>
          <v-row>
            <v-col>
              <!-- Show the Team's invite URL -->
              <v-text-field
                v-model="displayName"
                variant="outlined"
                :label="$t('page.team.card.myteam.display_name_label')"
                hide-details="auto"
                maxlength="25"
                counter
              ></v-text-field>
            </v-col>
            <v-col cols="auto">
              <!-- Button to copy the invite URL to clipboard -->
              <v-btn
                variant="outlined"
                class="mx-1"
                style="height: 100%"
                @click="clearDisplayName"
              >
                <v-icon>mdi-backspace</v-icon>
              </v-btn>
            </v-col>
          </v-row>
          <v-row>
            <v-col>
              <!-- Show the Team's invite URL -->
              <v-text-field
                v-model="visibleUrl"
                variant="outlined"
                :label="$t('page.team.card.myteam.team_invite_url_label')"
                hide-details="auto"
                readonly
              ></v-text-field>
            </v-col>
            <v-col cols="auto">
              <!-- Button to copy the invite URL to clipboard -->
              <v-btn
                variant="outlined"
                class="mx-1"
                style="height: 100%"
                @click="copyUrl"
              >
                <v-icon>mdi-content-copy</v-icon>
              </v-btn>
            </v-col>
          </v-row>
        </v-container>
      </template>
    </template>
    <template #footer>
      <v-container class="">
        <v-row align="end" justify="start">
          <!-- Button to show the new token form -->
          <v-btn
            v-if="localUserTeam == null"
            :disabled="creatingTeam"
            :loading="creatingTeam"
            variant="outlined"
            class="mx-1"
            prepend-icon="mdi-account-group"
            @click="createTeam"
          >
            {{ $t('page.team.card.myteam.create_new_team') }}
          </v-btn>
          <v-btn
            v-if="localUserTeam != null"
            :disabled="leavingTeam"
            :loading="leavingTeam"
            variant="outlined"
            class="mx-1"
            prepend-icon="mdi-account-off"
            @click="leaveTeam"
          >
            {{
              isTeamOwner
                ? $t('page.team.card.myteam.disband_team')
                : $t('page.team.card.myteam.leave_team')
            }}
          </v-btn>
        </v-row>
      </v-container>
    </template>
  </fitted-card>
  <v-snackbar v-model="createTeamSnackbar" :timeout="4000" color="accent">
    {{ createTeamResult }}
    <template #actions>
      <v-btn color="white" variant="text" @click="createTeamSnackbar = false">
        Close
      </v-btn>
    </template>
  </v-snackbar>
  <v-snackbar v-model="leaveTeamSnackbar" :timeout="4000" color="accent">
    {{ leaveTeamResult }}
    <template #actions>
      <v-btn color="white" variant="text" @click="leaveTeamSnackbar = false">
        Close
      </v-btn>
    </template>
  </v-snackbar>
</template>
<script setup>
  import { defineAsyncComponent, ref, computed, watch, nextTick } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { fireuser, functions } from '@/plugins/firebase';
  import { httpsCallable } from 'firebase/functions';
  import { useLiveData } from '@/composables/livedata';
  import { useUserStore } from '@/stores/user';
  import { useTarkovStore } from '@/stores/tarkov';
  const FittedCard = defineAsyncComponent(
    () => import('@/components/FittedCard.vue')
  );

  const { t } = useI18n({ useScope: 'global' });
  const { useTeamStore, useSystemStore } = useLiveData();
  const teamStore = useTeamStore();
  const systemStore = useSystemStore();

  const localUserTeam = computed(() => {
    console.debug(
      '[MyTeam.vue] localUserTeam computed. systemStore.$state.team:',
      systemStore.$state.team,
      'systemStore.userTeam (getter):',
      systemStore.userTeam
    );
    return systemStore.$state.team || null; // Directly use the raw state
  });

  // This computed property might also need to ensure it uses up-to-date store data
  const isTeamOwner = computed(() => {
    // Directly access $state.owner for reactivity
    console.debug(
      '[MyTeam.vue] isTeamOwner computed. teamStore.$state.owner:',
      teamStore.$state.owner,
      'fireuser.uid:',
      fireuser.uid,
      'systemStore.$state.team:',
      systemStore.$state.team
    );
    return (
      teamStore.$state.owner === fireuser.uid && systemStore.$state.team != null
    );
  });

  // Create new team
  const creatingTeam = ref(false);
  const createTeamResult = ref(null);
  const createTeamSnackbar = ref(false);
  const createTeam = async () => {
    creatingTeam.value = true;
    console.debug(
      '[MyTeam.vue] createTeam called. localUserTeam before call:',
      localUserTeam.value
    );
    try {
      const createTeamFunction = httpsCallable(functions, 'createTeam');
      await createTeamFunction({});
      console.debug(
        '[MyTeam.vue] createTeamFunction returned. localUserTeam after call (still pre-watch/nextTick):',
        localUserTeam.value
      );

      // Wait for systemStore to confirm the user is in a team (i.e., systemStore.$state.team has the new teamId)
      await new Promise((resolve, reject) => {
        console.debug(
          '[MyTeam.vue] Waiting for systemStore.$state.team to be populated. Current value:',
          systemStore.$state.team
        );
        const timeout = setTimeout(() => {
          console.warn(
            '[MyTeam.vue] Timeout (15s) waiting for systemStore.$state.team to become non-null.'
          );
          reject(
            new Error(
              'Timed out waiting for system record to update with new team ID.'
            )
          );
        }, 15000);

        let stopWatchingSystemTeam;
        stopWatchingSystemTeam = watch(
          () => systemStore.$state.team,
          (newTeamId) => {
            console.debug(
              '[MyTeam.vue] Watch on systemStore.$state.team triggered. New teamId:',
              newTeamId
            );
            if (newTeamId != null) {
              clearTimeout(timeout);
              if (stopWatchingSystemTeam) {
                stopWatchingSystemTeam();
              }
              console.debug(
                '[MyTeam.vue] systemStore.$state.team is now populated.'
              );
              resolve(newTeamId);
            }
          },
          { immediate: true, deep: false }
        );
      });

      // Now wait for teamStore to be populated with the owner information for the new team
      await new Promise((resolve, reject) => {
        console.debug(
          '[MyTeam.vue] Waiting for teamStore.owner to match current user. Current teamStore.$state:',
          JSON.parse(JSON.stringify(teamStore.$state || {})),
          'fireuser.uid:',
          fireuser.uid
        );
        const timeout = setTimeout(() => {
          console.warn(
            '[MyTeam.vue] Timeout (15s) waiting for teamStore.owner to match fireuser.uid. Current teamStore.$state.owner:',
            teamStore.owner // Log current owner at timeout
          );
          resolve(null);
        }, 15000);

        let stopWatchingTeamOwner;
        stopWatchingTeamOwner = watch(
          () => teamStore.$state, // Watch the entire $state object
          (newState) => {
            const newOwner = newState?.owner;
            console.debug(
              '[MyTeam.vue] Watch on teamStore.$state triggered. New state owner:',
              newOwner,
              'fireuser.uid:',
              fireuser.uid
            );
            if (newOwner && fireuser.uid && newOwner === fireuser.uid) {
              clearTimeout(timeout);
              if (stopWatchingTeamOwner) {
                stopWatchingTeamOwner();
              }
              console.debug(
                '[MyTeam.vue] teamStore.owner now matches fireuser.uid via $state watch.'
              );
              resolve(newOwner);
            }
          },
          { immediate: true, deep: true } // Use deep: true for watching object properties
        );
        // Initial check (can be removed if immediate:true on $state with deep:true works reliably)
        // if (
        //   teamStore.owner &&
        //   fireuser.uid &&
        //   teamStore.owner === fireuser.uid
        // ) {
        //   clearTimeout(timeout);
        //   if (stopWatchingTeamOwner) stopWatchingTeamOwner();
        //   console.debug(
        //     '[MyTeam.vue] Initial check: teamStore.owner already matches fireuser.uid.'
        //   );
        //   resolve(teamStore.owner);
        // }
      });

      console.debug(
        '[MyTeam.vue] All watches resolved. localUserTeam (before nextTick):',
        localUserTeam.value,
        'teamStore.owner:',
        teamStore.owner,
        'isTeamOwner computed:',
        isTeamOwner.value
      );
      await nextTick();
      console.debug(
        '[MyTeam.vue] After nextTick. localUserTeam (getter):',
        localUserTeam.value,
        '$state.team:',
        systemStore.$state.team,
        'teamStore.owner:',
        teamStore.owner,
        'isTeamOwner computed:',
        isTeamOwner.value
      );

      if (localUserTeam.value) {
        createTeamResult.value = t('page.team.card.myteam.create_team_success');
        createTeamSnackbar.value = true;
        if (!isTeamOwner.value) {
          console.warn(
            "[MyTeam.vue] Team created and user is in team, but 'isTeamOwner' is still false. This might indicate an issue with owner state propagation or comparison."
          );
        }
      } else {
        console.error(
          '[MyTeam.vue] Team creation failed: UI state (localUserTeam) did not update after nextTick. $state.team:',
          systemStore.$state.team
        );
        createTeamResult.value = t(
          'page.team.card.myteam.create_team_error_ui_update'
        );
        createTeamSnackbar.value = true;
      }
    } catch (error) {
      let backendMsg =
        error?.message || error?.data?.message || error?.toString();
      createTeamResult.value =
        backendMsg || t('page.team.card.myteam.create_team_error');
      console.error('[MyTeam.vue] Error in createTeam:', error);
      createTeamSnackbar.value = true;
    }
    creatingTeam.value = false;
    console.debug(
      '[MyTeam.vue] createTeam finished. creatingTeam=false. localUserTeam for final UI render check:',
      localUserTeam.value,
      '$state.team:',
      systemStore.$state.team
    );
  };

  // Leave team
  const leavingTeam = ref(false);
  const leaveTeamResult = ref(null);
  const leaveTeamSnackbar = ref(false);
  const leaveTeam = async () => {
    leavingTeam.value = true;
    try {
      const leaveTeamFunction = httpsCallable(functions, 'leaveTeam');
      const result = await leaveTeamFunction({}); // Capture result if needed
      if (isTeamOwner.value) {
        // MODIFIED
        leaveTeamResult.value = t('page.team.card.myteam.disband_team_success');
      } else {
        leaveTeamResult.value = t('page.team.card.myteam.leave_team_success');
      }
      leaveTeamSnackbar.value = true;
    } catch (error) {
      leaveTeamResult.value = t('page.team.card.myteam.leave_team_error');
      console.error(error);
      leaveTeamSnackbar.value = true;
    }
    leavingTeam.value = false;
  };

  const copyUrl = () => {
    if (teamUrl.value) {
      navigator.clipboard.writeText(teamUrl.value);
    } else {
      console.error('No team URL to copy');
    }
  };

  const teamUrl = computed(() => {
    const teamIdForUrl = systemStore.$state.team; // Correct: Use the team ID from the system store
    const passwordForUrl = teamStore.$state.password; // Correct: Use the password from the team store
    console.debug(
      '[Invite Debug - MyTeam.vue] Generating teamUrl. teamIdForUrl (from systemStore.$state.team):',
      teamIdForUrl,
      'passwordForUrl (from teamStore.$state.password):',
      passwordForUrl
    );
    if (!teamIdForUrl || !passwordForUrl) {
      console.warn(
        '[Invite Debug - MyTeam.vue] Missing teamIdForUrl or passwordForUrl when generating invite URL:',
        teamIdForUrl,
        passwordForUrl
      );
    }
    if (teamIdForUrl && passwordForUrl) {
      return `${window.location.href.split('?')[0]}?team=${encodeURIComponent(
        teamIdForUrl
      )}&code=${encodeURIComponent(passwordForUrl)}`;
    } else {
      return '';
    }
  });

  const userStore = useUserStore();

  const visibleUrl = computed(() => {
    if (userStore.getStreamerMode) {
      return t('page.team.card.myteam.url_hidden');
    } else {
      return teamUrl.value;
    }
  });

  const tarkovStore = useTarkovStore();
  const displayName = computed({
    get() {
      // Directly access the state property
      const nameFromStore = tarkovStore.displayName;
      console.debug(
        '[MyTeam.vue] displayName GETTER value from store state:',
        nameFromStore,
        'UID substring:',
        fireuser.uid?.substring(0, 6)
      );
      // Use fallback if nameFromStore is null, undefined, or empty string
      return nameFromStore || fireuser.uid?.substring(0, 6) || 'ErrorName';
    },
    set(newName) {
      if (newName !== '') {
        tarkovStore.setDisplayName(newName);
      }
    },
  });

  const clearDisplayName = () => {
    tarkovStore.setDisplayName(null);
  };
</script>
<style lang="scss" scoped></style>
