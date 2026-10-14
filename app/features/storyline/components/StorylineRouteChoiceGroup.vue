<template>
  <div class="rounded-md border p-2 sm:p-3" :class="tone.container">
    <div class="mb-2 flex items-center justify-between gap-2">
      <div class="text-xs font-semibold tracking-wide uppercase" :class="tone.title">
        {{ t('page.storyline.route_decision', { index }) }}
      </div>
      <UBadge variant="subtle" :color="toneName" size="md">
        {{ t('page.storyline.route_choose_one') }}
      </UBadge>
    </div>
    <div class="grid grid-cols-1 gap-1.5 @2xl/objectives:grid-cols-2">
      <StorylineObjectiveRow
        v-for="objective in routeChoice.objectives"
        :key="objective.id"
        choice
        :objective="objective"
        :input-id="storylineObjectiveInputId(chapterId, objective.id)"
        :accent="toneName === 'info' ? 'info' : 'success'"
        :read-only="readOnly"
        :hide-unlocks="hideUnlocks"
        @toggle="emit('toggleObjective', objective.id)"
      />
    </div>
    <p
      v-if="routeChoice.chosenObjectiveId && !readOnly"
      class="mt-2 text-xs leading-snug"
      :class="tone.hint"
    >
      {{ t('page.storyline.route_switch_hint') }}
    </p>
  </div>
</template>
<script setup lang="ts">
  import StorylineObjectiveRow from '@/features/storyline/components/StorylineObjectiveRow.vue';
  import { storylineObjectiveInputId } from '@/features/storyline/objectiveInputId';
  import type { StorylineRouteChoiceGroup } from '@/composables/useStorylineChapters';
  type Tone = 'warning' | 'info';
  const props = withDefaults(
    defineProps<{
      routeChoice: StorylineRouteChoiceGroup;
      chapterId: string;
      index: number;
      toneName?: Tone;
      readOnly?: boolean;
      /** Set when the timeline shows the options' unlocks in its own column. */
      hideUnlocks?: boolean;
    }>(),
    { toneName: 'warning' }
  );
  const emit = defineEmits<{ toggleObjective: [objectiveId: string] }>();
  const { t } = useI18n({ useScope: 'global' });
  const TONES: Record<Tone, { container: string; title: string; hint: string }> = {
    warning: {
      container: 'border-warning-700/30 bg-warning-950/10',
      title: 'text-warning-300',
      hint: 'text-warning-200',
    },
    info: {
      container: 'border-info-700/30 bg-info-950/10',
      title: 'text-info-300',
      hint: 'text-info-200',
    },
  };
  const tone = computed(() => TONES[props.toneName]);
</script>
