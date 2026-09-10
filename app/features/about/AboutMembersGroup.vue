<template>
  <div v-if="members.length">
    <h3 class="text-primary-300/80 text-xs font-semibold tracking-widest uppercase">
      {{ t(labelKey) }}
    </h3>
    <ul class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <AboutMemberCard v-for="member in members" :key="member.id" :member="member" />
    </ul>
  </div>
</template>
<script setup lang="ts">
  import AboutMemberCard from '@/features/about/AboutMemberCard.vue';
  import type { TeamMember } from '@/features/about/teamMembers';
  const { t } = useI18n({ useScope: 'global' });
  defineProps<{
    labelKey: string;
    members: TeamMember[];
  }>();
</script>
