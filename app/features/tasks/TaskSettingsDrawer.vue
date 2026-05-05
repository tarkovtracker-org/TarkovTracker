<template>
  <aside
    ref="drawerRef"
    tabindex="-1"
    :role="isOverlayMode ? 'dialog' : 'complementary'"
    :aria-modal="isOverlayMode ? 'true' : undefined"
    aria-labelledby="task-settings-drawer-title"
    class="overflow-y-auto backdrop-blur-sm"
    :class="
      isOverlayMode
        ? 'bg-surface-900/96 fixed right-3 bottom-3 left-3 z-40 flex max-h-[72vh] flex-col rounded-[28px] border border-white/10 p-4 shadow-2xl sm:top-24 sm:right-4 sm:bottom-4 sm:left-auto sm:max-h-[calc(100vh-7rem)] sm:w-96'
        : 'bg-surface-800/95 sticky top-6 max-h-[calc(100vh-3rem)] w-72 rounded-lg border border-white/10 p-4 shadow-xl'
    "
    @keydown="handleKeydown"
  >
    <div class="mb-3 flex items-center justify-between">
      <h2 id="task-settings-drawer-title" class="text-sm font-semibold text-white">
        {{ t('page.tasks.settings.title') }}
      </h2>
      <UButton
        variant="ghost"
        color="neutral"
        icon="i-mdi-close"
        size="xs"
        :aria-label="t('common.close')"
        @click="handleClose"
      />
    </div>
    <div class="space-y-3">
      <TaskFiltersSection
        :has-teammates="hasTeammates"
        :show-non-special-tasks="showNonSpecialTasks"
        :show-kappa-tasks="showKappaTasks"
        :show-lightkeeper-tasks="showLightkeeperTasks"
        :shared-by-all-only="sharedByAllOnly"
        :only-tasks-with-required-keys="onlyTasksWithRequiredKeys"
        :show-global-tasks="showGlobalTasks"
        :respect-task-filters-for-impact="respectTaskFiltersForImpact"
        :hide-completed-map-objectives="hideCompletedMapObjectives"
        @update:show-non-special-tasks="showNonSpecialTasks = $event"
        @update:show-kappa-tasks="showKappaTasks = $event"
        @update:show-lightkeeper-tasks="showLightkeeperTasks = $event"
        @update:shared-by-all-only="sharedByAllOnly = $event"
        @update:only-tasks-with-required-keys="onlyTasksWithRequiredKeys = $event"
        @update:show-global-tasks="showGlobalTasks = $event"
        @update:respect-task-filters-for-impact="respectTaskFiltersForImpact = $event"
        @update:hide-completed-map-objectives="hideCompletedMapObjectives = $event"
      />
      <CardDisplaySection
        :show-required-labels="showRequiredLabels"
        :show-experience-rewards="showExperienceRewards"
        :show-next-quests="showNextQuests"
        :show-previous-quests="showPreviousQuests"
        :hide-completed-task-objectives="hideCompletedTaskObjectives"
        @update:show-required-labels="showRequiredLabels = $event"
        @update:show-experience-rewards="showExperienceRewards = $event"
        @update:show-next-quests="showNextQuests = $event"
        @update:show-previous-quests="showPreviousQuests = $event"
        @update:hide-completed-task-objectives="hideCompletedTaskObjectives = $event"
      />
      <FilterBarSection
        :show-all-filter="showAllFilter"
        :show-available-filter="showAvailableFilter"
        :show-locked-filter="showLockedFilter"
        :show-completed-filter="showCompletedFilter"
        :show-failed-filter="showFailedFilter"
        @update:show-all-filter="showAllFilter = $event"
        @update:show-available-filter="showAvailableFilter = $event"
        @update:show-locked-filter="showLockedFilter = $event"
        @update:show-completed-filter="showCompletedFilter = $event"
        @update:show-failed-filter="showFailedFilter = $event"
      />
      <AdvancedTasksSection
        :enable-manual-task-fail="enableManualTaskFail"
        :failed-tasks-count="failedTasksCount"
        @update:enable-manual-task-fail="enableManualTaskFail = $event"
        @repair="repairFailedTasks"
      />
    </div>
    <UModal v-model:open="showRepairConfirm" @close="resolveRepairConfirm(false)">
      <template #content>
        <div class="p-5">
          <div class="mb-4 flex items-center gap-3">
            <div class="bg-warning-500/15 rounded-full p-2">
              <UIcon name="i-mdi-alert" class="text-warning-400 h-5 w-5" />
            </div>
            <h3 class="text-surface-100 text-base font-semibold">
              {{ t('page.tasks.settings.advanced.repair_failed') }}
            </h3>
          </div>
          <p class="text-surface-300 mb-5 text-sm">
            {{ t('page.tasks.settings.advanced.repair_failed_confirm') }}
          </p>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="resolveRepairConfirm(false)">
              {{ t('page.tasks.settings.advanced.repair_failed_cancel') }}
            </UButton>
            <UButton color="warning" variant="soft" @click="resolveRepairConfirm(true)">
              {{ t('page.tasks.settings.advanced.repair_failed_action') }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </aside>
</template>
<script setup lang="ts">
  import { usePageSettingsDrawer } from '@/composables/usePageSettingsDrawer';
  import { useTaskRepair } from '@/composables/useTaskRepair';
  import AdvancedTasksSection from '@/features/tasks/AdvancedTasksSection.vue';
  import CardDisplaySection from '@/features/tasks/CardDisplaySection.vue';
  import FilterBarSection from '@/features/tasks/FilterBarSection.vue';
  import TaskFiltersSection from '@/features/tasks/TaskFiltersSection.vue';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useTeamStore } from '@/stores/useTeamStore';
  interface Props {
    mode?: 'overlay' | 'docked';
  }
  const props = withDefaults(defineProps<Props>(), {
    mode: 'overlay',
  });
  const isOverlayMode = computed(() => props.mode === 'overlay');
  const { t } = useI18n({ useScope: 'global' });
  const { close } = usePageSettingsDrawer('tasks');
  const preferencesStore = usePreferencesStore();
  const teamStore = useTeamStore();
  const drawerRef = ref<HTMLElement | null>(null);
  const { restoreTriggerFocus, trapFocus } = useOverlayFocusTrap({
    containerRef: drawerRef,
    isOverlayMode,
  });
  const showRepairConfirm = ref(false);
  const repairConfirmResolver = ref<((value: boolean) => void) | null>(null);
  const requestRepairConfirm = () =>
    new Promise<boolean>((resolve) => {
      repairConfirmResolver.value = resolve;
      showRepairConfirm.value = true;
    });
  const resolveRepairConfirm = (confirmed: boolean) => {
    const resolver = repairConfirmResolver.value;
    repairConfirmResolver.value = null;
    showRepairConfirm.value = false;
    if (resolver) {
      resolver(confirmed);
    }
  };
  const { failedTasksCount, repairFailedTasks } = useTaskRepair({ requestRepairConfirm });
  const handleClose = () => {
    close();
    nextTick(() => {
      restoreTriggerFocus();
    });
  };
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleClose();
      return;
    }
    trapFocus(event);
  };
  onBeforeUnmount(() => {
    resolveRepairConfirm(false);
  });
  const hasTeammates = computed(() => (teamStore.teammates?.length ?? 0) > 0);
  const showKappaTasks = computed({
    get: () => !preferencesStore.getHideNonKappaTasks,
    set: (value) => preferencesStore.setHideNonKappaTasks(!value),
  });
  const showNonSpecialTasks = computed({
    get: () => preferencesStore.getShowNonSpecialTasks,
    set: (value) => preferencesStore.setShowNonSpecialTasks(value),
  });
  const showLightkeeperTasks = computed({
    get: () => preferencesStore.getShowLightkeeperTasks,
    set: (value) => preferencesStore.setShowLightkeeperTasks(value),
  });
  const sharedByAllOnly = computed({
    get: () => preferencesStore.getTaskSharedByAllOnly,
    set: (value) => preferencesStore.setTaskSharedByAllOnly(value),
  });
  const onlyTasksWithRequiredKeys = computed({
    get: () => preferencesStore.getOnlyTasksWithRequiredKeys,
    set: (value) => preferencesStore.setOnlyTasksWithRequiredKeys(value),
  });
  const showGlobalTasks = computed({
    get: () => !preferencesStore.getHideGlobalTasks,
    set: (value) => preferencesStore.setHideGlobalTasks(!value),
  });
  const respectTaskFiltersForImpact = computed({
    get: () => preferencesStore.getRespectTaskFiltersForImpact,
    set: (value) => preferencesStore.setRespectTaskFiltersForImpact(value),
  });
  const hideCompletedMapObjectives = computed({
    get: () => preferencesStore.getHideCompletedMapObjectives,
    set: (value) => preferencesStore.setHideCompletedMapObjectives(value),
  });
  const showRequiredLabels = computed({
    get: () => preferencesStore.getShowRequiredLabels,
    set: (value) => preferencesStore.setShowRequiredLabels(value),
  });
  const showExperienceRewards = computed({
    get: () => preferencesStore.getShowExperienceRewards,
    set: (value) => preferencesStore.setShowExperienceRewards(value),
  });
  const showNextQuests = computed({
    get: () => preferencesStore.getShowNextQuests,
    set: (value) => preferencesStore.setShowNextQuests(value),
  });
  const showPreviousQuests = computed({
    get: () => preferencesStore.getShowPreviousQuests,
    set: (value) => preferencesStore.setShowPreviousQuests(value),
  });
  const enableManualTaskFail = computed({
    get: () => preferencesStore.getEnableManualTaskFail,
    set: (value) => preferencesStore.setEnableManualTaskFail(value),
  });
  const hideCompletedTaskObjectives = computed({
    get: () => preferencesStore.getHideCompletedTaskObjectives,
    set: (value) => preferencesStore.setHideCompletedTaskObjectives(value),
  });
  const showAllFilter = computed({
    get: () => preferencesStore.getShowAllFilter,
    set: (value) => preferencesStore.setShowAllFilter(value),
  });
  const showAvailableFilter = computed({
    get: () => preferencesStore.getShowAvailableFilter,
    set: (value) => preferencesStore.setShowAvailableFilter(value),
  });
  const showLockedFilter = computed({
    get: () => preferencesStore.getShowLockedFilter,
    set: (value) => preferencesStore.setShowLockedFilter(value),
  });
  const showCompletedFilter = computed({
    get: () => preferencesStore.getShowCompletedFilter,
    set: (value) => preferencesStore.setShowCompletedFilter(value),
  });
  const showFailedFilter = computed({
    get: () => preferencesStore.getShowFailedFilter,
    set: (value) => preferencesStore.setShowFailedFilter(value),
  });
</script>
