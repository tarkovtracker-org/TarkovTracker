<template>
  <section
    class="bg-surface-900/90 space-y-5 rounded-xl border border-white/10 p-5 shadow-sm sm:p-6"
    :aria-label="$t('setup.steps.catch_up')"
  >
    <div v-if="!catalogReady" class="text-surface-400 text-sm" role="status">
      {{ catalogStatusText }}
    </div>
    <div v-if="catalogReady" class="space-y-5">
      <SetupCatchUpTabs :tabs="tabs" :id-prefix="tabId" @select="activeTab = $event" />
      <SetupQuestPicker
        v-show="activeTab === 'quests'"
        :id="`${tabId}-panel-quests`"
        v-model:include-prerequisites="includePrerequisites"
        role="tabpanel"
        :aria-labelledby="`${tabId}-tab-quests`"
        :choices="choices"
        :tasks="eligibleTasks"
        :traders="questTraders"
        :suggested="plan.suggested"
        :saving="saving"
        @change="setChoice"
        @remove="choices.delete($event)"
      />
      <SetupTradersPicker
        v-show="activeTab === 'traders'"
        :id="`${tabId}-panel-traders`"
        role="tabpanel"
        :aria-labelledby="`${tabId}-tab-traders`"
        :traders="loyaltyTraders"
        :saving="saving"
        @select-level="setTraderLevelDraft($event.id, $event.level)"
      />
      <SetupHideoutPicker
        v-show="activeTab === 'hideout'"
        :id="`${tabId}-panel-hideout`"
        role="tabpanel"
        :aria-labelledby="`${tabId}-tab-hideout`"
        :stations="stations"
        :levels="levels"
        :blocked-details="blockedDetails"
        :saving="saving"
        @select-level="setStationLevel($event.id, $event.level)"
        @include-station-prereqs="includeStationPrereqs"
        @open-traders-tab="activeTab = 'traders'"
      />
      <UAlert v-if="waitingForDetails" color="info" variant="soft" :title="detailMessage">
        <template #actions>
          <UButton variant="soft" :loading="detailsLoading" @click="loadTaskDetails">
            {{ $t('setup.retry_details') }}
          </UButton>
        </template>
      </UAlert>
      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4">
        <div class="flex flex-wrap items-center gap-3">
          <UButton
            v-if="showClearButton"
            variant="ghost"
            color="neutral"
            :disabled="saving"
            @click="clearDraft"
          >
            {{ $t('setup.clear_selections') }}
          </UButton>
          <output :hidden="!saveMessage" class="text-sm" :class="saveMessageClass">
            {{ saveMessage }}
          </output>
        </div>
        <UButton
          color="primary"
          variant="solid"
          :disabled="!canSave"
          :loading="saving"
          icon="i-mdi-check"
          @click="apply"
        >
          {{ saveButtonLabel }}
        </UButton>
      </div>
    </div>
    <UModal
      v-if="saveFailed"
      :title="$t('setup.leave_failed_save_title')"
      :description="$t('setup.leave_failed_save_description')"
    >
      <UButton color="neutral" variant="ghost" :disabled="saving">
        {{ $t('setup.leave_failed_save_action') }}
      </UButton>
      <template #footer="{ close }">
        <UButton color="neutral" variant="ghost" @click="close">
          {{ $t('common.cancel') }}
        </UButton>
        <UButton
          color="warning"
          variant="solid"
          :disabled="saving"
          @click="emit('finishAfterFailure')"
        >
          {{ $t('setup.leave_failed_save_action') }}
        </UButton>
      </template>
    </UModal>
  </section>
