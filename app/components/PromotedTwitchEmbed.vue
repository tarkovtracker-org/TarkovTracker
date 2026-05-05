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
          :icon="isMuted ? 'i-mdi-volume-off' : 'i-mdi-volume-high'"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="toggleMute"
        />
        <UButton
          :icon="isExpanded ? 'i-mdi-arrow-collapse' : 'i-mdi-arrow-expand'"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="isExpanded = !isExpanded"
        />
        <UButton
          icon="i-mdi-open-in-new"
          color="neutral"
          variant="ghost"
          size="xs"
          :to="`https://www.twitch.tv/${channel}`"
          target="_blank"
          rel="noopener noreferrer"
        />
        <UButton
          icon="i-mdi-close"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="isVisible = false"
        />
      </div>
      <div class="bg-black">
        <iframe
          v-if="playerUrl"
          :src="playerUrl"
          :title="t('promoted_stream.player_title', { streamer: displayName })"
          class="h-[360px] w-full min-w-[400px]"
          allow="autoplay; encrypted-media; fullscreen"
          allowfullscreen
          frameborder="0"
          height="360"
          scrolling="no"
          width="640"
        ></iframe>
      </div>
    </aside>
  </ClientOnly>
</template>
<script setup lang="ts">
  const { t } = useI18n({ useScope: 'global' });
  const runtimeConfig = useRuntimeConfig();
  const config = runtimeConfig.public.promotedTwitch as {
    channel?: string;
    displayName?: string;
  };
  const channel = config.channel?.trim().toLowerCase() || 'glorious_e';
  const displayName = config.displayName?.trim() || channel;
  const isVisible = ref(true);
  const isExpanded = ref(true);
  const isMuted = ref(true);
  const playerUrl = ref('');
  const buildPlayerUrl = (): string => {
    const url = new URL('https://player.twitch.tv/');
    url.searchParams.set('autoplay', 'true');
    url.searchParams.set('channel', channel);
    url.searchParams.set('muted', String(isMuted.value));
    url.searchParams.set('parent', window.location.hostname);
    return url.toString();
  };
  const toggleMute = (): void => {
    isMuted.value = !isMuted.value;
    playerUrl.value = buildPlayerUrl();
  };
  onMounted(() => {
    playerUrl.value = buildPlayerUrl();
  });
</script>
