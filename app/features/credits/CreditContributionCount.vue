<template>
  <span
    v-if="count != null"
    class="text-surface-400 group-hover:text-surface-300 shrink-0 text-xs font-semibold tabular-nums"
  >
    <span aria-hidden="true">{{ count }}</span>
    <span class="sr-only">{{ contributionLabel }}</span>
  </span>
</template>
<script setup lang="ts">
  const props = defineProps<{ count?: number }>();
  const { t } = useI18n({ useScope: 'global' });
  const contributionLabel = computed(() =>
    t('page.credits.contributors.contributions', { count: props.count }, props.count ?? 0)
  );
</script>
