<template>
  <v-alert
    v-if="hasInviteInUrl && !inInviteTeam && !declined"
    color="green"
    theme="dark"
    icon="mdi-handshake"
    density="compact"
    prominent
  >
    <div class="d-flex flex-row align-center justify-space-between">
      <div>
        {{ $t('page.team.card.teaminvite.description') }}
      </div>
      <div>
        <v-btn
          class="mx-1 my-1"
          variant="outlined"
          :disabled="accepting"
          :loading="accepting"
          @click="acceptInvite"
        >
          {{ $t('page.team.card.teaminvite.accept') }}
        </v-btn>
        <v-btn variant="outlined" :disabled="accepting" @click="declined = true">
          {{ $t('page.team.card.teaminvite.decline') }}
        </v-btn>
      </div>
    </div>
  </v-alert>
  <v-snackbar v-model="joinTeamSnackbar" :timeout="4000" color="accent">
    {{ joinResult }}
    <template #actions>
      <v-btn color="white" variant="text" @click="joinTeamSnackbar = false"> Close </v-btn>
    </template>
  </v-snackbar>
</template>
<script setup>
  import { computed, ref } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import { auth } from '@/plugins/firebase';
  import { useLiveData } from '@/composables/livedata';
  const router = useRouter();
  const { useSystemStore } = useLiveData();
  const systemStore = useSystemStore();
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const hasInviteInUrl = computed(() => {
    return !!(route.query.team && route.query.code);
  });
  const inInviteTeam = computed(() => {
    return systemStore?.userTeam != null && systemStore.userTeam == route?.query?.team;
  });
  const declined = ref(false);
  const accepting = ref(false);
  const joinTeamSnackbar = ref(false);
  const joinResult = ref('');
  const acceptInvite = async () => {
    // If the user is already in the team, do nothing
    if (inInviteTeam.value) {
      return;
    }
    // Mark the process as started
    accepting.value = true;
    try {
      // Use auth.currentUser to get the ID token
      if (!auth.currentUser) {
        console.error('[TeamInvite.vue] User not authenticated. Cannot accept invite.');
        joinResult.value = t('page.team.card.teaminvite.auth_error');
        joinTeamSnackbar.value = true;
        accepting.value = false;
        return;
      }
      const idToken = await auth.currentUser.getIdToken();
      const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
      // If the user is already in a team, leave it first
      if (systemStore.userTeam != null) {
        try {
          const leaveResponse = await fetch(
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
          const leaveResult = await leaveResponse.json();
          if (!leaveResponse.ok) {
            joinResult.value = leaveResult.error || t('page.team.card.teaminvite.leave_error');
            joinTeamSnackbar.value = true;
            accepting.value = false;
            return;
          }
          if ((!leaveResult.data || !leaveResult.data.left) && systemStore.userTeam) {
            joinResult.value = t('page.team.card.teaminvite.leave_error');
            joinTeamSnackbar.value = true;
            accepting.value = false;
            return;
          }
        } catch {
          joinResult.value = t('page.team.card.teaminvite.leave_error');
          joinTeamSnackbar.value = true;
          accepting.value = false;
          return;
        }
      }
      // Join the team
      try {
        console.debug(
          '[Invite Debug] route.query.team:',
          route?.query?.team,
          'route.query.code:',
          route?.query?.code
        );
        const joinPayload = {
          id: route?.query?.team,
          password: route?.query?.code,
        };
        console.debug('[Invite Debug] joinTeam payload:', joinPayload);
        const joinResponse = await fetch(
          `https://us-central1-${projectId}.cloudfunctions.net/joinTeam`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${idToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(joinPayload),
          }
        );
        const joinResultResp = await joinResponse.json();
        console.debug('[Invite Debug] joinTeam result:', joinResultResp);
        if (!joinResponse.ok) {
          console.error('[Invite Debug] joinTeam non-OK response:', joinResultResp);
          joinResult.value = joinResultResp.error || t('page.team.card.teaminvite.join_error');
          joinTeamSnackbar.value = true;
          accepting.value = false;
          return;
        } else {
          console.debug('[Invite Debug] joinTeam OK response:', joinResultResp);
        }
        if (!joinResultResp.joined) {
          console.error('[Invite Debug] joinTeam OK response but not joined:', joinResultResp);
          joinResult.value = t('page.team.card.teaminvite.join_error');
          joinTeamSnackbar.value = true;
          accepting.value = false;
          return;
        }
        joinResult.value = t('page.team.card.teaminvite.join_success');
        joinTeamSnackbar.value = true;
        accepting.value = false;
        router.push({ name: 'team' });
      } catch (_error) {
        console.error(
          '[Invite Debug] Error joining team:',
          _error,
          JSON.stringify(_error, Object.getOwnPropertyNames(_error))
        );
        joinResult.value = t('page.team.card.teaminvite.join_error');
        joinTeamSnackbar.value = true;
        accepting.value = false;
      }
    } catch {
      joinResult.value = t('page.team.card.teaminvite.join_error');
      joinTeamSnackbar.value = true;
      accepting.value = false;
    }
  };
</script>
<style lang="scss" scoped></style>
