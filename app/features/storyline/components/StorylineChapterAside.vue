<template>
  <aside class="min-w-0 shrink-0 space-y-3 @5xl/card:w-80 @7xl/card:w-96">
    <section v-if="chapter.requirements.length" :class="STORYLINE_PANEL_CLASS">
      <h3 :class="STORYLINE_LABEL_CLASS">{{ t('common.requires', 'Requires') }}</h3>
      <ul class="mt-1.5 space-y-1">
        <li
          v-for="requirement in chapter.requirements"
          :key="requirement.id"
          class="text-surface-200 text-sm"
        >
          {{ requirement.label }}
        </li>
      </ul>
    </section>
    <StorylineChapterEndings v-if="chapter.endings.length" :endings="chapter.endings" />
    <StorylineQuestRoutes
      v-if="chapter.questRouteChoices.length"
      :quest-routes="chapter.questRouteChoices"
    />
    <section v-if="chapter.chapterUnlocks.length" :class="STORYLINE_PANEL_CLASS">
      <h3 :class="STORYLINE_LABEL_CLASS">{{ t('page.storyline.route_unlocks_chapter') }}</h3>
      <StorylineUnlockBadges class="mt-2" :unlocks="chapter.chapterUnlocks" />
    </section>
  </aside>
</template>
<script setup lang="ts">
  import StorylineChapterEndings from '@/features/storyline/components/StorylineChapterEndings.vue';
  import StorylineQuestRoutes from '@/features/storyline/components/StorylineQuestRoutes.vue';
  import StorylineUnlockBadges from '@/features/storyline/components/StorylineUnlockBadges.vue';
  import {
    STORYLINE_LABEL_CLASS,
    STORYLINE_PANEL_CLASS,
  } from '@/features/storyline/storylineClasses';
  import type { StorylineNormalizedChapterView } from '@/composables/useStorylineChapters';
  defineProps<{ chapter: StorylineNormalizedChapterView }>();
  const { t } = useI18n({ useScope: 'global' });
</script>
