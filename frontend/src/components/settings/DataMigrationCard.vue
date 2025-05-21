<template>
  <fitted-card icon="mdi-database-import-outline" icon-color="white">
    <template #title>Data Migration</template>
    <template #content>
      <p class="mb-4">
        Migrate your progress data from the old TarkovTracker site to this new instance.
      </p>
      <v-card variant="flat" class="mb-3 migration-card">
        <v-card-text>
          <div class="migration-steps mb-4">
            <div class="step-item">
              <span class="step-number">1</span>
              <span class="step-text">
                Go to
                <a href="https://tarkovtracker.io/settings" target="_blank" class="info-link">
                  tarkovtracker.io/settings
                </a>
              </span>
            </div>
            <div class="step-item">
              <span class="step-number">2</span>
              <span class="step-text">Login if you're not already logged in</span>
            </div>
            <div class="step-item">
              <span class="step-number">3</span>
              <span class="step-text">Go to Settings > API Tokens</span>
            </div>
            <div class="step-item">
              <span class="step-number">4</span>
              <span class="step-text"
                >Create a new token with "Get Progression" permission enabled</span
              >
            </div>
            <div class="step-item">
              <span class="step-number">5</span>
              <span class="step-text">Copy the token and paste it below</span>
            </div>
          </div>
          <form @submit.prevent="fetchWithApiToken">
            <v-text-field
              v-model="apiToken"
              label="API Token from Old Site"
              placeholder="Paste your API token here..."
              variant="outlined"
              :disabled="fetchingApi"
              :error-messages="apiError"
              hide-details="auto"
              class="mb-4"
              :type="showToken ? 'text' : 'password'"
              :append-inner-icon="showToken ? 'mdi-eye-off' : 'mdi-eye'"
              autocomplete="off"
              @click:append-inner="showToken = !showToken"
            ></v-text-field>
            <v-text-field
              v-model="apiEndpoint"
              label="Old Site API Endpoint"
              placeholder="e.g. https://tarkovtracker.io/api/v2/progress"
              variant="outlined"
              :disabled="fetchingApi"
              :error-messages="apiEndpointError"
              hint="Change this only if the old site uses a different API endpoint. 
                Must include https:// and full path."
              persistent-hint
              class="mb-2"
            ></v-text-field>
            <div class="mb-4" style="font-size: 0.95em; color: #888; text-align: left">
              <span
                >Endpoint being used: <code>{{ apiEndpoint }}</code></span
              >
            </div>
            <div class="d-flex justify-space-between align-center">
              <div v-if="fetchingApi">
                <v-progress-circular
                  indeterminate
                  color="primary"
                  size="24"
                  class="mr-2"
                ></v-progress-circular>
                <span>Fetching data...</span>
              </div>
              <v-alert
                v-else-if="apiFetchSuccess"
                type="success"
                variant="tonal"
                density="compact"
                class="mb-0 mt-0 flex-grow-1 mr-4"
              >
                Data fetched successfully! Confirm below to import.
              </v-alert>
              <v-spacer v-else></v-spacer>
              <v-btn
                color="primary"
                :loading="fetchingApi"
                :disabled="!apiToken || fetchingApi"
                class="px-4"
                @click="fetchWithApiToken"
              >
                Fetch Data
              </v-btn>
            </div>
          </form>
        </v-card-text>
      </v-card>
      <v-dialog v-model="confirmDialog" max-width="700">
        <v-card>
          <v-card-title class="text-h5 px-4 py-3">Confirm Data Import</v-card-title>
          <v-card-text class="px-4 pb-4">
            <p class="mb-5">This will replace your current progress with the imported data:</p>
            <v-row>
              <v-col cols="12" md="6">
                <v-card variant="outlined" class="mb-4 pa-1">
                  <v-card-title class="text-subtitle-1 px-4 py-2">PMC Information</v-card-title>
                  <v-list density="compact" class="px-2">
                    <v-list-item>
                      <template #prepend>
                        <v-icon icon="mdi-account" class="mr-3"></v-icon>
                      </template>
                      <v-list-item-title
                        >Level: {{ importedData?.level || 'N/A' }}</v-list-item-title
                      >
                    </v-list-item>
                    <v-list-item>
                      <template #prepend>
                        <v-icon icon="mdi-shield" class="mr-3"></v-icon>
                      </template>
                      <v-list-item-title
                        >Faction: {{ importedData?.pmcFaction || 'N/A' }}</v-list-item-title
                      >
                    </v-list-item>
                    <v-list-item>
                      <template #prepend>
                        <v-icon icon="mdi-package-variant" class="mr-3"></v-icon>
                      </template>
                      <v-list-item-title style="white-space: normal; overflow: visible">
                        Edition: {{ getEditionName }}
                      </v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-card>
              </v-col>
              <v-col cols="12" md="6">
                <v-card variant="outlined" class="mb-4 pa-1">
                  <v-card-title class="text-subtitle-1 px-4 py-2">Task Progress</v-card-title>
                  <v-list density="compact" class="px-2">
                    <v-list-item>
                      <template #prepend>
                        <v-icon icon="mdi-check-circle" class="mr-3"></v-icon>
                      </template>
                      <v-list-item-title class="d-flex align-center">
                        Completed Tasks: {{ countCompletedTasks }}
                      </v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <template #prepend>
                        <v-icon icon="mdi-format-list-checks" class="mr-3"></v-icon>
                      </template>
                      <v-list-item-title class="d-flex align-center">
                        Task Objectives: {{ countTaskObjectives }}
                        <v-btn
                          size="small"
                          icon
                          variant="text"
                          class="ml-2"
                          @click="showObjectivesDetails = true"
                        >
                          <v-icon>mdi-information-outline</v-icon>
                        </v-btn>
                      </v-list-item-title>
                    </v-list-item>
                    <v-list-item v-if="countFailedTasks > 0">
                      <template #prepend>
                        <v-icon icon="mdi-close-circle" class="mr-3"></v-icon>
                      </template>
                      <v-list-item-title class="d-flex align-center">
                        Failed Tasks: {{ countFailedTasks }}
                        <v-btn
                          size="small"
                          icon
                          variant="text"
                          class="ml-2"
                          @click="showFailedTaskDetails = true"
                        >
                          <v-icon>mdi-information-outline</v-icon>
                        </v-btn>
                      </v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-card>
              </v-col>
            </v-row>
            <v-row>
              <v-col cols="12">
                <v-card variant="outlined" class="pa-1">
                  <v-card-title class="text-subtitle-1 px-4 py-2">Hideout Progress</v-card-title>
                  <v-list density="compact" class="px-2">
                    <v-list-item>
                      <template #prepend>
                        <v-icon icon="mdi-home" class="mr-3"></v-icon>
                      </template>
                      <v-list-item-title
                        >Completed Modules: {{ countHideoutModules }}</v-list-item-title
                      >
                    </v-list-item>
                    <v-list-item>
                      <template #prepend>
                        <v-icon icon="mdi-tools" class="mr-3"></v-icon>
                      </template>
                      <v-list-item-title
                        >Tracked Materials: {{ countHideoutParts }}</v-list-item-title
                      >
                    </v-list-item>
                  </v-list>
                </v-card>
              </v-col>
            </v-row>
            <p class="mt-5 text-red font-weight-bold">Warning: This action cannot be undone!</p>
          </v-card-text>
          <v-card-actions class="px-4 pb-4">
            <v-spacer></v-spacer>
            <v-btn color="grey" variant="flat" class="px-4" @click="confirmDialog = false">
              Cancel
            </v-btn>
            <v-btn
              color="error"
              variant="flat"
              :loading="importing"
              class="ml-3 px-4"
              @click="confirmImport"
            >
              Confirm Import
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
      <!-- Add task objectives explanation dialog -->
      <v-dialog v-model="showObjectivesDetails" max-width="500">
        <v-card>
          <v-card-title class="text-h6">Task Objectives Information</v-card-title>
          <v-card-text>
            <p>
              The count of {{ countTaskObjectives }} task objectives represents all objective data
              in your import.
            </p>
            <p class="mt-3">
              The dashboard may show a different number because it only counts unique task
              objectives that are currently relevant to your progress.
            </p>
            <p class="mt-3">
              This difference is normal and doesn't indicate any problem with your data migration.
            </p>
          </v-card-text>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn color="primary" variant="flat" @click="showObjectivesDetails = false"
              >Close</v-btn
            >
          </v-card-actions>
        </v-card>
      </v-dialog>
      <!-- Failed task details dialog with updated button -->
      <v-dialog v-model="showFailedTaskDetails" max-width="500">
        <v-card>
          <v-card-title class="text-h6">Failed Task Details</v-card-title>
          <v-card-text>
            <p>
              These tasks are marked as "failed" in your data. This typically happens when you chose
              a different quest branch or when a task became unavailable.
            </p>
            <v-list density="compact">
              <v-list-item v-for="task in failedTasks" :key="task.id">
                <v-list-item-title>
                  Task ID: {{ task.id }}
                  <v-chip size="small" color="red" class="ml-2">Failed</v-chip>
                </v-list-item-title>
                <v-list-item-subtitle>
                  This task will remain marked as failed after migration.
                </v-list-item-subtitle>
              </v-list-item>
            </v-list>
            <p class="mt-3">
              <strong>Note:</strong> This is normal for tasks that are mutually exclusive with other
              tasks you've completed.
            </p>
          </v-card-text>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn color="primary" variant="flat" @click="showFailedTaskDetails = false"
              >Close</v-btn
            >
          </v-card-actions>
        </v-card>
      </v-dialog>
    </template>
  </fitted-card>
