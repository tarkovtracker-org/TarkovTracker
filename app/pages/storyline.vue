<template>
  <div class="min-h-[calc(100vh-250px)] px-3 py-6 sm:px-6">
    <div class="mx-auto max-w-[1400px] space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-white sm:text-2xl">
            {{ t('page.storyline.title') }}
          </h1>
          <p class="text-surface-400 mt-1 text-sm">
            {{ t('page.storyline.subtitle') }}
          </p>
        </div>
        <div v-if="totalChapters > 0" class="text-right">
          <div class="text-surface-100 text-lg font-bold">
            {{ completedChapters }}/{{ totalChapters }}
          </div>
          <div class="text-surface-400 text-xs">
            {{ t('page.storyline.chapters_complete') }}
          </div>
        </div>
      </div>
      <div v-if="totalChapters > 0" class="bg-surface-800/60 h-2 overflow-hidden rounded-full">
        <div
          class="h-full rounded-full transition-[width] duration-300"
          :class="completedChapters >= totalChapters ? 'bg-success-500/70' : 'bg-primary-500/70'"
          :style="{ width: `${(completedChapters / totalChapters) * 100}%` }"
        ></div>
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
      <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <ChapterCard
          v-for="chapter in storylineChapters"
          :key="chapter.id"
          :chapter="chapter"
          @toggle-chapter="toggleChapter"
          @toggle-objective="toggleObjective"
        />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useStorylineChapters } from '@/composables/useStorylineChapters';
  import ChapterCard from '@/features/storyline/components/ChapterCard.vue';
  import { useTarkovStore } from '@/stores/useTarkov';
  const { t } = useI18n({ useScope: 'global' });
  definePageMeta({
    layout: 'default',
  });
  useHead(() => ({
    title: t('page.storyline.title'),
    meta: [
      { name: 'description', content: t('page.storyline.subtitle') },
      { property: 'og:title', content: t('page.storyline.title') },
      { property: 'og:description', content: t('page.storyline.subtitle') },
    ],
  }));
  const tarkovStore = useTarkovStore();
  const { chapters, normalizedChapters: storylineChapters } = useStorylineChapters();
  const totalChapters = computed(() => storylineChapters.value.length);
  const completedChapters = computed(() => {
    return storylineChapters.value.filter((chapter) => chapter.complete).length;
  });
  const toggleChapter = (chapterId: string) => {
    tarkovStore.toggleStoryChapterComplete(chapterId);
  };
  const toggleObjective = (chapterId: string, objectiveId: string) => {
    if (tarkovStore.isStoryObjectiveComplete(chapterId, objectiveId)) {
      tarkovStore.setStoryObjectiveUncomplete(chapterId, objectiveId);
      return;
    }
    const chapter = chapters.value.find((entry) => entry.id === chapterId);
    const linkedIds = chapter?.objectiveMap[objectiveId]?.mutuallyExclusiveWith ?? [];
    for (const linkedId of linkedIds) {
      if (tarkovStore.isStoryObjectiveComplete(chapterId, linkedId)) {
        tarkovStore.setStoryObjectiveUncomplete(chapterId, linkedId);
      }
    }
    tarkovStore.setStoryObjectiveComplete(chapterId, objectiveId);
  };
</script>
