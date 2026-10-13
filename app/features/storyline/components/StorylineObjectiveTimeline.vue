<template>
  <div>
    <div
      v-if="hasOptionals || hasUnlocks"
      class="text-surface-500 mb-1 hidden gap-x-4 pl-9 text-xs font-medium tracking-wide uppercase @3xl/objectives:flex"
    >
      <span class="px-2" :class="lanes.main">{{ t('page.storyline.timeline_objective') }}</span>
      <span v-if="hasOptionals" class="px-2" :class="lanes.optional">
        {{ t('common.optional', 'Optional') }}
      </span>
      <span v-if="hasUnlocks" :class="lanes.unlocks">
        {{ t('page.storyline.timeline_unlocks') }}
      </span>
    </div>
    <ol>
      <StorylineTimelineRow
        v-for="entry in entries"
        :key="entry.id"
        :entry="entry"
        :lanes="lanes"
        :chapter-id="chapterId"
        :read-only="readOnly"
        :has-optionals="hasOptionals"
        :has-unlocks="hasUnlocks"
        @toggle-objective="(objectiveId) => emit('toggleObjective', objectiveId)"
      />
    </ol>
  </div>
</template>
<script setup lang="ts">
  import StorylineTimelineRow from '@/features/storyline/components/StorylineTimelineRow.vue';
  import {
    storylineEntryUnlockGroups,
    type StorylineTimelineEntry,
  } from '@/features/storyline/storylineTimeline';
  const props = defineProps<{
    entries: StorylineTimelineEntry[];
    chapterId: string;
    readOnly?: boolean;
  }>();
  const emit = defineEmits<{ toggleObjective: [objectiveId: string] }>();
  const { t } = useI18n({ useScope: 'global' });
  const hasOptionals = computed(() =>
    props.entries.some((entry) => entry.step === null || entry.optionalObjectives.length > 0)
  );
  const hasUnlocks = computed(() =>
    props.entries.some((entry) => storylineEntryUnlockGroups(entry).length)
  );
  // Explicit optional children share a main row; standalone optionals keep their original place.
  // Unlocks get a fixed column on wide layouts.
  const lanes = computed(() => ({
    main: hasOptionals.value ? 'min-w-0 flex-3' : 'min-w-0 flex-1',
    optional: 'min-w-0 flex-2',
    unlocks: '@3xl/objectives:w-64 @3xl/objectives:shrink-0 @5xl/objectives:w-80',
  }));
</script>
