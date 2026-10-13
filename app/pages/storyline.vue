<template>
  <div class="min-h-[calc(100vh-250px)] px-3 py-6 sm:px-6">
    <div class="mx-auto max-w-480 space-y-4">
      <slot name="header" />
      <div v-if="totalChapters > 0" class="flex items-center gap-3">
        <div class="bg-surface-800/60 h-2 flex-1 overflow-hidden rounded-full">
          <div
            class="h-full rounded-full transition-[width] duration-300"
            :class="completedChapters >= totalChapters ? 'bg-success-500/70' : 'bg-primary-500/70'"
            :style="{ width: `${(completedChapters / totalChapters) * 100}%` }"
          ></div>
        </div>
        <span class="text-surface-400 shrink-0 text-sm tabular-nums">
          <span class="text-surface-100 font-semibold">
            {{ completedChapters }}/{{ totalChapters }}
          </span>
          {{ t('page.storyline.chapters_complete') }}
        </span>
      </div>
      <UAlert
        icon="i-mdi-hammer-wrench"
        color="warning"
        variant="soft"
        :title="t('page.storyline.wip_title')"
        :description="t('page.storyline.wip_description')"
      />
      <UAlert
        v-if="!storylineChapters.length"
        icon="i-mdi-book-off-outline"
        color="neutral"
        variant="soft"
        :title="t('page.storyline.no_data')"
      />
      <div v-else class="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <StorylineChapterNav
          class="min-w-0 shrink-0 lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto"
          :chapters="storylineChapters"
          :selected-id="selectedChapter?.id ?? null"
          @select="selectChapter"
        />
        <div ref="detailRef" class="min-w-0 flex-1 scroll-mt-16">
          <ChapterCard
            v-if="selectedChapter"
            :key="selectedChapter.id"
            :chapter="selectedChapter"
            @toggle-chapter="toggleChapter"
            @toggle-objective="toggleObjective"
          />
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useStorylineChapters } from '@/composables/useStorylineChapters';
  import ChapterCard from '@/features/storyline/components/ChapterCard.vue';
  import StorylineChapterNav from '@/features/storyline/components/StorylineChapterNav.vue';
  import { useStorylineRouteFocus } from '@/features/storyline/useStorylineRouteFocus';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { getQueryString } from '@/utils/routeHelpers';
  import { isAutomaticStoryObjective } from '@/utils/storylineCompletion';
  import { toggleStoryChapterWithLinearObjectives } from '@/utils/storylineObjectives';
  const { t } = useI18n({ useScope: 'global' });
  const tarkovStore = useTarkovStore();
  const route = useRoute();
  const { chapters, normalizedChapters: storylineChapters } = useStorylineChapters({
    completedObjectiveIds: (chapterId) =>
      Object.entries(
        tarkovStore.getCurrentProgressData()?.storyChapters?.[chapterId]?.objectives ?? {}
      )
        .filter(([, objective]) => objective?.complete === true)
        .map(([objectiveId]) => objectiveId),
  });
  const totalChapters = computed(() => storylineChapters.value.length);
  const selectedChapterId = ref<string | null>(null);
  const selectedChapter = computed(() =>
    storylineChapters.value.find((chapter) => chapter.id === selectedChapterId.value)
  );
  // Default once to the first chapter still in progress so returning players land on their next
  // step; after that the selection only moves when the player picks a chapter, so completing the
  // shown chapter keeps it on screen.
  watchEffect(() => {
    if (selectedChapter.value || !storylineChapters.value.length) return;
    const fallback =
      storylineChapters.value.find((chapter) => !chapter.complete) ?? storylineChapters.value[0];
    selectedChapterId.value = fallback?.id ?? null;
  });
  const detailRef = ref<HTMLElement | null>(null);
  const selectChapter = (chapterId: string) => {
    selectedChapterId.value = chapterId;
    const top = detailRef.value?.getBoundingClientRect().top ?? 0;
    if (top < 0) detailRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  // Registered before the focus watcher so a deep-linked chapter renders before it is focused.
  watch(
    () => getQueryString(route.query.chapter),
    (chapterId) => {
      if (chapterId) selectedChapterId.value = chapterId;
    },
    { immediate: true }
  );
  useStorylineRouteFocus(totalChapters);
  const completedChapters = computed(() => {
    return storylineChapters.value.filter((chapter) => chapter.complete).length;
  });
  const toggleChapter = (chapterId: string) => {
    const chapter = chapters.value.find((entry) => entry.id === chapterId);
    toggleStoryChapterWithLinearObjectives({
      chapterId,
      isChapterComplete: tarkovStore.isStoryChapterComplete(chapterId),
      objectives: chapter?.objectives,
      mutuallyExclusiveQuestPairs: chapter?.mutuallyExclusiveQuestPairs,
      isObjectiveComplete: (objectiveId) =>
        tarkovStore.isStoryObjectiveComplete(chapterId, objectiveId),
      setChapterComplete: (id) => tarkovStore.setStoryChapterComplete(id),
      setChapterUncomplete: (id) => tarkovStore.setStoryChapterUncomplete(id),
      setObjectiveComplete: (id, objectiveId) =>
        tarkovStore.setStoryObjectiveComplete(id, objectiveId),
      setObjectiveUncomplete: (id, objectiveId) =>
        tarkovStore.setStoryObjectiveUncomplete(id, objectiveId),
    });
  };
  const toggleObjective = (chapterId: string, objectiveId: string) => {
    const chapter = chapters.value.find((entry) => entry.id === chapterId);
    if (isAutomaticStoryObjective(chapter?.objectiveMap[objectiveId])) return;
    if (tarkovStore.isStoryObjectiveComplete(chapterId, objectiveId)) {
      tarkovStore.setStoryObjectiveUncomplete(chapterId, objectiveId);
      return;
    }
    const linkedIds = chapter?.objectiveMap[objectiveId]?.mutuallyExclusiveWith ?? [];
    if (linkedIds.some((linkedId) => tarkovStore.isStoryObjectiveComplete(chapterId, linkedId))) {
      return;
    }
    tarkovStore.setStoryObjectiveComplete(chapterId, objectiveId);
  };
</script>