</template>
<script setup>
  import { ref, computed } from 'vue';
  import { fireuser } from '@/plugins/firebase';
  import { markDataMigrated } from '@/plugins/store-initializer';
  import DataMigrationService from '@/utils/DataMigrationService';
  import { useTarkovStore } from '@/stores/tarkov';
  import FittedCard from '@/components/FittedCard';
  // API migration variables
  const apiToken = ref('');
  const apiEndpoint = ref('https://tarkovtracker.io/api/v2/progress');
  const apiError = ref('');
  const apiEndpointError = ref('');
  const fetchingApi = ref(false);
  const apiFetchSuccess = ref(false);
  const showToken = ref(false);
  // Import confirmation variables
  const importError = ref('');
  const importing = ref(false);
  const importSuccess = ref(false);
  const confirmDialog = ref(false);
  const importedData = ref(null);
  // Get the tarkov store
  const tarkovStore = useTarkovStore();
  // Compute the number of completed tasks
  const countCompletedTasks = computed(() => {
    if (!importedData.value || !importedData.value.taskCompletions) {
      return 0;
    }
    return Object.values(importedData.value.taskCompletions).filter((t) => t.complete).length;
  });
  // Compute the number of failed tasks
  const countFailedTasks = computed(() => {
    if (!importedData.value || !importedData.value.taskCompletions) {
      return 0;
    }
    return Object.values(importedData.value.taskCompletions).filter((t) => t.failed).length;
  });
  // Compute the number of completed task objectives
  const countTaskObjectives = computed(() => {
    if (!importedData.value || !importedData.value.taskObjectives) {
      return 0;
    }
    return Object.keys(importedData.value.taskObjectives).length;
  });
  // Compute the number of completed hideout modules
  const countHideoutModules = computed(() => {
    if (!importedData.value || !importedData.value.hideoutModules) {
      return 0;
    }
    return Object.values(importedData.value.hideoutModules).filter((m) => m.complete).length;
  });
  // Compute the number of tracked hideout parts
  const countHideoutParts = computed(() => {
    if (!importedData.value || !importedData.value.hideoutParts) {
      return 0;
    }
    return Object.keys(importedData.value.hideoutParts).length;
  });
  // Get edition name based on edition number
  const getEditionName = computed(() => {
    if (!importedData.value) return 'N/A';
    const edition = importedData.value.gameEdition;
    switch (edition) {
      case 1:
        return 'Standard Edition';
      case 2:
        return 'Left Behind Edition';
      case 3:
        return 'Prepare for Escape Edition';
      case 4:
        return 'Edge of Darkness Edition';
      case 5:
        return 'Unheard Edition';
      default:
        return `Edition ${edition}`;
    }
  });
  // Add state for the objectives info dialog
  const showObjectivesDetails = ref(false);
  // Add state for the failed tasks dialog
  const showFailedTaskDetails = ref(false);
  // Get a list of failed tasks
  const failedTasks = computed(() => {
    if (!importedData.value || !importedData.value.taskCompletions) {
      return [];
    }
    return Object.entries(importedData.value.taskCompletions)
      .filter(([_, task]) => task.failed === true)
      .map(([id, task]) => ({
        id,
        ...task,
      }));
  });
  // Fetch data using an API token
  const fetchWithApiToken = async () => {
    fetchingApi.value = true;
    apiError.value = '';
    apiFetchSuccess.value = false;
    apiEndpointError.value = '';
    try {
      // Validate token format (basic validation)
      if (!apiToken.value || apiToken.value.length < 10) {
        apiError.value = 'Please enter a valid API token';
        fetchingApi.value = false;
        return;
      }
      // Validate endpoint
      let endpoint = apiEndpoint.value.trim();
      try {
        new URL(endpoint);
      } catch {
        apiEndpointError.value = 'Please enter a valid URL (must start with https://)';
        fetchingApi.value = false;
        return;
      }
      if (!endpoint.endsWith('/api/v2/progress')) {
        apiEndpointError.value = 'Endpoint must end with /api/v2/progress';
        fetchingApi.value = false;
        return;
      }
      // Call the service to fetch data
      const data = await DataMigrationService.fetchDataWithApiToken(apiToken.value, endpoint);
      if (!data) {
        apiError.value = 'Failed to fetch data. Please check your token, endpoint, and try again.';
        fetchingApi.value = false;
        return;
      }
      // Store the fetched data
      importedData.value = data;
      apiFetchSuccess.value = true;
      // Show confirmation dialog
      confirmDialog.value = true;
    } catch (_error) {
      console.error('Error fetching data with API token:', _error);
      if (_error && _error.message) {
        apiError.value = `Error: ${_error.message}`;
      } else {
        apiError.value = 'Unknown error occurred during fetch.';
      }
    } finally {
      fetchingApi.value = false;
    }
  };
  // Confirm and execute the import
  const confirmImport = async () => {
    importing.value = true;
    importError.value = '';
    try {
      const result = await DataMigrationService.importDataToUser(fireuser.uid, importedData.value);
      if (result) {
        importSuccess.value = true;
        // Mark as migrated to ensure data persistence
        markDataMigrated();
        // Rebind the store to load the imported data
        if (tarkovStore && typeof tarkovStore.firebindAll === 'function') {
          tarkovStore.firebindAll();
        } else {
          // Force page reload as fallback
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      } else {
        importError.value = 'Failed to import data. Please try again.';
      }
    } catch (error) {
      console.error('Error during import:', error);
      importError.value = 'Error during import: ' + error.message;
    } finally {
      importing.value = false;
      confirmDialog.value = false;
    }
  };
</script>
<style scoped>
  code {
    font-family: monospace;
    white-space: pre-wrap;
  }
  .migration-card {
    border: 1px solid rgba(var(--v-theme-primary), 0.2);
    border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
  }
  .info-link {
    color: rgba(var(--v-theme-link), 1);
    text-decoration: none;
  }
  .info-link:hover {
    text-decoration: underline;
  }
  .migration-steps {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .step-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .step-number {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    background-color: rgba(var(--v-theme-primary), 1);
    color: white;
    border-radius: 50%;
    font-size: 14px;
    font-weight: bold;
  }
  .step-text {
    padding-top: 2px;
    text-align: left;
  }
</style>
