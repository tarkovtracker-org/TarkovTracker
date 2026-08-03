<template>
  <div class="bg-surface-850 rounded-lg border border-white/10 p-4 shadow-md sm:p-6">
    <div class="space-y-4">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="truncate text-xl font-bold sm:text-2xl">
              {{ displayName }}
            </h3>
            <UBadge v-if="isOwner" color="primary" variant="solid" size="sm">
              {{ $t('page.team.card.manageteam.membercard.owner') }}
            </UBadge>
          </div>
          <div v-if="props.teammember === $supabase.user.id" class="mt-1">
            <span class="text-primary text-sm font-medium">
              {{ $t('page.team.card.manageteam.membercard.this_is_you') }}
            </span>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-3">
          <img
            :src="groupIcon"
            class="h-12 w-12 object-contain sm:h-16 sm:w-16"
            alt="Level badge"
          />
          <div class="text-center">
            <div class="text-surface-400 text-xs tracking-wide uppercase">
              {{ $t('common.level') }}
            </div>
            <div class="mt-1 text-3xl leading-none font-bold sm:text-4xl">
              {{ level }}
            </div>
          </div>
        </div>
      </div>
      <div class="border-surface-700 flex items-center justify-between border-t pt-2">
        <div class="text-sm">
          <i18n-t
            v-if="!preferencesStore.teamIsHidden(props.teammember)"
            keypath="page.team.card.manageteam.membercard.taskscomplete"
            scope="global"
          >
            <template #completed>
              <span class="text-primary font-bold">
                {{ completedTaskCount }}
              </span>
            </template>
            <template #total>
              <span class="font-bold">
                {{ tasks.length }}
              </span>
            </template>
          </i18n-t>
        </div>
        <div class="flex gap-2">
          <UButton
            :disabled="props.teammember === $supabase.user.id || preferencesStore.taskTeamAllHidden"
            variant="outline"
            :icon="
              props.teammember !== $supabase.user.id &&
              preferencesStore.teamIsHidden(props.teammember)
                ? 'i-mdi-eye-off'
                : 'i-mdi-eye'
            "
            :color="
              props.teammember !== $supabase.user.id &&
              preferencesStore.teamIsHidden(props.teammember)
                ? 'error'
                : 'success'
            "
            size="sm"
            @click="preferencesStore.toggleHidden(props.teammember)"
          />
          <UButton
            v-if="props.teammember !== $supabase.user.id && isTeamOwnerView"
            variant="outline"
            icon="i-mdi-account-minus"
            color="error"
            size="sm"
            :loading="kickingTeammate"
            :disabled="kickingTeammate"
            @click="kickTeammate()"
          />
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useEdgeFunctions } from '@/composables/api/useEdgeFunctions';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useProgressStore } from '@/stores/useProgress';
  import { getTeamIdFromState, useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  import { useTeamStoreWithSupabase } from '@/stores/useTeamStore';
  import { getCurrentGameMode } from '@/stores/utils/gameMode';
  import { logger } from '@/utils/logger';
  const { $supabase } = useNuxtApp();
  const toast = useToast();
  const { t } = useI18n({ useScope: 'global' });
  const { teamStore } = useTeamStoreWithSupabase();
  const { systemStore } = useSystemStoreWithSupabase();
  const { kickTeamMember } = useEdgeFunctions();
  const props = defineProps<{
    teammember: string;
    isTeamOwnerView: boolean;
  }>();
  const isOwner = computed(() => {
    const currentTeamOwner = teamStore.owner;
    return currentTeamOwner === props.teammember;
  });
  const teamStoreId = computed(() => {
    if (props.teammember === $supabase.user.id) {
      return 'self';
    } else {
      return props.teammember;
    }
  });
  const progressStore = useProgressStore();
  const preferencesStore = usePreferencesStore();
  const metadataStore = useMetadataStore();
  const tasks = computed(() => metadataStore.tasks);
  const playerLevels = computed(() => metadataStore.playerLevels);
  const displayName = computed(() => {
    const fromProfile = teamStore.memberProfiles?.[props.teammember]?.displayName;
    const fromProgress = progressStore.getDisplayName(props.teammember);
    return fromProfile || fromProgress || props.teammember;
  });
  const level = computed(() => {
    if (props.teammember === $supabase.user.id) {
      return progressStore.getLevel(props.teammember);
    }
    const fromProfile = teamStore.memberProfiles?.[props.teammember]?.level;
    const fromProgress = progressStore.getLevel(props.teammember);
    return fromProfile ?? fromProgress;
  });
  const completedTaskCount = computed(() => {
    const profileCount = teamStore.memberProfiles?.[props.teammember]?.tasksCompleted;
    if (profileCount != null) return profileCount;
    return tasks.value.filter(
      (task) => progressStore.tasksCompletions?.[task.id]?.[teamStoreId.value] === true
    ).length;
  });
  const groupIcon = computed(() => {
    const entry = playerLevels.value.find((pl) => pl.level === level.value);
    return entry?.levelBadgeImageLink ?? '';
  });
  const kickingTeammate = ref(false);
  const kickTeammate = async () => {
    if (!props.teammember) return;
    const teamId = getTeamIdFromState(systemStore.$state, getCurrentGameMode());
    if (!teamId) {
      toast.add({
        title: t('page.team.card.manageteam.membercard.kick_error'),
        description: t('page.team.card.manageteam.membercard.kick_error'),
        color: 'error',
      });
      return;
    }
    kickingTeammate.value = true;
    try {
      const result = await kickTeamMember(teamId, props.teammember);
      if (result?.success) {
        toast.add({
          title: t('page.team.card.manageteam.membercard.kick_success'),
          color: 'success',
        });
      } else {
        throw new Error((result as { message?: string })?.message || 'Failed to kick team member');
      }
    } catch (err) {
      const error = err as Error & { data?: { message?: string } };
      const backendMsg = error?.message || error?.data?.message || String(err);
      const message = backendMsg || t('page.team.card.manageteam.membercard.kick_error');
      logger.error('[TeamMemberCard] Error kicking teammate:', error);
      toast.add({ title: message, color: 'error' });
    } finally {
      kickingTeammate.value = false;
    }
  };
</script>
