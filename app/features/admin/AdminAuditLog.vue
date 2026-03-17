<script setup lang="ts">
  import { useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  const { $supabase } = useNuxtApp();
  const { systemStore, hasInitiallyLoaded } = useSystemStoreWithSupabase();
  interface AuditLogEntry {
    id: string;
    admin_user_id: string;
    action: string;
    details: Record<string, unknown> | null;
    ip_address: string | null;
    created_at: string;
  }
  const logs = ref<AuditLogEntry[]>([]);
  const isLoading = ref(true);
  const error = ref<string | null>(null);
  const errorDescription = ref<string | null>(null);
  const isUserAuthenticated = computed(() => {
    // The system store is already filtered by user_id in the Supabase subscription,
    // so we just need to verify the user is logged in and has an ID
    return !!$supabase.user?.id;
  });
  const waitForSystemLoad = async (timeoutMs = 4000) => {
    if (hasInitiallyLoaded.value && isUserAuthenticated.value) return true;
    return await new Promise<boolean>((resolve) => {
      const stop = watch(
        () => [hasInitiallyLoaded.value, isUserAuthenticated.value],
        ([loaded, ready]) => {
          if (loaded && ready) {
            stop();
            resolve(true);
          }
        },
        { immediate: true }
      );
      setTimeout(() => {
        stop();
        resolve(hasInitiallyLoaded.value && isUserAuthenticated.value);
      }, timeoutMs);
    });
  };
  const fetchLogs = async () => {
    isLoading.value = true;
    error.value = null;
    errorDescription.value = null;
    // Defensive check: Ensure user is logged in
    if (!$supabase.user.loggedIn) {
      error.value = 'Unauthorized: Please log in to continue.';
      isLoading.value = false;
      return;
    }
    // Wait for system store to load and verify admin status
    const loaded = await waitForSystemLoad();
    if (!loaded || !systemStore.isAdmin) {
      error.value = 'Unauthorized: Admin privileges required to view audit logs.';
      isLoading.value = false;
      return;
    }
    try {
      const { data, error: fetchError } = await $supabase.client
        .from('admin_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (fetchError) {
        if (fetchError.code === '42P01') {
          error.value = 'Audit log table not found.';
          errorDescription.value = 'Run the SQL migration to create admin_audit_log.';
          return;
        }
        if (fetchError.code === '42501') {
          error.value = 'Unauthorized: Admin privileges required to view audit logs.';
          return;
        }
        throw fetchError;
      }
      const entries = data || [];
      logs.value = entries;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch audit logs';
    } finally {
      isLoading.value = false;
    }
  };
  const getAdminDisplay = (log: AuditLogEntry) => {
    const adminId = log.admin_user_id;
    // For the current user, show their display name or email
    if (adminId === $supabase.user.id) {
      return $supabase.user.displayName || $supabase.user.email || adminId;
    }
    const details = log.details;
    const adminDisplayName =
      details && typeof details.adminDisplayName === 'string' ? details.adminDisplayName : null;
    const adminEmail =
      details && typeof details.adminEmail === 'string' ? details.adminEmail : null;
    // For other admins, prefer stored display name/email if available
    return adminDisplayName || adminEmail || adminId;
  };
  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };
  const getActionIcon = (action: string) => {
    if (action.includes('cache')) return 'i-mdi-cached';
    return 'i-mdi-shield-account';
  };
  const getActionColor = (action: string) => {
    if (action.includes('purge')) return 'warning';
    return 'info';
  };
  onMounted(fetchLogs);
</script>
<template>
  <GenericCard
    icon="i-mdi-history"
    icon-color="info"
    highlight-color="secondary"
    :fill-height="false"
    title="Admin Audit Log"
    title-classes="text-lg font-semibold"
  >
    <template #title-right>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-mdi-refresh"
        :loading="isLoading"
        @click="fetchLogs"
      >
        Refresh
      </UButton>
    </template>
    <template #content>
      <div class="px-4 py-4">
        <!-- Loading state -->
        <div v-if="isLoading" class="flex items-center justify-center py-8">
          <UIcon name="i-mdi-loading" class="text-foreground-subtle size-6 animate-spin" />
        </div>
        <!-- Error state -->
        <UAlert
          v-else-if="error"
          icon="i-mdi-alert-circle"
          color="error"
          variant="soft"
          :title="error"
          :description="errorDescription || undefined"
        />
        <!-- Empty state -->
        <div v-else-if="logs.length === 0" class="text-foreground-muted py-8 text-center">
          <UIcon name="i-mdi-clipboard-text-off" class="mb-2 size-8" />
          <p>No admin actions recorded yet</p>
        </div>
        <!-- Log entries -->
        <div v-else class="space-y-2">
          <div
            v-for="log in logs"
            :key="log.id"
            class="bg-panel border-border rounded-lg border p-3"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge :color="getActionColor(log.action)" variant="soft" size="sm">
                  <UIcon :name="getActionIcon(log.action)" class="mr-1 size-3" />
                  {{ log.action }}
                </UBadge>
                <span class="text-foreground-muted text-xs">by</span>
                <UBadge color="neutral" variant="outline" size="xs" class="font-mono">
                  {{ getAdminDisplay(log) }}
                </UBadge>
              </div>
              <span class="text-foreground-subtle text-xs">
                {{ formatDate(log.created_at) }}
              </span>
            </div>
            <div v-if="log.details" class="text-foreground-muted mt-2 text-xs">
              <pre
                class="bg-shell border-border-muted overflow-x-auto rounded border p-2 font-mono text-xs whitespace-pre-wrap"
                >{{ JSON.stringify(log.details, null, 2) }}</pre
              >
            </div>
          </div>
        </div>
      </div>
    </template>
  </GenericCard>
</template>
