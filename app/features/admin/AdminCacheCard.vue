<script setup lang="ts">
  import { useEdgeFunctions } from '@/composables/api/useEdgeFunctions';
  import { useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  import { logger } from '@/utils/logger';
  import { STORAGE_KEYS } from '@/utils/storageKeys';
  import type { PurgeCacheResponse } from '@/types/edge';
  const { purgeCache } = useEdgeFunctions();
  const toast = useToast();
  const { $supabase } = useNuxtApp();
  const { systemStore, hasInitiallyLoaded } = useSystemStoreWithSupabase();
  const { t, locale } = useI18n({ useScope: 'global' });
  const LAST_PURGE_STORAGE_KEY = STORAGE_KEYS.adminLastPurge;
  const LAST_PURGE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
  interface LastPurgeEntry {
    type: string;
    timestamp: string;
  }
  interface CachedLastPurgeEntry extends LastPurgeEntry {
    expiresAt: number;
  }
  const isPurgingAll = ref(false);
  const isPurgingTarkov = ref(false);
  const lastPurge = ref<LastPurgeEntry | null>(null);
  const showConfirmAll = ref(false);
  const cacheInfoDescription = computed(() => t('admin.cache.info.description'));
  const isSystemReady = computed(() => {
    const storeUserId = (systemStore.$state as { user_id?: string | null }).user_id ?? null;
    const currentUserId = $supabase.user?.id ?? null;
    return !!currentUserId && storeUserId === currentUserId;
  });
  const waitForSystemLoad = async (timeoutMs = 4000) => {
    if (hasInitiallyLoaded.value && isSystemReady.value) return true;
    return await new Promise<boolean>((resolve) => {
      const stop = watch(
        () => [hasInitiallyLoaded.value, isSystemReady.value],
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
        resolve(hasInitiallyLoaded.value && isSystemReady.value);
      }, timeoutMs);
    });
  };
  const getPurgeLabel = (purgeType: string) => {
    return purgeType === 'all'
      ? t('admin.cache.purge_type.all')
      : t('admin.cache.purge_type.tarkov_data');
  };
  const persistLastPurge = (entry: LastPurgeEntry) => {
    try {
      const payload: CachedLastPurgeEntry = {
        ...entry,
        expiresAt: Date.now() + LAST_PURGE_TTL_MS,
      };
      localStorage.setItem(LAST_PURGE_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      logger.warn('[AdminCacheCard] Failed to persist last purge entry', error);
    }
  };
  const clearCachedLastPurge = () => {
    try {
      localStorage.removeItem(LAST_PURGE_STORAGE_KEY);
    } catch (error) {
      logger.warn('[AdminCacheCard] Failed to clear cached last purge entry', error);
    }
  };
  const readCachedLastPurge = (): LastPurgeEntry | null => {
    try {
      const raw = localStorage.getItem(LAST_PURGE_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<CachedLastPurgeEntry> | null;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof parsed.type !== 'string' ||
        typeof parsed.timestamp !== 'string' ||
        typeof parsed.expiresAt !== 'number'
      ) {
        clearCachedLastPurge();
        return null;
      }
      if (parsed.expiresAt <= Date.now()) {
        clearCachedLastPurge();
        return null;
      }
      return { type: parsed.type, timestamp: parsed.timestamp };
    } catch (error) {
      logger.warn('[AdminCacheCard] Failed to parse cached last purge entry', error);
      clearCachedLastPurge();
      return null;
    }
  };
  const setLastPurge = (entry: LastPurgeEntry) => {
    lastPurge.value = entry;
    persistLastPurge(entry);
  };
  const checkAdminAuthorization = (): boolean => {
    if (!systemStore.isAdmin) {
      toast.add({
        title: t('admin.cache.unauthorized.title'),
        description: t('admin.cache.unauthorized.description'),
        color: 'error',
        icon: 'i-mdi-alert-circle',
      });
      return false;
    }
    return true;
  };
  const updateLastPurgeIfValid = (result: PurgeCacheResponse, purgeType: string): boolean => {
    if (result.timestamp) {
      setLastPurge({ type: purgeType, timestamp: result.timestamp });
      return true;
    }
    logger.warn('[AdminCacheCard] Invalid purge result: missing timestamp', result);
    return false;
  };
  const fetchLastPurgeFromServer = async () => {
    if (!$supabase.user.loggedIn) {
      return;
    }
    await waitForSystemLoad();
    try {
      const { data, error } = await $supabase.client
        .from('admin_audit_log')
        .select('details, created_at')
        .eq('action', 'cache_purge')
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const record = data?.[0];
      if (!record) return;
      const details = record.details as Record<string, unknown> | null;
      // Support both camelCase (new) and snake_case (old audit records) for backward compatibility
      const purgeType =
        details && typeof details.purgeType === 'string'
          ? details.purgeType
          : details && typeof details.purge_type === 'string'
            ? details.purge_type
            : 'tarkov-data';
      setLastPurge({
        type: getPurgeLabel(purgeType),
        timestamp: record.created_at,
      });
    } catch (error) {
      logger.warn('[AdminCacheCard] Failed to fetch last purge record', error);
    }
  };
  const handlePurgeTarkovData = async () => {
    if (!$supabase.user.loggedIn) {
      toast.add({
        title: t('admin.cache.unauthorized.title'),
        description: t('admin.cache.unauthorized.description'),
        color: 'error',
        icon: 'i-mdi-alert-circle',
      });
      return;
    }
    const loaded = await waitForSystemLoad();
    if (!loaded) return;
    if (!checkAdminAuthorization()) return;
    isPurgingTarkov.value = true;
    try {
      const result = await purgeCache('tarkov-data');
      if (updateLastPurgeIfValid(result, t('admin.cache.purge_type.tarkov_data'))) {
        toast.add({
          title: t('admin.cache.tarkov_data.success_title'),
          description: t('admin.cache.tarkov_data.success_description'),
          color: 'success',
          icon: 'i-mdi-check-circle',
        });
      }
    } catch (error) {
      toast.add({
        title: t('admin.cache.purge_failed.title'),
        description:
          error instanceof Error ? error.message : t('admin.cache.purge_failed.description'),
        color: 'error',
        icon: 'i-mdi-alert-circle',
      });
    } finally {
      isPurgingTarkov.value = false;
    }
  };
  const handlePurgeAll = async () => {
    showConfirmAll.value = false;
    if (!$supabase.user.loggedIn) {
      toast.add({
        title: t('admin.cache.unauthorized.title'),
        description: t('admin.cache.unauthorized.description'),
        color: 'error',
        icon: 'i-mdi-alert-circle',
      });
      return;
    }
    const loaded = await waitForSystemLoad();
    if (!loaded) return;
    if (!checkAdminAuthorization()) return;
    isPurgingAll.value = true;
    try {
      const result = await purgeCache('all');
      if (updateLastPurgeIfValid(result, t('admin.cache.purge_type.all'))) {
        toast.add({
          title: t('admin.cache.full_purge.success_title'),
          description: t('admin.cache.full_purge.success_description'),
          color: 'success',
          icon: 'i-mdi-check-circle',
        });
      }
    } catch (error) {
      toast.add({
        title: t('admin.cache.purge_failed.title'),
        description:
          error instanceof Error ? error.message : t('admin.cache.purge_failed.description'),
        color: 'error',
        icon: 'i-mdi-alert-circle',
      });
    } finally {
      isPurgingAll.value = false;
    }
  };
  const dateFormatter = computed(() => {
    return new Intl.DateTimeFormat(locale.value, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'UTC',
      timeZoneName: 'short',
    });
  });
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return dateFormatter.value.format(date);
  };
  onMounted(async () => {
    lastPurge.value = readCachedLastPurge();
    await fetchLastPurgeFromServer();
  });
