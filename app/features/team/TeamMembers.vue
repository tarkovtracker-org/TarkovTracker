<template>
  <TeamCard :title="$t('page.team.members.title', { count: allMembers.length })">
    <template #icon>
      <UIcon name="i-mdi-account-group-outline" class="text-primary-300 h-5 w-5" />
    </template>
    <div v-if="allMembers.length > 0" class="space-y-4">
      <div class="grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-4">
        <div v-for="teammate in allMembers" :key="teammate">
          <TeamMemberCard :teammember="teammate" :is-team-owner-view="isCurrentUserTeamOwner" />
        </div>
        <div
          v-if="allMembers.length === 1"
          class="border-primary-500/30 bg-primary-500/5 flex flex-col items-start gap-4 rounded-xl border border-dashed p-5 sm:flex-row sm:items-center sm:justify-between"
          data-testid="team-members-empty-state"
        >
          <div class="flex items-start gap-3">
            <UIcon
              name="i-mdi-account-multiple-plus-outline"
              class="text-primary-300 mt-0.5 h-5 w-5 shrink-0"
            />
            <p class="text-surface-300 text-sm leading-6">
              {{ $t('page.team.members.alone') }}
            </p>
          </div>
          <UButton
            :icon="copied ? 'i-mdi-check' : 'i-mdi-content-copy'"
            color="primary"
            variant="outline"
            class="min-h-11 shrink-0"
            :disabled="!teamUrl"
            data-testid="copy-team-members-invite"
            @click="copyInvite"
          >
            <span aria-live="polite">
              {{ copied ? $t('page.team.members.copied') : $t('page.team.members.copy_invite') }}
            </span>
          </UButton>
        </div>
      </div>
    </div>
    <div v-else class="text-surface-400 py-6 text-center text-sm">
      {{ $t('page.team.members.no_members') }}
    </div>
  </TeamCard>
</template>
<script setup lang="ts">
  import TeamCard from '@/features/team/TeamCard.vue';
  import TeamMemberCard from '@/features/team/TeamMemberCard.vue';
  import { useTeamInviteCopyFeedback } from '@/features/team/useTeamInviteCopyFeedback';
  import { useTeamInviteLink } from '@/features/team/useTeamInviteLink';
  import { useTeamStoreWithSupabase } from '@/stores/useTeamStore';
  const { $supabase } = useNuxtApp();
  const { teamStore } = useTeamStoreWithSupabase();
  const { copied, copyInviteLink } = useTeamInviteCopyFeedback();
  const { teamUrl } = useTeamInviteLink();
  const teamMembers = computed<string[]>(() => teamStore.members || []);
  const isCurrentUserTeamOwner = computed(() => {
    const currentTeamOwner = teamStore.owner;
    const currentSupabaseUID = $supabase.user.id;
    return currentTeamOwner === currentSupabaseUID;
  });
  const allMembers = computed(() => {
    const currentUID = $supabase.user.id;
    if (!currentUID) return teamMembers.value;
    const hasCurrentUser = teamMembers.value.includes(currentUID);
    if (hasCurrentUser) {
      return [...teamMembers.value].sort((a, b) => {
        if (a === currentUID) return -1;
        if (b === currentUID) return 1;
        return 0;
      });
    } else {
      return [currentUID, ...teamMembers.value];
    }
  });
  const copyInvite = async () => {
    await copyInviteLink(teamUrl.value);
  };
</script>
