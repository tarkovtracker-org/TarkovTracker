<template>
  <div
    class="bg-surface-850 mx-auto flex max-w-3xl flex-col items-start gap-3 rounded-lg p-4 sm:p-5"
  >
    <p class="text-surface-200 text-sm">
      {{ $t(stream ? 'stash_import.window_position' : 'stash_import.window_hint') }}
    </p>
    <UAlert v-if="error" role="alert" color="error" variant="subtle" :description="$t(error)" />
    <UButton v-if="!stream" :loading="requesting" @click="$emit('share')">
      {{ $t('stash_import.window_share') }}
    </UButton>
    <template v-else>
      <UButton :disabled="!frameReady" :loading="scanning" @click="scan">
        {{ $t('stash_import.window_scan') }}
      </UButton>
      <video
        ref="video"
        :src-object.camel.prop="stream"
        autoplay
        muted
        playsinline
        class="max-h-dvh w-full rounded-md bg-black object-contain sm:max-h-120"
        :aria-label="$t('stash_import.window_preview')"
        @loadeddata="frameReady = true"
        @emptied="frameReady = false"
      />
    </template>
  </div>
</template>
<script setup lang="ts">
  defineProps<{
    stream?: MediaStream;
    error: string;
    requesting: boolean;
    scanning: boolean;
  }>();
  const emit = defineEmits<{ share: []; scan: [video: HTMLVideoElement] }>();
  const video = ref<HTMLVideoElement>();
  const frameReady = ref(false);
  watch(video, () => {
    frameReady.value = false;
  });
  function scan() {
    if (video.value) emit('scan', video.value);
  }
</script>
