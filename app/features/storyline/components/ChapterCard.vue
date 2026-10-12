<template>
  <article
    :id="`storyline-chapter-${chapter.id}`"
    class="bg-surface-900 @container/card scroll-mt-16 rounded-lg border p-3 transition-colors sm:p-5"
    :class="chapter.complete ? 'border-success-700/30' : 'border-white/10'"
  >
    <StorylineChapterHeader
      :chapter="chapter"
      :can-toggle="canToggleChapter"
      :complete-button-label="completeButtonLabel"
      @toggle="emit('toggleChapter', chapter.id)"
    />
    <div class="mt-4 flex flex-col gap-4 @5xl/card:flex-row-reverse @5xl/card:items-start">
      <StorylineChapterAside v-if="hasAside" :chapter="chapter" />
      <div class="@container/objectives min-w-0 flex-1 space-y-3">
        <p
          v-if="!props.readOnly && chapter.staleObjectiveIds.length"
          class="text-warning-300 text-xs leading-snug"
        >
          {{ staleProgressLabel }}
        </p>
        <StorylineChapterObjectives
          v-if="chapter.mainObjectives.length || chapter.optionalObjectives.length"
          :chapter="chapter"
          :read-only="props.readOnly"
          @toggle-objective="(objectiveId) => emit('toggleObjective', chapter.id, objectiveId)"
        />
      </div>
    </div>
    <footer
      v-if="canToggleChapter"
      class="mt-3 flex items-center justify-end border-t border-white/5 pt-2 @3xl/card:hidden"
    >
      <UButton
        size="md"
        :variant="chapter.complete ? 'soft' : 'ghost'"
        :color="chapter.complete ? 'success' : 'neutral'"
        @click="emit('toggleChapter', chapter.id)"
      >
        {{ completeButtonLabel }}
      </UButton>
    </footer>
  </article>
</template>
<script setup lang="ts">
  import StorylineChapterAside from '@/features/storyline/components/StorylineChapterAside.vue';
  import StorylineChapterHeader from '@/features/storyline/components/StorylineChapterHeader.vue';
  import StorylineChapterObjectives from '@/features/storyline/components/StorylineChapterObjectives.vue';
  import type { StorylineNormalizedChapterView } from '@/composables/useStorylineChapters';
  interface Props {
    chapter: StorylineNormalizedChapterView;
    readOnly?: boolean;
    showChapterActions?: boolean;
  }
  const props = withDefaults(defineProps<Props>(), {
    showChapterActions: true,
  });
  const { chapter } = toRefs(props);
  const emit = defineEmits<{
    toggleChapter: [chapterId: string];
    toggleObjective: [chapterId: string, objectiveId: string];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const canToggleChapter = computed(() => props.showChapterActions !== false && !props.readOnly);
  const completeButtonLabel = computed(() =>
    chapter.value.complete
      ? t('common.completed', 'Completed')
      : t('common.mark_complete', 'Mark complete')
  );
  const hasAside = computed(
    () =>
      chapter.value.requirements.length > 0 ||
      chapter.value.endings.length > 0 ||
      chapter.value.questRouteChoices.length > 0 ||
      chapter.value.chapterUnlocks.length > 0
  );
  const staleProgressLabel = computed(() => {
    const count = chapter.value.staleObjectiveIds.length;
    return t(
      count === 1 ? 'page.storyline.stale_progress_one' : 'page.storyline.stale_progress_other',
      { count }
    );
  });
</script>
