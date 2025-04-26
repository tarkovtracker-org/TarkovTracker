<template>
  <div>
    <v-container>
      <v-row justify="center" class="mt-4">
        <v-col cols="12" sm="10" md="8" lg="6" xl="4">
          <v-card class="auth-card elevation-8" color="rgb(18, 25, 30)">
            <div class="auth-header">
              <v-avatar size="72" class="mt-8 mb-3">
                <v-icon size="48" color="grey">mdi-shield-account</v-icon>
              </v-avatar>
              <h2 class="text-h5 font-weight-bold mb-2">
                Sign in to access your account
              </h2>
              <p class="text-body-2 text-medium-emphasis mb-6">
                Track your progress, share with friends, and coordinate raids
              </p>
            </div>
            <v-card-text class="px-6 pb-6 pt-2">
              <!-- Google Button with Google styling -->
              <v-btn
                block
                variant="elevated"
                class="mb-4 auth-btn google-btn"
                @click="signInWithGoogle"
                :loading="loading.google"
                :disabled="loading.google || loading.github"
                color="white"
                height="50"
              >
                <div class="d-flex align-center justify-center w-100">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    height="24"
                    viewBox="0 0 24 24"
                    width="24"
                    class="mr-3"
                  >
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  <span class="text-black">Continue with Google</span>
                </div>
              </v-btn>
              <!-- GitHub Button with GitHub styling -->
              <v-btn
                block
                class="auth-btn github-btn"
                @click="signInWithGithub"
                :loading="loading.github"
                :disabled="loading.google || loading.github"
                color="#24292e"
                height="50"
              >
                <div class="d-flex align-center justify-center w-100">
                  <v-icon start color="white" class="mr-3">mdi-github</v-icon>
                  <span class="text-white">Continue with GitHub</span>
                </div>
              </v-btn>
            </v-card-text>
            <div class="auth-footer px-6 py-3">
              <div class="d-flex justify-space-between">
                <v-btn
                  variant="text"
                  color="grey-lighten-1"
                  class="text-caption text-lowercase"
                  href="/privacy"
                  target="_blank"
                >
                  Privacy Policy
                </v-btn>
                <v-btn
                  variant="text"
                  color="grey-lighten-1"
                  class="text-caption text-lowercase"
                  href="/terms"
                  target="_blank"
                >
                  Terms of Service
                </v-btn>
              </div>
            </div>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
    <!-- Data Migration Dialog -->
    <div v-if="showMigrationDialog" class="migration-dialog-container">
      <data-migration-dialog
        :userId="userId"
        :show="showMigrationDialog"
        @close="onMigrationDialogClose"
      />
    </div>
    <!-- Debug display for migration state -->
    <div v-if="DEBUG_MODE" class="debug-panel">
      <p>Migration Debug Panel:</p>
      <ul>
        <li>User ID: {{ userId }}</li>
        <li>Show Dialog: {{ showMigrationDialog }}</li>
        <li>Local Data: {{ hasLocalData ? "Yes" : "No" }}</li>
        <li>Loading: {{ loading.google || loading.github ? "Yes" : "No" }}</li>
      </ul>
      <v-btn color="warning" @click="forceShowMigrationDialog">
        Force Show Dialog
      </v-btn>
    </div>
  </div>
