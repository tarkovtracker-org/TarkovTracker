<template>
  <div>
    <v-container>
      <v-row justify="center">
        <v-col cols="12" sm="10" md="8" lg="6" xl="4">
          <v-card class="auth-card elevation-8" color="rgb(18, 25, 30)">
            <div class="auth-header">
              <v-avatar size="72" class="mt-8 mb-3">
                <v-icon size="48" color="grey">mdi-shield-account</v-icon>
              </v-avatar>
              <h2 class="text-h5 font-weight-bold mb-2">Sign in to access your account</h2>
              <p class="text-body-2 text-medium-emphasis mb-6">
                Track your progress, share with friends, and coordinate raids
              </p>
            </div>
            <v-card-text class="px-6 pb-6 pt-2">
              <v-btn
                block
                variant="elevated"
                class="mb-4 auth-btn google-btn"
                color="white"
                height="50"
                :loading="loading.google"
                :disabled="loading.google || loading.github"
                @click="signInWithGoogle"
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
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53
                        -2.21 3.31v2.77h3.57
                        c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06
                        -2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18
                        C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1
                        C7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  <span class="text-black">Continue with Google</span>
                </div>
              </v-btn>
              <v-btn
                block
                class="auth-btn github-btn"
                color="#24292e"
                height="50"
                :loading="loading.github"
                :disabled="loading.google || loading.github"
                @click="signInWithGithub"
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
  </div>
</template>
<script setup>
  import { ref, onMounted, nextTick } from 'vue';
  import { useRouter } from 'vue-router';
  import { GoogleAuthProvider, GithubAuthProvider, signInWithPopup, getAuth } from 'firebase/auth';
  import { app as fireapp, fireuser } from '@/plugins/firebase.ts';
  import DataMigrationService from '@/utils/DataMigrationService';

  const hasLocalData = ref(false);

  const router = useRouter();
  const auth = getAuth(fireapp);
  const loading = ref({
    google: false,
    github: false,
  });
  const userId = ref(null);
  // Define emits - remove migration related emits if no longer used elsewhere
  // const emit = defineEmits([]); // Adjusted if no emits are needed

  // Helper function to safely access the store
  // const getTarkovStore = async () => {
  //   if (tarkovStore) return tarkovStore;
  //   try {
  //     // Wait for next tick and a small delay to ensure Pinia is ready
  //     await nextTick();
  //     await new Promise((resolve) => setTimeout(resolve, 100));
  //     try {
  //       tarkovStore = useTarkovStore(); // This line would be removed
  //       return tarkovStore;
  //     } catch (error) {
  //       console.error('Initial store access failed, retrying:', error);
  //       // Try one more time after a delay
  //       await new Promise((resolve) => setTimeout(resolve, 200));
  //       tarkovStore = useTarkovStore(); // This line would be removed
  //       return tarkovStore;
  //     }
  //   } catch (error) {
  //     console.error('Error accessing tarkovStore:', error);
  //     return null;
  //   }
  // };
  // Prevent automatic navigation after login - we'll handle it manually
  onMounted(async () => {
    try {
      // Wait for Vue to finish initial rendering and give Pinia time to initialize
      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, 100));
      // Check for local data
      hasLocalData.value = DataMigrationService.hasLocalData();
      // If a user is already logged in, set userId
      if (fireuser.uid) {
        userId.value = fireuser.uid;
        // If there was a checkUserDataAndShowMigration, it would be removed or simplified
      }
    } catch (error) {
      console.error('Error in onMounted:', error);
    }
  });
  const handleAuthSuccess = async (user) => {
    userId.value = user.uid;
    try {
      // If pinia-fireswap handles auto-migration,
      // no explicit check or dialog trigger is needed here.
      // The store should sync automatically when the user is authenticated and store binds.
      console.log(
        'User authenticated:',
        user.uid,
        'Local data exists:',
        DataMigrationService.hasLocalData()
      );
      // Navigate to dashboard after successful login
      router.push('/');
    } catch (error) {
      console.error('Error in handleAuthSuccess:', error);
      // Handle error (e.g., show a notification to the user)
    }
  };
  const signInWithGoogle = async () => {
    try {
      loading.value.google = true;
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await handleAuthSuccess(result.user);
    } catch (error) {
      console.error('Google sign in error:', error);
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
      console.error('GitHub sign in error:', error);
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
</style>
