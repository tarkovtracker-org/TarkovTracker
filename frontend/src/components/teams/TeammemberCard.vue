<template>
  <v-sheet class="pa-2" color="primary" :rounded="true">
    <v-container no-gutters>
      <v-row dense align="center" justify="space-between">
        <v-col cols="auto" class="text-left">
          <div class="text-h4">
            {{ progressStore.getDisplayName(props.teammember) }}
          </div>
          <div v-if="props.teammember == fireuser.uid" class="text-left">
            <b>
              {{ $t('page.team.card.manageteam.membercard.this_is_you') }}
            </b>
          </div>
        </v-col>
        <v-col align="center" justify="center"> </v-col>
        <v-col cols="auto">
          <div class="d-flex justify-center align-center">
            <span style="line-height: 0px">
              <img :src="groupIcon" contain style="max-width: 64px" />
            </span>
            <span>
              <div style="font-size: 0.7em" class="text-center mb-1">
                {{ $t('navigation_drawer.level') }}
              </div>
              <div class="text-center">
                <h1 style="font-size: 2.5em; line-height: 0.8em">
                  {{ progressStore.getLevel(props.teammember) }}
                </h1>
              </div>
            </span>
          </div>
        </v-col>
      </v-row>
      <v-row dense justify="space-between">
        <v-col cols="auto">
          <i18n-t
            v-if="!userStore.teamIsHidden(props.teammember)"
            keypath="page.team.card.manageteam.membercard.taskscomplete"
            scope="global"
          >
            <template #completed>
              <b>
                {{ completedTaskCount }}
              </b>
            </template>
            <template #total>
              <b>
                {{ tasks.length }}
              </b>
            </template>
          </i18n-t>
        </v-col>
        <v-col cols="auto">
          <v-btn
            :disabled="props.teammember == fireuser.uid || userStore.taskTeamAllHidden"
            variant="outlined"
            :icon="
              props.teammember != fireuser.uid && userStore.teamIsHidden(props.teammember)
                ? 'mdi-eye-off'
                : 'mdi-eye'
            "
            class="mx-1"
            :color="
              props.teammember != fireuser.uid && userStore.teamIsHidden(props.teammember)
                ? 'red'
                : 'green'
            "
            size="x-small"
            @click="userStore.toggleHidden(props.teammember)"
          ></v-btn>
          <!-- Button to delete the token -->
          <v-btn
            v-if="props.teammember != fireuser.uid && isTeamOwnerView"
            variant="outlined"
            icon="mdi-account-minus"
            class="mx-1"
            color="red"
            size="x-small"
            :loading="kickingTeammate"
            :disabled="kickingTeammate"
            @click="kickTeammate()"
          ></v-btn>
        </v-col>
      </v-row>
    </v-container>
  </v-sheet>
  <v-snackbar v-model="kickTeammateSnackbar" :timeout="4000" color="accent">
    {{ kickTeammateResult }}
    <template #actions>
      <v-btn color="white" variant="text" @click="kickTeammateSnackbar = false">
        {{ $t('generic.close_button') }}
      </v-btn>
    </template>
  </v-snackbar>
</template>
<script setup>
  import { fireuser } from '@/plugins/firebase';
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/stores/user';
  import { useProgressStore } from '@/stores/progress';
  import { useTarkovData } from '@/composables/tarkovdata';
  // Define the props for the component
  const props = defineProps({
    teammember: {
      type: String,
      required: true,
    },
    isTeamOwnerView: {
      type: Boolean,
      required: true,
    },
  });
  const teamStoreId = computed(() => {
    if (props.teammember == fireuser.uid) {
      return 'self';
    } else {
      return props.teammember;
    }
  });
  const progressStore = useProgressStore();
  const userStore = useUserStore();
  const { tasks, playerLevels } = useTarkovData();
  const { t } = useI18n({ useScope: 'global' });
  const completedTaskCount = computed(() => {
    return tasks.value.filter(
      (task) => progressStore.tasksCompletions?.[task.id]?.[teamStoreId.value] == true
    ).length;
  });
  const groupIcon = computed(() => {
    const level = progressStore.getLevel(props.teammember);
    const entry = playerLevels.value.find((pl) => pl.level === level);
    return entry?.levelBadgeImageLink ?? '';
  });
  const kickingTeammate = ref(false);
  const kickTeammateResult = ref(null);
  const kickTeammateSnackbar = ref(false);
  const kickTeammate = async () => {
    if (!props.teammember) return;
    kickingTeammate.value = true;
    try {
      const idToken = await fireuser.value.getIdToken();
      const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
      const response = await fetch(
        `https://us-central1-${projectId}.cloudfunctions.net/kickTeamMember`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ kicked: props.teammember }),
        }
      );
      const result = await response.json();
      if (!response.ok) {
        let backendMsg = result.error || t('page.team.card.manageteam.membercard.kick_error');
        kickTeammateResult.value = backendMsg;
        kickTeammateSnackbar.value = true;
        throw new Error(backendMsg);
      }
      if (!result.kicked) {
        kickTeammateResult.value = t('page.team.card.manageteam.membercard.kick_error');
        kickTeammateSnackbar.value = true;
        return;
      }
      kickTeammateResult.value = t('page.team.card.manageteam.membercard.kick_success');
      kickTeammateSnackbar.value = true;
    } catch (error) {
      let backendMsg = error?.message || error?.data?.message || error?.toString();
      kickTeammateResult.value = backendMsg || t('page.team.card.manageteam.membercard.kick_error');
      console.error('[TeammemberCard.vue] Error kicking teammate:', error);
      kickTeammateSnackbar.value = true;
    }
    kickingTeammate.value = false;
  };
</script>
<style lang="scss" scoped></style>
