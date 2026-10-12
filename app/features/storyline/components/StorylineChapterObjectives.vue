<template>
  <section :class="STORYLINE_PANEL_CLASS">
    <div v-if="chapter.mainObjectives.length" class="space-y-3">
      <StorylineObjectiveProgressBar
        :label="t('page.profile.storyline_objectives_main')"
        :completed="chapter.mainObjectiveCompleted"
        :total="chapter.mainObjectiveTotal"
        :complete="chapter.complete"
      />
      <StorylineRouteChoiceGroup
        v-for="(routeChoice, routeIndex) in chapter.mainRouteChoices"
        :key="routeChoice.id"
        :route-choice="routeChoice"
        :chapter-id="chapter.id"
        :index="routeIndex + 1"
        :read-only="readOnly"
        @toggle-objective="(objectiveId) => emit('toggleObjective', objectiveId)"
      />
      <StorylineObjectiveList
        v-if="timelineObjectives.length"
        indent-optional
        :objectives="timelineObjectives"
        :chapter-id="chapter.id"
        :label="t('page.storyline.route_required_steps')"
        :read-only="readOnly"
        @toggle-objective="(objectiveId) => emit('toggleObjective', objectiveId)"
      />
    </div>
    <div
      v-if="showOptionalSection"
      class="space-y-3"
      :class="chapter.mainObjectives.length ? 'mt-3 border-t border-white/5 pt-3' : ''"
    >
      <h3 :class="STORYLINE_LABEL_CLASS">
        {{ t('page.profile.storyline_objectives_optional') }}
      </h3>
      <StorylineRouteChoiceGroup
        v-for="(routeChoice, routeIndex) in chapter.optionalRouteChoices"
        :key="routeChoice.id"
        tone-name="info"
        :route-choice="routeChoice"
        :chapter-id="chapter.id"
        :index="routeIndex + 1"
        :read-only="readOnly"
        @toggle-objective="(objectiveId) => emit('toggleObjective', objectiveId)"
      />
      <StorylineObjectiveList
        v-if="showStandaloneOptionalObjectives"
        :objectives="sortObjectivesByOrder(chapter.optionalLinearObjectives)"
        :chapter-id="chapter.id"
        :label="t('page.storyline.route_optional_steps')"
        :read-only="readOnly"
        @toggle-objective="(objectiveId) => emit('toggleObjective', objectiveId)"
      />
    </div>
  </section>
</template>
<script setup lang="ts">
  import StorylineObjectiveList from '@/features/storyline/components/StorylineObjectiveList.vue';
  import StorylineObjectiveProgressBar from '@/features/storyline/components/StorylineObjectiveProgressBar.vue';
  import StorylineRouteChoiceGroup from '@/features/storyline/components/StorylineRouteChoiceGroup.vue';
  import {
    STORYLINE_LABEL_CLASS,
    STORYLINE_PANEL_CLASS,
  } from '@/features/storyline/storylineClasses';
  import type {
    StorylineNormalizedChapterView,
    StorylineObjectiveProgress,
  } from '@/composables/useStorylineChapters';
  const props = defineProps<{ chapter: StorylineNormalizedChapterView; readOnly?: boolean }>();
  const emit = defineEmits<{ toggleObjective: [objectiveId: string] }>();
  const { t } = useI18n({ useScope: 'global' });
  const { chapter } = toRefs(props);
  const sortObjectivesByOrder = (objectives: StorylineObjectiveProgress[]) =>
    [...objectives].sort(
      (left, right) => left.order - right.order || left.id.localeCompare(right.id)
    );
  const timelineObjectives = computed(() =>
    chapter.value.mainObjectives.length
      ? sortObjectivesByOrder([
          ...chapter.value.mainLinearObjectives,
          ...chapter.value.optionalLinearObjectives,
        ])
      : []
  );
  const showStandaloneOptionalObjectives = computed(
    () =>
      chapter.value.mainObjectives.length === 0 && chapter.value.optionalLinearObjectives.length > 0
  );
  const showOptionalSection = computed(
    () => chapter.value.optionalRouteChoices.length > 0 || showStandaloneOptionalObjectives.value
  );
</script>
