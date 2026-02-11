// Framework imports
// Library imports
import { logger } from '@/utils/logger';
import { clearStaleState, resetStore, safePatchStore } from '@/utils/storeHelpers';
import type {
  PostgrestError,
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import type { Store } from 'pinia';
// Local imports
export interface SupabaseListenerConfig {
  store: Store;
  table: string;
  filter?: string | Ref<string | undefined> | ComputedRef<string | undefined>;
  primaryKey?: string; // Defaults to 'id' or 'user_id'
  storeId?: string;
  onData?: (data: Record<string, unknown> | null) => void;
  /** Optional sync controller to pause during remote updates */
  syncController?: { pause: () => void; resume: () => void };
}
interface SupabaseListenerReturn {
  isSubscribed: Ref<boolean>;
  hasInitiallyLoaded: Ref<boolean>;
  loadError: Ref<PostgrestError | null>;
  cleanup: () => void;
  fetchData: () => Promise<void>;
}
const VUE_REACTIVITY_SETTLE_MS = 100;
/**
 * Creates a Supabase realtime listener that automatically manages subscriptions
 * and syncs data with a Pinia store. Supports reactive filter refs for auth changes.
 */
export function useSupabaseListener({
  store,
  table,
  filter,
  storeId,
  onData,
  syncController,
}: SupabaseListenerConfig): SupabaseListenerReturn {
  const { $supabase } = useNuxtApp();
  const channel = ref<RealtimeChannel | null>(null);
  const isSubscribed = ref(false);
  const hasInitiallyLoaded = ref(false);
  const loadError = ref<PostgrestError | null>(null);
  const storeIdForLogging = storeId || store.$id;
  // Helper to get current filter value (supports both string and ref)
  const getFilterValue = (): string | undefined => unref(filter);
  // Initial fetch
  const fetchData = async () => {
    loadError.value = null;
    const currentFilter = getFilterValue();
    if (!currentFilter) {
      hasInitiallyLoaded.value = true;
      return;
    }
    // Parse filter to get column and value
    // Expecting format "column=eq.value"
    const [column, rest] = currentFilter.split('=eq.');
    if (!column || !rest) {
      logger.error(`[${storeIdForLogging}] Invalid filter format. Expected 'col=eq.val'`);
      hasInitiallyLoaded.value = true;
      return;
    }
    const { data, error } = await $supabase.client
      .from(table)
      .select('*')
      .eq(column, rest)
      .single();
    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "The result contains 0 rows"
      logger.error(`[${storeIdForLogging}] Error fetching initial data:`, error);
      loadError.value = error;
      hasInitiallyLoaded.value = true;
      return;
    }
    if (data) {
      safePatchStore(store, data);
      clearStaleState(store, data);
      if (onData) onData(data);
    } else {
      resetStore(store);
      if (onData) onData(null);
    }
    // Mark initial load as complete
    hasInitiallyLoaded.value = true;
  };
  const setupSubscription = () => {
    const currentFilter = getFilterValue();
    if (channel.value) return;
    if (!currentFilter) return;
    channel.value = $supabase.client
      .channel(`public:${table}:${currentFilter}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table,
          filter: currentFilter,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          // Pause sync to prevent bounce loop
          syncController?.pause();
          try {
            if (payload.eventType === 'DELETE') {
              resetStore(store);
              if (onData) onData(null);
            } else {
              // INSERT or UPDATE
              const newData = payload.new as Record<string, unknown>;
              safePatchStore(store, newData);
              clearStaleState(store, newData);
              if (onData) onData(newData);
            }
          } finally {
            // Resume sync after a small delay to let Vue reactivity settle
            setTimeout(() => syncController?.resume(), VUE_REACTIVITY_SETTLE_MS);
          }
        }
      )
      .subscribe((status: string) => {
        isSubscribed.value = status === 'SUBSCRIBED';
      });
  };
  const cleanup = () => {
    if (channel.value) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $supabase.client.removeChannel(channel.value as any);
      channel.value = null;
      isSubscribed.value = false;
      // Note: Don't reset hasInitiallyLoaded here - it should persist as long as store has data
      // This prevents showing loading spinner when navigating back to a page
    }
  };
  // Watch for filter changes - supports both static strings and reactive refs
  const filterSource = isRef(filter) ? filter : () => filter;
  watch(
    filterSource,
    (newFilter) => {
      cleanup();
      if (!newFilter) {
        resetStore(store);
        if (onData) onData(null);
        hasInitiallyLoaded.value = true;
        return;
      }
      hasInitiallyLoaded.value = false;
      fetchData();
      setupSubscription();
    },
    { immediate: true }
  );
  // If used inside a component, clean up on unmount; otherwise caller must clean up manually.
  if (getCurrentInstance()) {
    onUnmounted(() => {
      cleanup();
    });
  }
  return {
    isSubscribed,
    hasInitiallyLoaded,
    loadError,
    cleanup,
    fetchData,
  };
}
