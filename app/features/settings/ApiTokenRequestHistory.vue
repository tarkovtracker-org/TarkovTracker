<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h4 class="font-semibold">{{ text('history') }}</h4>
      <UButton
        v-if="requests.length"
        :disabled="stale"
        color="neutral"
        variant="soft"
        size="xs"
        icon="i-mdi-content-copy"
        @click="emit('copy-evidence')"
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
            class="grid grid-cols-4 gap-x-2 gap-y-1 border-b border-white/5 py-2 @min-[34rem]:table-row"
          >
            <td class="col-span-4 block @min-[34rem]:table-cell @min-[34rem]:p-2">
              <time :datetime="request.occurred_at">{{ timestamp(request.occurred_at) }}</time>
            </td>
            <td
              class="col-span-3 col-start-1 row-start-2 block font-medium wrap-anywhere @min-[34rem]:table-cell @min-[34rem]:p-2"
            >
              {{ request.endpoint }}
            </td>
            <td
              class="col-span-4 col-start-1 row-start-3 block @min-[34rem]:table-cell @min-[34rem]:p-2"
            >
              <button
                type="button"
                class="wrap-anywhere underline underline-offset-2"
                @click="emit('select-client', request.client)"
              >
                {{ clientName(request.client) }}
              </button>
            </td>
            <td
              class="col-start-4 row-start-2 block text-end tabular-nums @min-[34rem]:table-cell @min-[34rem]:p-2 @min-[34rem]:text-start"
            >
              {{ request.status }}
            </td>
            <td
              class="col-span-4 block @min-[34rem]:table-cell @min-[34rem]:p-2"
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
      :disabled="stale"
      color="neutral"
      variant="soft"
      size="sm"
      @click="emit('load-more')"
    >
      {{ text('load_more') }}
    </UButton>
  </div>
</template>
<script setup lang="ts">
  import { useApiActivityLabels } from '@/features/settings/useApiActivityLabels';
  import type { ActivityRequest } from '@/features/settings/useApiTokenActivity';
  defineProps<{
    requests: ActivityRequest[];
    hasMore: boolean;
    loading: boolean;
    stale: boolean;
  }>();
  const emit = defineEmits<{
    'copy-evidence': [];
    'select-client': [client: string];
    'load-more': [];
  }>();
  const { text, timestamp } = useApiActivityLabels();
  const clientName = (value: string) => value || text('unidentified');
</script>
