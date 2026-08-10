<template>
  <section class="bg-surface-900/80 rounded-lg border border-white/10 p-5 sm:p-6 md:col-span-2">
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 class="text-primary-300/80 text-xs font-semibold tracking-widest uppercase">
        {{ t('page.credits.sections.contributors') }}
      </h2>
      <span class="text-surface-400 text-xs tabular-nums">
        {{ contributorCountLabel }}
      </span>
    </div>
    <div v-if="pending" class="text-surface-300 mt-4 flex items-center gap-2 text-sm">
      <UIcon name="i-mdi-loading" class="h-4 w-4 animate-spin" />
      <span>{{ t('page.credits.contributors.loading') }}</span>
    </div>
    <div v-else-if="showError" class="mt-4 space-y-3">
      <p class="text-error-300 text-sm">
        {{ t('page.credits.contributors.error') }}
      </p>
      <UButton size="sm" color="neutral" variant="soft" @click="() => refresh()">
        {{ t('common.retry') }}
      </UButton>
    </div>
    <p v-else-if="!contributors.length" class="text-surface-300 mt-4 text-sm">
      {{ t('page.credits.contributors.empty') }}
    </p>
    <CreditMemberList v-else :members="contributors" variant="grid" ordered class="mt-4" />
  </section>
</template>
<script setup lang="ts">
  import CreditMemberList from '@/features/credits/CreditMemberList.vue';
  import { useContributors } from '@/features/credits/useContributors';
  const { t } = useI18n({ useScope: 'global' });
  const { contributors, pending, refresh, showError } = useContributors();
  const contributorCountLabel = computed(() =>
    contributors.value.length
      ? t('page.credits.contributors.total', { count: contributors.value.length })
      : ''
  );
</script>
