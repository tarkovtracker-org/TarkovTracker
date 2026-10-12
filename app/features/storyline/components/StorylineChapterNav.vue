<template>
  <nav :aria-label="t('page.storyline.chapter_nav_label')">
    <ul
      class="-mx-3 flex snap-x gap-2 overflow-x-auto px-3 py-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-1"
    >
      <li v-for="chapter in chapters" :key="chapter.id" class="shrink-0 snap-start">
        <UTooltip :text="tileLabel(chapter)" :content="{ side: 'right' }">
          <button
            type="button"
            class="relative flex size-16 cursor-pointer items-center justify-center overflow-hidden rounded-md border transition-colors lg:size-18"
            :class="
              chapter.id === selectedId
                ? 'border-primary-400/80 bg-primary-500/25'
                : 'bg-surface-900 border-white/10 hover:border-white/25 hover:bg-white/5'
            "
            :aria-label="tileLabel(chapter)"
            :aria-current="chapter.id === selectedId ? 'true' : undefined"
            @click="emit('select', chapter.id)"
          >
            <img
              :src="`/img/storyline/${chapter.normalizedName}.webp`"
              alt=""
              class="size-3/5 object-contain"
              :class="chapter.id === selectedId || chapter.complete ? '' : 'opacity-60'"
            />
            <UIcon
              v-if="chapter.complete"
              name="i-mdi-check-bold"
              class="bg-success-600/90 absolute top-0 right-0 size-4 rounded-bl p-0.5 text-white"
            />
            <span class="absolute inset-x-0 bottom-0 h-1 bg-black/40">
              <span
                class="block h-full"
                :class="chapter.complete ? 'bg-success-500/80' : 'bg-primary-400/80'"
                :style="{ width: `${progressPercent(chapter)}%` }"
              ></span>
            </span>
          </button>
        </UTooltip>
      </li>
    </ul>
  </nav>
</template>
<script setup lang="ts">
  import type { StorylineNormalizedChapterView } from '@/composables/useStorylineChapters';
  defineProps<{
    chapters: StorylineNormalizedChapterView[];
    selectedId: string | null;
  }>();
  const emit = defineEmits<{ select: [chapterId: string] }>();
  const { t } = useI18n({ useScope: 'global' });
  const progressPercent = (chapter: StorylineNormalizedChapterView) => {
    if (chapter.complete) return 100;
    if (!chapter.mainObjectiveTotal) return 0;
    return (chapter.mainObjectiveCompleted / chapter.mainObjectiveTotal) * 100;
  };
  const tileLabel = (chapter: StorylineNormalizedChapterView) =>
    chapter.mainObjectiveTotal
      ? `${chapter.name} (${chapter.mainObjectiveCompleted}/${chapter.mainObjectiveTotal})`
      : chapter.name;
</script>
