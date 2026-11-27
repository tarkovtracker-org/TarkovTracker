<template>
  <div role="alert" aria-live="assertive" aria-atomic="true">
    <UAlert
      icon="i-mdi-clock-alert-outline"
      color="warning"
      variant="soft"
      :title="$t('settings.tarkov_dev_import.stale_recovery_title', { days: ageDays })"
    >
      <template #description>
        <p class="text-xs leading-5">
          {{ $t(descriptionKey) }}
        </p>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
          <template v-if="stage === 'initial'">
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              :disabled="disabled"
              @click="revealFallback"
            >
              {{ $t('settings.tarkov_dev_import.stale_skip_refresh_link') }}
            </UButton>
            <UButton
              v-if="profileUrl"
              size="sm"
              color="info"
              variant="solid"
              icon="i-mdi-open-in-new"
              :href="profileUrl"
              target="_blank"
              rel="noopener noreferrer"
              @click="markOpened"
            >
              {{ $t('settings.tarkov_dev_import.refresh_on_tarkov_dev') }}
            </UButton>
          </template>
          <template v-else-if="stage === 'awaiting'">
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                v-if="profileUrl"
                size="sm"
                color="info"
                variant="subtle"
                icon="i-mdi-open-in-new"
                :href="profileUrl"
                target="_blank"
                rel="noopener noreferrer"
                @click="markOpened"
              >
                {{ $t('settings.tarkov_dev_import.open_again') }}
              </UButton>
              <UButton
                size="sm"
                color="neutral"
                variant="ghost"
                :disabled="disabled"
                @click="revealFallback"
              >
                {{ $t('settings.tarkov_dev_import.include_stale_mode') }}
              </UButton>
            </div>
            <UButton
              size="sm"
              color="warning"
              variant="solid"
              icon="i-mdi-refresh"
              :loading="loading"
              :disabled="disabled"
              @click="emit('retryFresh')"
            >
              {{ $t('settings.tarkov_dev_import.check_for_update') }}
            </UButton>
          </template>
          <template v-else>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                v-if="profileUrl"
                size="sm"
                color="info"
                variant="subtle"
                icon="i-mdi-open-in-new"
                :href="profileUrl"
                target="_blank"
                rel="noopener noreferrer"
                @click="markOpened"
              >
                {{ $t('settings.tarkov_dev_import.refresh_on_tarkov_dev') }}
              </UButton>
              <UButton
                size="sm"
                color="neutral"
                variant="soft"
                icon="i-mdi-arrow-right"
                :loading="loading"
                :disabled="disabled"
                @click="emit('allowStale')"
              >
                {{ $t('settings.tarkov_dev_import.continue_stale_anyway') }}
              </UButton>
            </div>
            <UButton
              size="sm"
              color="warning"
              variant="solid"
              icon="i-mdi-refresh"
              :loading="loading"
              :disabled="disabled"
              @click="emit('retryFresh')"
            >
              {{ $t('settings.tarkov_dev_import.check_again') }}
            </UButton>
          </template>
        </div>
      </template>
    </UAlert>
  </div>
</template>
<script setup lang="ts">
  const props = defineProps<{
    ageDays: number;
    profileUrl?: string;
    loading: boolean;
    disabled: boolean;
  }>();
  const emit = defineEmits<{ retryFresh: []; allowStale: [] }>();
  const opened = ref(false);
  const fallbackVisible = ref(false);
  const recheckStillStale = ref(false);
  function markOpened() {
    opened.value = true;
  }
  function revealFallback() {
    fallbackVisible.value = true;
  }
  watch(
    () => props.loading,
    (next, prev) => {
      if (prev && !next) {
        recheckStillStale.value = true;
        fallbackVisible.value = true;
      }
    }
  );
  const stage = computed<'initial' | 'awaiting' | 'fallback'>(() => {
    if (fallbackVisible.value || !props.profileUrl) return 'fallback';
    return opened.value ? 'awaiting' : 'initial';
  });
  const descriptionKey = computed(() => {
    if (recheckStillStale.value) return 'settings.tarkov_dev_import.stale_recovery_description';
    if (stage.value === 'awaiting') return 'settings.tarkov_dev_import.multi_mode_awaiting';
    return 'settings.tarkov_dev_import.stale_initial_description';
  });
</script>
