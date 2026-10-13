<template>
  <div class="relative">
    <div
      v-if="loading"
      role="status"
      :aria-label="title"
      aria-busy="true"
      class="absolute inset-0 flex items-center justify-center bg-black"
    >
      <span
        aria-hidden="true"
        class="size-8 animate-spin rounded-full border-2 border-white/20 border-t-white"
      />
    </div>
    <iframe
      v-if="failed"
      :src="fallbackUrl"
      :title="title"
      class="h-full w-full border-0"
      allow="autoplay; encrypted-media; fullscreen"
      height="360"
      width="640"
    />
    <div v-else ref="container" class="h-full w-full" />
  </div>
</template>
<script setup lang="ts">
  import { loadTwitchPlayer, type TwitchPlayerInstance } from '@/utils/twitchPlayer';
  const props = defineProps<{ channel: string; title: string }>();
  const emit = defineEmits<{ ready: []; offline: [] }>();
  const container = ref<HTMLElement | null>(null);
  const failed = ref(false);
  const loading = ref(true);
  const fallbackUrl = computed(() => {
    const params = new URLSearchParams({
      channel: props.channel,
      parent: window.location.hostname,
      autoplay: 'true',
      muted: 'true',
    });
    return `https://player.twitch.tv/?${params}`;
  });
  let disposed = false;
  let detach = (): void => {};
  const updateTitle = (): void => {
    const iframe = container.value?.querySelector('iframe');
    if (iframe) iframe.title = props.title;
  };
  watch(() => props.title, updateTitle);
  const attach = (player: TwitchPlayerInstance, ready: string, offline: string): void => {
    const onReady = (): void => {
      updateTitle();
      emit('ready');
    };
    const onOffline = (): void => {
      emit('offline');
    };
    player.addEventListener(ready, onReady);
    player.addEventListener(offline, onOffline);
    detach = () => {
      player.removeEventListener(ready, onReady);
      player.removeEventListener(offline, onOffline);
      player.destroy();
    };
  };
  onMounted(async () => {
    try {
      const Player = await loadTwitchPlayer();
      if (disposed || !container.value) return;
      const player = new Player(container.value, {
        channel: props.channel,
        parent: [window.location.hostname],
        width: '100%',
        height: 360,
        autoplay: true,
        muted: true,
      });
      attach(player, Player.READY, Player.OFFLINE);
    } catch {
      // Keep the plain iframe and bounded status polling if the SDK is blocked.
      if (!disposed) failed.value = true;
    } finally {
      loading.value = false;
    }
  });
  onBeforeUnmount(() => {
    disposed = true;
    detach();
  });
</script>