</template>
<script setup>
import { ref, defineAsyncComponent, onMounted, nextTick } from "vue";
import { useRouter } from "vue-router";
import {
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  getAuth,
} from "firebase/auth";
import { app as fireapp, fireuser } from "@/plugins/firebase.ts";
import DataMigrationService from "@/services/DataMigrationService";
import { markDataMigrated } from "@/plugins/store-initializer";
// Defer store import to avoid initialization issues
let tarkovStore = null;
// Enable debug mode in development
const DEBUG_MODE = import.meta.env.DEV;
const hasLocalData = ref(false);
// Async import the dialog component to avoid circular dependencies
const DataMigrationDialog = defineAsyncComponent(
  () => import("@/components/DataMigrationDialog.vue"),
);
const router = useRouter();
const auth = getAuth(fireapp);
const loading = ref({
  google: false,
  github: false,
});
const showMigrationDialog = ref(false);
const userId = ref(null);
// Define emits
const emit = defineEmits(["migration-dialog-shown", "migration-dialog-closed"]);
// Helper function to safely access the store
const getTarkovStore = async () => {
  if (tarkovStore) return tarkovStore;
  try {
    // Dynamically import to avoid initialization issues
    const { useTarkovStore } = await import("@/stores/tarkov");
    // Wait for next tick and a small delay to ensure Pinia is ready
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      tarkovStore = useTarkovStore();
      return tarkovStore;
    } catch (error) {
      console.error("Initial store access failed, retrying:", error);
      // Try one more time after a delay
      await new Promise((resolve) => setTimeout(resolve, 200));
      tarkovStore = useTarkovStore();
      return tarkovStore;
    }
  } catch (error) {
    console.error("Error accessing tarkovStore:", error);
    return null;
  }
};
// Force show migration dialog (for debugging)
const forceShowMigrationDialog = () => {
  userId.value = fireuser.uid || "debug-user";
  showMigrationDialog.value = true;
  emit("migration-dialog-shown");
};
// Prevent automatic navigation after login - we'll handle it manually
onMounted(async () => {
  try {
    // Wait for Vue to finish initial rendering and give Pinia time to initialize
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Check for local data
    hasLocalData.value = DataMigrationService.hasLocalData();
    // If a user is already logged in and we need to show the migration dialog
    if (fireuser.uid) {
      userId.value = fireuser.uid;
      await checkUserDataAndShowMigration(fireuser.uid);
    }
  } catch (error) {
    console.error("Error in onMounted:", error);
  }
});
// This is key - it prevents the store from automatically binding to Firebase
// until the user has made a decision about data migration
const preventFirebaseBinding = async () => {
  try {
    // Try multiple times with increasing delays to get the store safely
    let store = null;
    const maxAttempts = 3;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        // Get store reference safely
        store = await getTarkovStore();
        if (store) break;
        // Wait longer between attempts
        await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
      } catch (error) {
        console.warn(`Store access attempt ${i + 1} failed:`, error);
        if (i === maxAttempts - 1) throw error;
      }
    }
    // Check if the store has a fireunbindAll method (from pinia-firestore)
    if (store?.fireunbindAll && typeof store.fireunbindAll === "function") {
      store.fireunbindAll();
    } else {
      console.warn("tarkovStore.fireunbindAll is not available");
    }
  } catch (error) {
    console.error("Error in preventFirebaseBinding:", error);
  }
};
const checkUserDataAndShowMigration = async (uid) => {
  try {
    // Check if there's local data to migrate
    const hasLocalData = DataMigrationService.hasLocalData();
    if (hasLocalData) {
      // First, prevent automatic binding to Firebase to preserve local data
      await preventFirebaseBinding();
      // Check if user already has data in their account
      const hasUserData = await DataMigrationService.hasUserData(uid);
      if (!hasUserData) {
        userId.value = uid;
        showMigrationDialog.value = true;
        emit("migration-dialog-shown");
        // Simple visibility check - the actual dialog creation is handled in handleAuthSuccess
        setTimeout(() => {
          console.warn(
            "CHECKING MIGRATION DIALOG VISIBILITY:",
            showMigrationDialog.value,
          );
        }, 500);
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error("Error checking user data:", error);
    return false;
  }
};
const handleAuthSuccess = async (user) => {
  userId.value = user.uid;
  try {
    // Check if there's local data to migrate
    const hasLocalData = DataMigrationService.hasLocalData();
    if (hasLocalData) {
      // First, prevent automatic binding to Firebase to preserve local data
      await preventFirebaseBinding();
      // Check if user already has data in their account
      const hasUserData = await DataMigrationService.hasUserData(user.uid);
      if (!hasUserData) {
        // SHOW THE DIALOG INSTEAD OF AUTO-MIGRATING
        userId.value = user.uid;
        showMigrationDialog.value = true;
        emit("migration-dialog-shown");
        // Force dialog visibility with a delay to ensure it's rendered
        setTimeout(() => {
          console.warn(
            "CHECKING MIGRATION DIALOG VISIBILITY:",
            showMigrationDialog.value,
          );
          // Add dialog directly to the body if it's not visible
          if (showMigrationDialog.value) {
            console.warn("ENHANCING MIGRATION DIALOG VISIBILITY");
            // Create a modal container if it doesn't exist
            const existingModal = document.getElementById(
              "migration-dialog-container",
            );
            if (!existingModal) {
              const modalContainer = document.createElement("div");
              modalContainer.id = "migration-dialog-container";
              modalContainer.style.cssText = `
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                background: rgba(0, 0, 0, 0.9) !important;
                z-index: 999999 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
              `;
              // Add buttons for migration choices directly into the container
              modalContainer.innerHTML = `
                <div style="background-color: rgb(18, 25, 30); padding: 30px; border-radius: 8px; max-width: 500px; text-align: center; box-shadow: 0 0 30px rgba(255, 193, 7, 0.3); font-family: 'Share Tech Mono', monospace;">
                  <h2 style="color: white; margin-bottom: 20px; font-family: 'Share Tech Mono', monospace;">Data Migration Options</h2>
                  <p style="color: white; margin-bottom: 30px; font-family: 'Share Tech Mono', monospace;">You have existing progress (Level ${DataMigrationService.getLocalData()?.level || "unknown"}) saved in your browser.</p>
                  <div style="display: flex; flex-direction: column; gap: 15px;">
                    <button id="migrate-btn" style="background: #4CAF50; color: white; border: none; padding: 12px; border-radius: 4px; cursor: pointer; font-size: 16px; font-family: 'Share Tech Mono', monospace; text-transform: uppercase; letter-spacing: 1px;">Migrate Existing Data</button>
                    <button id="fresh-btn" style="background: #607D8B; color: white; border: none; padding: 12px; border-radius: 4px; cursor: pointer; font-size: 16px; font-family: 'Share Tech Mono', monospace; text-transform: uppercase; letter-spacing: 1px;">Start Fresh Account</button>
                  </div>
                  <p style="color: #AAA; margin-top: 20px; font-size: 12px;">User ID: ${user.uid}</p>
                </div>
              `;
              document.body.appendChild(modalContainer);
              // Add event listeners for the buttons
              document
                .getElementById("migrate-btn")
                .addEventListener("click", async () => {
                  const result = await DataMigrationService.migrateDataToUser(
                    user.uid,
                  );
                  if (result) {
                    markDataMigrated();
                    const store = await getTarkovStore();
                    if (store && typeof store.firebindAll === "function") {
                      store.firebindAll();
                    }
                    modalContainer.remove();
                    router.push("/");
                  }
                });
              document
                .getElementById("fresh-btn")
                .addEventListener("click", async () => {
                  const store = await getTarkovStore();
                  if (store && typeof store.firebindAll === "function") {
                    store.firebindAll();
                  }
                  modalContainer.remove();
                  router.push("/");
                });
            }
          }
        }, 500);
        return true;
      }
    }
    router.push("/");
  } catch (error) {
    console.error("Error in handleAuthSuccess:", error);
    router.push("/");
  } finally {
    loading.value.google = false;
    loading.value.github = false;
  }
};
const onMigrationDialogClose = () => {
  showMigrationDialog.value = false;
  emit("migration-dialog-closed");
  router.push("/");
};
const signInWithGoogle = async () => {
  try {
    loading.value.google = true;
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    await handleAuthSuccess(result.user);
  } catch (error) {
    console.error("Google sign in error:", error);
    loading.value.google = false;
  }
};
const signInWithGithub = async () => {
  try {
    loading.value.github = true;
    const provider = new GithubAuthProvider();
    const result = await signInWithPopup(auth, provider);
    await handleAuthSuccess(result.user);
  } catch (error) {
    console.error("GitHub sign in error:", error);
    loading.value.github = false;
  }
};
</script>
<style scoped>
.auth-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background-color: rgb(18, 25, 30);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}
.auth-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 0 24px;
}
.auth-btn {
  letter-spacing: 0.5px;
  text-transform: none;
  font-weight: 500;
  border-radius: 4px;
}
.github-btn {
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.github-btn:hover {
  background-color: #2c3136 !important;
}
.google-btn {
  border: 1px solid rgba(0, 0, 0, 0.1);
}
.google-btn:hover {
  background-color: #f5f5f5 !important;
}
.auth-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  background-color: rgba(0, 0, 0, 0.2);
}
.migration-dialog-container {
  position: relative;
  z-index: 10000;
}
.debug-panel {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 10px;
  border-radius: 8px;
  z-index: 9998;
  color: white;
  font-size: 12px;
}
</style>

