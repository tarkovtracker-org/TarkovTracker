<template>
  <ol class="divide-y divide-white/8 border-t border-white/8">
    <li v-if="storyStep">
      <StorylineNextStepRow :item="storyStep" :track-clicks="trackClicks" />
    </li>
    <li v-for="(item, index) in items" :key="item.taskId">
      <DashboardUpNextRow :item="item" :index="index" :track-clicks="trackClicks" />
    </li>
  </ol>
</template>
<script setup lang="ts">
  import DashboardUpNextRow from '@/features/dashboard/DashboardUpNextRow.vue';
  import StorylineNextStepRow from '@/features/storyline/StorylineNextStepRow.vue';
  import type { UpNextItem } from '@/features/dashboard/upNext';
  import type { StorylineNextStep } from '@/features/storyline/nextStep';
  defineProps<{ items: UpNextItem[]; storyStep?: StorylineNextStep; trackClicks: boolean }>();
</script>
