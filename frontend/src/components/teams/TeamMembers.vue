<template>
  <icon-card icon="mdi-account-group" icon-background="secondary" icon-color="white">
    <template #stat>
      {{ $t('page.team.card.manageteam.title') }}
    </template>
    <template #content>
      <template v-if="teamStore.$state.members && teamStore.$state.members.length > 0">
        <tracker-tip tip="teammembers" class="text-left"></tracker-tip>
        <v-container>
          <v-row>
            <v-col
              v-for="teammate in teamStore.$state.members || []"
              :key="teammate"
              cols="12"
              sm="12"
              md="6"
              lg="4"
              xl="4"
            >
              <teammember-card
                :teammember="teammate"
                :is-team-owner-view="isCurrentUserTeamOwner"
              ></teammember-card>
            </v-col>
          </v-row>
        </v-container>
      </template>
      <template v-else-if="teamStore.$state.members">
        <v-container>
          <v-row>
            <v-col cols="12" class="text-center">
              {{ $t('page.team.card.manageteam.no_members') }}
            </v-col>
          </v-row>
        </v-container>
      </template>
      <template v-else> </template>
    </template>
  </icon-card>
</template>
<script setup>
  import {
    computed,
    defineAsyncComponent,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    defineProps,
  } from 'vue';
  import { useLiveData } from '@/composables/livedata';
  import { fireuser } from '@/plugins/firebase';
  const IconCard = defineAsyncComponent(() => import('@/components/IconCard'));
  const TeammemberCard = defineAsyncComponent(() => import('@/components/teams/TeammemberCard'));
  const TrackerTip = defineAsyncComponent(() => import('@/components/TrackerTip'));
  const { useTeamStore } = useLiveData();
  const teamStore = useTeamStore();
  const isCurrentUserTeamOwner = computed(() => {
    const currentTeamOwner = teamStore.$state.owner;
    const currentFireUID = fireuser.uid;
    console.log(
      `[TeamMembers.vue] isCurrentUserTeamOwner computed. ` +
        `teamStore.$state.owner: ${currentTeamOwner}, ` +
        `fireuser.uid: ${currentFireUID}, result: ${currentTeamOwner === currentFireUID}`
    );
    return currentTeamOwner === currentFireUID;
  });
</script>
<style lang="scss" scoped></style>
