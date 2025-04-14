<template>
  <div class="login-page">
    <tracker-tip tip="login"></tracker-tip>
    <v-container class="fill-height">
      <v-row align="center" justify="center">
        <v-col cols="12">
          <div
            v-if="fireuser?.uid && !showingMigrationDialog"
            class="text-center"
          >
            <v-card
              class="auth-success-card mx-auto"
              max-width="400"
              color="rgb(18, 25, 30)"
            >
              <v-card-title class="text-h5 text-center py-4 font-weight-bold">
                You're already signed in!
              </v-card-title>
              <v-card-text class="text-center">
                <v-icon size="64" color="success" class="mb-4"
                  >mdi-check-circle</v-icon
                >
                <p class="text-body-1">
                  Welcome back, {{ fireuser.displayName || "User" }}!
                </p>
                <v-btn color="primary" class="mt-4" to="/">
                  Go to Dashboard
                </v-btn>
              </v-card-text>
            </v-card>
          </div>
          <auth-buttons
            v-else
            @migration-dialog-shown="showingMigrationDialog = true"
            @migration-dialog-closed="showingMigrationDialog = false"
          />
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script setup>
import { defineAsyncComponent, ref, onMounted, watch } from "vue";
import { fireuser } from "@/plugins/firebase.ts";

// Track if the migration dialog is currently being shown
const showingMigrationDialog = ref(false);

// Debug logging for tracking state
onMounted(() => {
  console.log("LoginInterface mounted, user logged in:", !!fireuser.uid);
});

// Watch for changes to fireuser.uid to help debug
watch(
  () => fireuser.uid,
  (newVal, oldVal) => {
    console.log("User auth state changed:", oldVal, "→", newVal);
  },
);

// Watch migration dialog state
watch(showingMigrationDialog, (newVal) => {
  console.log("Migration dialog state changed:", newVal);
});

const TrackerTip = defineAsyncComponent(
  () => import("@/components/TrackerTip.vue"),
);
const AuthButtons = defineAsyncComponent(
  () => import("@/components/AuthButtons.vue"),
);
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background-color: rgba(0, 0, 0, 0.75);
  position: relative;
  background-image:
    radial-gradient(
      circle at 30% 20%,
      rgba(50, 50, 50, 0.15) 0%,
      transparent 50%
    ),
    radial-gradient(
      circle at 70% 65%,
      rgba(40, 40, 40, 0.1) 0%,
      transparent 50%
    );
}

.login-page::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image:
    linear-gradient(45deg, rgba(0, 0, 0, 0.5) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(0, 0, 0, 0.5) 25%, transparent 25%);
  background-size: 60px 60px;
  opacity: 0.03;
  z-index: -1;
}

.auth-success-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background-color: rgb(18, 25, 30);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}
</style>
