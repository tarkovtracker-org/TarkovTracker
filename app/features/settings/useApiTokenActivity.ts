type ActivityScope = () => string | undefined;
export type ActivityRange = 'today' | '24h' | '7d' | '30d';
export type ActivityCounts = { requests: number; counted: number; throttled: number };
export type ActivityGroup = ActivityCounts & { value: string };
export type ActivityBucket = ActivityCounts & { at: string };
type ActivityOutcome = 'counted' | 'throttled' | 'unavailable';
type ActivityKind = 'read' | 'write';
export type ActivityRequest = {
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
export type QuotaSnapshot = {
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
  const displayRange = ref(range.value);
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
  const abort = () => controller?.abort();
  function requestArgs(before?: ActivityRequest) {
    const cursor = before
      ? { p_before_at: before.occurred_at, p_before_id: before.id }
      : { p_before_at: null, p_before_id: null };
    return {
      p_range: range.value,
      p_token_id: tokenId() ?? null,
      p_endpoint: endpoint.value,
      p_client: client.value,
      p_throttle_only: throttleOnly.value,
      p_kind: kind.value === 'all' ? null : kind.value,
      ...cursor,
    };
  }
  async function fetchActivity(signal: AbortSignal, before?: ActivityRequest) {
    try {
      const { data, error } = await $supabase.client
        .rpc('get_api_request_activity', requestArgs(before))
        .abortSignal(signal);
      return error ? null : (data as Activity | null);
    } catch {
      return null;
    }
  }
  function applyActivity(
    result: Activity,
    requestedRange: ActivityRange,
    before?: ActivityRequest
  ) {
    if (!before) {
      activity.value = result;
      displayRange.value = requestedRange;
    }
    const page = result.requests.slice(0, PAGE_SIZE);
    requests.value = before ? [...requests.value, ...page] : page;
    hasMore.value = result.requests.length > PAGE_SIZE;
  }
  async function load(before?: ActivityRequest) {
    abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    failed.value = false;
    const requestedRange = range.value;
    const result = await fetchActivity(request.signal, before);
    if (request.signal.aborted) return;
    loading.value = false;
    failed.value = result === null;
    if (result) applyActivity(result, requestedRange, before);
  }
  watch([range, endpoint, client, throttleOnly, kind], () => void load(), { immediate: true });
  onScopeDispose(abort);
  return {
    range,
    displayRange,
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
