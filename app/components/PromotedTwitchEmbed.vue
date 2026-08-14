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
  const DISMISS_KEY = 'tt-twitch-dismissed';
  const { t } = useI18n({ useScope: 'global' });
  const runtimeConfig = useRuntimeConfig();
  const fallback = runtimeConfig.public.promotedTwitch as {
    channel?: string;
    displayName?: string;
    enabled?: boolean;
  };
  const normalizeChannel = (value: string | undefined): string => value?.trim().toLowerCase() || '';
  const channel = ref(normalizeChannel(fallback.channel) || 'honeyxxo');
  const displayName = ref(fallback.displayName?.trim() || channel.value);
  const enabled = ref(fallback.enabled !== false);
  const isVisible = ref(false);
  const isLive = ref(false);
  const dismissed = ref(false);
  const isExpanded = ref(true);
  const playerUrl = ref('');
  let pollTimer: ReturnType<typeof setInterval> | null = null;
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
  const dismiss = (): void => {
    dismissed.value = true;
    isVisible.value = false;
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {}
  };
  const undismiss = (): void => {
    dismissed.value = false;
    try {
      sessionStorage.removeItem(DISMISS_KEY);
    } catch {}
    if (isLive.value) {
      playerUrl.value = buildPlayerUrl();
      isVisible.value = true;
    }
  };
  const loadConfig = async (): Promise<void> => {
    try {
      const data = await $fetch<{ channel: string; displayName: string; enabled: boolean }>(
        '/api/twitch/config'
      );
      const nextChannel = normalizeChannel(data.channel) || channel.value;
      if (nextChannel !== channel.value) {
        isLive.value = false;
        isVisible.value = false;
        playerUrl.value = '';
      }
      channel.value = nextChannel;
      displayName.value = data.displayName?.trim() || channel.value;
      enabled.value = data.enabled;
    } catch {}
  };
  const checkLive = async (): Promise<void> => {
    try {
      const data = await $fetch<{ isLive: boolean }>('/api/twitch/live', {
        query: { channel: channel.value },
      });
      isLive.value = data.isLive;
      if (dismissed.value) return;
      if (data.isLive && !isVisible.value) {
        playerUrl.value = buildPlayerUrl();
        isVisible.value = true;
      } else if (!data.isLive) {
        isVisible.value = false;
      }
    } catch {
      isLive.value = false;
      isVisible.value = false;
    }
  };
  const refresh = async (): Promise<void> => {
    await loadConfig();
    if (!enabled.value) {
      isLive.value = false;
      isVisible.value = false;
      playerUrl.value = '';
      return;
    }
    await checkLive();
  };
  onMounted(async () => {
    try {
      dismissed.value = sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {}
    await refresh();
    pollTimer = setInterval(refresh, 60_000);
  });
  onUnmounted(() => {
    if (pollTimer) clearInterval(pollTimer);
  });
</script>
