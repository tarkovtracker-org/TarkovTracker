<template>
  <div class="space-y-2">
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
</template>
<script setup lang="ts">
  import { useApiActivityLabels } from '@/features/settings/useApiActivityLabels';
  import type { QuotaSnapshot } from '@/features/settings/useApiTokenActivity';
  const props = defineProps<{ snapshots: QuotaSnapshot[] }>();
  const { text, number, timestamp } = useApiActivityLabels();
  const quotaKinds = ['read', 'write'] as const;
  const quota = computed(() => ({
    read: props.snapshots.find((snapshot) => snapshot.kind === 'read'),
    write: props.snapshots.find((snapshot) => snapshot.kind === 'write'),
  }));
</script>
