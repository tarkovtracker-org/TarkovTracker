<template>
  <div class="space-y-3">
    <div class="border-warning-700/30 bg-warning-900/20 rounded-2xl border p-4">
      <div class="flex items-start gap-3">
        <UIcon name="i-mdi-alert-circle-outline" class="text-warning-400 mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <h3 class="text-warning-300 text-sm font-semibold">
            {{ t('page.supporter.kofi_deprecation_title') }}
          </h3>
          <p class="text-warning-400/80 mt-0.5 text-xs">
            {{ t('page.supporter.kofi_deprecation_detail') }}
          </p>
          <a
            href="https://ko-fi.com/dysektai"
            target="_blank"
            rel="noopener noreferrer"
            class="text-warning-400 hover:text-warning-300 mt-1.5 inline-block text-xs underline transition-colors"
          >
            ko-fi.com/dysektai
          </a>
        </div>
      </div>
    </div>
    <div class="border-surface-700/30 bg-surface-900/40 rounded-2xl border p-6">
      <div class="flex items-center gap-3">
        <UIcon name="i-mdi-clock-outline" class="text-surface-500 h-5 w-5 shrink-0" />
        <div>
          <h3 class="text-sm font-semibold text-white">
            {{ t('page.supporter.alt_payments_title') }}
          </h3>
          <p class="text-surface-500 mt-0.5 text-sm">
            {{ t('page.supporter.alt_payments_coming_soon') }}
          </p>
        </div>
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <span
          v-for="method in methods"
          :key="method"
          class="border-surface-700/50 text-surface-500 rounded-full border px-3 py-1 text-xs"
        >
          {{ method }}
        </span>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  const { t } = useI18n({ useScope: 'global' });
  const methods = computed(() => [
    t('page.supporter.alt_payment_crypto'),
    t('page.supporter.alt_payment_gift_cards'),
    t('page.supporter.alt_payments_more'),
  ]);
</script>
