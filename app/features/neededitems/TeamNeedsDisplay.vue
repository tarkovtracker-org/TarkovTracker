<template>
  <div class="flex flex-col items-center text-xs">
    <div class="text-surface-400 mb-1 flex items-center gap-1">
      <UIcon name="i-mdi-account-group" class="h-4 w-4" />
      <span>{{ $t('page.needed_items.teammates_needed') }}</span>
    </div>
    <div class="flex flex-wrap justify-center gap-1">
      <UBadge
        v-for="userNeed in teamNeeds"
        :key="userNeed.user"
        color="primary"
        variant="soft"
        size="sm"
        class="flex items-center gap-1"
      >
        <UIcon name="i-mdi-account" class="h-3 w-3" />
        <span>{{ getDisplayName(userNeed.user) }}</span>
        <span class="text-surface-300">
          {{ formatNumber(userNeed.count) }}/{{ formatNumber(neededCount) }}
        </span>
      </UBadge>
    </div>
  </div>
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
