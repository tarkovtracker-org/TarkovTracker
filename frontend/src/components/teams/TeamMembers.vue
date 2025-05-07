<template>
  <icon-card
    icon="mdi-account-group"
    icon-background="secondary"
    icon-color="white"
  >
    <template #stat>
      {{ $t('page.team.card.manageteam.title') }}
    </template>
    <template #content>
      <template
        v-if="teamStore.$state.members && teamStore.$state.members.length > 0"
      >
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
              <teammember-card :teammember="teammate"></teammember-card>
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
      <template v-else>
        <!-- You could put a v-progress-circular here or just leave it blank -->
      </template>
    </template>
  </icon-card>
</template>
<script setup>
  import { defineAsyncComponent, watch } from 'vue';
  import { useLiveData } from '@/composables/livedata';
  const IconCard = defineAsyncComponent(
    () => import('@/components/IconCard.vue')
  );
  const TeammemberCard = defineAsyncComponent(
    () => import('@/components/teams/TeammemberCard.vue')
  );
  const TrackerTip = defineAsyncComponent(
    () => import('@/components/TrackerTip.vue')
  );
  const { useTeamStore } = useLiveData();
  const teamStore = useTeamStore();

  // You can remove these watches now if the template change works, or keep them for one more test run.
  /*
  watch(() => teamStore.teamMembers, (newMembers, oldMembers) => {
    console.log('[TeamMembers.vue] watch teamStore.teamMembers RAW:', newMembers);
    if (newMembers) {
      console.log('[TeamMembers.vue] watch teamStore.teamMembers length:', newMembers.length);
    }
  }, { deep: true, immediate: true });

  watch(() => teamStore.$state.members, (newMembers, oldMembers) => {
    console.log('[TeamMembers.vue] watch teamStore.$state.members RAW:', newMembers);
    if (newMembers) {
      console.log('[TeamMembers.vue] watch teamStore.$state.members length:', newMembers.length);
    }
  }, { deep: true, immediate: true });
  */
</script>
<style lang="scss" scoped></style>
