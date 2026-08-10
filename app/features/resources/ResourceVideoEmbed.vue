<template>
  <div
    class="overflow-hidden rounded-xl border border-white/10 bg-black shadow-[0_10px_40px_rgba(0,0,0,0.35)]"
  >
    <div v-if="!isLoaded" class="relative aspect-video w-full">
      <NuxtImg
        :src="`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`"
        :alt="title"
        class="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
      />
      <button
        type="button"
        class="group focus-visible:ring-primary-400/40 absolute inset-0 flex h-full w-full cursor-pointer items-center justify-center bg-black/30 transition-colors hover:bg-black/40 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
        :aria-label="t('page.resources.video.play', { title }, `Play video: ${title}`)"
        @click="isLoaded = true"
      >
        <span
          class="bg-primary-500/90 group-hover:bg-primary-400 flex h-16 w-16 items-center justify-center rounded-full shadow-lg transition-transform group-hover:scale-105"
        >
          <UIcon name="i-mdi-play" class="h-8 w-8 text-white" />
        </span>
      </button>
    </div>
    <iframe
      v-else
      :src="`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`"
      :title="title"
      class="aspect-video w-full"
      allow="
        accelerometer;
        autoplay;
        clipboard-write;
        encrypted-media;
        gyroscope;
        picture-in-picture;
      "
      allowfullscreen
    />
  </div>
</template>
<script setup lang="ts">
  defineProps<{
    videoId: string;
    title: string;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const isLoaded = ref(false);
</script>
