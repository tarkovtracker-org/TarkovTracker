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
  import { usePromotedTwitch } from '@/composables/usePromotedTwitch';
  import { logger } from '@/utils/logger';
  const DISMISS_KEY = 'tt-twitch-dismissed';
  const POLL_INTERVAL_MS = 60_000;
  const { t } = useI18n({ useScope: 'global' });
  const runtimeConfig = useRuntimeConfig();
  const fallback = runtimeConfig.public.promotedTwitch as {
    channel?: string;
    displayName?: string;
    enabled?: boolean;
  };
  interface TwitchConfigResponse {
    channel: string;
    displayName: string;
    enabled: boolean;
  }
  const normalizeChannel = (value: string | undefined): string => value?.trim().toLowerCase() || '';
  const channel = ref(normalizeChannel(fallback.channel) || 'honeyxxo');
  const displayName = ref(fallback.displayName?.trim() || channel.value);
  const enabled = ref(fallback.enabled === true);
  const isVisible = ref(false);
  const isLive = ref(false);
  const dismissed = ref(false);
  const isExpanded = ref(true);
  const playerUrl = ref('');
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let liveInFlight: Promise<void> | null = null;
  let configInFlight: Promise<void> | null = null;
  let hasResolvedConfig = false;
  const { config: sharedConfig, applyConfig: applySharedConfig } = usePromotedTwitch();
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
    hidePlayer();
    if (hasResolvedConfig) clearDismissal();
    channel.value = next;
  };
  const resolveDisplayName = (value: string | undefined): string => value?.trim() || channel.value;
  const applyLocalConfig = (data: TwitchConfigResponse): void => {
    const nextChannel = normalizeChannel(data.channel) || channel.value;
    if (nextChannel !== channel.value) {
      adoptChannel(nextChannel);
      if (enabled.value) void checkLive();
    }
    displayName.value = resolveDisplayName(data.displayName);
    enabled.value = data.enabled;
    hasResolvedConfig = true;
  };
  const applyConfig = (data: TwitchConfigResponse): void => {
    applyLocalConfig(data);
    applySharedConfig(data);
  };
  watch(sharedConfig, (config) => {
    if (config) applyLocalConfig(config);
  });
  const refreshConfig = (): Promise<void> => {
    configInFlight ??= (async () => {
      try {
        applyConfig(await $fetch<TwitchConfigResponse>('/api/twitch/config'));
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
  const applyLiveResult = (live: boolean): void => {
    isLive.value = live;
    if (dismissed.value || !enabled.value) return;
    updatePlayerVisibility(live);
  };
  const checkLive = (): Promise<void> => {
    liveInFlight ??= (async () => {
      try {
        const data = await $fetch<{ isLive: boolean }>('/api/twitch/live', {
          query: { channel: channel.value },
        });
        applyLiveResult(data.isLive);
      } catch {
        isLive.value = false;
        isVisible.value = false;
      }
    })().finally(() => {
      liveInFlight = null;
    });
    return liveInFlight;
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
      stopPolling();
      return;
    }
    void refreshConfig();
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
    if (enabled.value) {
      await checkLive();
      startPolling();
    }
  });
  onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleVisibility);
    stopPolling();
  });
</script>
