<template>
  <div v-if="teamNeeds.length > 0" class="flex flex-col items-center text-xs">
    <div class="text-surface-400 mb-1 flex items-center gap-1">
      <UIcon name="i-mdi-account-group" class="h-4 w-4" />
      <span>{{ $t('page.needed_items.teammates_needed') }}</span>
    </div>
    <div class="flex flex-wrap justify-center gap-1">
      <UBadge
        v-for="(userNeed, userIndex) in teamNeeds"
        :key="userIndex"
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
  const formatNumber = useLocaleNumberFormatter();
  interface UserNeed {
    user: string;
    count: number;
  }
  defineProps<{
    teamNeeds: UserNeed[];
    neededCount: number;
  }>();
  const progressStore = useProgressStore();
  const getDisplayName = (user: string) => progressStore.getDisplayName(user);
</script>
