<template>
  <div>
    <div v-for="group in groups" :key="group.id" class="mb-1 last:mb-0">
      <span v-if="group.label" class="text-surface-400 block truncate text-xs leading-snug">
        {{ group.label }}
      </span>
      <StorylineUnlockBadges
        :unlocks="group.objective.unlocks"
        :estimated="group.objective.hasEstimatedUnlocks"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
  import StorylineUnlockBadges from '@/features/storyline/components/StorylineUnlockBadges.vue';
  import {
    storylineEntryUnlockGroups,
    type StorylineTimelineEntry,
  } from '@/features/storyline/storylineTimeline';
  const props = defineProps<{ entry: StorylineTimelineEntry }>();
  const groups = computed(() => storylineEntryUnlockGroups(props.entry));
</script>