</template>
<script setup lang="ts">
  import { hasTraderLoyalty } from '@/features/dashboard/traderStanding';
  import SetupCatchUpTabs from '@/features/setup/SetupCatchUpTabs.vue';
  import SetupHideoutPicker from '@/features/setup/SetupHideoutPicker.vue';
  import {
    expandHideoutStationPrerequisites,
    isTaskEligibleForFaction,
    planSetupHideout,
    planSetupQuests,
  } from '@/features/setup/setupProgress';
  import SetupQuestPicker from '@/features/setup/SetupQuestPicker.vue';
  import SetupTradersPicker from '@/features/setup/SetupTradersPicker.vue';
  import { describeBlockedHideoutTiers } from '@/stores/tarkov/hideoutPrereqs';
  import { flushActiveProgressWrites } from '@/stores/tarkov/localStorage';
  import { progressSaveStatus } from '@/stores/tarkov/progressSaveStatus';
  import { captureStartupOwnership } from '@/stores/tarkov/startupOwnership';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useProgressStore } from '@/stores/useProgress';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { otherRequirementsSignature } from '@/utils/taskOtherRequirements';
  import {
    applyTaskTraderRequirements,
    completeTaskForProgress,
    ensureTaskMinPlayerLevel,
    recordImpliedStoryObjectives,
  } from '@/utils/taskProgress';
  const emit = defineEmits<{
    busy: [value: boolean];
    dirty: [value: boolean];
    saved: [];
    finishAfterFailure: [];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const metadata = useMetadataStore();
  const tarkov = useTarkovStore();
  const preferences = usePreferencesStore();
  const progress = useProgressStore();
  const mode = tarkov.getCurrentGameMode();
  const tabId = useId();
  const activeTab = ref<'quests' | 'traders' | 'hideout'>('quests');
  const choices = reactive(new Map<string, 'active' | 'completed'>());
  const levels = reactive(new Map<string, number>());
  const traderLevels = reactive(new Map<string, number>());
  const includePrerequisites = ref(true);
  const saving = ref(false);
  const saveFailed = ref(false);
  const saved = ref(false);
  const detailsLoading = ref(false);
  const saveMessage = computed(() => {
    if (saveFailed.value) return t('setup.save_failed');
    return saved.value ? t('setup.saved') : '';
  });
  const saveButtonLabel = computed(() =>
    t(saveFailed.value ? 'setup.retry_save' : 'setup.save_changes')
  );
  const saveMessageClass = computed(() =>
    saveFailed.value ? 'text-error-400' : 'text-success-400'
  );
  const catalogStatusText = computed(() =>
    t(metadata.loading ? 'setup.catalog_loading' : 'setup.catalog_unavailable')
  );
  const catalogReady = computed(
    () =>
      !metadata.loading &&
      !metadata.tasksCoreRefreshing &&
      metadata.tasksCoreGameMode === mode &&
      metadata.hideoutStations.length > 0
  );
  const currentFaction = computed(() => tarkov.getPMCFaction());
  const allTasks = computed(() => new Map(metadata.tasks.map((task) => [task.id, task])));
  const eligibleTasks = computed(
    () =>
      new Map(
        metadata.tasks
          .filter((task) => isTaskEligibleForFaction(task, currentFaction.value))
          .map((task) => [task.id, task])
      )
  );
  const questTraders = computed(() => {
    const entries = [...eligibleTasks.value.values()]
      .map((task) => task.trader)
      .filter((trader): trader is { id: string; name: string } =>
        Boolean(trader?.id && trader?.name)
      );
    return [...new Map(entries.map((trader) => [trader.id, trader.name])).entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  const loyaltyTraders = computed(() =>
    (metadata.traders ?? [])
      .filter((trader) => hasTraderLoyalty(trader))
      .map((trader) => {
        const maxLevel = Math.max(0, ...(trader.levels ?? []).map((entry) => entry.level)) || 4;
        return {
          id: trader.id,
          name: trader.name,
          imageLink: trader.imageLink,
          levels: Array.from({ length: maxLevel }, (_, idx) => idx + 1),
          currentLevel: traderLevels.get(trader.id) ?? tarkov.getTraderLevel(trader.id),
        };
      })
  );
  const readCompletion = (id: string) => tarkov.getCurrentProgressData().taskCompletions?.[id];
  const stations = computed(() =>
    metadata.hideoutStations
      .map((station) => {
        const current = progress.hideoutLevels[station.id]?.self ?? 0;
        const available = station.levels
          .map((level) => level.level)
          .filter((level) => level > current);
        const options = [current, ...available].map((value) => ({
          label: t(value ? 'setup.station_level' : 'setup.station_unbuilt', { level: value }),
          value,
        }));
        return {
          id: station.id,
          name: station.name,
          imageLink: station.imageLink,
          current,
          options,
          disabled: saving.value || options.length < 2,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name))
  );
  const plan = computed(() => planSetupQuests(allTasks.value, choices, readCompletion));
  const upgrades = computed(() =>
    planSetupHideout(metadata.hideoutStations, levels, tarkov.isHideoutModuleComplete)
  );
  const questCompletions = computed(() =>
    includePrerequisites.value
      ? [...plan.value.completed, ...plan.value.suggested]
      : plan.value.completed
  );
  const plannedTraderEntries = computed(() =>
    [...traderLevels.entries()].filter(([id, level]) => tarkov.getTraderLevel(id) !== level)
  );
  const plannedTraderRecord = computed(() => Object.fromEntries(plannedTraderEntries.value));
  const tabs = computed(() => {
    const definitions = [
      {
        id: 'quests' as const,
        label: t('common.tasks'),
        icon: 'i-mdi-checkbox-multiple-marked-outline',
        count: choices.size,
      },
      {
        id: 'traders' as const,
        label: t('setup.traders_tab'),
        icon: 'i-mdi-account-group-outline',
        count: plannedTraderEntries.value.length,
      },
      {
        id: 'hideout' as const,
        label: t('setup.hideout_title'),
        icon: 'i-mdi-home-outline',
        count: upgrades.value.length,
      },
    ];
    return definitions.map((def) => {
      const active = activeTab.value === def.id;
      return {
        ...def,
        active,
        color: (active ? 'primary' : 'neutral') as 'primary' | 'neutral',
        variant: (active ? 'solid' : 'ghost') as 'solid' | 'ghost',
        badgeColor: (active ? 'neutral' : 'primary') as 'neutral' | 'primary',
      };
    });
  });
  const hasChanges = computed(
    () =>
      questCompletions.value.length > 0 ||
      plan.value.active.length > 0 ||
      upgrades.value.length > 0 ||
      plannedTraderEntries.value.length > 0
  );
  const showClearButton = computed(() => hasChanges.value && !saveFailed.value);
  const blockedDetails = computed(() => {
    if (!metadata.tasksRewardsHydrated) return [];
    return describeBlockedHideoutTiers(tarkov, {
      moduleIds: upgrades.value.map((level) => level.id),
      questIds: questCompletions.value,
      traderLevels: plannedTraderRecord.value,
    });
  });
  const detailsReady = computed(
    () => metadata.tasksObjectivesHydrated && metadata.tasksRewardsHydrated
  );
  // Trader and active quest writes can enforce hideout gates that depend on quest rewards.
  const waitingForDetails = computed(() => hasChanges.value && !detailsReady.value);
  const detailMessage = computed(() =>
    t(detailsLoading.value ? 'setup.details_loading' : 'setup.details_unavailable')
  );
  const hasSaveableDraft = computed(
    () => hasChanges.value && !waitingForDetails.value && !blockedDetails.value.length
  );
  const canRetrySave = computed(() => saveFailed.value && !hasChanges.value);
  const canSave = computed(() => !saving.value && (hasSaveableDraft.value || canRetrySave.value));
  function setTraderLevelDraft(traderId: string, level: number) {
    if (tarkov.getTraderLevel(traderId) === level) {
      traderLevels.delete(traderId);
      return;
    }
    traderLevels.set(traderId, level);
  }
  function setStationLevel(stationId: string, level: number) {
    const current = progress.hideoutLevels[stationId]?.self ?? 0;
    if (level <= current) {
      levels.delete(stationId);
      return;
    }
    levels.set(stationId, level);
  }
  function includeStationPrereqs() {
    const expanded = expandHideoutStationPrerequisites(
      metadata.hideoutStations,
      levels,
      (stationId) => progress.hideoutLevels[stationId]?.self ?? 0
    );
    expanded.forEach((level, stationId) => levels.set(stationId, level));
  }
  async function loadTaskDetails() {
    if (detailsLoading.value || detailsReady.value || !catalogReady.value) return;
    detailsLoading.value = true;
    try {
      await Promise.allSettled([
        metadata.fetchTaskObjectivesData(),
        metadata.fetchTaskRewardsData(),
      ]);
    } finally {
      detailsLoading.value = false;
    }
  }
  watch([catalogReady, () => metadata.tasksCoreRevision], () => void loadTaskDetails(), {
    immediate: true,
  });
  function clearDraft() {
    choices.clear();
    levels.clear();
    traderLevels.clear();
    includePrerequisites.value = true;
  }
  watchEffect(() => emit('dirty', hasChanges.value || saveFailed.value));
  watch(hasChanges, (dirty) => {
    if (dirty) saved.value = false;
  });
  function setChoice(id: string, status: 'active' | 'completed') {
    choices.set(id, status);
  }
  function applySelectedTraders() {
    for (const [traderId, level] of plannedTraderEntries.value) {
      tarkov.setTraderLevel(traderId, level);
    }
  }
  function applySelectedQuests() {
    const active = plan.value.active;
    questCompletions.value.forEach((id) =>
      completeTaskForProgress({ store: tarkov, taskId: id, tasksMap: allTasks.value })
    );
    active.forEach((id) => tarkov.setTaskActive(id));
    const completions = tarkov.getCurrentProgressData().taskCompletions;
    active.forEach((id) => {
      const task = allTasks.value.get(id);
      if (!task) return;
      ensureTaskMinPlayerLevel(tarkov, task);
      if (preferences.getTasksRequireTraderLevels)
        applyTaskTraderRequirements({ store: tarkov, task });
      const signature = otherRequirementsSignature(task, completions);
      if (signature) tarkov.confirmTaskAvailability(id, signature);
      recordImpliedStoryObjectives(tarkov, task);
    });
  }
  function applySelectedUpgrades() {
    for (const level of upgrades.value) {
      tarkov.setHideoutModuleComplete(level.id);
      level.itemRequirements.forEach((item) => tarkov.setHideoutPartComplete(item.id));
    }
  }
  const canApply = () =>
    canSave.value && catalogReady.value && tarkov.getCurrentGameMode() === mode;
  async function saveDraft(ownsSession: () => boolean) {
    applySelectedTraders();
    applySelectedQuests();
    applySelectedUpgrades();
    const cloudSaved = await tarkov.saveProgressNow();
    await flushActiveProgressWrites();
    if (!ownsSession()) return;
    saveFailed.value = !cloudSaved || progressSaveStatus.local === 'failed';
    if (saveFailed.value) return;
    clearDraft();
    saved.value = true;
    emit('saved');
  }
  async function apply() {
    if (!canApply()) return;
    const ownsSession = captureStartupOwnership();
    saving.value = true;
    emit('busy', true);
    try {
      if (saveFailed.value && progressSaveStatus.local === 'failed') tarkov.$persist();
      await saveDraft(ownsSession);
    } finally {
      saving.value = false;
      emit('busy', false);
    }
  }
</script>
