<template>
  <div class="flex items-center gap-2 text-sm">
    <span v-if="showLevelRequirement" class="flex items-center gap-1">
      <UIcon name="i-mdi-account" class="h-4 w-4" />
      {{ $t('common.lvl_level', { level: levelRequired }) }}
    </span>
    <span v-if="lockedBefore > 0" class="flex items-center gap-1">
      <UIcon name="i-mdi-lock-outline" class="h-4 w-4" />
      {{ $t('needed_items.locked_before', { count: lockedBefore }) }}
    </span>
  </div>
</template>
<script setup lang="ts">
  const props = defineProps<{
    levelRequired: number;
    lockedBefore: number;
    playerLevel: number;
  }>();
  const showLevelRequirement = computed(
    () => props.levelRequired > 0 && props.levelRequired > props.playerLevel
  );
</script>
