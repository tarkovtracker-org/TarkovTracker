<template>
  <UPopover v-if="teammates.length > 0" :content="{ align: 'end', sideOffset: 6 }">
    <UButton
      variant="ghost"
      color="neutral"
      size="sm"
      trailing-icon="i-mdi-chevron-down"
      class="text-surface-200 border border-white/10 leading-none"
      :aria-label="t('page.tasks.filters.team_aria_label', { name: selectedLabel })"
    >
      <UIcon :name="selectedIcon" class="h-4 w-4 shrink-0" />
      <span class="hidden max-w-28 truncate text-xs leading-none uppercase sm:inline">
        {{ selectedLabel }}
      </span>
    </UButton>
    <template #content>
      <div class="w-64 space-y-0.5 p-1.5">
        <button
          type="button"
          :class="rowClass(userView === 'self')"
          :aria-pressed="userView === 'self'"
          @click="selectUserView('self')"
        >
          <UIcon name="i-mdi-account-circle" class="h-4 w-4 shrink-0" />
          <span class="flex-1 truncate">{{ currentUserDisplayName }}</span>
          <UBadge size="sm" color="primary" variant="solid" class="uppercase">
            {{ t('page.tasks.user_views.yourself') }}
          </UBadge>
        </button>
        <div v-for="teamId in teammates" :key="teamId" class="flex items-center gap-1">
          <button
            type="button"
            :class="[rowClass(userView === teamId), { 'opacity-50': isTeammateHidden(teamId) }]"
            :aria-pressed="userView === teamId"
            @click="selectUserView(teamId)"
          >
            <UIcon name="i-mdi-account" class="h-4 w-4 shrink-0" />
            <span class="flex-1 truncate">{{ getTeammateDisplayName(teamId) }}</span>
          </button>
          <UButton
            variant="ghost"
            size="sm"
            :color="isTeammateHidden(teamId) ? 'error' : 'success'"
            :icon="isTeammateHidden(teamId) ? 'i-mdi-eye-off' : 'i-mdi-eye'"
            :disabled="preferencesStore.taskTeamAllHidden"
            :aria-label="getTeammateVisibilityLabel(teamId)"
            :aria-pressed="!isTeammateHidden(teamId)"
            @click="toggleTeammateVisibility(teamId)"
          />
        </div>
        <button
          type="button"
          :class="rowClass(userView === 'all')"
          :aria-pressed="userView === 'all'"
          @click="selectUserView('all')"
        >
          <UIcon name="i-mdi-account-multiple" class="h-4 w-4 shrink-0" />
          <span class="flex-1 truncate">{{ t('page.tasks.filters.whole_team') }}</span>
        </button>
      </div>
    </template>
  </UPopover>
</template>
<script setup lang="ts">
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useProgressStore } from '@/stores/useProgress';
  import { useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  import { useTeamStore } from '@/stores/useTeamStore';
  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();
  const progressStore = useProgressStore();
  const teamStore = useTeamStore();
  const { hasInitiallyLoaded: hasSystemInitiallyLoaded, hasTeam } = useSystemStoreWithSupabase();
  const userView = computed(() => preferencesStore.getTaskUserView);
  const teammates = computed(() => teamStore.teammates || []);
  const currentUserDisplayName = computed(
    () => progressStore.getDisplayName('self') || t('page.tasks.user_views.yourself', 'You')
  );
  const getTeammateDisplayName = (teamId: string): string =>
    progressStore.getDisplayName(teamId) || teamId;
  const selectedLabel = computed(() => {
    if (userView.value === 'all') return t('page.tasks.filters.whole_team');
    if (userView.value === 'self') return currentUserDisplayName.value;
    return getTeammateDisplayName(userView.value);
  });
  const SELECTED_ICONS: Record<string, string> = {
    all: 'i-mdi-account-multiple',
    self: 'i-mdi-account-circle',
  };
  const selectedIcon = computed(() => SELECTED_ICONS[userView.value] ?? 'i-mdi-account');
  const rowClass = (isActive: boolean) => [
    'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
    isActive
      ? 'bg-primary-500/12 text-white ring-1 ring-primary-500/25 light:text-primary-700'
      : 'text-surface-300 hover:bg-white/5 hover:text-white light:hover:text-surface-50',
  ];
  const canValidateSelectedTeammateView = computed(() => {
    if (teammates.value.length > 0) return true;
    if (teamStore.teamMembers.length > 0) return true;
    if (!hasSystemInitiallyLoaded.value) return false;
    return !hasTeam();
  });
  const isTeammateHidden = (teamId: string): boolean => preferencesStore.teamIsHidden(teamId);
  const isTeammateIndividuallyHidden = (teamId: string): boolean =>
    preferencesStore.teamHide?.[teamId] === true;
  const getTeammateVisibilityLabel = (teamId: string): string => {
    const actionLabel = isTeammateHidden(teamId) ? t('common.show') : t('common.hide');
    return `${actionLabel} ${getTeammateDisplayName(teamId)}`;
  };
  const toggleTeammateVisibility = (teamId: string) => {
    if (preferencesStore.taskTeamAllHidden) return;
    const wasHidden = isTeammateHidden(teamId);
    preferencesStore.toggleHidden(teamId);
    if (!wasHidden && userView.value === teamId) preferencesStore.setTaskUserView('all');
  };
  // Picking a teammate shows them again, unless the whole team is hidden.
  const shouldUnhideOnSelect = (teamId: string) =>
    teamId !== 'self' &&
    teamId !== 'all' &&
    !preferencesStore.taskTeamAllHidden &&
    isTeammateIndividuallyHidden(teamId);
  const selectUserView = (teamId: string) => {
    if (userView.value === teamId) return;
    if (shouldUnhideOnSelect(teamId)) preferencesStore.toggleHidden(teamId);
    preferencesStore.setTaskUserView(teamId);
  };
  watch(
    [userView, teammates, canValidateSelectedTeammateView],
    ([selectedUserView, currentTeammates, canValidate]) => {
      if (selectedUserView === 'self' || selectedUserView === 'all') return;
      if (!canValidate) return;
      if (!currentTeammates.includes(selectedUserView) || isTeammateHidden(selectedUserView)) {
        preferencesStore.setTaskUserView(currentTeammates.length > 0 ? 'all' : 'self');
      }
    },
    { immediate: true }
  );
</script>
