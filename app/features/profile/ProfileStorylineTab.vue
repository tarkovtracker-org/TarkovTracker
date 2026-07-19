<template>
  <div>
    <UAlert
      v-if="!chapterProgress.length"
      icon="i-mdi-book-off-outline"
      color="neutral"
      variant="soft"
      :title="t('page.profile.no_storyline')"
    />
    <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <div v-for="chapter in chapterProgress" :key="chapter.id" class="space-y-2">
        <ChapterCard
          :chapter="chapter"
          :read-only="props.readOnly"
          @toggle-chapter="handleChapterToggle"
          @toggle-objective="handleObjectiveToggle"
        />
        <div class="bg-surface-800/60 h-1.5 overflow-hidden rounded-full">
          <div
            class="h-full rounded-full transition-[width] duration-300"
            :class="
              chapter.complete
                ? 'bg-success-500/70'
                : chapter.mainProgress > 0
                  ? 'bg-primary-500/70'
                  : 'bg-surface-700'
            "
            :style="{
              width:
                chapter.mainTotal > 0
                  ? `${(chapter.mainProgress / chapter.mainTotal) * 100}%`
                  : chapter.complete
                    ? '100%'
                    : '0%',
            }"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import {
    useStorylineChapters,
    type StorylineNormalizedChapterView,
  } from '@/composables/useStorylineChapters';
  import ChapterCard from '@/features/storyline/components/ChapterCard.vue';
  interface Props {
    storyChapterCompletionState: Record<string, boolean>;
    storyObjectiveCompletionState: Record<string, Record<string, boolean>>;
    readOnly?: boolean;
  }
  const props = defineProps<Props>();
  const emit = defineEmits<{
    toggleChapter: [chapterId: string];
    toggleObjective: [chapterId: string, objectiveId: string];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const { normalizedChapters } = useStorylineChapters({
    isChapterComplete: (chapterId: string) => props.storyChapterCompletionState[chapterId] === true,
    isObjectiveComplete: (chapterId: string, objectiveId: string) =>
      props.storyObjectiveCompletionState[chapterId]?.[objectiveId] === true,
  });
  interface ChapterProgress extends StorylineNormalizedChapterView {
    mainProgress: number;
    mainTotal: number;
  }
  const chapterProgress = computed<ChapterProgress[]>(() => {
    return normalizedChapters.value.map((chapter) => {
      return {
        ...chapter,
        mainProgress: chapter.mainObjectiveCompleted,
        mainTotal: chapter.mainObjectiveTotal,
      };
    });
  });
  const handleObjectiveToggle = (chapterId: string, objectiveId: string) => {
    if (props.readOnly) {
      return;
    }
    emit('toggleObjective', chapterId, objectiveId);
  };
  const handleChapterToggle = (chapterId: string) => {
    if (props.readOnly) {
      return;
    }
    emit('toggleChapter', chapterId);
  };
</script>
