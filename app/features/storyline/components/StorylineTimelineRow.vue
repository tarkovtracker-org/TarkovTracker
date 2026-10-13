<template>
  <li
    class="before:bg-surface-700 relative flex flex-col gap-x-4 pb-1.5 pl-9 before:absolute before:inset-y-0 before:left-3.25 before:w-0.5 first:before:top-3 last:pb-0 last:before:bottom-auto last:before:h-3 @3xl/objectives:flex-row"
  >
    <StorylineTimelineNode :step="entry.step" :complete="entry.complete" />
    <div v-if="optional" class="hidden @3xl/objectives:block" :class="lanes.main">
      <span class="border-warning-700/50 mt-4 -ml-5.5 block border-t border-dashed"></span>
    </div>
    <div v-else :class="lanes.main">
      <StorylineRouteChoiceGroup
        v-if="entry.routeChoice"
        :route-choice="entry.routeChoice"
        :chapter-id="chapterId"
        :index="entry.routeIndex ?? entry.step ?? 0"
        :read-only="readOnly"
        hide-unlocks
        @toggle-objective="(objectiveId) => emit('toggleObjective', objectiveId)"
      />
      <StorylineObjectiveRow v-else-if="entry.objective" v-bind="rowProps(entry.objective)" />
    </div>
    <div v-if="hasOptionals" :class="[lanes.optional, optionalLaneClass]">
      <div
        v-for="objective in optionalObjectives"
        :key="objective.id"
        :data-parent-objective-id="objective.parentObjectiveId"
        class="mb-1 last:mb-0"
      >
        <span v-if="entry.routeChoice" class="text-surface-400 block px-2 text-xs leading-snug">
          {{ parentLabel(objective) }}
        </span>
        <StorylineObjectiveRow
          class="bg-warning-950/15 border-warning-700/30 border border-dashed"
          optional
          accent="warning"
          v-bind="rowProps(objective)"
        />
      </div>
    </div>
    <!-- One column on wide layouts so unlocks never add height to a step; below the step otherwise. -->
    <div
      v-if="hasUnlocks"
      class="pl-8.5 @3xl/objectives:pt-1.5 @3xl/objectives:pl-0"
      :class="lanes.unlocks"
    >
      <StorylineTimelineUnlocks :entry="entry" />
    </div>
  </li>
</template>
<script setup lang="ts">
  import StorylineObjectiveRow from '@/features/storyline/components/StorylineObjectiveRow.vue';
  import StorylineRouteChoiceGroup from '@/features/storyline/components/StorylineRouteChoiceGroup.vue';
  import StorylineTimelineNode from '@/features/storyline/components/StorylineTimelineNode.vue';
  import StorylineTimelineUnlocks from '@/features/storyline/components/StorylineTimelineUnlocks.vue';
  import { storylineObjectiveInputId } from '@/features/storyline/objectiveInputId';
  import type { StorylineObjectiveProgress } from '@/composables/useStorylineChapters';
  import type { StorylineTimelineEntry } from '@/features/storyline/storylineTimeline';
  const props = defineProps<{
    entry: StorylineTimelineEntry;
    lanes: { main: string; optional: string; unlocks: string };
    chapterId: string;
    readOnly?: boolean;
    hasOptionals: boolean;
    hasUnlocks: boolean;
  }>();
  const emit = defineEmits<{ toggleObjective: [objectiveId: string] }>();
  const optional = computed(() => props.entry.step === null);
  const optionalObjectives = computed(() =>
    optional.value && props.entry.objective
      ? [props.entry.objective]
      : props.entry.optionalObjectives
  );
  const optionalLaneClass = computed(() => {
    if (optional.value) return 'ml-2 @3xl/objectives:ml-0';
    if (!optionalObjectives.value.length) return 'hidden @3xl/objectives:block';
    return 'border-warning-700/40 relative ml-2 border-l border-dashed pl-3 @3xl/objectives:ml-0 @3xl/objectives:border-l-0 @3xl/objectives:pl-0 @3xl/objectives:before:absolute @3xl/objectives:before:top-4 @3xl/objectives:before:-left-4 @3xl/objectives:before:w-4 @3xl/objectives:before:border-t @3xl/objectives:before:border-dashed @3xl/objectives:before:border-warning-700/50';
  });
  const parentLabel = (objective: StorylineObjectiveProgress) =>
    props.entry.routeChoice?.objectives.find((parent) => parent.id === objective.parentObjectiveId)
      ?.description;
  const rowProps = (objective: StorylineObjectiveProgress) => ({
    hideUnlocks: true,
    objective,
    inputId: storylineObjectiveInputId(props.chapterId, objective.id),
    readOnly: props.readOnly,
    onToggle: () => emit('toggleObjective', objective.id),
  });
</script>
