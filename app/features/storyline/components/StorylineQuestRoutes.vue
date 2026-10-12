<template>
  <section :class="STORYLINE_PANEL_CLASS">
    <h3 :class="STORYLINE_LABEL_CLASS">{{ t('page.storyline.route_choice') }}</h3>
    <div v-for="questRoute in questRoutes" :key="questRoute.id" class="mt-2 space-y-1.5">
      <div
        v-for="(branch, branchIndex) in questRoute.branches"
        :key="branch.id"
        class="flex flex-wrap items-center gap-1.5 rounded border p-2"
        :class="getQuestBranchClass(branch, questRoute)"
      >
        <span class="text-surface-100 min-w-0 flex-1 text-sm">
          {{ branchLabel(branch, branchIndex) }}
        </span>
        <UBadge variant="subtle" color="neutral" size="md">
          {{ branchProgressLabel(branch) }}
        </UBadge>
        <UBadge
          v-if="questRoute.chosenBranchId === branch.id"
          variant="subtle"
          color="success"
          size="md"
        >
          {{ t('page.storyline.route_chosen') }}
        </UBadge>
        <UBadge v-else-if="branch.knownStepsComplete" variant="subtle" color="warning" size="md">
          {{ t('page.storyline.quest_route_known_steps_done') }}
        </UBadge>
      </div>
      <p class="text-surface-400 text-xs leading-snug">
        {{ t('page.storyline.quest_route_exclusive') }}
      </p>
      <p v-if="questRoute.conflicting" class="text-warning-300 text-xs leading-snug">
        {{ t('page.storyline.quest_route_conflict') }}
      </p>
    </div>
  </section>
</template>
<script setup lang="ts">
  import {
    STORYLINE_LABEL_CLASS,
    STORYLINE_PANEL_CLASS,
  } from '@/features/storyline/storylineClasses';
  import type {
    StorylineQuestRouteBranchView,
    StorylineQuestRouteChoiceView,
  } from '@/composables/useStorylineChapters';
  defineProps<{ questRoutes: StorylineQuestRouteChoiceView[] }>();
  const { t } = useI18n({ useScope: 'global' });
  const branchProgressLabel = (branch: StorylineQuestRouteBranchView) =>
    branch.evidencePending
      ? t('page.storyline.quest_route_evidence_pending')
      : t('page.storyline.quest_route_progress', {
          completed: branch.completedCount,
          total: branch.totalCount,
        });
  // A route the chapter publishes no objective for has only its quest ID to go on, so it gets a
  // positional name instead of exposing the ID.
  const branchLabel = (branch: StorylineQuestRouteBranchView, index: number) =>
    branch.evidencePending
      ? t('page.storyline.quest_route_unnamed', { index: index + 1 })
      : branch.label;
  // A branch is highlighted from the player's own marks only. The sibling is not styled as blocked:
  // the objective list can be a projection of the overlay's capture, so a finished known set is not
  // proof the route is finished, and the overlay only rules out completing both.
  const getQuestBranchClass = (
    branch: StorylineQuestRouteBranchView,
    questRoute: StorylineQuestRouteChoiceView
  ) => {
    if (questRoute.chosenBranchId === branch.id) return 'border-success-700/40 bg-success-950/20';
    if (branch.knownStepsComplete) return 'border-warning-700/30 bg-warning-950/10';
    return 'border-white/10 bg-surface-900/40';
  };
</script>
