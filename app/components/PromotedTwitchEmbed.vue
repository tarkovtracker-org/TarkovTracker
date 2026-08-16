<template>
  <ClientOnly>
    <aside
      v-if="isVisible"
      class="border-surface-700 fixed right-3 bottom-3 z-50 overflow-hidden rounded-lg border bg-black sm:right-5 sm:bottom-5"
      :class="
        isExpanded ? 'w-[min(calc(100vw-1.5rem),40rem)]' : 'w-[min(calc(100vw-1.5rem),25rem)]'
      "
      :aria-label="t('promoted_stream.region_label', { streamer: displayName })"
    >
      <div class="border-surface-700 flex h-9 items-center gap-2 border-b px-2">
        <UIcon name="i-mdi-twitch" class="text-primary-400 size-4 shrink-0" />
        <span class="text-surface-100 min-w-0 flex-1 truncate text-xs font-semibold">
          {{ t('promoted_stream.title', { streamer: displayName }) }}
        </span>
        <UButton
          :icon="isExpanded ? 'i-mdi-arrow-collapse' : 'i-mdi-arrow-expand'"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="
            isExpanded
              ? t('promoted_stream.shrink', 'Shrink player')
              : t('promoted_stream.expand', 'Expand player')
          "
          @click="toggleExpanded"
        />
        <UButton
          icon="i-mdi-open-in-new"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="t('promoted_stream.open_channel', 'Open channel')"
          :to="`https://www.twitch.tv/${channel}`"
          target="_blank"
          rel="noopener noreferrer"
        />
        <UButton
          icon="i-mdi-close"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="t('promoted_stream.close', 'Close player')"
          @click="dismiss"
        />
      </div>
      <div class="bg-black">
        <iframe
          v-if="playerUrl"
          :src="playerUrl"
          :title="t('promoted_stream.player_title', { streamer: displayName })"
          class="h-[360px] w-full min-w-[400px] border-0"
          allow="autoplay; encrypted-media; fullscreen"
          height="360"
          width="640"
        ></iframe>
      </div>
    </aside>
    <UButton
      v-else-if="isLive && dismissed"
      icon="i-mdi-twitch"
      color="primary"
      variant="solid"
      size="sm"
      class="fixed right-3 bottom-3 z-50 shadow-lg sm:right-5 sm:bottom-5"
      :aria-label="t('promoted_stream.reopen', 'Reopen stream')"
      @click="undismiss"
    />
  </ClientOnly>
