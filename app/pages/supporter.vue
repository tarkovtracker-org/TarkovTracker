<template>
  <div class="min-h-[calc(100vh-250px)] px-3 py-6 sm:px-6">
    <div class="mx-auto max-w-275 space-y-8">
      <PageHeader :title="t('page.supporter.title')" :description="t('page.supporter.subtitle')">
        <template #actions>
          <nav :aria-label="t('page.supporter.policies_title')" class="flex flex-wrap gap-2">
            <UButton
              to="/terms-of-service#supporter"
              size="sm"
              color="neutral"
              variant="link"
              icon="i-mdi-file-document-outline"
              :label="t('common.terms_of_service')"
            />
            <UButton
              to="/privacy"
              size="sm"
              color="neutral"
              variant="link"
              icon="i-mdi-shield-account-outline"
              :label="t('common.privacy_policy')"
            />
          </nav>
        </template>
      </PageHeader>
      <ClientOnly>
        <SupporterPage />
      </ClientOnly>
      <section
        aria-labelledby="supporter-policies-title"
        class="border-surface-700/50 bg-surface-900/60 text-surface-300 space-y-4 rounded-2xl border p-5 text-sm sm:p-6"
      >
        <h2 id="supporter-policies-title" class="text-surface-50 text-lg font-semibold">
          {{ t('page.supporter.policies_title') }}
        </h2>
        <p>{{ t('page.supporter.terms_summary') }}</p>
        <NuxtLink to="/terms-of-service#refunds" class="text-link inline-block underline">
          {{ t('page.supporter.payment_terms_link') }}
        </NuxtLink>
        <p>{{ t('page.supporter.retention_summary') }}</p>
        <NuxtLink to="/terms-of-service#privacy" class="text-link inline-block underline">
          {{ t('page.supporter.retention_terms_link') }}
        </NuxtLink>
        <p>{{ t('page.supporter.privacy_summary') }}</p>
        <NuxtLink to="/privacy" class="text-link inline-block underline">
          {{ t('common.privacy_policy') }}
        </NuxtLink>
      </section>
    </div>
  </div>
</template>
<script setup lang="ts">
  import PageHeader from '@/components/ui/PageHeader.vue';
  import SupporterPage from '@/features/client-pages/SupporterPage.client.vue';
  const { t } = useI18n({ useScope: 'global' });
  definePageMeta({ layout: 'default' });
</script>
