<template>
  <UAlert
    v-if="deadline"
    color="warning"
    icon="i-mdi-account-clock-outline"
    :title="$t('page.team.expiry.title')"
    :description="$t('page.team.expiry.warning', { deadline })"
    data-testid="team-expiry-warning"
  />
</template>
<script setup lang="ts">
  import { useTeamStore } from '@/stores/useTeamStore';
  const props = defineProps<{ teamId: string | null }>();
  const teamStore = useTeamStore();
  const { $supabase } = useNuxtApp();
  const deadline = computed(() => {
    if (teamStore.id !== props.teamId || teamStore.owner !== $supabase.user.id) return null;
    const date = new Date(teamStore.ownerOnlyExpiresAt ?? '');
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : null;
  });
</script>
