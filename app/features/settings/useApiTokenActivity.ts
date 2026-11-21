type ActivityScope = () => string | undefined;
type ActivityRange = 'today' | '24h' | '7d' | '30d';
export type ActivityCounts = { requests: number; counted: number; throttled: number };
export type ActivityGroup = ActivityCounts & { value: string };
type ActivityBucket = ActivityCounts & { at: string };
type ActivityOutcome = 'counted' | 'throttled' | 'unavailable';
type ActivityKind = 'read' | 'write';
type ActivityRequest = {
  id: string;
  occurred_at: string;
  endpoint: string;
  client: string;
  status: number;
  kind: ActivityKind;
  outcome: ActivityOutcome;
  quota_limit: number | null;
  quota_remaining: number | null;
  quota_reset_at: string | null;
};
type QuotaSnapshot = {
  kind: ActivityKind;
  at: string;
  limit: number;
  remaining: number;
  reset_at: string;
};
type Activity = {
  summary: ActivityCounts;
  buckets: ActivityBucket[];
  endpoints: ActivityGroup[];
  clients: ActivityGroup[];
  requests: ActivityRequest[];
  quota: QuotaSnapshot[];
};
const PAGE_SIZE = 50;
export function useApiTokenActivity(tokenId: ActivityScope) {
  const { $supabase } = useNuxtApp();
  const range = ref<ActivityRange>('today');
  const endpoint = ref<string | null>(null);
  const client = ref<string | null>(null);
  const throttleOnly = ref(false);
  const kind = ref<ActivityKind | 'all'>('all');
  const activity = shallowRef<Activity | null>(null);
  const requests = shallowRef<ActivityRequest[]>([]);
  const loading = ref(false);
  const failed = ref(false);
  const hasMore = ref(false);
  let controller: AbortController | undefined;
  async function load(before?: ActivityRequest) {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    failed.value = false;
    if (!before) requests.value = [];
    try {
      const { data, error } = await $supabase.client
        .rpc('get_api_request_activity', {
          p_range: range.value,
          p_token_id: tokenId() ?? null,
          p_endpoint: endpoint.value,
          p_client: client.value,
          p_before_at: before?.occurred_at ?? null,
          p_before_id: before?.id ?? null,
          p_throttle_only: throttleOnly.value,
          p_kind: kind.value === 'all' ? null : kind.value,
        })
        .abortSignal(request.signal);
      if (request.signal.aborted) return;
      if (error || !data) throw error;
      const result = data as Activity;
      if (!before) activity.value = result;
      requests.value = [...requests.value, ...result.requests.slice(0, PAGE_SIZE)];
      hasMore.value = result.requests.length > PAGE_SIZE;
    } catch {
      if (!request.signal.aborted) failed.value = true;
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }
  watch([range, endpoint, client, throttleOnly, kind], () => void load(), { immediate: true });
  onScopeDispose(() => controller?.abort());
  return {
    range,
    endpoint,
    client,
    throttleOnly,
    kind,
    activity,
    requests,
    loading,
    failed,
    hasMore,
    load,
  };
}
