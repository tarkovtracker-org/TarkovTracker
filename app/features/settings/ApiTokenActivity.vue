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
    <div v-if="activity" class="space-y-2">
      <div>
        <h4 class="font-semibold">{{ text('quota') }}</h4>
        <p class="text-surface-400 text-xs">{{ text('quota_description') }}</p>
      </div>
      <div class="grid gap-2 sm:grid-cols-2">
        <div v-for="quotaKind in quotaKinds" :key="quotaKind" class="bg-surface-900 rounded-md p-3">
          <div class="flex flex-wrap justify-between gap-1 text-sm">
            <strong>{{ text(quotaKind) }}</strong>
            <span v-if="quota[quotaKind]" class="tabular-nums">
              {{
                text('quota_fraction', {
                  used: number(quota[quotaKind].limit - quota[quotaKind].remaining),
                  limit: number(quota[quotaKind].limit),
                })
              }}
            </span>
            <span v-else class="text-surface-400">{{ text('quota_unknown') }}</span>
          </div>
          <template v-if="quota[quotaKind]">
            <UProgress
              class="my-2"
              :aria-label="text(quotaKind)"
              :model-value="quota[quotaKind].limit - quota[quotaKind].remaining"
              :max="quota[quotaKind].limit"
              :color="quota[quotaKind].remaining === 0 ? 'warning' : 'primary'"
              size="sm"
            />
            <p class="text-surface-400 text-xs">
              {{ text('observed', { time: timestamp(quota[quotaKind].at) }) }}
            </p>
          </template>
        </div>
      </div>
    </div>
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
    <p v-if="failed" role="alert" class="text-error text-sm">{{ text('load_error') }}</p>
    <p v-if="loading" role="status" class="text-surface-400 text-sm">{{ text('loading') }}</p>
    <template v-if="activity && ((!failed && !loading) || requests.length)">
      <div class="grid gap-2 border-y border-white/10 py-3 @min-[15rem]:grid-cols-3">
        <div v-for="metric in metrics" :key="metric">
          <strong class="block text-lg tabular-nums">{{ number(activity.summary[metric]) }}</strong>
          <span class="text-surface-400 text-xs wrap-anywhere">{{ text(metric) }}</span>
        </div>
      </div>
      <div v-if="activity.summary.requests" class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h4 class="font-semibold">{{ text('chart') }}</h4>
          <p class="text-surface-400 flex flex-wrap gap-3 text-xs">
            <span>
              <span class="bg-primary-400 me-1 inline-block size-2 rounded-sm"></span>
              {{ text('chart_other') }}
            </span>
            <span>
              <span class="bg-warning me-1 inline-block size-2 rounded-sm"></span>
              {{ text('throttled') }}
            </span>
          </p>
        </div>
        <div class="flex h-24 items-end gap-px border-b border-white/10 sm:gap-1">
          <UTooltip
            v-for="bucket in activity.buckets"
            :key="bucket.at"
            :text="describeBucket(bucket)"
          >
            <button
              type="button"
              class="flex h-full min-w-0 flex-1 flex-col-reverse justify-start rounded-sm hover:bg-white/10 focus-visible:outline-2"
              :aria-label="describeBucket(bucket)"
              @click="selectedBucket = describeBucket(bucket)"
            >
              <span
                class="bg-primary-400 block w-full"
                :style="{ height: percent(bucket.requests - bucket.throttled) }"
              />
              <span
                class="bg-warning block w-full"
                :style="{ height: percent(bucket.throttled) }"
              />
            </button>
          </UTooltip>
        </div>
        <div class="text-surface-400 flex justify-between text-xs">
          <span>{{ bucketTime(activity.buckets[0]?.at) }}</span>
          <span>{{ bucketTime(activity.buckets.at(-1)?.at) }} UTC</span>
        </div>
        <p v-if="selectedBucket" class="text-surface-300 text-xs" role="status">
          {{ selectedBucket }}
        </p>
      </div>
      <div v-if="groups.some((group) => group.rows.length)" class="grid gap-3 sm:grid-cols-2">
        <div
          v-for="group in groups"
          :key="group.type"
          class="min-w-0 rounded-lg border border-white/10 p-3"
        >
          <h4 class="text-sm font-semibold">{{ text(group.type) }}</h4>
          <p class="text-surface-400 mb-1 text-xs">{{ text('rank_legend') }}</p>
          <button
            v-for="row in group.rows"
            :key="row.value"
            type="button"
            class="flex w-full items-start justify-between gap-2 rounded px-1 py-1.5 text-left text-xs wrap-anywhere hover:bg-white/10 aria-pressed:bg-white/10"
            :aria-pressed="group.selected === row.value"
            @click="toggleGroup(group.type, row)"
          >
            <span>
              {{ group.type === 'client' ? clientName(row.value) : endpointName(row.value) }}
            </span>
            <span class="text-surface-300 shrink-0 tabular-nums">
              {{ number(row.counted) }} / {{ number(row.throttled) }}
            </span>
          </button>
        </div>
      </div>
      <div class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h4 class="font-semibold">{{ text('history') }}</h4>
          <UButton
            v-if="requests.length"
            :disabled="loading"
            color="neutral"
            variant="soft"
            size="xs"
            icon="i-mdi-content-copy"
            @click="copyEvidence"
          >
            {{ text('copy_evidence') }}
          </UButton>
        </div>
        <p class="text-surface-400 text-xs">{{ text('history_description') }}</p>
        <p v-if="!requests.length" class="text-surface-400 text-sm">{{ text('no_activity') }}</p>
        <div v-else>
          <table class="block w-full text-left text-xs @min-[34rem]:table">
            <thead
              class="text-surface-400 sr-only border-b border-white/10 @min-[34rem]:not-sr-only @min-[34rem]:table-header-group"
            >
              <tr>
                <th scope="col" class="p-2">{{ text('time') }}</th>
                <th scope="col" class="p-2">{{ text('endpoint') }}</th>
                <th scope="col" class="p-2">{{ text('client') }}</th>
                <th scope="col" class="p-2">{{ text('status') }}</th>
                <th scope="col" class="p-2">{{ text('quota_result') }}</th>
              </tr>
            </thead>
            <tbody class="block @min-[34rem]:table-row-group">
              <tr
                v-for="request in requests"
                :key="request.id"
                class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 border-b border-white/5 py-2 @min-[34rem]:table-row"
              >
                <td class="col-span-2 block @min-[34rem]:table-cell @min-[34rem]:p-2">
                  <time :datetime="request.occurred_at">{{ timestamp(request.occurred_at) }}</time>
                </td>
                <td
                  class="col-start-1 row-start-2 block font-medium wrap-anywhere @min-[34rem]:table-cell @min-[34rem]:p-2"
                >
                  {{ request.endpoint }}
                </td>
                <td class="col-start-1 row-start-3 block @min-[34rem]:table-cell @min-[34rem]:p-2">
                  <button
                    type="button"
                    class="wrap-anywhere underline underline-offset-2"
                    @click="client = request.client"
                  >
                    {{ clientName(request.client) }}
                  </button>
                </td>
                <td
                  class="col-start-2 row-start-2 block text-end tabular-nums @min-[34rem]:table-cell @min-[34rem]:p-2 @min-[34rem]:text-start"
                >
                  {{ request.status }}
                </td>
                <td
                  class="col-span-2 block @min-[34rem]:table-cell @min-[34rem]:p-2"
                  :class="{ 'text-warning': request.outcome === 'throttled' }"
                >
                  {{ text(request.outcome === 'throttled' ? 'throttled_result' : request.outcome) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <UButton
          v-if="hasMore"
          :loading="loading"
          color="neutral"
          variant="soft"
          size="sm"
          @click="load(requests.at(-1))"
        >
          {{ text('load_more') }}
        </UButton>
      </div>
    </template>
  </section>
</template>
<script setup lang="ts">
  import {
    useApiTokenActivity,
    type ActivityCounts,
    type ActivityGroup,
  } from '@/features/settings/useApiTokenActivity';
  const props = defineProps<{ title: string; tokenId?: string }>();
  const { t, locale } = useI18n();
  const toast = useToast();
  const {
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
  } = useApiTokenActivity(() => props.tokenId);
  const text = (key: string, params: Record<string, string> = {}) =>
    t(`page.settings.card.apitokens.activity.${key}`, params);
  const quotaKinds = ['read', 'write'] as const;
  const metrics = ['requests', 'counted', 'throttled'] as const;
  const quota = computed(() => ({
    read: activity.value?.quota.find((snapshot) => snapshot.kind === 'read'),
    write: activity.value?.quota.find((snapshot) => snapshot.kind === 'write'),
  }));
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
  const number = (value: number) => value.toLocaleString(locale.value);
  const utcTime = computed(
    () =>
      new Intl.DateTimeFormat(locale.value, {
        dateStyle: 'medium',
        timeStyle: 'medium',
        timeZone: 'UTC',
      })
  );
  const timestamp = (value: string) => utcTime.value.format(new Date(value));
  const bucketFormat = computed(
    () =>
      new Intl.DateTimeFormat(locale.value, {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
        ...(range.value === 'today' || range.value === '24h' ? { hour: 'numeric' } : {}),
      })
  );
  const bucketTime = (value?: string) => (value ? bucketFormat.value.format(new Date(value)) : '');
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
      rows: activity.value?.endpoints.slice(0, 5) ?? [],
      selected: endpoint.value,
    },
    {
      type: 'client' as const,
      rows: activity.value?.clients.slice(0, 5) ?? [],
      selected: client.value,
    },
  ]);
  const maxRequests = computed(() =>
    Math.max(1, ...(activity.value?.buckets.map((bucket) => bucket.requests) ?? []))
  );
  const percent = (value: number) => `${(value / maxRequests.value) * 100}%`;
  const describeBucket = (bucket: ActivityCounts & { at: string }) =>
    text('bucket', {
      time: bucketTime(bucket.at),
      requests: number(bucket.requests),
      throttled: number(bucket.throttled),
    });
  const selectedBucket = ref('');
  watch([range, endpoint, client, throttleOnly, kind, activity], () => {
    selectedBucket.value = '';
  });
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
  function toggleGroup(type: 'endpoint' | 'client', row: ActivityGroup) {
    const filter = type === 'endpoint' ? endpoint : client;
    filter.value = filter.value === row.value ? null : row.value;
  }
  async function copyEvidence() {
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
