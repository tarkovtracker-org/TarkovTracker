<script setup lang="ts">
  const route = useRoute();
  const { client: supabase } = useNuxtApp().$supabase;
  const authorizationId = computed(() => {
    const value = route.query.authorization_id;
    return typeof value === 'string' ? value : '';
  });
  const loading = ref(true);
  const error = ref('');
  const details = ref<{
    user?: { id: string; email: string };
    scope?: string;
    authorization_id: string;
    redirect_url?: string;
    client?: { id: string; name: string; uri?: string; logo_uri?: string };
  } | null>(null);
  onMounted(async () => {
    if (!authorizationId.value) {
      error.value = 'Missing authorization_id parameter';
      loading.value = false;
      return;
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        await navigateTo({ path: '/login', query: { redirect: route.fullPath } });
        return;
      }
      const { data, error: fetchError } = await supabase.auth.oauth.getAuthorizationDetails(
        authorizationId.value
      );
      console.log('[OAuth] Authorization details:', JSON.stringify(data, null, 2));
      if (fetchError) {
        if (fetchError.message?.includes('cannot be processed')) {
          error.value = 'This authorization request has expired or was already processed.';
        } else {
          throw fetchError;
        }
        return;
      }
      if (data?.redirect_url) {
        console.log('[OAuth] Auto-redirecting to:', data.redirect_url);
        window.location.href = data.redirect_url;
        return;
      }
      details.value = data;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch authorization details';
    } finally {
      loading.value = false;
    }
  });
  async function approve() {
    loading.value = true;
    error.value = '';
    try {
      console.log('[OAuth] Approving authorization:', authorizationId.value);
      const { data, error: approveError } = await supabase.auth.oauth.approveAuthorization(
        authorizationId.value
      );
      console.log('[OAuth] Approve result:', { data, error: approveError });
      if (approveError) throw approveError;
      if (data?.redirect_url) {
        console.log('[OAuth] Redirecting to:', data.redirect_url);
        window.location.href = data.redirect_url;
      } else {
        throw new Error('No redirect URL returned');
      }
    } catch (e) {
      console.error('[OAuth] Approve error:', e);
      error.value = e instanceof Error ? e.message : 'Failed to approve authorization';
      loading.value = false;
    }
  }
  async function deny() {
    loading.value = true;
    error.value = '';
    try {
      const { data, error: denyError } = await supabase.auth.oauth.denyAuthorization(
        authorizationId.value
      );
      if (denyError) throw denyError;
      if (data?.redirect_url) {
        window.location.href = data.redirect_url;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to deny authorization';
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
      <h1 class="mb-6 text-2xl font-bold text-(--color-text-primary)">Authorize Application</h1>
      <div v-if="loading" class="py-8 text-center">
        <div
          class="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-(--color-accent-primary)"
        ></div>
        <p class="mt-4 text-(--color-text-secondary)">Loading...</p>
      </div>
      <div
        v-else-if="error"
        class="mb-4 rounded border border-(--color-error) bg-(--color-error-surface) p-4"
      >
        <p class="text-sm text-(--color-error)">{{ error }}</p>
      </div>
      <div v-else-if="details">
        <div class="mb-6">
          <p class="mb-4 text-(--color-text-secondary)">
            <strong class="text-(--color-text-primary)">
              {{ details.client?.name || 'Unknown Application' }}
            </strong>
            is requesting access to your TarkovTracker account.
          </p>
          <div v-if="details.scope" class="mb-4 rounded bg-(--color-surface-3) p-4">
            <h3 class="mb-2 font-semibold text-(--color-text-primary)">Requested Permissions:</h3>
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
            Will redirect to:
            <span class="font-mono">{{ details.redirect_url }}</span>
          </p>
        </div>
        <div class="flex gap-3">
          <button
            :disabled="loading"
            class="flex-1 rounded bg-(--color-accent-primary) px-4 py-2 font-semibold text-white transition hover:bg-(--color-accent-primary-hover) disabled:cursor-not-allowed disabled:opacity-50"
            @click="approve"
          >
            Approve
          </button>
          <button
            :disabled="loading"
            class="flex-1 rounded bg-(--color-surface-3) px-4 py-2 font-semibold text-(--color-text-primary) transition hover:bg-(--color-surface-4) disabled:cursor-not-allowed disabled:opacity-50"
            @click="deny"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
