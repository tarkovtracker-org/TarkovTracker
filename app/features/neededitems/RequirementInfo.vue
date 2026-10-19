<template>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5">
    <span v-if="showLevelRequirement" class="flex items-center gap-1">
      <UIcon name="i-mdi-account" :class="iconClass" />
      {{ $t('common.lvl_level', { level: levelRequired }) }}
    </span>
    <span v-if="lockedBefore > 0" class="flex items-center gap-1">
      <UIcon name="i-mdi-lock-outline" :class="iconClass" />
      {{ $t('needed_items.locked_before', { count: lockedBefore }) }}
    </span>
  </div>
</template>
<script setup lang="ts">
  const props = withDefaults(
    defineProps<{
      levelRequired: number;
      lockedBefore: number;
      playerLevel: number;
      iconClass?: string;
    }>(),
    { iconClass: 'h-4 w-4' }
  );
  const showLevelRequirement = computed(
    () => props.levelRequired > 0 && props.levelRequired > props.playerLevel
  );
</script>
