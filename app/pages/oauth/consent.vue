<script setup lang="ts">
  import { useOAuthConsent } from '@/composables/useOAuthConsent';
  import { logger } from '@/utils/logger';
  import {
    sanitizeForDebugLog,
    toSafeRedirectUri,
    validateOAuthRedirectUri,
  } from '@/utils/oauthConsent';
  const route = useRoute();
  const { t } = useI18n({ useScope: 'global' });
  const { client: supabase } = useNuxtApp().$supabase;
  const { authorizationId, details, error, init, loading } = useOAuthConsent({
    navigateToFn: navigateTo,
    oauthLogger: logger,
    route,
  });
  onMounted(async () => {
    await init();
  });
  function redirectToOAuthCallback(redirectUrl: string) {
    const expectedRedirectUri = details.value?.redirect_uri ?? details.value?.redirect_url;
    const isSafeRedirect = validateOAuthRedirectUri(redirectUrl, {
      expectedRedirectUri,
      preservedQuerySource: details.value?.redirect_url,
    });
    if (!isSafeRedirect) {
      logger.warn('[OAuth] Blocked invalid redirect URL:', {
        authorizationId: authorizationId.value,
        redirectUri: toSafeRedirectUri(redirectUrl),
      });
      throw new Error('Invalid redirect URL returned');
    }
    window.location.href = redirectUrl;
  }
  async function approve() {
    loading.value = true;
    error.value = '';
    try {
      logger.debug('[OAuth] Approving authorization:', authorizationId.value);
      const { data, error: approveError } = await supabase.auth.oauth.approveAuthorization(
        authorizationId.value
      );
      const safeApproveResult = {
        approved: !approveError,
        authorizationId: authorizationId.value,
        clientId: details.value?.client?.id ?? null,
        redirectUri: toSafeRedirectUri(data?.redirect_url),
        scopes: details.value?.scope?.split(' ').filter(Boolean) ?? [],
      };
      const sanitizedApproveError = approveError
        ? sanitizeForDebugLog({
            message: approveError.message,
            code: 'code' in approveError ? approveError.code : undefined,
            type: approveError.name,
          })
        : null;
      logger.debug('[OAuth] Approve result:', {
        error: sanitizedApproveError,
        result: safeApproveResult,
      });
      if (approveError) throw approveError;
      if (data?.redirect_url) {
        logger.debug('[OAuth] Redirecting to:', toSafeRedirectUri(data.redirect_url));
        redirectToOAuthCallback(data.redirect_url);
      } else {
        throw new Error('No redirect URL returned');
      }
    } catch (e) {
      logger.error('[OAuth] Approve error:', e);
      error.value = e instanceof Error ? e.message : 'Failed to approve authorization';
      loading.value = false;
    }
  }
  async function deny() {
    loading.value = true;
    error.value = '';
    try {
      logger.debug('[OAuth] Denying authorization:', authorizationId.value);
      const { data, error: denyError } = await supabase.auth.oauth.denyAuthorization(
        authorizationId.value
      );
      if (denyError) throw denyError;
      logger.debug('[OAuth] Deny result:', {
        authorizationId: authorizationId.value,
        redirect_url: toSafeRedirectUri(data?.redirect_url),
      });
      if (data?.redirect_url) {
        redirectToOAuthCallback(data.redirect_url);
      } else {
        throw new Error('No redirect URL returned');
      }
    } catch (e) {
      logger.error(`Failed to deny authorization for authorizationId=${authorizationId.value}:`, e);
      error.value = 'Failed to deny authorization. Please try again.';
    } finally {
      loading.value = false;
    }
  }
  useHead({
    title: 'OAuth Consent - TarkovTracker',
  });
</script>
<template>
  <div class="flex min-h-screen items-center justify-center bg-(--color-surface-1) p-4">
    <div class="w-full max-w-md rounded-lg bg-(--color-surface-2) p-6 shadow-lg">
      <h1 class="mb-6 text-2xl font-bold text-(--color-text-primary)">
        {{ t('oauth.consent.authorize') }}
      </h1>
      <div v-if="loading" class="py-8 text-center">
        <div
          class="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-(--color-accent-primary)"
        ></div>
        <p class="mt-4 text-(--color-text-secondary)">{{ t('oauth.consent.loading') }}</p>
      </div>
      <div
        v-else-if="error"
        class="mb-4 rounded border border-(--color-error) bg-(--color-error-surface) p-4"
      >
        <p class="text-sm text-(--color-error)">
          {{ t('oauth.consent.error', { error }) }}
        </p>
      </div>
      <div v-else-if="details">
        <div class="mb-6">
          <p class="mb-4 text-(--color-text-secondary)">
            <strong class="text-(--color-text-primary)">
              {{ details.client?.name || t('oauth.consent.unknown') }}
            </strong>
            {{ t('oauth.consent.requesting_access') }}
          </p>
          <div v-if="details.scope" class="mb-4 rounded bg-(--color-surface-3) p-4">
            <h3 class="mb-2 font-semibold text-(--color-text-primary)">
              {{ t('oauth.consent.requested_permissions') }}
            </h3>
            <ul class="list-inside list-disc space-y-1">
              <li
                v-for="scope in details.scope?.split(' ') || []"
                :key="scope"
                class="text-sm text-(--color-text-secondary)"
              >
                {{ scope }}
              </li>
            </ul>
          </div>
          <p v-if="details.redirect_url" class="mb-4 text-xs text-(--color-text-tertiary)">
            {{ t('oauth.consent.redirect_to') }}
            <span class="font-mono">{{ details.redirect_url }}</span>
          </p>
        </div>
        <div class="flex gap-3">
          <button
            :disabled="loading"
            class="flex-1 rounded bg-(--color-accent-primary) px-4 py-2 font-semibold text-white transition hover:bg-(--color-accent-primary-hover) disabled:cursor-not-allowed disabled:opacity-50"
            @click="approve"
          >
            {{ t('oauth.consent.approve') }}
          </button>
          <button
            :disabled="loading"
            class="flex-1 rounded bg-(--color-surface-3) px-4 py-2 font-semibold text-(--color-text-primary) transition hover:bg-(--color-surface-4) disabled:cursor-not-allowed disabled:opacity-50"
            @click="deny"
          >
            {{ t('oauth.consent.deny') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
