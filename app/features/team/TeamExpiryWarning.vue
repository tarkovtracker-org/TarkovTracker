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
  // Match the translated sentence: format with the app's selected locale, not the browser's.
  const { locale } = useI18n({ useScope: 'global' });
  const deadline = computed(() => {
    if (teamStore.id !== props.teamId || teamStore.owner !== $supabase.user.id) return null;
    const date = new Date(teamStore.ownerOnlyExpiresAt ?? '');
    return Number.isFinite(date.getTime()) ? date.toLocaleString(locale.value) : null;
  });
</script>
