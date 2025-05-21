<template>
  <v-container
    class="h-100 pb-0 mb-0"
    style="
      min-height: calc(100vh - 210px);
      margin-bottom: 0 !important;
      padding-bottom: 0 !important;
    "
  >
    <v-row justify="center">
      <v-col v-if="fireuser.loggedIn" cols="12" sm="12" md="12" lg="12" xl="12">
        <fitted-card icon="mdi-key-chain" icon-color="white">
          <template #title>
            {{ $t('page.settings.card.apitokens.title') }}
          </template>
          <template #content>
            <div style="text-align: left" class="pt-2 px-4">
              <i18n-t keypath="page.settings.card.apitokens.description" scope="global">
                <template #openAPI_documentation>
                  <a
                    href="https://tarkovtracker-org.github.io/TarkovTracker/"
                    target="_blank"
                    class="info-link"
                  >
                    <v-icon class="mr-1" size="16">mdi-file-document</v-icon
                    >{{ $t('page.settings.card.apitokens.openAPI_documentation') }}
                  </a>
                </template>
              </i18n-t>
            </div>
            <api-tokens />
          </template>
        </fitted-card>
      </v-col>
      <v-col v-else cols="12" sm="12" md="12" lg="12" xl="12">
        <fitted-card icon="mdi-key-chain" icon-color="white">
          <template #title>
            {{ $t('page.settings.card.apitokens.title') }}
          </template>
          <template #content>
            <div style="text-align: left" class="pt-2 px-4">
              <i18n-t keypath="page.settings.card.apitokens.description" scope="global">
                <template #openAPI_documentation>
                  <a
                    href="https://tarkovtracker-org.github.io/TarkovTracker/"
                    target="_blank"
                    class="info-link"
                  >
                    <v-icon class="mr-1" size="16">mdi-file-document</v-icon
                    >{{ $t('page.settings.card.apitokens.openAPI_documentation') }}
                  </a>
                </template>
              </i18n-t>
            </div>
            <v-row justify="center">
              <v-col cols="12">
                <v-alert dense outlined type="error" :value="true" class="ma-2">
                  {{ $t('page.settings.card.apitokens.not_logged_in') }}
                </v-alert>
              </v-col>
            </v-row>
          </template>
        </fitted-card>
      </v-col>
      <v-col v-if="fireuser.loggedIn" cols="12" sm="12" md="6" lg="4" xl="4">
        <fitted-card icon="mdi-eye" icon-color="white">
          <template #title>
            {{ $t('page.settings.card.streamermode.title') }}
          </template>
          <template #content>
            <div style="text-align: left" class="pt-2 px-4">
              {{ $t('page.settings.card.streamermode.description') }}
            </div>
            <v-container>
              <v-row justify="center">
                <v-col cols="12">
                  <v-switch
                    v-model="streamerMode"
                    :disabled="Boolean(userStore.saving && userStore.saving.streamerMode)"
                    hide-details
                    density="compact"
                    color="green"
                    base-color="error"
                    :label="
                      streamerMode
                        ? $t('page.settings.card.streamermode.modeOn')
                        : $t('page.settings.card.streamermode.modeOff')
                    "
                  >
                  </v-switch>
                  <v-progress-circular
                    v-if="userStore.saving && userStore.saving.streamerMode"
                    indeterminate
                    color="primary"
                    size="20"
                    class="ml-2 align-middle"
                  />
                </v-col>
              </v-row>
            </v-container>
          </template>
        </fitted-card>
      </v-col>
      <v-col cols="12" sm="12" md="6" lg="4" xl="4">
        <quest-filter />
      </v-col>
      <v-col cols="12" sm="12" md="6" lg="4" xl="4">
        <faction-select />
      </v-col>
      <v-col cols="12" sm="12" md="6" lg="4" xl="4">
        <fitted-card icon="mdi-gift-open" icon-color="white">
          <template #title>
            {{ $t('page.settings.card.gameedition.title') }}
          </template>
          <template #content>
            {{ $t('page.settings.card.gameedition.description') }}
            <v-container>
              <v-row justify="center">
                <v-col cols="12">
                  <v-select
                    v-model="currentGameEdition"
                    density="compact"
                    :items="gameEditions"
                    :label="$t('page.settings.card.gameedition.select')"
                    variant="outlined"
                    hide-details
                  ></v-select>
                </v-col>
              </v-row>
            </v-container>
          </template>
        </fitted-card>
      </v-col>
      <v-col v-if="fireuser.loggedIn" cols="12" sm="12" md="6" lg="4" xl="4">
        <data-migration-card />
      </v-col>
    </v-row>
    <!-- Reset section in a separate row at the bottom -->
    <v-row justify="center" class="mt-4">
      <v-col cols="12" sm="8" md="6" lg="4" xl="4">
        <fitted-card icon="mdi-restart-alert" icon-color="white" class="reset-card">
          <template #title>
            {{ $t('page.settings.card.reset.title') }}
          </template>
          <template #content>
            <div class="text-center">
              <p class="mb-3">
                {{ $t('page.settings.card.reset.description') }}
              </p>
              <v-dialog v-model="resetDialog">
                <template #activator="{ props }">
                  <v-btn color="warning" prepend-icon="mdi-alert" v-bind="props">
                    {{ $t('page.settings.card.reset.button') }}
                  </v-btn>
                </template>
                <v-row class="justify-center">
                  <v-col cols="auto">
                    <v-card
                      :title="$t('page.settings.card.reset.confirmtitle')"
                      style="width: fit-content"
                    >
                      <v-card-text>
                        <v-container class="ma-0 pa-0">
                          <v-row no-gutters>
                            <v-col cols="12">
                              {{ $t('page.settings.card.reset.confirmation') }}
                            </v-col>
                          </v-row>
                          <v-row>
                            <v-col cols="12" md="6">
                              <v-btn
                                color="red"
                                block
                                prepend-icon="mdi-alert"
                                @click="
                                  tarkovStore.resetOnlineProfile();
                                  resetDialog = false;
                                "
                              >
                                {{ $t('page.settings.card.reset.confirmresetbutton') }}
                              </v-btn>
                            </v-col>
                            <v-col cols="12" md="6">
                              <v-btn color="primary" block @click="resetDialog = false">{{
                                $t('page.settings.card.reset.confirmcancelbutton')
                              }}</v-btn>
                            </v-col>
                          </v-row>
                        </v-container>
                      </v-card-text>
                    </v-card>
                  </v-col>
                </v-row>
              </v-dialog>
            </div>
          </template>
        </fitted-card>
      </v-col>
    </v-row>
  </v-container>
