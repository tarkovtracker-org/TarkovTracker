// Framework imports
// Library imports
import { logger } from '@/utils/logger';
import {
  logChannelSubscribeFailure,
  removeOwnedChannel,
  type OwnedRealtimeChannel,
} from '@/utils/realtimeChannel';
import { clearStaleState, resetStore, safePatchStore } from '@/utils/storeHelpers';
import type { PostgrestError, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { StateTree, Store } from 'pinia';
// Local imports
export interface SupabaseListenerConfig<
  TStoreState extends StateTree = StateTree,
  TData extends Record<string, unknown> = Record<string, unknown>,
> {
  store: Store<string, TStoreState>;
  table: string;
  filter?: string | Ref<string | undefined> | ComputedRef<string | undefined>;
  primaryKey?: string; // Defaults to 'id' or 'user_id'
  storeId?: string;
  onData?: (data: TData | null) => void;
  patchStore?: boolean;
  /** Optional sync controller to pause during remote updates */
  syncController?: { pause: () => void; resume: () => void };
  scope?: ListenerScope;
}
interface SupabaseListenerReturn {
  isSubscribed: Ref<boolean>;
  hasInitiallyLoaded: Ref<boolean>;
  loadError: Ref<PostgrestError | null>;
  cleanup: () => void;
  fetchData: () => Promise<void>;
}
type ListenerScope = { run<T>(fn: () => T): T | undefined };
interface QueryBuilderWithAbortSignal<TData extends Record<string, unknown>> {
  abortSignal?: (signal: AbortSignal) => PromiseLike<{
    data: TData | null;
    error: PostgrestError | null;
  }>;
  then: PromiseLike<{
    data: TData | null;
    error: PostgrestError | null;
  }>['then'];
}
const VUE_REACTIVITY_SETTLE_MS = 100;
const runFilterWatch = (
  scope: ListenerScope | undefined,
  watchFilter: () => () => void
): (() => void) | undefined => (scope ? scope.run(watchFilter) : watchFilter());
const registerComponentCleanup = (scope: ListenerScope | undefined, cleanup: () => void): void => {
  if (scope) {
    scope.run(() => onScopeDispose(cleanup));
    return;
  }
  if (getCurrentInstance()) {
    onUnmounted(cleanup);
  }
};
const isAbortError = (error: unknown): boolean => {
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError' || error.name === 'TimeoutError';
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
};
/**
 * Creates a Supabase realtime listener that automatically manages subscriptions
 * and syncs data with a Pinia store. Supports reactive filter refs for auth changes.
 */
export function useSupabaseListener<
  TStoreState extends StateTree = StateTree,
  TData extends Record<string, unknown> = Record<string, unknown>,
>({
  store,
  table,
  filter,
  storeId,
  onData,
  patchStore = true,
  syncController,
  scope,
}: SupabaseListenerConfig<TStoreState, TData>): SupabaseListenerReturn {
  const { $supabase } = useNuxtApp();
  // `shallowRef`: a Realtime channel owns a socket, timers, and internal state
  // that must not be wrapped in a deep reactive proxy.
  const channel = shallowRef<OwnedRealtimeChannel | null>(null);
  /** Removal of the previous channel, awaited before rejoining the same topic. */
  let pendingChannelRemoval: Promise<boolean> | null = null;
  const isSubscribed = ref(false);
  const hasInitiallyLoaded = ref(false);
  const loadError = ref<PostgrestError | null>(null);
  const storeIdForLogging = storeId || store.$id;
  let activeFetchController: AbortController | null = null;
  let latestFetchVersion = 0;
  let cleanupVersion = 0;
  let pendingSyncResumeTimeout: ReturnType<typeof setTimeout> | null = null;
  // Helper to get current filter value (supports both string and ref)
  const getFilterValue = (): string | undefined => unref(filter);
  // Initial fetch
  const fetchData = async () => {
    const fetchVersion = ++latestFetchVersion;
    activeFetchController?.abort();
    const fetchController = new AbortController();
    activeFetchController = fetchController;
    loadError.value = null;
    const currentFilter = getFilterValue();
    if (!currentFilter) {
      if (fetchVersion === latestFetchVersion) {
        hasInitiallyLoaded.value = true;
      }
      return;
    }
    // Parse filter to get column and value
    // Expecting format "column=eq.value"
    const [column, rest] = currentFilter.split('=eq.');
    if (!column || !rest) {
      logger.error(`[${storeIdForLogging}] Invalid filter format. Expected 'col=eq.val'`);
      if (fetchVersion === latestFetchVersion) {
        hasInitiallyLoaded.value = true;
      }
      return;
    }
    try {
      const queryBuilder = $supabase.client
        .from(table)
        .select('*')
        .eq(column, rest)
        .single() as QueryBuilderWithAbortSignal<TData>;
      const result =
        typeof queryBuilder.abortSignal === 'function'
          ? await queryBuilder.abortSignal(fetchController.signal)
          : await queryBuilder;
      if (fetchVersion !== latestFetchVersion) {
        return;
      }
      const { data, error } = result;
      if (error && error.code !== 'PGRST116') {
        logger.error(`[${storeIdForLogging}] Error fetching initial data:`, error);
        loadError.value = error;
        hasInitiallyLoaded.value = true;
        return;
      }
      if (data) {
        if (patchStore) {
          safePatchStore(store, data as Partial<TStoreState>);
          clearStaleState(store, data);
        }
        if (onData) onData(data);
      } else {
        if (patchStore) {
          resetStore(store);
        }
        if (onData) onData(null);
      }
      hasInitiallyLoaded.value = true;
    } catch (error) {
      if (fetchController.signal.aborted || isAbortError(error)) {
        return;
      }
      logger.error(`[${storeIdForLogging}] Error fetching initial data:`, error);
      hasInitiallyLoaded.value = true;
    } finally {
      if (activeFetchController === fetchController) {
        activeFetchController = null;
      }
    }
  };
  /**
   * Waits for a previous channel removal to settle.
   *
   * `RealtimeClient.channel()` returns the existing channel until its
   * `phx_leave` settles, and `subscribe()` only rejoins a closed channel. Filter
   * transitions such as A -> undefined -> A reuse the same topic, so the removal
   * has to finish before rejoining.
   */
  const awaitPendingRemoval = async (): Promise<boolean> => {
    const inFlightRemoval = pendingChannelRemoval;
    if (!inFlightRemoval) return true;
    const leftCleanly = await inFlightRemoval;
    if (pendingChannelRemoval === inFlightRemoval) pendingChannelRemoval = null;
    return leftCleanly;
  };
  const createSubscription = () => {
    const currentFilter = getFilterValue();
    if (channel.value) return;
    if (!currentFilter) return;
    const subscriptionVersion = cleanupVersion;
    const client = $supabase.client;
    const nextChannel = client
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
          if (subscriptionVersion !== cleanupVersion) return;
          syncController?.pause();
          try {
            if (subscriptionVersion !== cleanupVersion) return;
            if (payload.eventType === 'DELETE') {
              if (patchStore) {
                resetStore(store);
              }
              if (onData) onData(null);
            } else {
              // INSERT or UPDATE
              const newData = payload.new as TData;
              if (patchStore) {
                safePatchStore(store, newData as Partial<TStoreState>);
                clearStaleState(store, newData);
              }
              if (onData) onData(newData);
            }
          } finally {
            if (subscriptionVersion === cleanupVersion) {
              if (pendingSyncResumeTimeout) clearTimeout(pendingSyncResumeTimeout);
              pendingSyncResumeTimeout = setTimeout(() => {
                pendingSyncResumeTimeout = null;
                if (subscriptionVersion === cleanupVersion) syncController?.resume();
              }, VUE_REACTIVITY_SETTLE_MS);
            }
          }
        }
      )
      .subscribe((status: string, error?: Error) => {
        isSubscribed.value = status === 'SUBSCRIBED';
        logChannelSubscribeFailure(storeIdForLogging, status, error, { table });
      });
    channel.value = { channel: nextChannel, client };
  };
  /**
   * Subscribes immediately unless a previous channel is still leaving.
   *
   * Staying synchronous in the common case preserves the channel being available
   * as soon as the listener is created; the deferred branch only runs when the
   * same topic could still be occupied.
   */
  const setupSubscription = (): void => {
    if (!pendingChannelRemoval) {
      createSubscription();
      return;
    }
    const setupVersion = cleanupVersion;
    void awaitPendingRemoval().then((leftCleanly) => {
      // A failed leave leaves the topic occupied, so rejoining it would return a
      // channel that never joins. Skip and let the next filter change retry.
      if (!leftCleanly || setupVersion !== cleanupVersion) return;
      createSubscription();
    });
  };
  const cleanup = () => {
    cleanupVersion += 1;
    if (pendingSyncResumeTimeout) {
      clearTimeout(pendingSyncResumeTimeout);
      pendingSyncResumeTimeout = null;
    }
    syncController?.resume();
    latestFetchVersion += 1;
    activeFetchController?.abort();
    activeFetchController = null;
    const channelToRemove = channel.value;
    channel.value = null;
    if (channelToRemove) {
      pendingChannelRemoval = removeOwnedChannel(channelToRemove, storeIdForLogging);
      isSubscribed.value = false;
      // Note: Don't reset hasInitiallyLoaded here - it should persist as long as store has data
      // This prevents showing loading spinner when navigating back to a page
    }
  };
  // Watch for filter changes - supports both static strings and reactive refs
  const filterSource = isRef(filter) ? filter : () => filter;
  const watchFilter = () =>
    watch(
      filterSource,
      (newFilter) => {
        cleanup();
        if (!newFilter) {
          if (patchStore) {
            resetStore(store);
          }
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
  const stopFilterWatch = runFilterWatch(scope, watchFilter);
  // If used inside a component, clean up on unmount; otherwise caller must clean up manually.
  registerComponentCleanup(scope, cleanup);
  return {
    isSubscribed,
    hasInitiallyLoaded,
    loadError,
    cleanup: () => {
      stopFilterWatch?.();
      cleanup();
    },
    fetchData,
  };
}
