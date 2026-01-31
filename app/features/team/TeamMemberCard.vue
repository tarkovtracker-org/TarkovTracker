<template>
  <UCard :ui="{ body: 'p-4 sm:p-6' }">
    <div class="space-y-4">
      <!-- Header with name, badge, and level -->
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
          <div v-if="props.teammember == $supabase.user.id" class="mt-1">
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
            <div class="text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
              {{ $t('navigation_drawer.level') }}
            </div>
            <div class="mt-1 text-3xl leading-none font-bold sm:text-4xl">
              {{ level }}
            </div>
          </div>
        </div>
      </div>
      <!-- Task progress and actions -->
      <div
        class="flex items-center justify-between border-t border-gray-200 pt-2 dark:border-gray-700"
      >
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
            :disabled="props.teammember == $supabase.user.id || preferencesStore.taskTeamAllHidden"
            variant="outline"
            :icon="
              props.teammember != $supabase.user.id &&
              preferencesStore.teamIsHidden(props.teammember)
                ? 'i-mdi-eye-off'
                : 'i-mdi-eye'
            "
            :color="
              props.teammember != $supabase.user.id &&
              preferencesStore.teamIsHidden(props.teammember)
                ? 'error'
                : 'success'
            "
            size="sm"
            @click="preferencesStore.toggleHidden(props.teammember)"
          />
          <UButton
            v-if="props.teammember != $supabase.user.id && isTeamOwnerView"
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
  </UCard>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useEdgeFunctions } from '@/composables/api/useEdgeFunctions';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useProgressStore } from '@/stores/useProgress';
  import { useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  import { useTeamStoreWithSupabase } from '@/stores/useTeamStore';
  import { logger } from '@/utils/logger';
  import { useToast } from '#imports';
  const { $supabase } = useNuxtApp();
  const toast = useToast();
  const { teamStore } = useTeamStoreWithSupabase();
  const { systemStore } = useSystemStoreWithSupabase();
  const { kickTeamMember } = useEdgeFunctions();
  // Define the props for the component
  const props = defineProps<{
    teammember: string;
    isTeamOwnerView: boolean;
  }>();
  // Check if this member is the team owner
  const isOwner = computed(() => {
    const currentTeamOwner = teamStore.owner;
    return currentTeamOwner === props.teammember;
  });
  const teamStoreId = computed(() => {
    if (props.teammember == $supabase.user.id) {
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
  const { t } = useI18n({ useScope: 'global' });
  const displayName = computed(() => {
    const fromProfile = teamStore.memberProfiles?.[props.teammember]?.displayName;
    const fromProgress = progressStore.getDisplayName(props.teammember);
    return fromProfile || fromProgress || props.teammember;
  });
  const level = computed(() => {
    // For the current user, always use progressStore which respects automatic calculation
    if (props.teammember === $supabase.user.id) {
      return progressStore.getLevel(props.teammember);
    }
    // For teammates, prefer server-side profile data, fallback to progress store
    const fromProfile = teamStore.memberProfiles?.[props.teammember]?.level;
    const fromProgress = progressStore.getLevel(props.teammember);
    return fromProfile ?? fromProgress;
  });
  const completedTaskCount = computed(() => {
    const profileCount = teamStore.memberProfiles?.[props.teammember]?.tasksCompleted;
    if (profileCount != null) return profileCount;
    return tasks.value.filter(
      (task) => progressStore.tasksCompletions?.[task.id]?.[teamStoreId.value] == true
    ).length;
  });
  const groupIcon = computed(() => {
    const entry = playerLevels.value.find((pl) => pl.level === level.value);
    return entry?.levelBadgeImageLink ?? '';
  });
  const kickingTeammate = ref(false);
  const kickTeammate = async () => {
    if (!props.teammember) return;
    const teamId = (teamStore.$state as { id?: string })?.id || systemStore.$state?.team;
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