</template>
<script setup>
  import { ref, computed } from 'vue';
  import { useUserStore } from '@/stores/user';
  import { useTarkovStore } from '@/stores/tarkov';
  import { fireuser } from '@/plugins/firebase';
  import QuestFilter from '@/components/settings/QuestFilter';
  import FactionSelect from '@/components/settings/FactionSelect';
  import ApiTokens from '@/components/settings/ApiTokens';
  import DataMigrationCard from '@/components/settings/DataMigrationCard';
  import FittedCard from '@/components/FittedCard';

  const tarkovStore = useTarkovStore();
  const userStore = useUserStore();
  const resetDialog = ref(false);
  const gameEditions = [
    { title: 'Standard Edition', value: 1 },
    { title: 'Left Behind Edition', value: 2 },
    { title: 'Prepare for Escape Edition', value: 3 },
    { title: 'Edge of Darkness (Limited Edition)', value: 4 },
    { title: 'Unheard Edition', value: 5 },
  ];
  const currentGameEdition = computed({
    get() {
      return tarkovStore.getGameEdition();
    },
    set(newValue) {
      tarkovStore.setGameEdition(newValue);
    },
  });
  const streamerMode = computed({
    get() {
      return userStore.getStreamerMode;
    },
    set(newValue) {
      userStore.setStreamerMode(newValue);
    },
  });
</script>
<style lang="scss" scoped>
  a:link,
  a:active,
  a:visited {
    color: rgba(var(--v-theme-link), 1);
  }
  .info-link {
    text-decoration: none;
  }
  .reset-card {
    border-top: 2px solid rgba(var(--v-theme-warning), 0.5);
  }
</style>