</template>
<script setup lang="ts">
  import { usePromotedTwitch, type PromotedTwitchConfig } from '@/composables/usePromotedTwitch';
  import { logger } from '@/utils/logger';
  const DISMISS_KEY = 'tt-twitch-dismissed';
  const CONFIG_REFRESH_INTERVAL_MS = 300_000;
  const POLL_INTERVAL_MS = 60_000;
  const { t } = useI18n({ useScope: 'global' });
  const runtimeConfig = useRuntimeConfig();
  const fallback = runtimeConfig.public.promotedTwitch as {
    channel?: string;
    displayName?: string;
    enabled?: boolean;
  };
  type TwitchConfigResponse = PromotedTwitchConfig;
  const normalizeChannel = (value: string | undefined): string => value?.trim().toLowerCase() || '';
  const channel = ref(normalizeChannel(fallback.channel) || 'honeyxxo');
  const displayName = ref(fallback.displayName?.trim() || channel.value);
  const enabled = ref(fallback.enabled === true);
  const isVisible = ref(false);
  const isLive = ref(false);
  const dismissed = ref(false);
  const isExpanded = ref(true);
  const playerUrl = ref('');
  let configTimer: ReturnType<typeof setInterval> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let liveInFlight: {
    channel: string;
    generation: number;
    promise: Promise<void>;
  } | null = null;
  let configInFlight: Promise<void> | null = null;
  let configVersion = 0;
  let hasResolvedConfig = false;
  let liveGeneration = 0;
  const { config: sharedConfig } = usePromotedTwitch();
  const buildPlayerUrl = (): string => {
    const params = new URLSearchParams({
      channel: channel.value,
      parent: window.location.hostname,
      autoplay: 'true',
      muted: 'true',
    });
    return `https://player.twitch.tv/?${params.toString()}`;
  };
  const toggleExpanded = (): void => {
    isExpanded.value = !isExpanded.value;
  };
  const hidePlayer = (): void => {
    isLive.value = false;
    isVisible.value = false;
    playerUrl.value = '';
  };
  const clearDismissal = (): void => {
    dismissed.value = false;
    try {
      sessionStorage.removeItem(DISMISS_KEY);
    } catch (error) {
      logger.warn('[PromotedTwitchEmbed] Failed to clear stored dismissal', error);
    }
  };
  const dismiss = (): void => {
    dismissed.value = true;
    isVisible.value = false;
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {}
  };
  const undismiss = (): void => {
    clearDismissal();
    if (isLive.value) {
      playerUrl.value = buildPlayerUrl();
      isVisible.value = true;
    }
  };
  const adoptChannel = (next: string): void => {
    liveGeneration += 1;
    hidePlayer();
    if (hasResolvedConfig) clearDismissal();
    channel.value = next;
  };
  const resolveDisplayName = (value: string | undefined): string => value?.trim() || channel.value;
  const applyConfigChannel = (value: string): boolean => {
    const nextChannel = normalizeChannel(value) || channel.value;
    if (nextChannel === channel.value) return false;
    adoptChannel(nextChannel);
    return true;
  };
  const shouldCheckChangedChannel = (
    channelChanged: boolean,
    nextEnabled: boolean,
    enabledChanged: boolean
  ): boolean => channelChanged && nextEnabled && !enabledChanged;
  const applyLocalConfig = (data: TwitchConfigResponse): void => {
    if (data.version < configVersion) return;
    configVersion = data.version;
    const enabledChanged = data.enabled !== enabled.value;
    const channelChanged = applyConfigChannel(data.channel);
    displayName.value = resolveDisplayName(data.displayName);
    enabled.value = data.enabled;
    hasResolvedConfig = true;
    if (shouldCheckChangedChannel(channelChanged, data.enabled, enabledChanged)) void checkLive();
  };
  const refreshConfig = (): Promise<void> => {
    configInFlight ??= (async () => {
      try {
        applyLocalConfig(await $fetch<TwitchConfigResponse>('/api/twitch/config'));
      } catch (error) {
        logger.warn('[PromotedTwitchEmbed] Failed to refresh promoted stream config', error);
      }
    })().finally(() => {
      configInFlight = null;
    });
    return configInFlight;
  };
  const updatePlayerVisibility = (live: boolean): void => {
    if (!live) {
      isVisible.value = false;
      return;
    }
    if (!isVisible.value) {
      playerUrl.value = buildPlayerUrl();
      isVisible.value = true;
    }
  };
  const isCurrentLiveRequest = (requestedChannel: string, requestedGeneration: number): boolean =>
    requestedChannel === channel.value && requestedGeneration === liveGeneration && enabled.value;
  const applyLiveResult = (
    requestedChannel: string,
    requestedGeneration: number,
    live: boolean
  ): void => {
    if (!isCurrentLiveRequest(requestedChannel, requestedGeneration)) return;
    isLive.value = live;
    if (dismissed.value) return;
    updatePlayerVisibility(live);
  };
  const discardLiveResult = (requestedChannel: string, requestedGeneration: number): void => {
    if (requestedChannel !== channel.value || requestedGeneration !== liveGeneration) return;
    isLive.value = false;
    isVisible.value = false;
  };
  const checkLive = (): Promise<void> => {
    const requestedChannel = channel.value;
    const requestedGeneration = liveGeneration;
    if (
      liveInFlight?.channel === requestedChannel &&
      liveInFlight.generation === requestedGeneration
    ) {
      return liveInFlight.promise;
    }
    const request = (async () => {
      try {
        const data = await $fetch<{ isLive: boolean }>('/api/twitch/live', {
          query: { channel: requestedChannel },
        });
        applyLiveResult(requestedChannel, requestedGeneration, data.isLive);
      } catch (error) {
        logger.warn('[PromotedTwitchEmbed] Failed to check promoted stream status', {
          action: 'check_promoted_twitch_live',
          channel: requestedChannel,
          error,
        });
        discardLiveResult(requestedChannel, requestedGeneration);
      }
    })();
    liveInFlight = {
      channel: requestedChannel,
      generation: requestedGeneration,
      promise: request,
    };
    void request.finally(() => {
      if (liveInFlight?.promise === request) liveInFlight = null;
    });
    return request;
  };
  watch(
    sharedConfig,
    (config) => {
      if (config) applyLocalConfig(config);
    },
    { immediate: true }
  );
  const stopConfigPolling = (): void => {
    if (configTimer) {
      clearInterval(configTimer);
      configTimer = null;
    }
  };
  const startConfigPolling = (): void => {
    stopConfigPolling();
    if (document.hidden) return;
    configTimer = setInterval(() => {
      void refreshConfig();
    }, CONFIG_REFRESH_INTERVAL_MS);
  };
  const stopPolling = (): void => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
  const startPolling = (): void => {
    stopPolling();
    if (!enabled.value || document.hidden) return;
    pollTimer = setInterval(() => {
      void checkLive();
    }, POLL_INTERVAL_MS);
  };
  watch(enabled, (next) => {
    liveGeneration += 1;
    if (next) {
      startPolling();
      void checkLive();
    } else {
      stopPolling();
      hidePlayer();
    }
  });
  const handleVisibility = (): void => {
    if (document.hidden) {
      stopConfigPolling();
      stopPolling();
      return;
    }
    void refreshConfig();
    startConfigPolling();
    if (enabled.value) {
      void checkLive();
      startPolling();
    }
  };
  onMounted(async () => {
    try {
      dismissed.value = sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {}
    document.addEventListener('visibilitychange', handleVisibility);
    await refreshConfig();
    startConfigPolling();
    if (enabled.value) {
      await checkLive();
      startPolling();
    }
  });
  onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleVisibility);
    stopConfigPolling();
    stopPolling();
  });
</script>
