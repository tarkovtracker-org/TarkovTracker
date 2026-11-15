<template>
  <span class="text-surface-300 inline-flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
    <UIcon
      name="i-mdi-account-group"
      class="text-surface-400 size-3.5 shrink-0"
      aria-hidden="true"
    />
    <span class="text-surface-400">{{ $t('page.needed_items.teammates_label') }}</span>
    <template v-for="(userNeed, index) in teamNeeds" :key="userNeed.user">
      <span class="break-words">
        {{ getDisplayName(userNeed.user) }}
        <span class="text-surface-400 tabular-nums">
          {{ formatNumber(userNeed.count) }}/{{ formatNumber(neededCount) }}
        </span>
        <span v-if="index < teamNeeds.length - 1" aria-hidden="true">,</span>
      </span>
    </template>
  </span>
</template>
<script setup lang="ts">
  import { useProgressStore } from '@/stores/useProgress';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import type { NeededItemTeamNeed } from '@/features/neededitems/neededitem-keys';
  /** Teammates who still need this, with their counts. Wraps rather than truncating. */
  defineProps<{
    teamNeeds: NeededItemTeamNeed[];
    neededCount: number;
  }>();
  const formatNumber = useLocaleNumberFormatter();
  const progressStore = useProgressStore();
  const getDisplayName = (user: string) => progressStore.getDisplayName(user);
</script>
