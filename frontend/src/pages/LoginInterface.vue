<template>
  <div class="login-page">
    <tracker-tip :tip="{ id: 'login' }"></tracker-tip>
    <v-container
      class="d-flex align-start justify-center pt-16 mb-0 pb-0"
      style="margin-bottom: 0 !important; padding-bottom: 0 !important"
    >
      <v-row
        justify="center"
        class="w-100 mb-0 pb-0"
        style="margin-bottom: 0 !important; padding-bottom: 0 !important"
      >
        <v-col cols="12">
          <div v-if="fireuser?.uid && !showingMigrationDialog" class="text-center">
            <v-card class="auth-success-card mx-auto" max-width="400" color="rgb(18, 25, 30)">
              <v-card-title class="text-h5 text-center py-4 font-weight-bold">
                You're already signed in!
              </v-card-title>
              <v-card-text class="text-center">
                <v-icon size="64" color="success" class="mb-4">mdi-check-circle</v-icon>
                <p class="text-body-1">Welcome back, {{ fireuser.displayName || 'User' }}!</p>
                <v-btn color="primary" class="mt-4" to="/"> Go to Dashboard </v-btn>
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
  import { defineAsyncComponent, ref } from 'vue';
  import { fireuser } from '@/plugins/firebase.ts';
  // Track if the migration dialog is currently being shown
  const showingMigrationDialog = ref(false);
  const TrackerTip = defineAsyncComponent(() => import('@/components/TrackerTip'));
  const AuthButtons = defineAsyncComponent(() => import('@/components/AuthButtons'));
</script>
<style scoped>
  .login-page {
    display: flex;
    flex-direction: column;
    position: relative;
    background-image:
      radial-gradient(circle at 30% 20%, rgba(50, 50, 50, 0.15) 0%, transparent 50%),
      radial-gradient(circle at 70% 65%, rgba(40, 40, 40, 0.1) 0%, transparent 50%);
  }
  .login-page::before {
    content: '';
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
