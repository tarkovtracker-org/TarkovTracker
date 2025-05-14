<template>
  <!-- Force the dialog to be visible with !important styles -->
  <div v-if="dialog" class="migration-dialog-overlay">
    <v-card class="migration-dialog mx-auto" max-width="500" elevation="24">
      <v-card-title class="text-h4 py-4 text-center">
        Data Migration
        <v-chip color="warning" class="ml-2">Important!</v-chip>
      </v-card-title>
      <v-card-text class="pa-4 text-body-1">
        <p class="mb-6 text-center">
          You have existing progress data (Level {{ localUserLevel }}) saved in
          your browser. <br /><br />
          Would you like to:
        </p>
        <div class="d-flex flex-column gap-4">
          <v-btn
            variant="elevated"
            color="success"
            block
            @click="migrateData"
            :loading="loading"
            :disabled="loading"
            height="56"
            class="text-h6"
          >
            <v-icon start size="large">mdi-database-import</v-icon>
            Migrate existing data to your account
          </v-btn>
          <v-btn
            variant="outlined"
            block
            @click="startFresh"
            :disabled="loading"
            height="56"
            class="text-h6"
          >
            <v-icon start size="large">mdi-restart</v-icon>
            Start fresh (existing data will be discarded)
          </v-btn>
        </div>
        <!-- Debug info -->
        <div class="debug-info mt-6 pa-2">
          <p>Debug Info:</p>
          <ul>
            <li>User ID: {{ props.userId }}</li>
            <li>Dialog State: {{ dialog }}</li>
            <li>Local Level: {{ localUserLevel }}</li>
          </ul>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>
<script setup>
  import { ref, watch, onMounted, computed } from 'vue';
  import DataMigrationService from '@/services/DataMigrationService';
  import { initializeStore } from '@/plugins/store-initializer';
  import { useTarkovStore } from '@/stores/tarkov'; // Static import

  // No direct import of the store - we'll dynamically import it only when needed
  let tarkovStore = null;
  const props = defineProps({
    userId: {
      type: String,
      required: true,
    },
    show: {
      type: Boolean,
      default: false,
    },
  });
  const emit = defineEmits(['close']);
  const dialog = ref(false);
  const loading = ref(false);
  // Get the local user level to display in the dialog
  const localUserLevel = computed(() => {
    try {
      const localData = DataMigrationService.getLocalData();
      return localData?.level || 1;
    } catch (error) {
      console.error('Error getting local user level:', error);
      return 1;
    }
  });
  // Use the store initializer to safely get the store
  const getTarkovStore = async () => {
    if (tarkovStore) return tarkovStore;
    try {
      // Dynamically import the store module
      // const storeModule = await import("@/stores/tarkov"); // Removed dynamic import
      // Use the store initializer to safely initialize
      tarkovStore = await initializeStore('tarkov', useTarkovStore); // Pass useTarkovStore directly
      return tarkovStore;
    } catch (error) {
      console.error('Error initializing tarkovStore:', error);
      return null;
    }
  };
  onMounted(async () => {
    // First make the dialog visible
    dialog.value = true;
    // Force dialog to be visible with a timeout
    setTimeout(() => {
      if (!dialog.value) {
        console.warn('FORCING DIALOG VISIBILITY');
        dialog.value = true;
      }
    }, 100);
    // Then initialize store in a non-blocking way
    setTimeout(async () => {
      const store = await getTarkovStore();
    }, 300);
  });
  // Watch for changes to the show prop
  watch(
    () => props.show,
    (newVal) => {
      dialog.value = true; // Always force to true to ensure visibility
    },
    { immediate: true }
  );
  // Close the dialog when dialog is closed
  watch(dialog, (newVal) => {
    if (!newVal) {
      emit('close');
    }
  });
  // Migrate the data from localStorage to the user's account
  const migrateData = async () => {
    loading.value = true;
    try {
      // Step 1: Get the local data (level 18, etc.)
      const localData = DataMigrationService.getLocalData();
      if (!localData) {
        console.warn('No local data found to migrate');
        loading.value = false;
        return;
      }
      // Step 2: Migrate the data to the user's account
      const result = await DataMigrationService.migrateDataToUser(props.userId);
      if (result) {
        // Step 3: If successful, rebind the store to Firebase to show the migrated data
        const store = await getTarkovStore();
        if (store && typeof store.firebindAll === 'function') {
          store.firebindAll();
          // Add a short delay before closing to ensure data is loaded
          setTimeout(() => {
            dialog.value = false;
          }, 500);
        } else {
          console.warn(
            'tarkovStore.firebindAll is not available, using fallback'
          );
          // Fallback - try to reload the page to force data refresh
          dialog.value = false;
          setTimeout(() => {
            window.location.reload();
          }, 500);
        }
      } else {
        console.error('Migration failed');
        alert('Migration failed. Please try again or contact support.');
      }
    } catch (error) {
      console.error('Error migrating data:', error);
      alert('Error during migration. Please try again.');
    } finally {
      loading.value = false;
    }
  };
  // Start fresh with a new account
  const startFresh = async () => {
    try {
      // Rebind the store to Firebase to get a fresh state
      const store = await getTarkovStore();
      if (store && typeof store.firebindAll === 'function') {
        store.firebindAll();
      } else {
        console.warn(
          'tarkovStore.firebindAll is not available, using fallback'
        );
        // Fallback - reload the page to force a fresh state
        setTimeout(() => {
          window.location.reload();
        }, 300);
      }
    } catch (error) {
      console.error('Error rebinding store:', error);
    }
    // Close the dialog
    dialog.value = false;
  };
</script>
<style scoped>
  .migration-dialog-overlay {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    background-color: rgba(0, 0, 0, 0.9) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 9999999 !important; /* Super high z-index to ensure visibility */
    padding: 20px !important;
  }
  .migration-dialog {
    background-color: rgb(18, 25, 30) !important;
    border: 2px solid rgba(255, 193, 7, 0.8) !important;
    box-shadow: 0 0 30px rgba(255, 193, 7, 0.3) !important;
    padding: 20px !important;
    max-height: 90vh !important;
    overflow-y: auto !important;
    animation: pulse 2s infinite !important;
    position: relative !important;
    z-index: 10000000 !important; /* Even higher z-index */
  }
  @keyframes pulse {
    0% {
      box-shadow: 0 0 15px rgba(255, 193, 7, 0.3);
    }
    50% {
      box-shadow: 0 0 30px rgba(255, 193, 7, 0.5);
    }
    100% {
      box-shadow: 0 0 15px rgba(255, 193, 7, 0.3);
    }
  }
  .debug-info {
    font-size: 12px;
    opacity: 0.7;
    background-color: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
  }
</style>
