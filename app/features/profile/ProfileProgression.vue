<template>
  <div class="min-h-[calc(100vh-250px)] px-3 py-6 sm:px-6">
    <div class="mx-auto max-w-[1400px] space-y-4 sm:space-y-6">
      <section
        class="bg-surface-900 relative overflow-hidden rounded-xl border border-white/10 p-4 shadow-md sm:p-6"
      >
        <div class="pointer-events-none absolute inset-0" :class="modeTheme.heroBackdrop"></div>
        <div class="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex items-start gap-3 sm:gap-4">
            <div
              class="ring-default bg-surface-800 flex h-14 w-14 shrink-0 items-center justify-center rounded-lg ring-1 sm:h-16 sm:w-16"
              :class="modeTheme.iconTint"
            >
              <UIcon :name="modeTheme.icon" class="h-7 w-7 sm:h-8 sm:w-8" />
            </div>
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <h1 class="text-xl font-bold text-white sm:text-2xl">{{ displayName }}</h1>
                <UBadge variant="soft" size="sm" :class="modeTheme.modeBadgeClass">
                  {{ modeLabel }}
                </UBadge>
                <UBadge v-if="isViewingSharedProfile" color="info" variant="soft" size="sm">
                  {{ t('page.profile.shared_view', 'Shared View') }}
                </UBadge>
                <UBadge color="neutral" variant="soft" size="sm">
                  {{ modeFaction }}
                </UBadge>
              </div>
              <p class="text-surface-300 text-sm sm:text-base">
                {{ storyHeadline }}
              </p>
              <p class="text-surface-400 text-xs sm:text-sm">
                {{ storySubline }}
              </p>
            </div>
          </div>
          <div class="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[340px]">
            <div
              class="flex overflow-hidden rounded-md border border-white/10"
              role="group"
              :aria-label="t('page.profile.mode_toggle_label', 'Select profile mode')"
            >
              <button
                type="button"
                class="focus:ring-pvp-400 flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-xs font-semibold uppercase transition-colors focus:z-10 focus:ring-2 focus:outline-none"
                :class="pvpToggleClass"
                @click="selectedMode = GAME_MODES.PVP"
              >
                <UIcon name="i-mdi-sword-cross" class="h-3.5 w-3.5" />
                PvP
              </button>
              <button
                type="button"
                class="focus:ring-pve-400 flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-xs font-semibold uppercase transition-colors focus:z-10 focus:ring-2 focus:outline-none"
                :class="pveToggleClass"
                @click="selectedMode = GAME_MODES.PVE"
              >
                <UIcon name="i-mdi-account-group" class="h-3.5 w-3.5" />
                PvE
              </button>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                icon="i-mdi-content-copy"
                color="primary"
                variant="solid"
                size="sm"
                class="flex-1 sm:flex-none"
                @click="copyProfileSnapshot"
              >
                {{ t('page.profile.copy_snapshot', 'Copy Snapshot') }}
              </UButton>
              <UButton
                v-if="!isViewingSharedProfile"
                icon="i-mdi-clipboard-text-search-outline"
                color="neutral"
                variant="soft"
                size="sm"
                class="flex-1 sm:flex-none"
                @click="router.push('/tasks')"
              >
                {{ t('page.profile.view_tasks', 'Open Tasks') }}
              </UButton>
            </div>
            <p class="text-surface-500 truncate text-[11px]">{{ shareUrl }}</p>
            <p class="text-surface-400 text-[11px]">{{ shareAccessLabel }}</p>
          </div>
        </div>
      </section>
      <UAlert
        v-if="isViewingSharedProfile && sharedProfileLoading"
        icon="i-mdi-loading"
        color="info"
        variant="soft"
        :title="t('page.profile.loading_shared_profile', 'Loading shared profile...')"
      />
      <UAlert
        v-else-if="sharedProfileError"
        icon="i-mdi-lock-alert-outline"
        color="warning"
        variant="soft"
        :title="sharedProfileError"
      />
      <UAlert
        v-else-if="showMetadataHint"
        icon="i-mdi-database-sync"
        color="info"
        variant="soft"
        :title="t('page.profile.loading_data', 'Loading progression metadata...')"
      />
      <template v-if="canRenderProfileContent">
        <section class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article
            v-for="card in statCards"
            :key="card.id"
            class="bg-surface-900 rounded-lg border border-white/10 p-4"
          >
            <div class="mb-3 flex items-center justify-between gap-2">
              <div class="text-surface-400 text-xs font-semibold tracking-wider uppercase">
                {{ card.label }}
              </div>
              <div
                class="flex h-8 w-8 items-center justify-center rounded-md"
                :class="statToneClasses[card.tone].chip"
              >
                <UIcon
                  :name="card.icon"
                  class="h-4.5 w-4.5"
                  :class="statToneClasses[card.tone].icon"
                />
              </div>
            </div>
            <div class="text-xl font-bold text-white">{{ card.value }}</div>
            <div class="text-surface-400 mt-0.5 text-xs">{{ card.meta }}</div>
            <div class="bg-surface-800/60 mt-3 h-1.5 overflow-hidden rounded-full">
              <div
                class="h-full rounded-full transition-[width] duration-300"
                :class="statToneClasses[card.tone].bar"
                :style="{ width: `${card.percentage.toFixed(2)}%` }"
              ></div>
            </div>
          </article>
        </section>
        <div class="grid gap-4 xl:grid-cols-3">
          <div class="space-y-4 xl:col-span-2">
            <GenericCard
              icon="i-mdi-timeline-clock"
              :highlight-color="modeTheme.timelineHighlight"
              :title="t('page.profile.activity_timeline', 'Activity Timeline')"
              :subtitle="
                t('page.profile.timeline_subtitle', 'Recent progress events from timestamps')
              "
              :fill-height="false"
            >
              <template #content>
                <div class="space-y-3 p-4">
                  <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div class="bg-surface-900/80 rounded-md border border-white/10 p-2.5">
                      <div
                        class="text-surface-500 text-[11px] font-semibold tracking-wider uppercase"
                      >
                        {{ t('page.profile.started', 'Started') }}
                      </div>
                      <div class="text-surface-100 mt-1 text-sm font-medium">
                        {{ firstProgressLabel }}
                      </div>
                    </div>
                    <div class="bg-surface-900/80 rounded-md border border-white/10 p-2.5">
                      <div
                        class="text-surface-500 text-[11px] font-semibold tracking-wider uppercase"
                      >
                        {{ t('page.profile.latest_activity', 'Latest Activity') }}
                      </div>
                      <div class="text-surface-100 mt-1 text-sm font-medium">
                        {{ latestProgressLabel }}
                      </div>
                    </div>
                    <div class="bg-surface-900/80 rounded-md border border-white/10 p-2.5">
                      <div
                        class="text-surface-500 text-[11px] font-semibold tracking-wider uppercase"
                      >
                        {{ t('page.profile.recent_momentum', '7-Day Momentum') }}
                      </div>
                      <div class="text-surface-100 mt-1 text-sm font-medium">
                        {{
                          t(
                            'page.profile.recent_momentum_value',
                            `${formatNumber(recentCompletedTasks)} tasks completed`
                          )
                        }}
                      </div>
                    </div>
                  </div>
                  <div v-if="timelineEvents.length" class="space-y-2">
                    <article
                      v-for="event in timelineEvents"
                      :key="event.key"
                      class="bg-surface-900/70 flex items-start gap-3 rounded-md border border-white/8 p-3"
                    >
                      <div
                        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                        :class="timelineToneClasses[event.tone].chip"
                      >
                        <UIcon
                          :name="event.icon"
                          class="h-4 w-4"
                          :class="timelineToneClasses[event.tone].icon"
                        />
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="text-surface-100 truncate text-sm font-medium">
                          {{ event.title }}
                        </div>
                        <div class="text-surface-400 truncate text-xs">
                          {{ event.subtitle }}
                        </div>
                      </div>
                      <div class="text-surface-500 shrink-0 text-[11px]">
                        {{ formatDateTime(event.timestamp) }}
                      </div>
                    </article>
                  </div>
                  <UAlert
                    v-else
                    icon="i-mdi-map-marker-question"
                    color="neutral"
                    variant="soft"
                    :title="
                      t('page.profile.no_timeline', 'No timestamped activity yet for this mode.')
                    "
                  />
                </div>
              </template>
            </GenericCard>
          </div>
          <div class="space-y-4">
            <GenericCard
              icon="i-mdi-book-open-variant"
              :highlight-color="modeTheme.storyHighlight"
              :title="t('page.profile.progress_overview', 'Progress Overview')"
              :subtitle="t('page.profile.progress_overview_subtitle', 'Journey summary and pacing')"
              :fill-height="false"
            >
              <template #content>
                <div class="space-y-3 p-4 text-sm">
                  <p class="text-surface-200 leading-relaxed">
                    {{ storyParagraph }}
                  </p>
                  <div class="bg-surface-900/80 rounded-md border border-white/10 p-3">
                    <div
                      class="text-surface-500 text-[11px] font-semibold tracking-wider uppercase"
                    >
                      {{ t('page.profile.next_milestone', 'Next milestone') }}
                    </div>
                    <p class="text-surface-200 mt-1">
                      {{ nextMilestoneCopy }}
                    </p>
                  </div>
                  <div class="bg-surface-900/80 rounded-md border border-white/10 p-3">
                    <div
                      class="text-surface-500 text-[11px] font-semibold tracking-wider uppercase"
                    >
                      {{ t('page.profile.total_actions', 'Tracked Actions') }}
                    </div>
                    <p class="text-surface-200 mt-1">
                      {{
                        t(
                          'page.profile.total_actions_value',
                          `${formatNumber(totalTrackedActions)} objective/item increments logged`
                        )
                      }}
                    </p>
                  </div>
                </div>
              </template>
            </GenericCard>
            <GenericCard
              icon="i-mdi-trophy-outline"
              highlight-color="kappa"
              :title="t('page.profile.achievements', 'Achievements')"
              :subtitle="t('page.profile.achievements_subtitle', 'Major progression checkpoints')"
              :fill-height="false"
            >
              <template #content>
                <div class="space-y-3 p-4">
                  <article
                    v-for="achievement in achievementRows"
                    :key="achievement.id"
                    class="bg-surface-900/80 rounded-md border border-white/10 p-3"
                  >
                    <div class="mb-2 flex items-center justify-between gap-2">
                      <div class="flex items-center gap-2">
                        <UIcon
                          :name="achievement.icon"
                          class="h-4.5 w-4.5"
                          :class="achievement.iconClass"
                        />
                        <span class="text-surface-100 text-sm font-medium">
                          {{ achievement.title }}
                        </span>
                      </div>
                      <span class="text-surface-400 text-xs">
                        {{ formatNumber(achievement.completed) }}/{{
                          formatNumber(achievement.total)
                        }}
                      </span>
                    </div>
                    <div class="bg-surface-800/60 h-1.5 overflow-hidden rounded-full">
                      <div
                        class="h-full rounded-full transition-[width] duration-300"
                        :class="achievement.barClass"
                        :style="{ width: `${achievement.percentage.toFixed(2)}%` }"
                      ></div>
                    </div>
                  </article>
                </div>
              </template>
            </GenericCard>
            <GenericCard
              icon="i-mdi-timeline-check-outline"
              highlight-color="primary"
              :title="t('page.profile.kappa_projection', 'Kappa Timeline')"
              :subtitle="
                t('page.profile.kappa_projection_subtitle', 'Finished duration or estimated ETA')
              "
              :fill-height="false"
            >
              <template #content>
                <div class="space-y-3 p-4 text-sm">
                  <p class="text-surface-100 font-semibold">{{ kappaProjection.headline }}</p>
                  <p class="text-surface-300">{{ kappaProjection.detail }}</p>
                  <div
                    v-if="kappaProjection.etaTimestamp"
                    class="bg-surface-900/80 rounded-md border border-white/10 p-3"
                  >
                    <div
                      class="text-surface-500 text-[11px] font-semibold tracking-wider uppercase"
                    >
                      {{ t('page.profile.estimated_finish', 'Estimated finish') }}
                    </div>
                    <p class="text-surface-100 mt-1 text-sm font-medium">
                      {{ formatDate(kappaProjection.etaTimestamp) }}
                    </p>
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <UBadge
                      v-if="kappaProjection.confidence"
                      variant="soft"
                      :class="kappaConfidenceClass"
                    >
                      {{ kappaConfidenceLabel }}
                    </UBadge>
                    <UBadge color="neutral" variant="soft">
                      {{
                        t(
                          'page.profile.kappa_remaining',
                          `${formatNumber(Math.max(totalKappaTasks - completedKappaTasks, 0))} remaining`
                        )
                      }}
                    </UBadge>
                  </div>
                </div>
              </template>
            </GenericCard>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
