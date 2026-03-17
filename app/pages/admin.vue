<script setup lang="ts">
  import { useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  import { logger } from '@/utils/logger';
  definePageMeta({
    middleware: ['admin'],
  });
  const { t } = useI18n({ useScope: 'global' });
  const metaTitle = computed(() => t('admin.title'));
  useSeoMeta({
    title: metaTitle,
    robots: 'noindex, nofollow',
  });
  const { $supabase } = useNuxtApp();
  const router = useRouter();
  const { systemStore, hasInitiallyLoaded, loadError } = useSystemStoreWithSupabase();
  const errorReference = ref<string | null>(null);
  watch(loadError, (error) => {
    if (error) {
      const errorId = `ERR-${Date.now().toString(36).toUpperCase()}`;
      logger.error(`[Admin Page Error ${errorId}]:`, error);
      errorReference.value = errorId;
    } else {
      errorReference.value = null;
    }
  });
  watch(
    [hasInitiallyLoaded, () => systemStore.isAdmin, loadError],
    ([loaded, adminStatus, error]) => {
      if (loaded && !adminStatus && !error) {
        router.push('/');
      }
    },
    { immediate: true }
  );
</script>
<template>
  <div v-if="!hasInitiallyLoaded" class="flex min-h-[50vh] items-center justify-center">
    <div class="text-center">
      <UIcon name="i-mdi-loading" class="text-primary-400 h-12 w-12 animate-spin" />
      <p class="text-foreground-muted mt-4">Verifying admin access...</p>
    </div>
  </div>
  <div v-else-if="loadError" class="flex min-h-[50vh] items-center justify-center px-4">
    <UAlert
      icon="i-mdi-alert-circle"
      color="error"
      variant="soft"
      title="Connection Error"
      :description="`Failed to load admin data. Please refresh or contact support. Reference: ${errorReference ?? 'N/A'}`"
    />
  </div>
  <div v-else-if="systemStore.isAdmin" class="px-3 py-6 sm:px-6">
    <div class="mx-auto max-w-[1400px] space-y-6">
      <UAlert icon="i-mdi-alert" color="warning" variant="soft" title="Admin Access">
        <template #description>
          Actions performed here affect all users. Logged in as
          <span class="font-medium">
            {{ $supabase.user?.email || $supabase.user?.displayName || 'Unknown' }}
          </span>
        </template>
      </UAlert>
      <div class="grid gap-6 lg:grid-cols-2">
        <AdminCacheCard />
        <AdminAuditLog />
      </div>
    </div>
  </div>
</template>
