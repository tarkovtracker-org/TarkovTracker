<template>
  <section class="space-y-5" :aria-label="$t('setup.steps.review')">
    <details class="border-surface-700 space-y-3 rounded-lg border p-4">
      <summary class="cursor-pointer font-semibold">{{ $t('setup.edit_level') }}</summary>
      <PlayerLevelField />
    </details>
    <div v-if="!catalogReady" class="text-surface-400 text-sm" role="status">
      {{ $t(metadata.loading ? 'setup.catalog_loading' : 'setup.catalog_unavailable') }}
    </div>
    <template v-else>
      <SetupQuestPicker
        v-model:include-prerequisites="includePrerequisites"
        :choices="choices"
        :tasks="tasks"
        :suggested="plan.suggested"
        :saving="saving"
        @change="setChoice"
        @remove="choices.delete($event)"
      />
      <section class="border-surface-700 space-y-3 rounded-lg border p-4">
        <h3 class="font-semibold">{{ $t('setup.hideout_title') }}</h3>
        <p class="text-surface-400 text-sm">{{ $t('setup.hideout_help') }}</p>
        <div class="grid gap-x-4 gap-y-2 sm:grid-cols-2">
          <UFormField v-for="station in stations" :key="station.id" :label="station.name">
            <USelect
              class="w-full"
              :model-value="levels.get(station.id) ?? station.current"
              :items="station.options"
              :disabled="station.disabled"
              @update:model-value="levels.set(station.id, $event)"
            />
          </UFormField>
        </div>
      </section>
      <div class="flex flex-wrap items-center gap-3">
        <UButton :disabled="!canSave" :loading="saving" icon="i-mdi-check" @click="apply">
          {{ $t(saveFailed ? 'setup.retry_save' : 'setup.save_changes') }}
        </UButton>
        <UButton
          v-if="hasChanges && !saveFailed"
          variant="ghost"
          :disabled="saving"
          @click="clearDraft"
        >
          {{ $t('setup.clear_selections') }}
        </UButton>
        <output
          :hidden="!saveMessage"
          class="text-sm"
          :class="saveFailed ? 'text-error-400' : 'text-success-400'"
        >
          {{ saveMessage }}
        </output>
      </div>
    </template>
  </section>
</template>
<script setup lang="ts">
  import PlayerLevelField from '@/features/settings/PlayerLevelField.vue';
  import { planSetupHideout, planSetupQuests } from '@/features/setup/setupProgress';
  import SetupQuestPicker from '@/features/setup/SetupQuestPicker.vue';
  import { flushActiveProgressWrites } from '@/stores/tarkov/localStorage';
  import { progressSaveStatus } from '@/stores/tarkov/progressSaveStatus';
  import { captureStartupOwnership } from '@/stores/tarkov/startupOwnership';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { useProgressStore } from '@/stores/useProgress';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { otherRequirementsSignature } from '@/utils/taskOtherRequirements';
  import { completeTaskForProgress } from '@/utils/taskProgress';
  const emit = defineEmits<{ busy: [value: boolean]; dirty: [value: boolean]; saved: [] }>();
  const { t } = useI18n({ useScope: 'global' });
  const metadata = useMetadataStore();
  const tarkov = useTarkovStore();
  const progress = useProgressStore();
  const mode = tarkov.getCurrentGameMode();
  const choices = reactive(new Map<string, 'active' | 'completed'>());
  const levels = reactive(new Map<string, number>());
  const includePrerequisites = ref(false);
  const saving = ref(false);
  const saveFailed = ref(false);
  const saved = ref(false);
  const saveMessage = computed(() => {
    if (saveFailed.value) return t('setup.save_failed');
    return saved.value ? t('setup.saved') : '';
  });
  const catalogReady = computed(
    () =>
      !metadata.loading &&
      metadata.tasksCoreGameMode === mode &&
      metadata.hideoutStations.length > 0
  );
  const tasks = computed(() => new Map(metadata.tasks.map((task) => [task.id, task])));
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
        return { ...station, current, options, disabled: saving.value || options.length < 2 };
      })
      .sort((left, right) => left.name.localeCompare(right.name))
  );
  const plan = computed(() => planSetupQuests(tasks.value, choices, readCompletion));
  const upgrades = computed(() =>
    planSetupHideout(metadata.hideoutStations, levels, tarkov.isHideoutModuleComplete)
  );
  const questCompletions = computed(() =>
    includePrerequisites.value
      ? [...plan.value.completed, ...plan.value.suggested]
      : plan.value.completed
  );
  const hasChanges = computed(() =>
    [questCompletions.value, plan.value.active, upgrades.value].some(
      (changes) => changes.length > 0
    )
  );
  const canSave = computed(() => !saving.value && (hasChanges.value || saveFailed.value));
  function clearDraft() {
    choices.clear();
    levels.clear();
    includePrerequisites.value = false;
  }
  watchEffect(() => emit('dirty', hasChanges.value || saveFailed.value));
  function setChoice(id: string, status: 'active' | 'completed') {
    choices.set(id, status);
  }
  function applySelectedQuests() {
    questCompletions.value.forEach((id) =>
      completeTaskForProgress({ store: tarkov, taskId: id, tasksMap: tasks.value })
    );
    plan.value.active.forEach((id) => {
      tarkov.setTaskUncompleted(id);
      const task = tasks.value.get(id);
      const signature = task && otherRequirementsSignature(task);
      if (signature) tarkov.confirmTaskAvailability(id, signature);
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
