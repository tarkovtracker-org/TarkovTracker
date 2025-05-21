<template>
  <fitted-card icon="mdi-account-wrench" icon-color="white" highlight-color="secondary">
    <template #title>
      {{ $t('page.team.card.teamoptions.title') }}
    </template>
    <template #content>
      <v-container>
        <v-row>
          <v-col cols="12">
            <v-switch
              v-model="taskHideAll"
              inset
              true-icon="mdi-eye-off"
              false-icon="mdi-eye"
              color="error"
              base-color="green"
              hide-details
              density="compact"
            >
              <template #label>
                <div style="text-align: left">{{ $t(taskHideAllLabel) }}</div>
              </template>
            </v-switch>
            <v-switch
              v-model="itemsHideAll"
              inset
              true-icon="mdi-eye-off"
              false-icon="mdi-eye"
              color="error"
              base-color="green"
              hide-details
              density="compact"
            >
              <template #label>
                <div style="text-align: left">{{ $t(itemsHideAllLabel) }}</div>
              </template>
            </v-switch>
            <v-switch
              v-model="itemsHideNonFIR"
              :disabled="itemsHideAll"
              inset
              true-icon="mdi-eye-off"
              false-icon="mdi-eye"
              color="error"
              base-color="green"
              hide-details
              density="compact"
            >
              <template #label>
                <div style="text-align: left">{{ $t(itemsHideNonFIRLabel) }}</div>
              </template>
            </v-switch>
            <v-switch
              v-model="itemsHideHideout"
              :disabled="itemsHideAll"
              inset
              true-icon="mdi-eye-off"
              false-icon="mdi-eye"
              color="error"
              base-color="green"
              hide-details
              density="compact"
            >
              <template #label>
                <div style="text-align: left">{{ $t(itemsHideHideoutLabel) }}</div>
              </template>
            </v-switch>
            <v-switch
              v-model="mapHideAll"
              inset
              true-icon="mdi-eye-off"
              false-icon="mdi-eye"
              color="error"
              base-color="green"
              hide-details
              density="compact"
            >
              <template #label>
                <div style="text-align: left">{{ $t(mapHideAllLabel) }}</div>
              </template>
            </v-switch>
          </v-col>
        </v-row>
      </v-container>
    </template>
  </fitted-card>
</template>
<script setup>
  import { computed } from 'vue';
  import { useUserStore } from '@/stores/user';
  import FittedCard from '@/components/FittedCard';
  const userStore = useUserStore();
  const taskHideAll = computed({
    get: () => userStore.taskTeamAllHidden,
    set: (value) => userStore.setQuestTeamHideAll(value),
  });
  const taskHideAllLabel = computed(() =>
    userStore.taskTeamAllHidden
      ? 'page.team.card.teamoptions.task_hide_all'
      : 'page.team.card.teamoptions.task_show_all'
  );
  const itemsHideAll = computed({
    get: () => userStore.itemsTeamAllHidden,
    set: (value) => userStore.setItemsTeamHideAll(value),
  });
  const itemsHideAllLabel = computed(() =>
    userStore.itemsTeamAllHidden
      ? 'page.team.card.teamoptions.items_hide_all'
      : 'page.team.card.teamoptions.items_show_all'
  );
  const itemsHideNonFIR = computed({
    get: () => userStore.itemsTeamNonFIRHidden,
    set: (value) => userStore.setItemsTeamHideNonFIR(value),
  });
  const itemsHideNonFIRLabel = computed(() =>
    userStore.itemsTeamNonFIRHidden
      ? 'page.team.card.teamoptions.items_hide_non_fir'
      : 'page.team.card.teamoptions.items_show_non_fir'
  );
  const itemsHideHideout = computed({
    get: () => userStore.itemsTeamHideoutHidden,
    set: (value) => userStore.setItemsTeamHideHideout(value),
  });
  const itemsHideHideoutLabel = computed(() =>
    userStore.itemsTeamHideoutHidden
      ? 'page.team.card.teamoptions.items_hide_hideout'
      : 'page.team.card.teamoptions.items_show_hideout'
  );
  const mapHideAll = computed({
    get: () => userStore.mapTeamAllHidden,
    set: (value) => userStore.setMapTeamHideAll(value),
  });
  const mapHideAllLabel = computed(() =>
    userStore.mapTeamAllHidden
      ? 'page.team.card.teamoptions.map_hide_all'
      : 'page.team.card.teamoptions.map_show_all'
  );
</script>
<style lang="scss" scoped></style>
