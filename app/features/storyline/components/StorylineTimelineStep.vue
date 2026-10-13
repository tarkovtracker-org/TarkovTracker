<template>
  <!-- The connector starts where the objective text ends so each step visibly owns its optional. -->
  <div class="flex items-start">
    <StorylineRouteChoiceGroup
      v-if="entry.routeChoice"
      class="min-w-0 flex-1"
      :route-choice="entry.routeChoice"
      :chapter-id="chapterId"
      :index="entry.routeIndex ?? entry.step ?? 0"
      :read-only="readOnly"
      hide-unlocks
      @toggle-objective="(objectiveId) => emit('toggleObjective', objectiveId)"
    />
    <StorylineObjectiveRow
      v-else-if="entry.objective"
      class="min-w-0"
      plain
      hide-unlocks
      :objective="entry.objective"
      :input-id="storylineObjectiveInputId(chapterId, entry.objective.id)"
      :read-only="readOnly"
      @toggle="emit('toggleObjective', entry.objective.id)"
    />
    <span
      v-if="entry.optionalObjectives.length"
      class="border-warning-700/50 mt-4 hidden border-t border-dashed @3xl/objectives:block"
      :class="entry.routeChoice ? 'w-2 shrink-0' : 'min-w-2 flex-1'"
      aria-hidden="true"
    ></span>
  </div>
</template>
<script setup lang="ts">
  /** The main-lane content of a numbered timeline step: one objective or a route decision. */
  import StorylineObjectiveRow from '@/features/storyline/components/StorylineObjectiveRow.vue';
  import StorylineRouteChoiceGroup from '@/features/storyline/components/StorylineRouteChoiceGroup.vue';
  import { storylineObjectiveInputId } from '@/features/storyline/objectiveInputId';
  import type { StorylineTimelineEntry } from '@/features/storyline/storylineTimeline';
  defineProps<{ entry: StorylineTimelineEntry; chapterId: string; readOnly?: boolean }>();
  const emit = defineEmits<{ toggleObjective: [objectiveId: string] }>();
</script>
