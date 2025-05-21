<template>
  <fitted-card icon="mdi-account-supervisor" icon-color="white" highlight-color="secondary">
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
              <v-btn variant="outlined" class="mx-1" style="height: 100%" @click="clearDisplayName">
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
              <v-btn variant="outlined" class="mx-1" style="height: 100%" @click="copyUrl">
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
      <v-btn color="white" variant="text" @click="createTeamSnackbar = false"> Close </v-btn>
    </template>
  </v-snackbar>
  <v-snackbar v-model="leaveTeamSnackbar" :timeout="4000" color="accent">
    {{ leaveTeamResult }}
    <template #actions>
      <v-btn color="white" variant="text" @click="leaveTeamSnackbar = false"> Close </v-btn>
    </template>
  </v-snackbar>
</template>
<script setup>
  import { ref, computed, watch, nextTick } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { fireuser, auth } from '@/plugins/firebase';
  import { useLiveData } from '@/composables/livedata';
  import { useUserStore } from '@/stores/user';
  import { useTarkovStore } from '@/stores/tarkov';
  import FittedCard from '@/components/FittedCard';
  const { t } = useI18n({ useScope: 'global' });
  const { useTeamStore, useSystemStore } = useLiveData();
  const teamStore = useTeamStore();
  const systemStore = useSystemStore();
  const generateRandomName = (length = 6) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  };
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
    return teamStore.$state.owner === fireuser.uid && systemStore.$state.team != null;
  });
  // Create new team
  const creatingTeam = ref(false);
  const createTeamResult = ref(null);
  const createTeamSnackbar = ref(false);
  const createTeam = async () => {
    creatingTeam.value = true;
    console.debug(
      '[MyTeam.vue] createTeam called. localUserTeam before call:',
      localUserTeam.value,
      'fireuser.loggedIn:',
      fireuser.loggedIn,
      'fireuser.uid:',
      fireuser.uid
    );
    // Check if our reactive state indicates a logged-in user
    if (!fireuser.loggedIn || !fireuser.uid) {
      console.error('[MyTeam.vue] createTeam - User not authenticated (reactive state).');
      createTeamResult.value = t('page.team.card.myteam.user_not_authenticated');
      createTeamSnackbar.value = true;
      creatingTeam.value = false;
      return;
    }
    // Get the current Firebase user object directly from auth
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error(
        '[MyTeam.vue] createTeam - Firebase auth.currentUser is null, ' +
          'despite reactive state indicating login.'
      );
      createTeamResult.value = t('page.team.card.myteam.auth_inconsistency');
      // Add a new translation key for this
      createTeamSnackbar.value = true;
      creatingTeam.value = false;
      return;
    }
    try {
      const idToken = await currentUser.getIdToken();
      const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
      const response = await fetch(
        `https://us-central1-${projectId}.cloudfunctions.net/createTeam`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            // Add password, maximumMembers, etc. here if needed
          }),
        }
      );
      if (!response.ok) {
        let specificErrorMessage = t('page.team.card.myteam.create_team_error'); // Default message
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorResult = await response.json(); // Attempt to parse JSON from error response
            if (errorResult && errorResult.error) {
              specificErrorMessage = errorResult.error; // Use backend's error message
            } else if (response.statusText) {
              specificErrorMessage = response.statusText;
            }
          } else if (response.statusText) {
            specificErrorMessage = response.statusText;
          }
        } catch {
          console.error('[MyTeam.vue] Could not parse JSON from error response body');
          if (response.statusText) {
            specificErrorMessage = response.statusText; // Fallback to status text
          }
        }
        createTeamResult.value = specificErrorMessage;
        createTeamSnackbar.value = true;
        throw new Error(specificErrorMessage); // Throw an error with the specific message
      }
      // response.ok is true, proceed with parsing success response
      const result = await response.json();
      // Check for the team field under result.data.team
      if (!result.data || !result.data.team) {
        createTeamResult.value = t('page.team.card.myteam.create_team_error_ui_update');
        createTeamSnackbar.value = true;
        return;
      }
      console.debug(
        '[MyTeam.vue] createTeam returned. localUserTeam after call (still pre-watch/nextTick):',
        localUserTeam.value
      );
      await new Promise((resolve, _reject) => {
        console.debug(
          '[MyTeam.vue] Waiting for systemStore.$state.team to be populated. Current value:',
          systemStore.$state.team
        );
        const timeout = setTimeout(() => {
          console.warn(
            '[MyTeam] Timeout (15s) waiting for systemStore.$state.team to become non-null.'
          );
          _reject(new Error('Timed out waiting for system record to update with new team ID.'));
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
              console.debug('[MyTeam.vue] systemStore.$state.team is now populated.');
              resolve(newTeamId);
            }
          },
          { immediate: true, deep: false }
        );
      });
      // Now wait for teamStore to be populated with the owner information for the new team
      await new Promise((resolve, _reject) => {
        console.debug(
          '[MyTeam.vue] Waiting for teamStore.owner to match current user and ' +
            'password to be populated. Current teamStore.$state:',
          JSON.parse(JSON.stringify(teamStore.$state || {})),
          'fireuser.uid:',
          fireuser.uid
        );
        const timeout = setTimeout(() => {
          console.warn(
            '[MyTeam] Timeout (15s) waiting for teamStore.owner to match fireuser.uid ' +
              'and password to be populated. Current teamStore.$state.owner:',
            teamStore.owner, // Log current owner at timeout
            'Current teamStore.$state.password:',
            teamStore.$state.password // Log current password at timeout
          );
          resolve(null); // Resolve with null on timeout as before, or consider rejecting
        }, 15000);
        let stopWatchingTeamOwnerAndPassword;
        stopWatchingTeamOwnerAndPassword = watch(
          () => teamStore.$state, // Watch the entire $state object
          (newState) => {
            const newOwner = newState?.owner;
            const newPassword = newState?.password; // Check for password
            console.debug(
              '[MyTeam.vue] Watch on teamStore.$state triggered. New state owner:',
              newOwner,
              'New state password:', // Log the password
              newPassword,
              'fireuser.uid:',
              fireuser.uid
            );
            // We need both owner to match and password to be populated
            if (newOwner && fireuser.uid && newOwner === fireuser.uid && newPassword) {
              clearTimeout(timeout);
              if (stopWatchingTeamOwnerAndPassword) {
                stopWatchingTeamOwnerAndPassword();
              }
              console.debug(
                '[MyTeam] teamStore.owner now matches fireuser.uid ' +
                  'and teamStore.password is populated via $state watch.'
              );
              resolve(newState); // Resolve with the new state containing owner and password
            }
          },
          { immediate: true, deep: true } // Use deep: true for watching object properties
        );
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
        if (isTeamOwner.value) {
          const randomTeamName = generateRandomName();
          tarkovStore.setDisplayName(randomTeamName);
          console.log(
            '[MyTeam.vue] Team created/joined by owner, set random display name:',
            randomTeamName
          );
        } else {
          console.warn(
            "[MyTeam.vue] Team created and user is in team, but 'isTeamOwner' is still false. " +
              'This might indicate an issue with owner state propagation or comparison.'
          );
        }
      } else {
        console.error(
          '[MyTeam.vue] Team creation failed: UI state (localUserTeam) did not update ' +
            'after nextTick. $state.team:',
          systemStore.$state.team
        );
        createTeamResult.value = t('page.team.card.myteam.create_team_error_ui_update');
        createTeamSnackbar.value = true;
      }
    } catch (error) {
      // Log the full error object for inspection
      console.error('[MyTeam.vue] Error in createTeam function. Full error object below:');
      console.dir(error);
      console.error(
        '[MyTeam.vue] ERROR OBJECT (stringified, ' + "'in case dir is not showing full details):'"
      );
      try {
        console.log(JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      } catch {
        console.error('[MyTeam.vue] Could not stringify the error object');
      }
      let messageForSnackbar = null;
      if (error && typeof error === 'object') {
        if (error.details) {
          if (typeof error.details.error === 'string') {
            messageForSnackbar = error.details.error;
          } else if (typeof error.details === 'string') {
            // Attempt to parse if details is a string (might be stringified JSON)
            try {
              const parsedDetails = JSON.parse(error.details);
              if (parsedDetails && typeof parsedDetails.error === 'string') {
                messageForSnackbar = parsedDetails.error;
              } else {
                messageForSnackbar = error.details;
              }
            } catch {
              // Parsing failed, use error.details as is if it's a string
              messageForSnackbar = error.details;
            }
          }
        }
        // If no message from .details, fallback to error.message
        if (!messageForSnackbar && typeof error.message === 'string' && error.message.length > 0) {
          messageForSnackbar = error.message;
        }
      }
      // Ultimate fallback if no message could be extracted
      if (!messageForSnackbar) {
        messageForSnackbar = t('page.team.card.myteam.create_team_error');
      }
      createTeamResult.value = messageForSnackbar;
      createTeamSnackbar.value = true;
    }
    creatingTeam.value = false;
    console.debug(
      '[MyTeam.vue] createTeam finished. creatingTeam=false. ' +
        'localUserTeam for final UI render check:',
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
    // Check if our reactive state indicates a logged-in user
    if (!fireuser.loggedIn || !fireuser.uid) {
      console.error('[MyTeam.vue] leaveTeam - User not authenticated (reactive state).');
      leaveTeamResult.value = t('page.team.card.myteam.user_not_authenticated');
      // Use existing or new translation key
      leaveTeamSnackbar.value = true;
      leavingTeam.value = false;
      return;
    }
    // Get the current Firebase user object directly from auth
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error(
        '[MyTeam] leaveTeam - Firebase auth.currentUser is null, ' +
          'despite reactive state indicating login.'
      );
      leaveTeamResult.value = t('page.team.card.myteam.auth_inconsistency');
      leaveTeamSnackbar.value = true;
      leavingTeam.value = false;
      return;
    }
    try {
      const idToken = await currentUser.getIdToken();
      const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
      const response = await fetch(
        `https://us-central1-${projectId}.cloudfunctions.net/leaveTeam`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      );
      const result = await response.json();
      if (!response.ok) {
        leaveTeamResult.value = result.error || t('page.team.card.myteam.leave_team_error');
        leaveTeamSnackbar.value = true;
        leavingTeam.value = false;
        throw new Error(result.error || 'Failed to leave team');
      }
      // Ensure result.data exists before trying to access result.data.left
      if (!result.data || (!result.data.left && systemStore.$state.team)) {
        leaveTeamResult.value = t('page.team.card.myteam.leave_team_error');
        leaveTeamSnackbar.value = true;
        return;
      }
      leaveTeamResult.value = t('page.team.card.myteam.leave_team_success');
      leaveTeamSnackbar.value = true;
      // Reset the local display name as the user is no longer in a team
      // This check ensures we only reset if they had a team-specific name
      if (tarkovStore.displayName.startsWith('User ')) {
        tarkovStore.setDisplayName(tarkovStore.getDefaultDisplayName());
        console.log(
          '[MyTeam] Left team, reset display name to default:',
          tarkovStore.getDefaultDisplayName()
        );
      }
    } catch (error) {
      console.error('[MyTeam] Error leaving team:', error);
      leaveTeamResult.value =
        error.message || t('page.team.card.myteam.leave_team_error_unexpected');
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
    const teamIdForUrl = systemStore.$state.team;
    const passwordForUrl = teamStore.$state.password;
    console.debug(
      '[Invite Debug - MyTeam.vue] Generating teamUrl. ' +
        'teamIdForUrl (from systemStore.$state.team):',
      teamIdForUrl,
      'passwordForUrl (from teamStore.$state.password):',
      passwordForUrl
    );
    if (!teamIdForUrl || !passwordForUrl) {
      console.warn(
        '[MyTeam.vue] Missing teamIdForUrl or passwordForUrl when generating invite URL:',
        teamIdForUrl,
        passwordForUrl
      );
    }
    if (teamIdForUrl && passwordForUrl) {
      const baseUrl = window.location.href.split('?')[0];
      const teamParam = `team=${encodeURIComponent(teamIdForUrl)}`;
      const codeParam = `code=${encodeURIComponent(passwordForUrl)}`;
      return `${baseUrl}?${teamParam}&${codeParam}`;
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
  // If the user changes their tarkov display name, we need to update it in the team store
  watch(
    () => tarkovStore.getDisplayName,
    (newDisplayName) => {
      if (isTeamOwner.value && newDisplayName !== teamStore.getOwnerDisplayName) {
        teamStore.setOwnerDisplayName(newDisplayName);
      }
    }
  );
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
