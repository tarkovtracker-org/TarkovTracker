<template>
  <div class="space-y-4">
    <div
      v-if="view === 'tarkov-dev'"
      class="flex flex-wrap items-center gap-1.5"
      :aria-label="$t('setup.tarkov_dev_fills_label')"
    >
      <span class="text-surface-400 text-xs font-medium">
        {{ $t('setup.tarkov_dev_fills_label') }}
      </span>
      <UBadge
        v-for="badge in tarkovDevFillBadges"
        :key="badge"
        color="info"
        variant="subtle"
        size="sm"
      >
        {{ $t(badge) }}
      </UBadge>
    </div>
    <div
      v-if="showImportedProfileBanner"
      class="bg-success-500/8 border-success-500/25 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-xs"
    >
      <span class="text-surface-200 flex items-center gap-2">
        <UIcon name="i-mdi-check-circle" class="text-success-400 size-4 shrink-0" />
        <span>{{ importedProfileSummary }}</span>
      </span>
      <UButton color="neutral" variant="ghost" size="xs" @click="emit('editProfile')">
        {{ $t('setup.edit_profile_link') }}
      </UButton>
    </div>
    <DataManagementCard
      :key="view"
      :session="session"
      :view="view"
      :restore-only="true"
      @tarkov-dev-imported="emit('tarkovDevImported', $event)"
    />
    <div
      v-if="showEditionFallbackCard"
      class="bg-surface-900/90 space-y-2 rounded-xl border border-white/10 p-4"
    >
      <label for="setup-inline-edition" class="text-surface-100 block text-xs font-semibold">
        {{ $t('setup.inline_edition_prompt') }}
      </label>
      <SelectMenuFixed
        id="setup-inline-edition"
        v-model="selectedGameEdition"
        :items="gameEditionOptions"
        value-key="value"
        :placeholder="$t('setup.ready.edition_fallback')"
        size="sm"
        class="max-w-sm"
      />
    </div>
    <div v-if="modeSwitchFailed" class="flex flex-wrap items-center gap-2" role="alert">
      <p class="text-warning text-sm">{{ $t('setup.import_mode_switch_failed') }}</p>
      <UButton color="warning" variant="soft" @click="emit('retryModeSwitch')">
        {{ $t('common.retry') }}
      </UButton>
    </div>
    <div
      v-if="!previewVisible"
      class="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-4"
    >
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-mdi-arrow-left"
        :disabled="busy"
        @click="emit('back')"
      >
        {{ $t('setup.back') }}
      </UButton>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          v-if="view === 'eft-logs'"
          color="neutral"
          variant="soft"
          :disabled="busy"
          @click="emit('finishFromLogs')"
        >
          {{ $t('setup.skip_catch_up_finish') }}
        </UButton>
        <UButton
          :color="advanceButtonColor"
          :variant="advanceButtonVariant"
          :trailing-icon="advanceButtonIcon"
          :disabled="busy || advanceDisabled"
          @click="emit('advance')"
        >
          {{ primaryLabel }}
        </UButton>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import DataManagementCard from '@/features/settings/DataManagementCard.vue';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { getGameModeLabel, type GameMode } from '@/utils/constants';
  import type { DataManagementSession } from '@/features/settings/useDataManagementSession';
  const props = defineProps<{
    view: 'backup' | 'tarkov-dev' | 'eft-logs';
    session: DataManagementSession;
    mode: GameMode;
    tarkovDevImportedCount: number;
    editionResolvedByImport: boolean;
    sourceImported: boolean;
    previewVisible: boolean;
    busy: boolean;
    advanceDisabled: boolean;
    modeSwitchFailed: boolean;
    primaryLabel: string;
  }>();
  const emit = defineEmits<{
    back: [];
    advance: [];
    finishFromLogs: [];
    editProfile: [];
    retryModeSwitch: [];
    tarkovDevImported: [payload: { mode: GameMode; modes?: GameMode[]; editionResolved: boolean }];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const tarkov = useTarkovStore();
  const metadata = useMetadataStore();
  const tarkovDevFillBadges = [
    'setup.fills.mode',
    'setup.fills.level',
    'setup.fills.faction',
    'setup.fills.edition',
    'setup.fills.skills',
  ] as const;
  const showImportedProfileBanner = computed(
    () => props.view === 'eft-logs' && props.tarkovDevImportedCount > 0
  );
  const showEditionFallbackCard = computed(
    () =>
      props.view === 'tarkov-dev' &&
      props.tarkovDevImportedCount > 0 &&
      !props.editionResolvedByImport
  );
  const advanceButtonColor = computed(() => (props.sourceImported ? 'primary' : 'neutral'));
  const advanceButtonVariant = computed(() => (props.sourceImported ? 'solid' : 'soft'));
  const advanceButtonIcon = computed(() =>
    props.sourceImported ? 'i-mdi-arrow-right' : undefined
  );
  const importedProfileSummary = computed(() =>
    t('setup.profile_imported_summary', {
      mode: t(getGameModeLabel(props.mode)),
      faction: tarkov.getPMCFaction(),
      level: tarkov.playerLevel(),
    })
  );
  const gameEditionOptions = computed(() =>
    metadata.editions.map((edition) => ({
      label: edition.title,
      value: edition.value,
    }))
  );
  const selectedGameEdition = computed({
    get: () => tarkov.getGameEdition() || 1,
    set: (value: number) => tarkov.setGameEdition(value || 1),
  });
</script>
