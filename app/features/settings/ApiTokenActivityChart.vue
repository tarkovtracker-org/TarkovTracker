<template>
  <div class="space-y-2">
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
      <UTooltip v-for="bucket in buckets" :key="bucket.at" :text="describeBucket(bucket)">
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
          <span class="bg-warning block w-full" :style="{ height: percent(bucket.throttled) }" />
        </button>
      </UTooltip>
    </div>
    <div class="text-surface-400 flex justify-between text-xs">
      <span>{{ bucketTime(buckets[0]?.at) }}</span>
      <span>{{ bucketTime(buckets.at(-1)?.at) }} UTC</span>
    </div>
    <p v-if="selectedBucket" class="text-surface-300 text-xs" role="status">
      {{ selectedBucket }}
    </p>
  </div>
</template>
<script setup lang="ts">
  import { useApiActivityLabels } from '@/features/settings/useApiActivityLabels';
  import type { ActivityBucket, ActivityRange } from '@/features/settings/useApiTokenActivity';
  const props = defineProps<{ buckets: ActivityBucket[]; range: ActivityRange }>();
  const { text, number, locale } = useApiActivityLabels();
  const bucketFormat = computed(
    () =>
      new Intl.DateTimeFormat(locale.value, {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
        ...(props.range === 'today' || props.range === '24h' ? { hour: 'numeric' } : {}),
      })
  );
  const bucketTime = (value?: string) => (value ? bucketFormat.value.format(new Date(value)) : '');
  const maxRequests = computed(() =>
    Math.max(1, ...props.buckets.map((bucket) => bucket.requests))
  );
  const percent = (value: number) => `${(value / maxRequests.value) * 100}%`;
  const describeBucket = (bucket: ActivityBucket) =>
    text('bucket', {
      time: bucketTime(bucket.at),
      requests: number(bucket.requests),
      throttled: number(bucket.throttled),
    });
  const selectedBucket = ref('');
  watch(
    () => props.buckets,
    () => {
      selectedBucket.value = '';
    }
  );
</script>
