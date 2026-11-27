<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-surface-200 text-xs font-semibold">
        {{ $t('settings.tarkov_dev_import.multi_preview_title') }}
      </p>
      <span v-if="readyModes.length > 0" class="text-surface-400 text-xs">
        {{
          $t('settings.tarkov_dev_import.multi_preview_selected_count', {
            selected: selectedModes.length,
            total: readyModes.length,
          })
        }}
      </span>
    </div>
    <div class="grid gap-3" :class="gridColumnsClass">
      <div
        v-for="row in modeRows"
        :key="row.mode"
        :data-testid="`tarkov-dev-mode-card-${row.mode}`"
        class="bg-surface-900/80 flex min-w-0 flex-col gap-3 rounded-lg border p-3"
        :class="row.cardClass"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2">
            <UCheckbox
              v-if="row.ready"
              :model-value="selectedModes.includes(row.mode)"
              :disabled="isImporting"
              :aria-label="$t('settings.tarkov_dev_import.include_mode_aria', { mode: row.label })"
              @update:model-value="toggleSelectedMode(row.mode, Boolean($event))"
            />
            <GameModeBadge :mode="row.mode" class="-my-1.5" :class="row.badgeIconClass" />
            <span class="text-surface-100 truncate text-sm font-semibold">
              {{ row.label }}
            </span>
          </div>
          <UBadge :color="row.badgeColor" variant="subtle" size="sm" class="shrink-0">
            {{ row.badgeLabel }}
          </UBadge>
        </div>
        <TarkovDevModeReadyBody
          v-if="row.ready"
          :display-name="row.ready.displayName"
          :pmc-faction="row.ready.pmcFaction"
          :level="row.ready.level"
          :prestige-level="row.ready.prestigeLevel"
          :show-prestige="row.mode !== GAME_MODES.SEASONAL"
          :edition-label="row.ready.editionLabel"
          :updated-label="row.ready.updatedLabel"
          :updated-tooltip="row.ready.updatedTooltip"
          :updated-iso="row.ready.updatedIso"
          :is-aging="row.ready.isAging"
          :skills="row.ready.skills"
          :profile-url="row.profileUrl"
          :refreshing="refreshingMode === row.mode"
          :refresh-disabled="refreshDisabled || refreshingMode !== null"
          @refetch="emit('refetchMode', row.mode)"
        />
        <TarkovDevModeStatusBody
          v-else-if="row.nonReady"
          :status="row.nonReady.status"
          :message="row.nonReady.message"
          :profile-url="row.profileUrl"
          :refreshing="refreshingMode === row.mode"
          :refresh-disabled="refreshDisabled || refreshingMode !== null"
          @refetch="emit('refetchMode', row.mode)"
          @allow-stale="emit('allowStaleMode', row.mode)"
        />
      </div>
    </div>
    <div class="flex gap-2">
      <UButton
        variant="soft"
        color="neutral"
        class="flex-1"
        :disabled="actionsLocked"
        @click="emit('cancel')"
      >
        {{ $t('common.cancel') }}
      </UButton>
      <UButton
        icon="i-mdi-check"
        color="primary"
        variant="solid"
        class="flex-1"
        :loading="isImporting"
        :disabled="confirmDisabled"
        @click="emit('confirm', [...selectedModes])"
      >
        {{
          selectedModes.length > 1
            ? $t('settings.tarkov_dev_import.confirm_import_count', {
                count: selectedModes.length,
              })
            : $t('common.confirm_import')
        }}
      </UButton>
    </div>
  </div>
