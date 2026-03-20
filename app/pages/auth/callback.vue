<template>
  <div class="bg-canvas flex min-h-screen items-center justify-center px-4">
    <UCard class="bg-panel border-border shadow-card w-full max-w-md border" :ui="{ body: 'p-8' }">
      <div class="flex flex-col items-center space-y-3 text-center">
        <UIcon name="i-heroicons-arrow-path" class="text-primary-500 h-10 w-10 animate-spin" />
        <h2 class="text-foreground text-lg font-semibold">{{ t('oauth.callback.title') }}</h2>
        <p class="text-foreground-muted text-sm">{{ t('oauth.callback.description') }}</p>
      </div>
    </UCard>
  </div>
</template>
<script setup lang="ts">
  import { useProductAnalytics } from '@/composables/useProductAnalytics';
  import { sanitizeInternalRedirect } from '@/utils/redirect';
  const { t } = useI18n({ useScope: 'global' });
  const { clearPendingLoginProvider, trackLoginSucceeded } = useProductAnalytics();
  const { $supabase } = useNuxtApp();
  const finalizeLoginTracking = () => {
    if ($supabase.user.loggedIn) {
      trackLoginSucceeded();
      return;
    }
    clearPendingLoginProvider();
  };
  onMounted(async () => {
    // Check if this is a popup window (has opener)
    const isPopup = window.opener && !window.opener.closed;
    if (isPopup) {
      // Wait for Supabase to process the OAuth hash
      // The Supabase client automatically processes the hash on page load
      // We just need to wait a moment for it to complete
      await new Promise((resolve) => setTimeout(resolve, 500));
      await $supabase.ready();
      finalizeLoginTracking();
      // Send success message to opener window
      window.opener.postMessage({ type: 'OAUTH_SUCCESS' }, window.location.origin);
      // Close this popup after a short delay to ensure the message is sent
      setTimeout(() => {
        window.close();
      }, 200);
    } else {
      // This is a full redirect (not popup) - redirect to original page or dashboard
      // Wait a moment for the session to be established
      await new Promise((resolve) => setTimeout(resolve, 500));
      await $supabase.ready();
      finalizeLoginTracking();
      const route = useRoute();
      const redirect = sanitizeInternalRedirect(route.query.redirect);
      await navigateTo(redirect, { replace: true });
    }
  });
</script>
