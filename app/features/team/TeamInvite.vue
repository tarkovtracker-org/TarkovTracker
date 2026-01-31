<template>
  <UAlert
    v-if="hasInviteInUrl && !inInviteTeam && !declined"
    color="success"
    variant="solid"
    icon="i-mdi-handshake"
    class="mb-4"
  >
    <template #title>
      <div class="flex w-full flex-row items-center justify-between">
        <div>
          {{ $t('page.team.card.teaminvite.description') }}
        </div>
        <div class="flex gap-2">
          <UButton
            color="neutral"
            variant="outline"
            :disabled="accepting"
            :loading="accepting"
            @click="acceptInvite"
          >
            {{ $t('page.team.card.teaminvite.accept') }}
          </UButton>
          <UButton color="neutral" variant="outline" :disabled="accepting" @click="declined = true">
            {{ $t('page.team.card.teaminvite.decline') }}
          </UButton>
        </div>
      </div>
    </template>
  </UAlert>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useRoute } from 'vue-router';
  import { useEdgeFunctions } from '@/composables/api/useEdgeFunctions';
  import { useSystemStore } from '@/stores/useSystemStore';
  import type { SystemState } from '@/types/tarkov';
  import { logger } from '@/utils/logger';
  import { useToast } from '#imports';
  const systemStore = useSystemStore();
  const route = useRoute();
  const toast = useToast();
  const { joinTeam } = useEdgeFunctions();
  const hasInviteInUrl = computed(() => {
    return !!(route.query.team && route.query.code);
  });
  const inInviteTeam = computed(() => {
    // Access state directly for reactivity
    const systemState = systemStore.$state;
    const currentTeamId = systemState.team ?? systemState.team_id;
    const queryTeam = route.query.team;
    // Normalize query param: if array, take first; if null/undefined, bail
    const inviteTeamId = Array.isArray(queryTeam) ? queryTeam[0] : queryTeam;
    if (!inviteTeamId || !currentTeamId) return false;
    // Strict comparison after ensuring both are strings
    return String(currentTeamId) === String(inviteTeamId);
  });
  const declined = ref(false);
  const accepting = ref(false);
  const acceptInvite = async () => {
    if (!route.query.team || !route.query.code) return;
    accepting.value = true;
    try {
      const teamId = String(route.query.team);
      const code = String(route.query.code);
      const result = await joinTeam(teamId, code);
      if (result?.success) {
        toast.add({
          title: 'Joined team successfully!',
          color: 'success',
        });
        systemStore.$patch({ team: teamId, team_id: teamId } as Partial<SystemState>);
        declined.value = false;
      } else {
        throw new Error((result as { message?: string })?.message || 'Failed to join team');
      }
    } catch (err) {
      const error = err as Error & { data?: { message?: string } };
      const message = error?.message || error?.data?.message || String(err);
      logger.error('[TeamInvite] Error joining team:', error);
      toast.add({
        title: message,
        color: 'error',
      });
    } finally {
      accepting.value = false;
    }
  };
</script>