</template>
<script setup lang="ts">
  import GameModeBadge from '@/components/GameModeBadge.vue';
  import TarkovDevModeReadyBody from '@/features/settings/TarkovDevModeReadyBody.vue';
  import TarkovDevModeStatusBody from '@/features/settings/TarkovDevModeStatusBody.vue';
  import {
    GAME_MODES,
    getGameModeLabel,
    sortSkillsByGameOrder,
    type GameMode,
    type PMCFaction,
  } from '@/utils/constants';
  import { buildTarkovDevProfileUrl } from '@/utils/tarkovDevProfileUrl';
  import type {
    TarkovDevModeFetchStatus,
    TarkovDevMultiModePreview,
  } from '@/composables/useTarkovDevImport';
  const DAY_MS = 86_400_000;
  const AGE_WARNING_DAYS = 2;
  type ReadyRowData = {
    displayName: string;
    pmcFaction: PMCFaction;
    level: number;
    prestigeLevel: number;
    editionLabel: string;
    updatedLabel: string;
    updatedTooltip: string | null;
    updatedIso?: string;
    isAging: boolean;
    skills: Array<{ id: string; value: number }>;
  };
  type NonReadyRowData = {
    status: 'stale' | 'not_found' | 'cooldown' | 'error';
    message: string;
  };
  type ModeRow = {
    mode: GameMode;
    label: string;
    profileUrl?: string;
    cardClass: string;
    badgeIconClass: string;
    badgeColor: 'success' | 'warning' | 'neutral' | 'error';
    badgeLabel: string;
    ready: ReadyRowData | null;
    nonReady: NonReadyRowData | null;
  };
  const props = defineProps<{
    preview: TarkovDevMultiModePreview;
    now: number;
    playerLevels: ReadonlyArray<{ level: number; exp: number }>;
    editions: ReadonlyArray<{ value: number; title: string }>;
    isImporting: boolean;
    refreshDisabled: boolean;
    refreshingMode: GameMode | null;
    formatDate: (timestamp: number) => string;
    formatRelativeTime: (timestamp: number, nowMs: number) => string;
  }>();
  const emit = defineEmits<{
    confirm: [modes: GameMode[]];
    cancel: [];
    refetchMode: [mode: GameMode];
    allowStaleMode: [mode: GameMode];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const readyModes = computed(() =>
    props.preview.requestedModes.filter((mode) => props.preview.modes[mode]?.status === 'ok')
  );
  const selectedModes = ref<GameMode[]>([]);
  watch(
    readyModes,
    (nextReady, previousReady) => {
      const prevSet = new Set(previousReady ?? []);
      const retained = selectedModes.value.filter((mode) => nextReady.includes(mode));
      const newlyReady = nextReady.filter((mode) => !prevSet.has(mode));
      selectedModes.value = Array.from(new Set([...retained, ...newlyReady]));
    },
    { immediate: true }
  );
  const actionsLocked = computed(() => props.isImporting || props.refreshingMode !== null);
  const confirmDisabled = computed(() => actionsLocked.value || selectedModes.value.length === 0);
  const gridColumnsClass = computed(() => {
    const count = modeRows.value.length;
    if (count >= 3) return 'grid-cols-1 md:grid-cols-3';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2';
    return 'grid-cols-1';
  });
  function toggleSelectedMode(mode: GameMode, checked: boolean) {
    if (checked) {
      if (!selectedModes.value.includes(mode)) {
        selectedModes.value = [...selectedModes.value, mode];
      }
      return;
    }
    selectedModes.value = selectedModes.value.filter((entry) => entry !== mode);
  }
  function deriveLevel(totalXP: number): number {
    for (let i = props.playerLevels.length - 1; i >= 0; i--) {
      const level = props.playerLevels[i];
      if (level && totalXP >= level.exp) return level.level;
    }
    return 1;
  }
  function getEditionLabel(editionValue: number | null): string {
    if (editionValue === null) return '';
    const match = props.editions.find((edition) => edition.value === editionValue);
    return (
      match?.title ?? t('settings.game_profile.game_edition_with_value', { edition: editionValue })
    );
  }
  function resolveBadge(
    entry: TarkovDevModeFetchStatus,
    isAging: boolean
  ): { color: 'success' | 'warning' | 'neutral' | 'error'; label: string } {
    if (entry.status === 'ok') {
      if (entry.staleAccepted) {
        return { color: 'warning', label: t('settings.tarkov_dev_import.mode_status_stale_ok') };
      }
      return isAging
        ? { color: 'warning', label: t('settings.tarkov_dev_import.mode_status_aging') }
        : { color: 'success', label: t('settings.tarkov_dev_import.mode_status_ready') };
    }
    if (entry.status === 'stale') {
      return {
        color: 'warning',
        label: t('settings.tarkov_dev_import.mode_status_stale', { days: entry.ageDays }),
      };
    }
    if (entry.status === 'not_found') {
      return { color: 'neutral', label: t('settings.tarkov_dev_import.mode_status_not_cached') };
    }
    if (entry.status === 'cooldown') {
      return { color: 'neutral', label: t('settings.tarkov_dev_import.mode_status_cooldown') };
    }
    return { color: 'error', label: t('settings.tarkov_dev_import.mode_status_error') };
  }
  function buildNonReadyMessage(
    entry: Exclude<TarkovDevModeFetchStatus, { status: 'ok' }>
  ): string {
    if (entry.status === 'stale') {
      return t('settings.tarkov_dev_import.multi_mode_stale_hint');
    }
    if (entry.status === 'not_found') {
      return t('settings.tarkov_dev_import.multi_mode_not_found_hint');
    }
    if (entry.status === 'cooldown') {
      return t('settings.tarkov_dev_import.cooldown_hint', { minutes: entry.minutes });
    }
    return t('settings.tarkov_dev_import.multi_mode_error_hint');
  }
  function buildReadyRow(
    mode: GameMode,
    label: string,
    profileUrl: string | undefined,
    entry: Extract<TarkovDevModeFetchStatus, { status: 'ok' }>
  ): ModeRow {
    const updatedAt = entry.data.updatedAt;
    const ageDays =
      updatedAt !== null ? Math.max(0, Math.floor((props.now - updatedAt) / DAY_MS)) : null;
    const isAging = (ageDays ?? 0) >= AGE_WARNING_DAYS;
    const badge = resolveBadge(entry, isAging);
    const skills = sortSkillsByGameOrder(
      Object.entries(entry.data.skills).map(([id, value]) => ({ id, name: id, value }))
    ).map(({ id, value }) => ({ id, value }));
    return {
      mode,
      label,
      profileUrl,
      cardClass: selectedModes.value.includes(mode)
        ? 'border-primary-500/45'
        : 'border-white/10 opacity-80',
      badgeIconClass: '',
      badgeColor: badge.color,
      badgeLabel: badge.label,
      ready: {
        displayName: entry.data.displayName,
        pmcFaction: entry.data.pmcFaction,
        level: deriveLevel(entry.data.totalXP),
        prestigeLevel: entry.data.prestigeLevel,
        editionLabel: getEditionLabel(entry.data.gameEditionGuess),
        updatedLabel: updatedAt
          ? props.formatRelativeTime(updatedAt, props.now)
          : t('settings.tarkov_dev_import.last_refreshed_unknown'),
        updatedTooltip: updatedAt ? props.formatDate(updatedAt) : null,
        updatedIso: updatedAt ? new Date(updatedAt).toISOString() : undefined,
        isAging,
        skills,
      },
      nonReady: null,
    };
  }
  function buildModeRow(mode: GameMode): ModeRow | null {
    const entry = props.preview.modes[mode];
    if (!entry) return null;
    const label = t(getGameModeLabel(mode));
    const profileUrl = buildTarkovDevProfileUrl(props.preview.tarkovUid, mode);
    if (entry.status === 'ok') return buildReadyRow(mode, label, profileUrl, entry);
    const badge = resolveBadge(entry, false);
    return {
      mode,
      label,
      profileUrl,
      cardClass: entry.status === 'stale' ? 'border-warning-500/35' : 'border-white/10 opacity-90',
      badgeIconClass: 'opacity-75',
      badgeColor: badge.color,
      badgeLabel: badge.label,
      ready: null,
      nonReady: { status: entry.status, message: buildNonReadyMessage(entry) },
    };
  }
  const modeRows = computed(() =>
    props.preview.requestedModes.map(buildModeRow).filter((row): row is ModeRow => row !== null)
  );
</script>
