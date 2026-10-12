<template>
  <div>
    <h4 :class="STORYLINE_SUBLABEL_CLASS">{{ label }}</h4>
    <ol class="gap-x-8 @4xl/objectives:columns-2">
      <li
        v-for="objective in objectives"
        :key="objective.id"
        class="break-inside-avoid"
        :class="
          indentOptional && isOptional(objective)
            ? 'ml-3 border-l border-white/10 pl-1 sm:ml-6'
            : ''
        "
      >
        <StorylineObjectiveRow
          :objective="objective"
          :input-id="storylineObjectiveInputId(chapterId, objective.id)"
          :optional="isOptional(objective)"
          :accent="isOptional(objective) ? 'warning' : 'success'"
          :read-only="readOnly"
          @toggle="emit('toggleObjective', objective.id)"
        />
      </li>
    </ol>
  </div>
</template>
<script setup lang="ts">
  import StorylineObjectiveRow from '@/features/storyline/components/StorylineObjectiveRow.vue';
  import { storylineObjectiveInputId } from '@/features/storyline/objectiveInputId';
  import { STORYLINE_SUBLABEL_CLASS } from '@/features/storyline/storylineClasses';
  import type { StorylineObjectiveProgress } from '@/composables/useStorylineChapters';
  defineProps<{
    objectives: StorylineObjectiveProgress[];
    chapterId: string;
    label: string;
    readOnly?: boolean;
    indentOptional?: boolean;
  }>();
  const emit = defineEmits<{ toggleObjective: [objectiveId: string] }>();
  const isOptional = (objective: StorylineObjectiveProgress) => objective.type === 'optional';
</script>