</script>
<template>
  <GenericCard
    icon="i-mdi-cached"
    icon-color="warning"
    highlight-color="warning"
    :fill-height="false"
    :title="t('admin.cache.title')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-4 px-4 py-4">
        <!-- Last purge info -->
        <div v-if="lastPurge" class="bg-success-500/10 rounded-lg p-3">
          <div class="text-success-400 flex items-center gap-2 text-sm">
            <UIcon name="i-mdi-check-circle" class="size-4" />
            <span>
              {{
                t('admin.cache.last_purge', {
                  type: lastPurge.type,
                  timestamp: formatTimestamp(lastPurge.timestamp),
                })
              }}
            </span>
          </div>
        </div>
        <!-- Purge buttons -->
        <div class="grid gap-4 md:grid-cols-2">
          <!-- Tarkov Data Cache -->
          <div class="bg-panel border-border rounded-lg border p-4">
            <h4 class="text-foreground mb-2 font-medium">
              {{ t('admin.cache.tarkov_data.title') }}
            </h4>
            <p class="text-foreground-muted mb-3 text-sm">
              {{ t('admin.cache.tarkov_data.description') }}
            </p>
            <UButton
              color="warning"
              variant="soft"
              icon="i-mdi-database-refresh"
              :loading="isPurgingTarkov"
              :disabled="isPurgingAll"
              @click="handlePurgeTarkovData"
            >
              {{ t('admin.cache.tarkov_data.action') }}
            </UButton>
          </div>
          <!-- Full Cache -->
          <div class="border-error-500/35 bg-error-500/10 rounded-lg border p-4">
            <h4
              class="mb-2 font-medium text-[color-mix(in_srgb,var(--color-error-500)_78%,var(--color-foreground))]"
            >
              {{ t('admin.cache.full_purge.title') }}
            </h4>
            <p class="text-foreground-muted mb-3 text-sm">
              {{ t('admin.cache.full_purge.description') }}
            </p>
            <UButton
              color="error"
              variant="soft"
              icon="i-mdi-delete-sweep"
              :loading="isPurgingAll"
              :disabled="isPurgingTarkov"
              @click="showConfirmAll = true"
            >
              {{ t('admin.cache.full_purge.action') }}
            </UButton>
          </div>
        </div>
        <!-- Info alert -->
        <UAlert
          icon="i-mdi-information"
          color="info"
          variant="soft"
          :title="t('admin.cache.info.title')"
          :description="cacheInfoDescription"
        />
      </div>
    </template>
  </GenericCard>
  <!-- Confirmation Modal -->
  <UModal v-model:open="showConfirmAll">
    <template #content>
      <div class="p-6">
        <div class="mb-4 flex items-center gap-3">
          <div class="bg-error-500/15 rounded-full p-2">
            <UIcon name="i-mdi-alert" class="text-error-400 size-6" />
          </div>
          <h3 class="text-foreground text-lg font-semibold">
            {{ t('admin.cache.full_purge.confirm_title') }}
          </h3>
        </div>
        <p class="text-foreground-muted mb-6">
          {{ t('admin.cache.full_purge.confirm_description') }}
        </p>
        <div class="flex justify-end gap-3">
          <UButton color="neutral" variant="ghost" @click="showConfirmAll = false">
            {{ t('common.cancel') }}
          </UButton>
          <UButton color="error" icon="i-mdi-delete-sweep" @click="handlePurgeAll">
            {{ t('admin.cache.full_purge.confirm_action') }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
