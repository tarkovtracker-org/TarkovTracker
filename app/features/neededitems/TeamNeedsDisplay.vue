<template>
  <span class="text-surface-300 inline-flex min-w-0 items-center gap-1">
    <UIcon
      name="i-mdi-account-group"
      class="text-surface-400 size-3.5 shrink-0"
      :title="$t('page.needed_items.teammates_needed')"
    />
    <span class="sr-only">{{ $t('page.needed_items.teammates_needed') }}</span>
    <span class="truncate">
      <template v-for="(userNeed, index) in teamNeeds" :key="userNeed.user">
        <span v-if="index" aria-hidden="true">,</span>
        {{ getDisplayName(userNeed.user) }}
        <span class="text-surface-400 tabular-nums">
          {{ formatNumber(userNeed.count) }}/{{ formatNumber(neededCount) }}
        </span>
      </template>
    </span>
  </span>
</template>
<script setup lang="ts">
  import { useProgressStore } from '@/stores/useProgress';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import type { NeededItemTeamNeed } from '@/features/neededitems/neededitem-keys';
  const formatNumber = useLocaleNumberFormatter();
  defineProps<{
    teamNeeds: NeededItemTeamNeed[];
    neededCount: number;
  }>();
  const progressStore = useProgressStore();
  const getDisplayName = (user: string) => progressStore.getDisplayName(user);
</script>
