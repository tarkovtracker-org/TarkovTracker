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
          @click="isExpanded = !isExpanded"
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
  const config = runtimeConfig.public.promotedTwitch as {
    channel?: string;
    displayName?: string;
    enabled?: boolean;
    endsAt?: string;
  };
  const channel = config.channel?.trim().toLowerCase() || 'honeyxxo';
  const displayName = config.displayName?.trim() || channel;
  const isVisible = ref(false);
  const isLive = ref(false);
  const dismissed = ref(false);
  const isExpanded = ref(true);
  const playerUrl = ref('');
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const buildPlayerUrl = (): string => {
    const params = new URLSearchParams({
      channel,
      parent: window.location.hostname,
      autoplay: 'true',
      muted: 'true',
    });
    return `https://player.twitch.tv/?${params.toString()}`;
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
  const checkLive = async (): Promise<void> => {
    try {
      const data = await $fetch<{ isLive: boolean }>('/api/twitch/live', {
        query: { channel },
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
  onMounted(() => {
    if (config.enabled === false) return;
    if (config.endsAt && new Date(config.endsAt) < new Date()) return;
    try {
      dismissed.value = sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {}
    checkLive();
    pollTimer = setInterval(checkLive, 60_000);
  });
  onUnmounted(() => {
    if (pollTimer) clearInterval(pollTimer);
  });
</script>
