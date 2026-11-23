<template>
  <section class="bg-surface-950 @container space-y-4 rounded-lg border border-white/10 p-3 sm:p-4">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="text-primary-300 text-xs uppercase">{{ text('title') }}</p>
        <h3 class="text-lg font-semibold wrap-anywhere">{{ title }}</h3>
      </div>
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-mdi-refresh"
        :disabled="loading"
        @click="load()"
      >
        {{ text('refresh') }}
      </UButton>
    </header>
    <ApiTokenQuota v-if="activity" :snapshots="activity.quota" />
    <div class="space-y-1">
      <div class="flex flex-wrap items-end gap-2">
        <UFormField :label="text('range')" class="min-w-0">
          <USelect v-model="range" :items="rangeOptions" class="max-w-full" />
        </UFormField>
        <UFormField :label="text('quota_kind')" class="min-w-0">
          <USelect v-model="kind" :items="kindOptions" class="max-w-full" />
        </UFormField>
        <UFormField v-if="activity" :label="text('endpoint')" class="min-w-0">
          <USelect v-model="endpointFilter" :items="endpointOptions" class="max-w-full" />
        </UFormField>
        <UFormField v-if="activity" :label="text('client')" class="min-w-0">
          <USelect v-model="clientFilter" :items="clientOptions" class="max-w-full" />
        </UFormField>
        <UCheckbox v-model="throttleOnly" :label="text('throttle_only')" class="py-1.5" />
      </div>
      <p :role="statusRole" :class="statusColor" class="min-h-4 text-xs">
        {{ statusMessage }}
      </p>
    </div>
    <template v-if="activity">
      <div class="grid gap-2 border-y border-white/10 py-3 @min-[15rem]:grid-cols-3">
        <div v-for="metric in metrics" :key="metric">
          <strong class="block text-lg tabular-nums">
            {{ number(activity.summary[metric]) }}
          </strong>
          <span class="text-surface-400 text-xs wrap-anywhere">{{ text(metric) }}</span>
        </div>
      </div>
      <ApiTokenActivityChart
        v-if="activity.summary.requests"
        :buckets="activity.buckets"
        :range="displayRange"
      />
      <div v-if="groups.some((group) => group.rows.length)" class="grid gap-3 sm:grid-cols-2">
        <ApiTokenActivityRanking
          v-for="group in groups"
          :key="group.type"
          :title="text(group.type)"
          :rows="group.rows"
          :selected="group.selected"
          @select="toggleGroup(group.type, $event)"
        />
      </div>
      <ApiTokenRequestHistory
        :requests="requests"
        :has-more="hasMore"
        :loading="loading"
        :stale="resultsStale"
        @copy-evidence="copyEvidence"
        @select-client="client = $event"
        @load-more="load(requests.at(-1))"
      />
    </template>
  </section>
</template>
<script setup lang="ts">
  import ApiTokenActivityChart from '@/features/settings/ApiTokenActivityChart.vue';
  import ApiTokenActivityRanking from '@/features/settings/ApiTokenActivityRanking.vue';
  import ApiTokenQuota from '@/features/settings/ApiTokenQuota.vue';
  import ApiTokenRequestHistory from '@/features/settings/ApiTokenRequestHistory.vue';
  import { useApiActivityLabels } from '@/features/settings/useApiActivityLabels';
  import { useApiTokenActivity } from '@/features/settings/useApiTokenActivity';
  const props = defineProps<{ title: string; tokenId?: string }>();
  const { text, number } = useApiActivityLabels();
  const toast = useToast();
  const {
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
  } = useApiTokenActivity(() => props.tokenId);
  const resultsStale = computed(() => loading.value || failed.value);
  const statusRole = computed(() => (failed.value ? 'alert' : 'status'));
  const statusColor = computed(() => (failed.value ? 'text-error' : 'text-surface-400'));
  const statusMessage = computed(() => {
    const keys = activity.value
      ? { failure: 'stale_results', pending: 'updating' }
      : { failure: 'load_error', pending: 'loading' };
    if (failed.value) return text(keys.failure);
    return loading.value ? text(keys.pending) : '';
  });
  const quotaKinds = ['read', 'write'] as const;
  const metrics = ['requests', 'counted', 'throttled'] as const;
  const rangeOptions = computed(() => [
    { value: 'today', label: text('today') },
    { value: '24h', label: text('last_24_hours') },
    { value: '7d', label: text('last_7_days') },
    { value: '30d', label: text('last_30_days') },
  ]);
  const kindOptions = computed(() => [
    { label: text('all_kinds'), value: 'all' },
    ...quotaKinds.map((value) => ({ label: text(value), value })),
  ]);
  const clientName = (value: string) => value || text('unidentified');
  const endpointLabels = new Map([
    ['GET /token', 'inspect_token'],
    ['GET /progress', 'read_progress'],
    ['GET /team/progress', 'read_team_progress'],
    ['POST /progress/tasks', 'update_tasks'],
    ['POST /progress/level/{level}', 'update_level'],
    ['POST /progress/task/{id}', 'update_task'],
    ['POST /progress/task/objective/{id}', 'update_objective'],
  ]);
  function endpointName(value: string) {
    const label = endpointLabels.get(value);
    return label ? text(label) : value;
  }
  const groups = computed(() => [
    {
      type: 'endpoint' as const,
      rows: (activity.value?.endpoints ?? []).map((row) => ({
        ...row,
        label: endpointName(row.value),
      })),
      selected: endpoint.value,
    },
    {
      type: 'client' as const,
      rows: (activity.value?.clients ?? []).slice(0, 5).map((row) => ({
        ...row,
        label: clientName(row.value),
      })),
      selected: client.value,
    },
  ]);
  const ALL = '*';
  const UNKNOWN_CLIENT = '?';
  const clientOptionValue = (value: string) => value || UNKNOWN_CLIENT;
  const endpointFilter = computed({
    get: () => endpoint.value ?? ALL,
    set: (value: string) => {
      endpoint.value = value === ALL ? null : value;
    },
  });
  const clientFilter = computed({
    get: () => (client.value === null ? ALL : clientOptionValue(client.value)),
    set: (value: string) => {
      client.value = value === ALL ? null : value === UNKNOWN_CLIENT ? '' : value;
    },
  });
  const endpointOptions = computed(() => [
    { label: text('all_endpoints'), value: ALL },
    ...Array.from(
      new Set([
        ...(activity.value?.endpoints.map((row) => row.value) ?? []),
        ...(endpoint.value ? [endpoint.value] : []),
      ])
    ).map((value) => ({ label: value, value })),
  ]);
  const clientOptions = computed(() => [
    { label: text('all_clients'), value: ALL },
    ...Array.from(
      new Set([
        ...(activity.value?.clients.map((row) => row.value) ?? []),
        ...(client.value === null ? [] : [client.value]),
      ])
    ).map((value) => ({ label: clientName(value), value: clientOptionValue(value) })),
  ]);
  function toggleGroup(type: 'endpoint' | 'client', value: string) {
    const filter = type === 'endpoint' ? endpoint : client;
    filter.value = filter.value === value ? null : value;
  }
  async function copyEvidence() {
    if (resultsStale.value) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            range: range.value,
            filters: {
              endpoint: endpoint.value,
              client: client.value,
              kind: kind.value,
              throttledOnly: throttleOnly.value,
            },
            summary: activity.value?.summary,
            quota: activity.value?.quota,
            requests: requests.value,
          },
          null,
          2
        )
      );
      toast.add({ title: text('copied') });
    } catch {
      toast.add({ title: text('copy_error'), color: 'error' });
    }
  }
</script>