<script setup lang="ts">
  import {
    computeConfidence,
    computeCriticalPathFloor,
    dampenPace,
  } from '@/features/profile/kappaProjectionHelpers';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useProgressStore } from '@/stores/useProgress';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { GAME_MODES, type GameMode } from '@/utils/constants';
  import { isTaskAvailableForEdition as checkTaskEdition } from '@/utils/editionHelpers';
  import { calculatePercentageNum, useLocaleNumberFormatter } from '@/utils/formatters';
  import { logger } from '@/utils/logger';
  import { getCompletionFlags, type RawTaskCompletion } from '@/utils/taskStatus';
  import type { ApiUpdateMeta, ApiTaskUpdate, UserProgressData } from '@/stores/progressState';
  import type { Task } from '@/types/tarkov';
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MAX_LEVEL = 79;
  const MIN_ESTIMATE_SAMPLE = 3;
  const TIMELINE_LIMIT = 12;
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const DEFAULT_PROGRESS_DATA: UserProgressData = {
    displayName: null,
    hideoutModules: {},
    hideoutParts: {},
    level: 1,
    pmcFaction: 'USEC',
    prestigeLevel: 0,
    skillOffsets: {},
    skills: {},
    taskCompletions: {},
    taskObjectives: {},
    traders: {},
    xpOffset: 0,
  };
  type StatTone = 'info' | 'primary' | 'success' | 'warning';
  type TimelineTone = 'error' | 'info' | 'primary' | 'success';
  type ProjectionConfidence = 'high' | 'low' | 'medium' | null;
  interface SharedProfileResponse {
    data: unknown;
    gameEdition: number | null;
    mode: GameMode;
    userId: string;
    visibility: 'owner' | 'public';
  }
  interface StatCard {
    id: string;
    icon: string;
    label: string;
    meta: string;
    percentage: number;
    tone: StatTone;
    value: string;
  }
  interface TimelineEvent {
    key: string;
    icon: string;
    subtitle: string;
    timestamp: number;
    title: string;
    tone: TimelineTone;
  }
  interface AchievementRow {
    barClass: string;
    completed: number;
    icon: string;
    iconClass: string;
    id: string;
    percentage: number;
    title: string;
    total: number;
  }
  interface KappaProjection {
    confidence: ProjectionConfidence;
    daysRemaining: number | null;
    detail: string;
    etaTimestamp: number | null;
    headline: string;
    state: 'completed' | 'projected' | 'unknown';
  }
  interface ModeTheme {
    heroBackdrop: string;
    icon: string;
    iconTint: string;
    label: string;
    modeBadgeClass: string;
    storyHighlight: 'info' | 'pve' | 'pvp';
    timelineHighlight: 'info' | 'pve' | 'pvp';
  }
  const MODE_THEMES: Record<GameMode, ModeTheme> = {
    pvp: {
      heroBackdrop: 'bg-gradient-to-r from-pvp-900 via-primary-900/35 to-surface-900',
      icon: 'i-mdi-sword-cross',
      iconTint: 'text-pvp-300',
      label: 'PvP',
      modeBadgeClass: 'border border-pvp-500/30 bg-pvp-700/25 text-pvp-200',
      storyHighlight: 'pvp',
      timelineHighlight: 'pvp',
    },
    pve: {
      heroBackdrop: 'bg-gradient-to-r from-pve-900 via-secondary-900/35 to-surface-900',
      icon: 'i-mdi-account-group',
      iconTint: 'text-pve-300',
      label: 'PvE',
      modeBadgeClass: 'border border-pve-500/30 bg-pve-700/25 text-pve-200',
      storyHighlight: 'pve',
      timelineHighlight: 'pve',
    },
  };
  const statToneClasses = {
    primary: {
      bar: 'bg-primary-500/70',
      chip: 'bg-primary-700/25',
      icon: 'text-primary-300',
    },
    info: {
      bar: 'bg-info-500/70',
      chip: 'bg-info-700/25',
      icon: 'text-info-300',
    },
    success: {
      bar: 'bg-success-500/70',
      chip: 'bg-success-700/25',
      icon: 'text-success-300',
    },
    warning: {
      bar: 'bg-warning-500/70',
      chip: 'bg-warning-700/25',
      icon: 'text-warning-300',
    },
  } as const satisfies Record<
    StatTone,
    {
      bar: string;
      chip: string;
      icon: string;
    }
  >;
  const timelineToneClasses = {
    primary: {
      chip: 'bg-primary-700/25',
      icon: 'text-primary-300',
    },
    info: {
      chip: 'bg-info-700/25',
      icon: 'text-info-300',
    },
    success: {
      chip: 'bg-success-700/25',
      icon: 'text-success-300',
    },
    error: {
      chip: 'bg-error-700/25',
      icon: 'text-error-300',
    },
  } as const satisfies Record<
    TimelineTone,
    {
      chip: string;
      icon: string;
    }
  >;
  const normalizeMode = (value: unknown): GameMode | null => {
    if (Array.isArray(value)) {
      return normalizeMode(value[0]);
    }
    if (value === GAME_MODES.PVE) {
      return GAME_MODES.PVE;
    }
    if (value === GAME_MODES.PVP) {
      return GAME_MODES.PVP;
    }
    return null;
  };
  const normalizeUserId = (value: unknown): string | null => {
    if (Array.isArray(value)) {
      return normalizeUserId(value[0]);
    }
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!UUID_REGEX.test(trimmed)) {
      return null;
    }
    return trimmed;
  };
  const normalizeTimestamp = (value: number | undefined): number | null => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return null;
    }
    if (value < 1_000_000_000_000) {
      return Math.round(value * 1000);
    }
    return Math.round(value);
  };
  const countDaysInclusive = (start: number, end: number): number => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return 1;
    }
    return Math.max(1, Math.ceil((end - start) / DAY_MS));
  };
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value && typeof value === 'object');
  const isApiTaskUpdate = (value: unknown): value is ApiTaskUpdate => {
    if (!isRecord(value)) {
      return false;
    }
    return (
      typeof value.id === 'string' &&
      (value.state === 'completed' || value.state === 'failed' || value.state === 'uncompleted')
    );
  };
  const normalizeApiUpdateMeta = (value: unknown): ApiUpdateMeta | undefined => {
    if (!isRecord(value)) {
      return undefined;
    }
    if (
      typeof value.id !== 'string' ||
      typeof value.at !== 'number' ||
      !Number.isFinite(value.at)
    ) {
      return undefined;
    }
    if (value.source !== 'api') {
      return undefined;
    }
    const tasks = Array.isArray(value.tasks)
      ? value.tasks.filter((task): task is ApiTaskUpdate => isApiTaskUpdate(task))
      : undefined;
    return {
      at: value.at,
      id: value.id,
      source: 'api',
      tasks,
    };
  };
  const normalizeSharedProgressData = (value: unknown): UserProgressData => {
    if (!isRecord(value)) {
      return structuredClone(DEFAULT_PROGRESS_DATA);
    }
    const level =
      typeof value.level === 'number' && Number.isFinite(value.level)
        ? Math.max(1, Math.round(value.level))
        : 1;
    const pmcFaction = value.pmcFaction === 'BEAR' ? 'BEAR' : 'USEC';
    const traders = isRecord(value.traders)
      ? (value.traders as UserProgressData['traders'])
      : DEFAULT_PROGRESS_DATA.traders;
    const skills = isRecord(value.skills)
      ? (value.skills as UserProgressData['skills'])
      : DEFAULT_PROGRESS_DATA.skills;
    const taskObjectives = isRecord(value.taskObjectives)
      ? (value.taskObjectives as UserProgressData['taskObjectives'])
      : DEFAULT_PROGRESS_DATA.taskObjectives;
    const taskCompletions = isRecord(value.taskCompletions)
      ? (value.taskCompletions as UserProgressData['taskCompletions'])
      : DEFAULT_PROGRESS_DATA.taskCompletions;
    const hideoutParts = isRecord(value.hideoutParts)
      ? (value.hideoutParts as UserProgressData['hideoutParts'])
      : DEFAULT_PROGRESS_DATA.hideoutParts;
    const hideoutModules = isRecord(value.hideoutModules)
      ? (value.hideoutModules as UserProgressData['hideoutModules'])
      : DEFAULT_PROGRESS_DATA.hideoutModules;
    const skillOffsets = isRecord(value.skillOffsets)
      ? (value.skillOffsets as UserProgressData['skillOffsets'])
      : DEFAULT_PROGRESS_DATA.skillOffsets;
    return {
      displayName:
        typeof value.displayName === 'string' && value.displayName.trim().length > 0
          ? value.displayName
          : null,
      hideoutModules,
      hideoutParts,
      lastApiUpdate: normalizeApiUpdateMeta(value.lastApiUpdate),
      level,
      pmcFaction,
      prestigeLevel:
        typeof value.prestigeLevel === 'number' && Number.isFinite(value.prestigeLevel)
          ? Math.max(0, Math.round(value.prestigeLevel))
          : 0,
      skillOffsets,
      skills,
      taskCompletions,
      taskObjectives,
      traders,
      xpOffset:
        typeof value.xpOffset === 'number' && Number.isFinite(value.xpOffset) ? value.xpOffset : 0,
    };
  };
  const route = useRoute();
  const router = useRouter();
  const { t, locale } = useI18n({ useScope: 'global' });
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const progressStore = useProgressStore();
  const tarkovStore = useTarkovStore();
  const { copyToClipboard } = useCopyToClipboard();
  const { $supabase } = useNuxtApp();
  const formatNumber = useLocaleNumberFormatter();
  const routeSharedUserId = computed(() => normalizeUserId(route.params.userId));
  const querySharedUserId = computed(() => normalizeUserId(route.query.user));
  const sharedUserId = computed(() => routeSharedUserId.value ?? querySharedUserId.value);
  const selectedMode = ref<GameMode>(
    normalizeMode(route.params.mode) ??
      normalizeMode(route.query.mode) ??
      tarkovStore.getCurrentGameMode()
  );
  watch(
    () => [route.params.mode, route.query.mode] as const,
    ([paramMode, queryMode]) => {
      const normalizedMode = normalizeMode(paramMode) ?? normalizeMode(queryMode);
      if (normalizedMode && normalizedMode !== selectedMode.value) {
        selectedMode.value = normalizedMode;
      }
    }
  );
  watch(selectedMode, (mode) => {
    const sharedId = sharedUserId.value;
    if (sharedId) {
      const currentMode = normalizeMode(route.params.mode);
      const currentUserId = normalizeUserId(route.params.userId);
      if (currentMode === mode && currentUserId === sharedId) {
        return;
      }
      const nextQuery = { ...route.query };
      delete nextQuery.mode;
      delete nextQuery.user;
      void router.replace({
        path: `/profile/${sharedId}/${mode}`,
        query: nextQuery,
      });
      return;
    }
    const queryMode = normalizeMode(route.query.mode);
    if (queryMode === mode) {
      return;
    }
    void router.replace({
      query: {
        ...route.query,
        mode,
      },
    });
  });
  const sharedProfileLoading = ref(false);
  const sharedProfileError = ref<string | null>(null);
  const sharedProfileEdition = ref<number | null>(null);
  const sharedProfileData = ref<UserProgressData | null>(null);
  let sharedProfileRequestId = 0;
  const getAuthHeader = async (): Promise<string | null> => {
    try {
      const sessionResult = await $supabase.client.auth.getSession();
      const accessToken = sessionResult.data?.session?.access_token;
      if (!accessToken) {
        return null;
      }
      return `Bearer ${accessToken}`;
    } catch (error) {
      logger.warn('[Profile] Failed to fetch auth session for shared profile request:', error);
      return null;
    }
  };
  const loadSharedProfile = async (userId: string, mode: GameMode) => {
    const requestId = ++sharedProfileRequestId;
    sharedProfileLoading.value = true;
    sharedProfileError.value = null;
    sharedProfileData.value = null;
    sharedProfileEdition.value = null;
    try {
      const authHeader = await getAuthHeader();
      const response = await $fetch<SharedProfileResponse>(`/api/profile/${userId}/${mode}`, {
        headers: authHeader ? { Authorization: authHeader } : undefined,
      });
      if (requestId !== sharedProfileRequestId) {
        return;
      }
      sharedProfileData.value = normalizeSharedProgressData(response.data);
      sharedProfileEdition.value =
        typeof response.gameEdition === 'number' ? response.gameEdition : 1;
    } catch (error) {
      if (requestId !== sharedProfileRequestId) {
        return;
      }
      const statusCode =
        (error as { statusCode?: number }).statusCode ??
        (error as { status?: number }).status ??
        (error as { response?: { status?: number } }).response?.status;
      if (statusCode === 403) {
        sharedProfileError.value = t(
          'page.profile.shared_private',
          'This player has set this mode to private.'
        );
      } else if (statusCode === 404) {
        sharedProfileError.value = t('page.profile.shared_not_found', 'Shared profile not found.');
      } else if (statusCode === 503) {
        sharedProfileError.value = t(
          'page.profile.shared_unavailable',
          'Shared profiles are temporarily unavailable.'
        );
      } else {
        sharedProfileError.value = t(
          'page.profile.shared_load_failed',
          'Unable to load shared profile right now.'
        );
      }
      logger.warn('[Profile] Shared profile request failed:', {
        error,
        mode,
        statusCode,
        userId,
      });
    } finally {
      if (requestId === sharedProfileRequestId) {
        sharedProfileLoading.value = false;
      }
    }
  };
  watch(
    [sharedUserId, selectedMode],
    ([nextSharedUserId, nextMode]) => {
      if (!nextSharedUserId) {
        sharedProfileLoading.value = false;
        sharedProfileError.value = null;
        sharedProfileData.value = null;
        sharedProfileEdition.value = null;
        return;
      }
      void loadSharedProfile(nextSharedUserId, nextMode);
    },
    { immediate: true }
  );
  const isViewingSharedProfile = computed(() => Boolean(sharedUserId.value));
  const canRenderProfileContent = computed(() => {
    if (!isViewingSharedProfile.value) {
      return true;
    }
    if (sharedProfileLoading.value || sharedProfileError.value) {
      return false;
    }
    return sharedProfileData.value !== null;
  });
  const modeTheme = computed(() => MODE_THEMES[selectedMode.value]);
  const modeLabel = computed(() => modeTheme.value.label);
  const pvpToggleClass = computed(() =>
    selectedMode.value === GAME_MODES.PVP
      ? 'bg-pvp-800 text-pvp-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]'
      : 'bg-transparent text-pvp-500 hover:bg-pvp-950/50 hover:text-pvp-300'
  );
  const pveToggleClass = computed(() =>
    selectedMode.value === GAME_MODES.PVE
      ? 'bg-pve-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]'
      : 'bg-transparent text-pve-500 hover:bg-pve-950/50 hover:text-pve-300'
  );
  const modeData = computed<UserProgressData>(() => {
    if (isViewingSharedProfile.value) {
      return sharedProfileData.value ?? DEFAULT_PROGRESS_DATA;
    }
    return selectedMode.value === GAME_MODES.PVE
      ? tarkovStore.getPvEProgressData()
      : tarkovStore.getPvPProgressData();
  });
  const isViewingCurrentMode = computed(
    () => !isViewingSharedProfile.value && selectedMode.value === tarkovStore.getCurrentGameMode()
  );
  const profileGameEdition = computed(() => {
    if (isViewingSharedProfile.value) {
      return sharedProfileEdition.value ?? 1;
    }
    return tarkovStore.getGameEdition();
  });
  const displayName = computed(() => {
    const modeDisplayName = modeData.value.displayName;
    if (modeDisplayName && modeDisplayName.trim() !== '') {
      return modeDisplayName;
    }
    if (isViewingSharedProfile.value) {
      return t('page.profile.shared_player', 'Shared Player');
    }
    const fallbackName = tarkovStore.getDisplayName();
    if (fallbackName && fallbackName.trim() !== '') {
      return fallbackName;
    }
    return t('app_bar.user_label', 'User');
  });
  const modeFaction = computed(() => modeData.value.pmcFaction ?? 'USEC');
  const profileLevel = computed(() => {
    if (isViewingCurrentMode.value && preferencesStore.getUseAutomaticLevelCalculation) {
      return progressStore.getLevel('self');
    }
    return modeData.value.level ?? 1;
  });
  const relevantTasks = computed<Task[]>(() => {
    const faction = modeFaction.value;
    return (metadataStore.tasks ?? []).filter((task) => {
      if (!task?.id) {
        return false;
      }
      const taskFaction = task.factionName ?? 'Any';
      if (taskFaction !== 'Any' && taskFaction !== faction) {
        return false;
      }
      return checkTaskEdition(task.id, profileGameEdition.value, metadataStore.editions);
    });
  });
  const allTasksById = computed(() => {
    const lookup = new Map<string, Task>();
    for (const task of metadataStore.tasks ?? []) {
      if (task?.id) {
        lookup.set(task.id, task);
      }
    }
    return lookup;
  });
  const taskCompletions = computed(() => modeData.value.taskCompletions ?? {});
  const objectiveCompletions = computed(() => modeData.value.taskObjectives ?? {});
  const hideoutModuleCompletions = computed(() => modeData.value.hideoutModules ?? {});
  const hideoutPartCompletions = computed(() => modeData.value.hideoutParts ?? {});
  const getTaskTimestamp = (taskId: string): number | null => {
    const completion = taskCompletions.value[taskId] as RawTaskCompletion;
    if (!completion || typeof completion === 'boolean') {
      return null;
    }
    return normalizeTimestamp(completion.timestamp);
  };
  const isTaskSuccessful = (taskId: string): boolean => {
    const completion = taskCompletions.value[taskId] as RawTaskCompletion;
    const flags = getCompletionFlags(completion);
    return flags.complete && !flags.failed;
  };
  const isTaskFailed = (taskId: string): boolean => {
    const completion = taskCompletions.value[taskId] as RawTaskCompletion;
    return getCompletionFlags(completion).failed;
  };
  const totalTasks = computed(() => relevantTasks.value.length);
  const completedTasks = computed(() =>
    relevantTasks.value.reduce((count, task) => {
      if (isTaskSuccessful(task.id)) {
        return count + 1;
      }
      return count;
    }, 0)
  );
  const failedTasks = computed(() =>
    relevantTasks.value.reduce((count, task) => {
      if (isTaskFailed(task.id)) {
        return count + 1;
      }
      return count;
    }, 0)
  );
  const remainingTasks = computed(() =>
    Math.max(totalTasks.value - completedTasks.value - failedTasks.value, 0)
  );
  const objectiveMetaById = computed(() => {
    const lookup = new Map<
      string,
      {
        description: string;
        taskName: string;
      }
    >();
    for (const task of relevantTasks.value) {
      const taskName = task.name || t('page.profile.task_fallback', 'Task');
      for (const objective of task.objectives ?? []) {
        if (!objective?.id) {
          continue;
        }
        lookup.set(objective.id, {
          description: objective.description || t('page.profile.objective_fallback', 'Objective'),
          taskName,
        });
      }
    }
    return lookup;
  });
  const totalObjectives = computed(() => objectiveMetaById.value.size);
  const completedObjectives = computed(() => {
    let count = 0;
    for (const objectiveId of objectiveMetaById.value.keys()) {
      if (objectiveCompletions.value[objectiveId]?.complete === true) {
        count++;
      }
    }
    return count;
  });
  const hideoutModuleLabelById = computed(() => {
    const lookup = new Map<string, string>();
    for (const station of metadataStore.hideoutStations ?? []) {
      const stationName = station.name || t('page.profile.hideout_fallback', 'Hideout');
      for (const level of station.levels ?? []) {
        if (!level?.id) {
          continue;
        }
        lookup.set(level.id, `${stationName} Lv.${level.level}`);
      }
    }
    return lookup;
  });
  const totalHideoutModules = computed(() => hideoutModuleLabelById.value.size);
  const completedHideoutModules = computed(() => {
    let count = 0;
    for (const moduleId of hideoutModuleLabelById.value.keys()) {
      if (hideoutModuleCompletions.value[moduleId]?.complete === true) {
        count++;
      }
    }
    return count;
  });
  const hideoutPartLabelById = computed(() => {
    const lookup = new Map<string, string>();
    for (const requirement of metadataStore.neededItemHideoutModules ?? []) {
      if (!requirement.id || lookup.has(requirement.id)) {
        continue;
      }
      const itemName =
        requirement.item?.name ||
        requirement.item?.shortName ||
        t('page.profile.hideout_item_fallback', 'Hideout item');
      lookup.set(requirement.id, itemName);
    }
    return lookup;
  });
  const completedHideoutParts = computed(() =>
    Object.values(hideoutPartCompletions.value).reduce((count, part) => {
      if (part?.complete === true) {
        return count + 1;
      }
      return count;
    }, 0)
  );
  const objectiveProgressCount = computed(() =>
    Object.values(objectiveCompletions.value).reduce((count, objective) => {
      return count + Math.max(0, objective?.count ?? 0);
    }, 0)
  );
  const hideoutProgressCount = computed(() =>
    Object.values(hideoutPartCompletions.value).reduce((count, part) => {
      return count + Math.max(0, part?.count ?? 0);
    }, 0)
  );
  const totalTrackedActions = computed(
    () => objectiveProgressCount.value + hideoutProgressCount.value
  );
  const totalKappaTasks = computed(
    () => relevantTasks.value.filter((task) => task.kappaRequired === true).length
  );
  const completedKappaTasks = computed(() =>
    relevantTasks.value.reduce((count, task) => {
      if (task.kappaRequired === true && isTaskSuccessful(task.id)) {
        return count + 1;
      }
      return count;
    }, 0)
  );
  const completedTaskIdSet = computed(() => {
    const ids = new Set<string>();
    for (const task of relevantTasks.value) {
      if (isTaskSuccessful(task.id)) {
        ids.add(task.id);
      }
    }
    return ids;
  });
  const totalLightkeeperTasks = computed(
    () => relevantTasks.value.filter((task) => task.lightkeeperRequired === true).length
  );
  const completedLightkeeperTasks = computed(() =>
    relevantTasks.value.reduce((count, task) => {
      if (task.lightkeeperRequired === true && isTaskSuccessful(task.id)) {
        return count + 1;
      }
      return count;
    }, 0)
  );
  const taskCompletionPct = computed(() =>
    calculatePercentageNum(completedTasks.value, totalTasks.value)
  );
  const objectiveCompletionPct = computed(() =>
    calculatePercentageNum(completedObjectives.value, totalObjectives.value)
  );
  const hideoutCompletionPct = computed(() =>
    calculatePercentageNum(completedHideoutModules.value, totalHideoutModules.value)
  );
  const timelineAllEvents = computed<TimelineEvent[]>(() => {
    const events: TimelineEvent[] = [];
    for (const task of relevantTasks.value) {
      const completion = taskCompletions.value[task.id] as RawTaskCompletion;
      if (!completion || typeof completion === 'boolean') {
        continue;
      }
      const timestamp = normalizeTimestamp(completion.timestamp);
      if (!timestamp) {
        continue;
      }
      const flags = getCompletionFlags(completion);
      if (flags.complete && !flags.failed) {
        events.push({
          key: `task:${task.id}`,
          icon: 'i-mdi-checkbox-marked-circle-outline',
          subtitle: task.trader?.name || t('page.profile.timeline_task', 'Task completion'),
          timestamp,
          title: task.name || t('page.profile.task_fallback', 'Task'),
          tone: 'success',
        });
        continue;
      }
      if (flags.failed) {
        events.push({
          key: `task-failed:${task.id}`,
          icon: 'i-mdi-close-circle-outline',
          subtitle: t('page.profile.timeline_failed', 'Task branch failed'),
          timestamp,
          title: task.name || t('page.profile.task_fallback', 'Task'),
          tone: 'error',
        });
      }
    }
    for (const [objectiveId, objective] of Object.entries(objectiveCompletions.value)) {
      if (!objective?.complete) {
        continue;
      }
      const timestamp = normalizeTimestamp(objective.timestamp);
      if (!timestamp) {
        continue;
      }
      const meta = objectiveMetaById.value.get(objectiveId);
      if (!meta) {
        continue;
      }
      events.push({
        key: `objective:${objectiveId}`,
        icon: 'i-mdi-bullseye-arrow',
        subtitle: meta.taskName,
        timestamp,
        title: meta.description,
        tone: 'info',
      });
    }
    for (const [moduleId, moduleProgress] of Object.entries(hideoutModuleCompletions.value)) {
      if (!moduleProgress?.complete) {
        continue;
      }
      const timestamp = normalizeTimestamp(moduleProgress.timestamp);
      if (!timestamp) {
        continue;
      }
      const moduleLabel =
        hideoutModuleLabelById.value.get(moduleId) ||
        t('page.profile.hideout_module_fallback', 'Hideout upgrade');
      events.push({
        key: `hideout-module:${moduleId}`,
        icon: 'i-mdi-home-city-outline',
        subtitle: t('page.profile.timeline_hideout', 'Hideout module completed'),
        timestamp,
        title: moduleLabel,
        tone: 'primary',
      });
    }
    for (const [partId, partProgress] of Object.entries(hideoutPartCompletions.value)) {
      if (!partProgress?.complete) {
        continue;
      }
      const timestamp = normalizeTimestamp(partProgress.timestamp);
      if (!timestamp) {
        continue;
      }
      const partLabel =
        hideoutPartLabelById.value.get(partId) ||
        t('page.profile.hideout_item_fallback', 'Hideout item');
      events.push({
        key: `hideout-part:${partId}`,
        icon: 'i-mdi-hammer-screwdriver',
        subtitle: t('page.profile.timeline_hideout_item', 'Hideout materials delivered'),
        timestamp,
        title: partLabel,
        tone: 'primary',
      });
    }
    events.sort((a, b) => b.timestamp - a.timestamp);
    return events;
  });
  const timelineEvents = computed(() => timelineAllEvents.value.slice(0, TIMELINE_LIMIT));
  const firstProgressTimestamp = computed(() => {
    if (!timelineAllEvents.value.length) {
      return null;
    }
    return timelineAllEvents.value[timelineAllEvents.value.length - 1]?.timestamp ?? null;
  });
  const latestProgressTimestamp = computed(() => {
    if (!timelineAllEvents.value.length) {
      return null;
    }
    return timelineAllEvents.value[0]?.timestamp ?? null;
  });
  const journeyDays = computed(() => {
    if (!firstProgressTimestamp.value || !latestProgressTimestamp.value) {
      return 0;
    }
    return countDaysInclusive(firstProgressTimestamp.value, latestProgressTimestamp.value);
  });
  const activeDays = computed(() => {
    if (!firstProgressTimestamp.value) {
      return 0;
    }
    return countDaysInclusive(firstProgressTimestamp.value, Date.now());
  });
  const recentCompletedTasks = computed(() => {
    const threshold = Date.now() - 7 * DAY_MS;
    return relevantTasks.value.reduce((count, task) => {
      if (!isTaskSuccessful(task.id)) {
        return count;
      }
      const timestamp = getTaskTimestamp(task.id);
      if (!timestamp || timestamp < threshold) {
        return count;
      }
      return count + 1;
    }, 0);
  });
  const nextTaskMilestone = computed(() => {
    const milestones = [25, 50, 75, 100];
    return milestones.find((milestone) => taskCompletionPct.value < milestone) ?? null;
  });
  const completedTaskTimestamps = computed(() => {
    const timestamps: number[] = [];
    for (const task of relevantTasks.value) {
      if (!isTaskSuccessful(task.id)) {
        continue;
      }
      const timestamp = getTaskTimestamp(task.id);
      if (!timestamp) {
        continue;
      }
      timestamps.push(timestamp);
    }
    return timestamps;
  });
  const completedKappaTaskTimestamps = computed(() => {
    const timestamps: number[] = [];
    for (const task of relevantTasks.value) {
      if (task.kappaRequired !== true || !isTaskSuccessful(task.id)) {
        continue;
      }
      const timestamp = getTaskTimestamp(task.id);
      if (!timestamp) {
        continue;
      }
      timestamps.push(timestamp);
    }
    return timestamps;
  });
  const kappaProjection = computed<KappaProjection>(() => {
    const total = totalKappaTasks.value;
    const completed = completedKappaTasks.value;
    if (total <= 0) {
      return {
        confidence: null,
        daysRemaining: null,
        detail: t('page.profile.kappa_unknown_detail', 'No Kappa tasks detected for this profile.'),
        etaTimestamp: null,
        headline: t('page.profile.kappa_unknown', 'Kappa timeline unavailable'),
        state: 'unknown',
      };
    }
    if (completed >= total) {
      const timestamps = completedKappaTaskTimestamps.value;
      if (timestamps.length >= 2) {
        const minTimestamp = Math.min(...timestamps);
        const maxTimestamp = Math.max(...timestamps);
        const days = countDaysInclusive(minTimestamp, maxTimestamp);
        return {
          confidence: 'high',
          daysRemaining: 0,
          detail: t(
            'page.profile.kappa_done_detail',
            `Finished ${formatNumber(total)} Kappa tasks in about ${formatNumber(days)} days.`
          ),
          etaTimestamp: maxTimestamp,
          headline: t('page.profile.kappa_done', 'Kappa complete in this mode'),
          state: 'completed',
        };
      }
      return {
        confidence: 'high',
        daysRemaining: 0,
        detail: t(
          'page.profile.kappa_done_detail_simple',
          'All Kappa tasks are complete in this profile.'
        ),
        etaTimestamp: null,
        headline: t('page.profile.kappa_done', 'Kappa complete in this mode'),
        state: 'completed',
      };
    }
    const remaining = total - completed;
    let sampleCount = 0;
    let sampleDays = 0;
    if (completedKappaTaskTimestamps.value.length >= MIN_ESTIMATE_SAMPLE) {
      sampleCount = completedKappaTaskTimestamps.value.length;
      const first = Math.min(...completedKappaTaskTimestamps.value);
      const last = Math.max(...completedKappaTaskTimestamps.value);
      sampleDays = countDaysInclusive(first, last);
    } else if (
      completedTaskTimestamps.value.length >= MIN_ESTIMATE_SAMPLE &&
      firstProgressTimestamp.value
    ) {
      sampleCount = completedTaskTimestamps.value.length;
      sampleDays = countDaysInclusive(firstProgressTimestamp.value, Date.now());
    }
    if (sampleCount < MIN_ESTIMATE_SAMPLE || sampleDays <= 0) {
      return {
        confidence: null,
        daysRemaining: null,
        detail: t(
          'page.profile.kappa_insufficient_detail',
          'Complete more timestamped tasks to generate an ETA.'
        ),
        etaTimestamp: null,
        headline: t('page.profile.kappa_insufficient', 'Kappa ETA needs more history'),
        state: 'unknown',
      };
    }
    const rawPacePerDay = sampleCount / sampleDays;
    if (!Number.isFinite(rawPacePerDay) || rawPacePerDay <= 0) {
      return {
        confidence: null,
        daysRemaining: null,
        detail: t(
          'page.profile.kappa_pace_unavailable',
          'Not enough pace data to estimate completion.'
        ),
        etaTimestamp: null,
        headline: t('page.profile.kappa_insufficient', 'Kappa ETA needs more history'),
        state: 'unknown',
      };
    }
    const pacePerDay = dampenPace(rawPacePerDay, sampleDays);
    const paceBasedDays = Math.max(1, Math.ceil(remaining / pacePerDay));
    const remainingKappaTasks = relevantTasks.value.filter(
      (task) => task.kappaRequired === true && !isTaskSuccessful(task.id)
    );
    const { floor: criticalPathFloor } = computeCriticalPathFloor(
      remainingKappaTasks,
      allTasksById.value,
      completedTaskIdSet.value,
      profileLevel.value
    );
    const floorActive = criticalPathFloor > paceBasedDays;
    const daysRemaining = Math.max(paceBasedDays, criticalPathFloor);
    const etaTimestamp = Date.now() + daysRemaining * DAY_MS;
    const confidence = computeConfidence(sampleCount, sampleDays);
    let detail = t(
      'page.profile.kappa_projected_detail',
      `Based on ${formatNumber(sampleCount)} timestamped completions across ${formatNumber(sampleDays)} days.`
    );
    if (floorActive) {
      detail +=
        ' ' +
        t(
          'page.profile.kappa_floor_note',
          `Estimate raised to account for ${formatNumber(criticalPathFloor)} sequential prerequisites and level gates.`
        );
    }
    return {
      confidence,
      daysRemaining,
      detail,
      etaTimestamp,
      headline: t(
        'page.profile.kappa_projected_headline',
        `Estimated Kappa in about ${formatNumber(daysRemaining)} days.`
      ),
      state: 'projected',
    };
  });
  const kappaConfidenceLabel = computed(() => {
    if (kappaProjection.value.confidence === 'high') {
      return t('page.profile.confidence_high', 'High confidence');
    }
    if (kappaProjection.value.confidence === 'medium') {
      return t('page.profile.confidence_medium', 'Medium confidence');
    }
    return t('page.profile.confidence_low', 'Low confidence');
  });
  const kappaConfidenceClass = computed(() => {
    if (kappaProjection.value.confidence === 'high') {
      return 'border border-success-500/30 bg-success-700/25 text-success-200';
    }
    if (kappaProjection.value.confidence === 'medium') {
      return 'border border-info-500/30 bg-info-700/25 text-info-200';
    }
    return 'border border-warning-500/30 bg-warning-700/25 text-warning-200';
  });
  const storyHeadline = computed(() => {
    if (totalTasks.value <= 0) {
      return t('page.profile.story_no_tasks', 'Waiting for task metadata to build your story.');
    }
    if (completedTasks.value <= 0) {
      return t('page.profile.story_start', `${modeLabel.value} profile is just getting started.`);
    }
    if (taskCompletionPct.value >= 100) {
      return t('page.profile.story_complete', 'Main task storyline completed.');
    }
    if (taskCompletionPct.value >= 75) {
      return t('page.profile.story_late', 'Entering late-wipe progression arc.');
    }
    if (taskCompletionPct.value >= 50) {
      return t('page.profile.story_mid', 'Mid-wipe momentum is building.');
    }
    return t('page.profile.story_early', 'Early progression with steady momentum.');
  });
  const storySubline = computed(() => {
    return `${formatNumber(completedTasks.value)}/${formatNumber(totalTasks.value)} tasks, ${formatNumber(
      completedObjectives.value
    )}/${formatNumber(totalObjectives.value)} objectives, ${formatNumber(
      completedHideoutModules.value
    )}/${formatNumber(totalHideoutModules.value)} hideout upgrades.`;
  });
  const storyParagraph = computed(() => {
    if (!firstProgressTimestamp.value) {
      return t(
        'page.profile.story_paragraph_empty',
        `${displayName.value} has not recorded timestamped progress in ${modeLabel.value} yet.`
      );
    }
    return t(
      'page.profile.story_paragraph',
      `${displayName.value} has been active in ${modeLabel.value} for about ${formatNumber(
        activeDays.value
      )} days, with ${formatNumber(journeyDays.value)} days between first and latest tracked progress.`
    );
  });
  const nextMilestoneCopy = computed(() => {
    if (!nextTaskMilestone.value) {
      return t('page.profile.next_milestone_done', 'All task completion milestones reached.');
    }
    const remainingPct = Math.max(0, nextTaskMilestone.value - taskCompletionPct.value);
    return t(
      'page.profile.next_milestone_value',
      `${remainingPct.toFixed(1)}% left to reach ${nextTaskMilestone.value}% task completion.`
    );
  });
  const dateFormatter = computed(
    () =>
      new Intl.DateTimeFormat(locale.value, {
        dateStyle: 'medium',
      })
  );
  const dateTimeFormatter = computed(
    () =>
      new Intl.DateTimeFormat(locale.value, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
  );
  const formatDate = (timestamp: number | null): string => {
    if (!timestamp) {
      return t('page.profile.no_date', 'No data yet');
    }
    return dateFormatter.value.format(timestamp);
  };
  const formatDateTime = (timestamp: number): string => {
    return dateTimeFormatter.value.format(timestamp);
  };
  const firstProgressLabel = computed(() => formatDate(firstProgressTimestamp.value));
  const latestProgressLabel = computed(() => formatDate(latestProgressTimestamp.value));
  const profileShareUserId = computed(
    () => sharedUserId.value ?? normalizeUserId($supabase.user?.id ?? null)
  );
  const sharePath = computed(() => {
    if (profileShareUserId.value) {
      return `/profile/${profileShareUserId.value}/${selectedMode.value}`;
    }
    return `/profile?mode=${selectedMode.value}`;
  });
  const shareUrl = computed(() => {
    if (import.meta.client && typeof window !== 'undefined') {
      return `${window.location.origin}${sharePath.value}`;
    }
    return sharePath.value;
  });
  const shareAccessLabel = computed(() => {
    if (isViewingSharedProfile.value) {
      return t('page.profile.shared_mode_notice', 'Viewing shared progression for this mode.');
    }
    const modeIsPublic =
      selectedMode.value === GAME_MODES.PVE
        ? preferencesStore.getProfileSharePvePublic
        : preferencesStore.getProfileSharePvpPublic;
    if (modeIsPublic) {
      return t(
        'page.profile.share_public_enabled',
        'This mode is public. Anyone with the link can view it.'
      );
    }
    return t(
      'page.profile.share_private_enabled',
      'This mode is private. Enable sharing in Settings to make this link public.'
    );
  });
  const shareSnapshot = computed(() => {
    const lines = [
      `${displayName.value} • ${modeLabel.value} profile`,
      `Level ${formatNumber(profileLevel.value)} ${modeFaction.value}`,
      `Tasks: ${formatNumber(completedTasks.value)}/${formatNumber(totalTasks.value)} (${taskCompletionPct.value.toFixed(1)}%)`,
      `Objectives: ${formatNumber(completedObjectives.value)}/${formatNumber(totalObjectives.value)} (${objectiveCompletionPct.value.toFixed(1)}%)`,
      `Hideout modules: ${formatNumber(completedHideoutModules.value)}/${formatNumber(totalHideoutModules.value)} (${hideoutCompletionPct.value.toFixed(1)}%)`,
      `Kappa: ${formatNumber(completedKappaTasks.value)}/${formatNumber(totalKappaTasks.value)}`,
      `Lightkeeper: ${formatNumber(completedLightkeeperTasks.value)}/${formatNumber(totalLightkeeperTasks.value)}`,
      kappaProjection.value.state === 'projected' && kappaProjection.value.daysRemaining
        ? `Kappa ETA: ~${formatNumber(kappaProjection.value.daysRemaining)} days (${formatDate(kappaProjection.value.etaTimestamp)})`
        : kappaProjection.value.state === 'completed'
          ? 'Kappa ETA: Complete'
          : 'Kappa ETA: Insufficient history',
      `Profile link: ${shareUrl.value}`,
    ];
    return lines.join('\n');
  });
  const copyProfileSnapshot = async () => {
    await copyToClipboard(shareSnapshot.value);
  };
  const statCards = computed<StatCard[]>(() => [
    {
      id: 'level',
      icon: 'i-mdi-account-star-outline',
      label: t('navigation_drawer.level', 'Level'),
      meta: t(
        'page.profile.level_meta',
        `${modeLabel.value} profile level and active faction (${modeFaction.value})`
      ),
      percentage: Math.min(100, calculatePercentageNum(profileLevel.value, MAX_LEVEL)),
      tone: 'primary',
      value: formatNumber(profileLevel.value),
    },
    {
      id: 'tasks',
      icon: 'i-mdi-clipboard-check-outline',
      label: t('page.dashboard.progress.tasks', 'Tasks'),
      meta: t(
        'page.profile.tasks_meta',
        `${formatNumber(remainingTasks.value)} remaining, ${formatNumber(failedTasks.value)} failed branches`
      ),
      percentage: taskCompletionPct.value,
      tone: 'success',
      value: `${formatNumber(completedTasks.value)}/${formatNumber(totalTasks.value)}`,
    },
    {
      id: 'objectives',
      icon: 'i-mdi-target',
      label: t('page.dashboard.progress.objectives', 'Objectives'),
      meta: t(
        'page.profile.objectives_meta',
        `${objectiveCompletionPct.value.toFixed(1)}% completion across tracked objectives`
      ),
      percentage: objectiveCompletionPct.value,
      tone: 'info',
      value: `${formatNumber(completedObjectives.value)}/${formatNumber(totalObjectives.value)}`,
    },
    {
      id: 'hideout',
      icon: 'i-mdi-home-city-outline',
      label: t('navigation_drawer.hideout', 'Hideout'),
      meta: t(
        'page.profile.hideout_meta',
        `${formatNumber(completedHideoutParts.value)} completed hideout item checkpoints`
      ),
      percentage: hideoutCompletionPct.value,
      tone: 'warning',
      value: `${formatNumber(completedHideoutModules.value)}/${formatNumber(totalHideoutModules.value)}`,
    },
  ]);
  const achievementRows = computed<AchievementRow[]>(() => [
    {
      barClass: 'bg-success-500/70',
      completed: completedTasks.value,
      icon: 'i-mdi-flag-checkered',
      iconClass: 'text-success-300',
      id: 'main_tasks',
      percentage: taskCompletionPct.value,
      title: t('page.profile.achievement_mainline', 'Mainline Task Progress'),
      total: totalTasks.value,
    },
    {
      barClass: 'bg-kappa-500/70',
      completed: completedKappaTasks.value,
      icon: 'i-mdi-trophy',
      iconClass: 'text-kappa-300',
      id: 'kappa',
      percentage: calculatePercentageNum(completedKappaTasks.value, totalKappaTasks.value),
      title: t('page.dashboard.progress.kappa', 'Kappa Tasks'),
      total: totalKappaTasks.value,
    },
    {
      barClass: 'bg-lightkeeper-500/70',
      completed: completedLightkeeperTasks.value,
      icon: 'i-mdi-lighthouse',
      iconClass: 'text-lightkeeper-300',
      id: 'lightkeeper',
      percentage: calculatePercentageNum(
        completedLightkeeperTasks.value,
        totalLightkeeperTasks.value
      ),
      title: t('page.dashboard.progress.lightkeeper', 'Lightkeeper'),
      total: totalLightkeeperTasks.value,
    },
    {
      barClass: 'bg-info-500/70',
      completed: completedObjectives.value,
      icon: 'i-mdi-bullseye-arrow',
      iconClass: 'text-info-300',
      id: 'objectives',
      percentage: objectiveCompletionPct.value,
      title: t('page.profile.achievement_objectives', 'Objective Completion'),
      total: totalObjectives.value,
    },
  ]);
  const showMetadataHint = computed(
    () => canRenderProfileContent.value && metadataStore.loading && metadataStore.tasks.length === 0
  );
  useSeoMeta({
    title: () => `${t('page.profile.title', 'User Profile')} | ${modeLabel.value}`,
    description: () =>
      t(
        'page.profile.meta_description',
        'Share your progression story with level, achievements, task completion, and timeline insights for PvP or PvE.'
      ),
  });
</script>
