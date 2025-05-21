<template>
  <tracker-tip :tip="{ id: 'team' }"></tracker-tip>
  <v-container v-if="fireuser.loggedIn">
    <v-row v-if="route?.query?.team && route?.query?.code" justify="center">
      <v-col cols="12">
        <team-invite></team-invite>
      </v-col>
    </v-row>
    <v-row v-if="fireuser.loggedIn" justify="center">
      <v-col v-if="systemStore.$state.team" cols="12">
        <team-members></team-members>
      </v-col>
      <v-col cols="12" sm="12" md="12" lg="6" xl="6">
        <my-team></my-team>
      </v-col>
      <v-col cols="12" sm="12" md="12" lg="6" xl="6">
        <team-options></team-options>
      </v-col>
    </v-row>
  </v-container>
</template>
<script setup>
  import { fireuser } from '@/plugins/firebase';
  import { useLiveData } from '@/composables/livedata';
  import { useRoute } from 'vue-router';
  import { defineAsyncComponent } from 'vue';
  const TeamMembers = defineAsyncComponent(() => import('@/components/teams/TeamMembers'));
  const TeamOptions = defineAsyncComponent(() => import('@/components/teams/TeamOptions'));
  const MyTeam = defineAsyncComponent(() => import('@/components/teams/MyTeam'));
  const TrackerTip = defineAsyncComponent(() => import('@/components/TrackerTip'));
  const TeamInvite = defineAsyncComponent(() => import('@/components/teams/TeamInvite'));
  const { useSystemStore } = useLiveData();
  const systemStore = useSystemStore();
  const route = useRoute();
</script>
<style lang="scss" scoped></style>
