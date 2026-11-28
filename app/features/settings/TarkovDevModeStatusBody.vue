<template>
  <div
    class="bg-surface-950/60 flex flex-1 flex-col justify-between gap-3 rounded-md border border-white/8 p-2.5"
  >
    <div class="flex items-start gap-2">
      <UIcon :name="statusIcon" class="mt-0.5 size-4 shrink-0" :class="iconToneClass" />
      <p class="text-xs leading-5" :class="messageToneClass">
        {{ displayMessage }}
      </p>
    </div>
    <div v-if="viewState === 'stale-initial'" class="space-y-2">
      <UButton
        size="xs"
        color="info"
        variant="solid"
        icon="i-mdi-open-in-new"
        class="w-full justify-center whitespace-nowrap"
        :href="profileUrl"
        target="_blank"
        rel="noopener noreferrer"
        @click="markOpened"
      >
        {{ $t('settings.tarkov_dev_import.refresh_on_tarkov_dev') }}
      </UButton>
      <button
        type="button"
        class="text-surface-400 hover:text-surface-200 block w-full cursor-pointer text-center text-xs underline-offset-4 hover:underline"
        @click="revealFallback"
      >
        {{ $t('settings.tarkov_dev_import.stale_skip_refresh_link') }}
      </button>
    </div>
    <div v-else-if="viewState === 'stale-awaiting'" class="space-y-2">
      <UButton
        size="xs"
        color="warning"
        variant="solid"
        icon="i-mdi-refresh"
        class="w-full justify-center whitespace-nowrap"
        :loading="refreshing"
        :disabled="refreshDisabled"
        @click="emit('refetch')"
      >
        {{ $t('settings.tarkov_dev_import.check_for_update') }}
      </UButton>
      <div class="flex items-center justify-between gap-2 text-xs">
        <button
          type="button"
          class="text-surface-400 hover:text-surface-200 cursor-pointer underline-offset-4 hover:underline"
          @click="revealFallback"
        >
          {{ $t('settings.tarkov_dev_import.include_stale_mode') }}
        </button>
        <a
          :href="profileUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="text-info-300 hover:text-info-200 ml-auto underline-offset-4 hover:underline"
          @click="markOpened"
        >
          {{ $t('settings.tarkov_dev_import.open_again') }}
        </a>
      </div>
    </div>
    <div v-else-if="viewState === 'stale-fallback'" class="space-y-2">
      <UButton
        v-if="profileUrl"
        size="xs"
        color="info"
        variant="subtle"
        icon="i-mdi-open-in-new"
        class="w-full justify-center whitespace-nowrap"
        :href="profileUrl"
        target="_blank"
        rel="noopener noreferrer"
        @click="markOpened"
      >
        {{ $t('settings.tarkov_dev_import.refresh_on_tarkov_dev') }}
      </UButton>
      <div class="grid grid-cols-2 gap-2">
        <UButton
          size="xs"
          color="neutral"
          variant="soft"
          class="justify-center whitespace-nowrap"
          :loading="refreshing"
          :disabled="refreshDisabled"
          @click="emit('allowStale')"
        >
          {{ $t('settings.tarkov_dev_import.include_stale_mode') }}
        </UButton>
        <UButton
          size="xs"
          color="warning"
          variant="solid"
          icon="i-mdi-refresh"
          class="justify-center whitespace-nowrap"
          :loading="refreshing"
          :disabled="refreshDisabled"
          @click="emit('refetch')"
        >
          {{ $t('settings.tarkov_dev_import.recheck_mode') }}
        </UButton>
      </div>
    </div>
    <div v-else-if="viewState === 'not-found-initial'" class="space-y-2">
      <UButton
        size="xs"
        color="info"
        variant="subtle"
        icon="i-mdi-open-in-new"
        class="w-full justify-center whitespace-nowrap"
        :href="profileUrl"
        target="_blank"
        rel="noopener noreferrer"
        @click="markOpened"
      >
        {{ $t('settings.tarkov_dev_import.load_on_tarkov_dev') }}
      </UButton>
    </div>
    <div v-else-if="viewState === 'not-found-awaiting'" class="space-y-2">
      <UButton
        size="xs"
        color="info"
        variant="solid"
        icon="i-mdi-refresh"
        class="w-full justify-center whitespace-nowrap"
        :loading="refreshing"
        :disabled="refreshDisabled"
        @click="emit('refetch')"
      >
        {{ $t('settings.tarkov_dev_import.check_for_update') }}
      </UButton>
      <a
        v-if="profileUrl"
        :href="profileUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="text-surface-400 hover:text-surface-200 block text-center text-xs underline-offset-4 hover:underline"
      >
        {{ $t('settings.tarkov_dev_import.open_again') }}
      </a>
    </div>
    <div v-else-if="viewState === 'error'">
      <UButton
        size="xs"
        color="neutral"
        variant="soft"
        icon="i-mdi-refresh"
        class="w-full justify-center whitespace-nowrap"
        :loading="refreshing"
        :disabled="refreshDisabled"
        @click="emit('refetch')"
      >
        {{ $t('settings.tarkov_dev_import.recheck_mode') }}
      </UButton>
    </div>
  </div>
</template>
<script setup lang="ts">
  type ViewState =
    | 'cooldown'
    | 'stale-initial'
    | 'stale-awaiting'
    | 'stale-fallback'
    | 'not-found-initial'
    | 'not-found-awaiting'
    | 'error';
  const props = defineProps<{
    status: 'stale' | 'not_found' | 'cooldown' | 'fetchable' | 'error';
    message: string;
    profileUrl?: string;
    refreshing: boolean;
    refreshDisabled: boolean;
  }>();
  const emit = defineEmits<{ refetch: []; allowStale: [] }>();
  const { t } = useI18n({ useScope: 'global' });
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
    () => props.refreshing,
    (next, prev) => {
      if (prev && !next && props.status === 'stale') {
        recheckStillStale.value = true;
        fallbackVisible.value = true;
      }
    }
  );
  const viewState = computed<ViewState>(() => {
    if (props.status === 'cooldown') return 'cooldown';
    if (props.status === 'stale') {
      if (fallbackVisible.value || !props.profileUrl) return 'stale-fallback';
      return opened.value ? 'stale-awaiting' : 'stale-initial';
    }
    if (props.status === 'not_found') {
      return !opened.value && props.profileUrl ? 'not-found-initial' : 'not-found-awaiting';
    }
    return 'error';
  });
  const displayMessage = computed(() => {
    if (props.status === 'stale' && recheckStillStale.value) {
      return t('settings.tarkov_dev_import.multi_mode_still_stale');
    }
    if (viewState.value === 'stale-awaiting' || viewState.value === 'not-found-awaiting') {
      return t('settings.tarkov_dev_import.multi_mode_awaiting');
    }
    return props.message;
  });
  const statusIcon = computed(() => {
    if (props.status === 'stale') return 'i-mdi-clock-alert-outline';
    if (props.status === 'error') return 'i-mdi-alert-circle-outline';
    if (props.status === 'cooldown') return 'i-mdi-timer-sand';
    return 'i-mdi-cloud-off-outline';
  });
  const iconToneClass = computed(() => {
    if (props.status === 'stale') return 'text-warning-400';
    if (props.status === 'error') return 'text-error-300';
    return 'text-surface-400';
  });
  const messageToneClass = computed(() => {
    if (props.status === 'error') return 'text-error-300';
    if (props.status === 'stale') return 'text-surface-200';
    return 'text-surface-400';
  });
</script>
