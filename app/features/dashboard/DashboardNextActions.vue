<template>
  <section
    v-if="primaryRecommendation"
    data-testid="dashboard-focus-card"
    :class="['relative mb-8 overflow-hidden rounded-2xl border shadow-2xl', toneClasses.shell]"
  >
    <div
      :class="[
        'pointer-events-none absolute -top-20 right-0 h-64 w-64 rounded-full blur-3xl',
        toneClasses.halo,
      ]"
    ></div>
    <div
      class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
    ></div>
    <div
      class="relative grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.9fr)] lg:p-6"
    >
      <div class="space-y-4">
        <NuxtLink
          :to="primaryRecommendation.action"
          class="group block rounded-2xl focus-visible:outline-none"
          :aria-label="primaryHeading"
          @click="handleRecommendationClick(primaryRecommendation, 'primary')"
        >
          <div
            class="rounded-2xl border border-white/8 p-1 transition-all duration-150 group-hover:border-white/14 group-hover:bg-white/3 group-focus-visible:border-white/18 group-focus-visible:ring-2 group-focus-visible:ring-white/14"
          >
            <div class="space-y-4 rounded-[calc(var(--ui-radius)*1.2)] px-3 py-3 sm:px-4 sm:py-4">
              <div class="flex items-start gap-4">
                <div
                  :class="[
                    'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border shadow-lg',
                    toneClasses.iconBg,
                  ]"
                >
                  <UIcon :name="recommendationIcon" :class="['h-7 w-7', toneClasses.icon]" />
                </div>
                <div class="min-w-0 space-y-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <span
                      :class="[
                        'text-[11px] font-semibold tracking-[0.26em] uppercase',
                        toneClasses.eyebrow,
                      ]"
                    >
                      {{ sectionLabel }}
                    </span>
                    <span
                      v-if="filtersActive"
                      class="text-surface-300 inline-flex min-h-6 items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] leading-none"
                    >
                      <span class="leading-none">
                        {{ t('page.dashboard.focus.badge.based_on_filters') }}
                      </span>
                    </span>
                    <span
                      v-if="hiddenAvailableCount > 0"
                      class="border-warning-400/20 bg-warning-500/10 text-warning-100 inline-flex min-h-6 items-center rounded-full border px-2.5 py-1 text-[11px] leading-none"
                    >
                      <span class="leading-none">{{ hiddenTasksBadge }}</span>
                    </span>
                  </div>
                  <div class="space-y-2">
                    <h2 class="max-w-3xl text-2xl font-semibold text-white sm:text-3xl">
                      {{ primaryHeading }}
                    </h2>
                    <p class="text-surface-200 max-w-3xl text-sm leading-6 sm:text-base">
                      {{ primarySummary }}
                    </p>
                  </div>
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="badge in primaryBadges"
                  :key="badge"
                  :class="[
                    'inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-xs leading-none font-medium',
                    toneClasses.badge,
                  ]"
                >
                  <span class="leading-none">{{ badge }}</span>
                </span>
              </div>
              <div
                class="grid gap-3 md:grid-cols-[minmax(0,1.12fr)_minmax(0,0.94fr)_minmax(0,0.94fr)]"
              >
                <div :class="['rounded-xl p-4 shadow-lg', toneClasses.proofCard]">
                  <div class="text-surface-300 text-[11px] tracking-[0.2em] uppercase">
                    {{ t('page.dashboard.focus.stat.why') }}
                  </div>
                  <div class="mt-2 text-sm leading-6 font-medium text-white">
                    {{ primaryWhy }}
                  </div>
                </div>
                <div class="bg-surface-950/48 rounded-xl border border-white/8 p-4">
                  <div class="text-surface-400 text-[11px] tracking-[0.2em] uppercase">
                    {{ t('page.dashboard.focus.stat.progress') }}
                  </div>
                  <div class="text-surface-100 mt-2 text-sm leading-6">
                    {{ primaryContribution }}
                  </div>
                </div>
                <div class="bg-surface-950/48 rounded-xl border border-white/8 p-4">
                  <div class="text-surface-400 text-[11px] tracking-[0.2em] uppercase">
                    {{ t('page.dashboard.focus.stat.status') }}
                  </div>
                  <div class="text-surface-100 mt-2 text-sm leading-6">
                    {{ primaryStatus }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </NuxtLink>
        <div class="flex flex-wrap gap-3">
          <UButton
            :color="primaryCtaColor"
            class="font-semibold"
            size="lg"
            :to="primaryRecommendation.action"
            @click="handleRecommendationClick(primaryRecommendation, 'primary')"
          >
            {{ primaryCtaLabel }}
          </UButton>
          <UButton color="neutral" size="lg" to="/tasks" variant="soft">
            {{ t('page.dashboard.focus.cta.open_tasks') }}
          </UButton>
        </div>
      </div>
      <div class="bg-surface-950/60 rounded-2xl border border-white/10 p-4">
        <div class="mb-3 flex items-center justify-between gap-3">
          <div>
            <div class="text-surface-400 text-[11px] tracking-[0.2em] uppercase">
              {{ t('page.dashboard.focus.stat.secondary') }}
            </div>
            <div class="text-surface-200 mt-1 text-sm">
              {{ secondarySummary }}
            </div>
          </div>
          <div
            class="text-surface-200 inline-flex min-h-7 items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs leading-none font-medium"
          >
            <span class="leading-none">{{ secondaryRecommendations.length }}</span>
          </div>
        </div>
        <div v-if="secondaryRecommendations.length" class="space-y-3">
          <NuxtLink
            v-for="recommendation in secondaryRecommendations"
            :key="recommendation.id"
            :to="recommendation.action"
            class="group bg-surface-900/70 hover:bg-surface-900 flex items-start gap-3 rounded-xl border border-white/10 px-3 py-3 transition-colors hover:border-white/18"
            @click="handleRecommendationClick(recommendation, 'secondary')"
          >
            <div
              :class="[
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
                getToneClasses(recommendation).iconBg,
              ]"
            >
              <UIcon
                :name="getRecommendationIcon(recommendation)"
                :class="['h-4.5 w-4.5', getToneClasses(recommendation).icon]"
              />
            </div>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-semibold text-white">
                {{ getSecondaryHeading(recommendation) }}
              </div>
              <div class="text-surface-300 mt-1 text-xs leading-5">
                {{ getSecondaryDescription(recommendation) }}
              </div>
            </div>
            <UIcon
              name="i-mdi-arrow-right"
              class="text-surface-400 group-hover:text-surface-300 mt-1 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
            />
          </NuxtLink>
        </div>
        <div
          v-else
          class="bg-surface-900/40 text-surface-300 rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm"
        >
          {{ t('page.dashboard.focus.stat.secondary_empty') }}
        </div>
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
  import {
    useDashboardFocusAnalytics,
    type DashboardRecommendationClickVariant,
  } from '@/composables/useDashboardFocusAnalytics';
  import {
    getPrimaryDashboardRecommendationBlocker,
    type DashboardRecommendation,
    type DashboardRecommendationBlocker,
    type DashboardRecommendationTone,
  } from '@/composables/useDashboardRecommendations';
  const { t } = useI18n({ useScope: 'global' });
  const { trackRecommendationClick } = useDashboardFocusAnalytics();
  const {
    filtersActive,
    hasMultipleStrongOptions,
    hiddenAvailableCount,
    mode,
    primaryRecommendation,
    secondaryRecommendations,
  } = useDashboardRecommendations();
  const toneMap: Record<
    DashboardRecommendationTone,
    {
      badge: string;
      eyebrow: string;
      halo: string;
      icon: string;
      iconBg: string;
      proofCard: string;
      shell: string;
    }
  > = {
    primary: {
      badge: 'border-primary-400/20 bg-primary-500/10 text-primary-50',
      eyebrow: 'text-primary-200',
      halo: 'bg-primary-500/18',
      icon: 'text-primary-200',
      iconBg: 'border-primary-400/20 bg-primary-500/10',
      proofCard: 'border-primary-400/30 bg-surface-900/88 ring-primary-400/10 ring-1',
      shell:
        'border-primary-500/20 bg-gradient-to-br from-surface-900 via-primary-950/55 to-accent-950/45',
    },
    accent: {
      badge: 'border-accent-400/20 bg-accent-500/10 text-accent-50',
      eyebrow: 'text-accent-200',
      halo: 'bg-accent-500/18',
      icon: 'text-accent-200',
      iconBg: 'border-accent-400/20 bg-accent-500/10',
      proofCard: 'border-accent-400/30 bg-surface-900/88 ring-accent-400/10 ring-1',
      shell:
        'border-accent-500/20 bg-gradient-to-br from-surface-900 via-accent-950/55 to-secondary-950/45',
    },
    info: {
      badge: 'border-info-400/20 bg-info-500/10 text-info-50',
      eyebrow: 'text-info-200',
      halo: 'bg-info-500/18',
      icon: 'text-info-200',
      iconBg: 'border-info-400/20 bg-info-500/10',
      proofCard: 'border-info-400/30 bg-surface-900/88 ring-info-400/10 ring-1',
      shell:
        'border-info-500/20 bg-gradient-to-br from-surface-900 via-info-950/55 to-secondary-950/45',
    },
    warning: {
      badge: 'border-warning-400/20 bg-warning-500/10 text-warning-50',
      eyebrow: 'text-warning-200',
      halo: 'bg-warning-500/18',
      icon: 'text-warning-200',
      iconBg: 'border-warning-400/20 bg-warning-500/10',
      proofCard: 'border-warning-400/30 bg-surface-900/88 ring-warning-400/10 ring-1',
      shell:
        'border-warning-500/20 bg-gradient-to-br from-surface-900 via-warning-950/55 to-surface-950',
    },
    success: {
      badge: 'border-success-400/20 bg-success-500/10 text-success-50',
      eyebrow: 'text-success-200',
      halo: 'bg-success-500/18',
      icon: 'text-success-200',
      iconBg: 'border-success-400/20 bg-success-500/10',
      proofCard: 'border-success-400/30 bg-surface-900/88 ring-success-400/10 ring-1',
      shell:
        'border-success-500/20 bg-gradient-to-br from-surface-900 via-success-950/55 to-accent-950/35',
    },
    kappa: {
      badge: 'border-kappa-400/20 bg-kappa-500/10 text-kappa-50',
      eyebrow: 'text-kappa-200',
      halo: 'bg-kappa-500/18',
      icon: 'text-kappa-200',
      iconBg: 'border-kappa-400/20 bg-kappa-500/10',
      proofCard: 'border-kappa-400/30 bg-surface-900/88 ring-kappa-400/10 ring-1',
      shell:
        'border-kappa-500/20 bg-gradient-to-br from-surface-900 via-kappa-950/55 to-surface-950',
    },
    lightkeeper: {
      badge: 'border-lightkeeper-400/20 bg-lightkeeper-500/10 text-lightkeeper-50',
      eyebrow: 'text-lightkeeper-200',
      halo: 'bg-lightkeeper-500/18',
      icon: 'text-lightkeeper-200',
      iconBg: 'border-lightkeeper-400/20 bg-lightkeeper-500/10',
      proofCard: 'border-lightkeeper-400/30 bg-surface-900/88 ring-lightkeeper-400/10 ring-1',
      shell:
        'border-lightkeeper-500/20 bg-gradient-to-br from-surface-900 via-lightkeeper-950/55 to-surface-950',
    },
  };
  const getToneClasses = (recommendation: DashboardRecommendation) => toneMap[recommendation.tone];
  const toneClasses = computed(() =>
    primaryRecommendation.value ? getToneClasses(primaryRecommendation.value) : toneMap.primary
  );
  const getCountLabel = (
    count: number,
    oneKey: string,
    otherKey: string,
    values: Record<string, string | number> = {}
  ) => {
    return count === 1 ? t(oneKey, values) : t(otherKey, values);
  };
  const formatNumericValue = (value?: number) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '';
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2);
  };
  const getPrimaryBlocker = (
    recommendation: DashboardRecommendation
  ): DashboardRecommendationBlocker =>
    getPrimaryDashboardRecommendationBlocker(recommendation.blockers);
  const sectionLabel = computed(() => {
    if (mode.value === 'complete') return t('page.dashboard.focus.title.complete');
    if (mode.value === 'blocked') return t('page.dashboard.focus.title.blocked');
    if (hasMultipleStrongOptions.value) return t('page.dashboard.focus.title.multiple');
    return t('page.dashboard.focus.title.default');
  });
  const hiddenTasksBadge = computed(() =>
    getCountLabel(
      hiddenAvailableCount.value,
      'page.dashboard.focus.badge.hidden_available_one',
      'page.dashboard.focus.badge.hidden_available_other',
      { count: hiddenAvailableCount.value }
    )
  );
  const getRecommendationIcon = (recommendation: DashboardRecommendation) => {
    if (recommendation.kind === 'filters') return 'i-mdi-filter-variant-remove';
    if (recommendation.reason === 'complete') return 'i-mdi-check-circle';
    if (recommendation.unlockTraderName) return 'i-mdi-lock-open-variant-outline';
    if (recommendation.blockers.some((blocker) => blocker.type !== 'ready'))
      return 'i-mdi-lock-outline';
    if (recommendation.reason === 'impact') return 'i-mdi-source-branch';
    if (recommendation.reason === 'lightkeeper') return 'i-mdi-lighthouse';
    if (recommendation.reason === 'kappa') return 'i-mdi-trophy';
    return 'i-mdi-crosshairs-gps';
  };
  const recommendationIcon = computed(() =>
    primaryRecommendation.value
      ? getRecommendationIcon(primaryRecommendation.value)
      : 'i-mdi-crosshairs-gps'
  );
  const getPrimaryHeading = (recommendation: DashboardRecommendation) => {
    const task = recommendation.taskName || '';
    if (recommendation.reason === 'complete') {
      return t('page.dashboard.focus.heading.caught_up');
    }
    if (recommendation.kind === 'filters') {
      return t('page.dashboard.focus.heading.review_filters');
    }
    if (mode.value === 'blocked') {
      return t('page.dashboard.focus.heading.closest_unlock', { task });
    }
    if (recommendation.progress.completed <= 0) {
      return t('page.dashboard.focus.heading.start', { task });
    }
    if (recommendation.progress.remaining <= 1) {
      return t('page.dashboard.focus.heading.finish', { task });
    }
    return t('page.dashboard.focus.heading.continue', { task });
  };
  const getPrimarySummary = (recommendation: DashboardRecommendation) => {
    const task = recommendation.taskName || '';
    const blocker = getPrimaryBlocker(recommendation);
    switch (recommendation.reason) {
      case 'unlock-trader':
        return t('page.dashboard.focus.summary.unlock_trader', {
          task,
          trader: recommendation.unlockTraderName,
        });
      case 'impact':
        return t('page.dashboard.focus.summary.impact', { task });
      case 'close':
        return t('page.dashboard.focus.summary.close', { task });
      case 'kappa':
        return t('page.dashboard.focus.summary.kappa', { task });
      case 'lightkeeper':
        return t('page.dashboard.focus.summary.lightkeeper', { task });
      case 'filter-hidden':
        return getCountLabel(
          recommendation.hiddenAvailableCount ?? 0,
          'page.dashboard.focus.summary.filter_hidden_one',
          'page.dashboard.focus.summary.filter_hidden_other',
          { count: recommendation.hiddenAvailableCount ?? 0 }
        );
      case 'blocked-level':
        return getCountLabel(
          blocker.count ?? 0,
          'page.dashboard.focus.summary.blocked_level_one',
          'page.dashboard.focus.summary.blocked_level_other',
          { count: blocker.count ?? 0, task }
        );
      case 'blocked-prerequisite':
        return t('page.dashboard.focus.summary.blocked_prerequisite', { task });
      case 'blocked-fence':
        return t('page.dashboard.focus.summary.blocked_fence', { task });
      case 'blocked-trader-unlock':
        return t('page.dashboard.focus.summary.blocked_trader_unlock', { task });
      case 'complete':
        return t('page.dashboard.focus.summary.complete');
      default:
        return t('page.dashboard.focus.summary.default', { task });
    }
  };
  const formatImpactLabel = (count: number) =>
    getCountLabel(
      count,
      'page.dashboard.focus.reason.impact_one',
      'page.dashboard.focus.reason.impact_other',
      { count }
    );
  const formatImpactContribution = (count: number) =>
    getCountLabel(
      count,
      'page.dashboard.focus.contribution.impact_one',
      'page.dashboard.focus.contribution.impact_other',
      { count }
    );
  const getCompactReasonText = (recommendation: DashboardRecommendation) => {
    if (recommendation.kind === 'filters') return t('page.dashboard.focus.reason.filters');
    if (recommendation.reason === 'complete') return t('page.dashboard.focus.reason.complete');
    if (recommendation.unlockTraderName) {
      return t('page.dashboard.focus.reason.unlock_trader', {
        trader: recommendation.unlockTraderName,
      });
    }
    if (recommendation.impact > 0) return formatImpactLabel(recommendation.impact);
    if (recommendation.isLightkeeper) return t('page.dashboard.focus.reason.lightkeeper');
    if (recommendation.isKappa) return t('page.dashboard.focus.reason.kappa');
    if (recommendation.reason === 'close') return t('page.dashboard.focus.reason.close');
    if (recommendation.chainTraderName) {
      return t('page.dashboard.focus.reason.trader', { trader: recommendation.chainTraderName });
    }
    return t('page.dashboard.focus.reason.default');
  };
  const getProofText = (recommendation: DashboardRecommendation) => {
    const blocker = getPrimaryBlocker(recommendation);
    if (recommendation.kind === 'filters') {
      return getCountLabel(
        recommendation.hiddenAvailableCount ?? 0,
        'page.dashboard.focus.proof.filters_one',
        'page.dashboard.focus.proof.filters_other',
        { count: recommendation.hiddenAvailableCount ?? 0 }
      );
    }
    if (recommendation.reason === 'complete') {
      return t('page.dashboard.focus.proof.complete');
    }
    if (recommendation.unlockTraderName) {
      return getCountLabel(
        recommendation.progress.remaining,
        'page.dashboard.focus.proof.unlock_trader_one',
        'page.dashboard.focus.proof.unlock_trader_other',
        {
          count: recommendation.progress.remaining,
          trader: recommendation.unlockTraderName,
        }
      );
    }
    if (recommendation.impact > 0) {
      return getCountLabel(
        recommendation.impact,
        'page.dashboard.focus.proof.impact_one',
        'page.dashboard.focus.proof.impact_other',
        { count: recommendation.impact }
      );
    }
    if (blocker.type === 'level') {
      return getCountLabel(
        blocker.count ?? 0,
        'page.dashboard.focus.proof.blocked_level_one',
        'page.dashboard.focus.proof.blocked_level_other',
        { count: blocker.count ?? 0 }
      );
    }
    if (blocker.type === 'prerequisite') {
      return getCountLabel(
        blocker.count ?? 0,
        'page.dashboard.focus.proof.blocked_prerequisite_one',
        'page.dashboard.focus.proof.blocked_prerequisite_other',
        { count: blocker.count ?? 0 }
      );
    }
    if (blocker.type === 'fence') {
      return t('page.dashboard.focus.proof.blocked_fence', {
        count: formatNumericValue(blocker.count),
      });
    }
    if (blocker.type === 'trader-unlock') {
      return t('page.dashboard.focus.proof.blocked_trader_unlock', {
        task: blocker.taskName,
        trader: blocker.traderName,
      });
    }
    if (recommendation.isLightkeeper) {
      return getCountLabel(
        recommendation.progress.remaining,
        'page.dashboard.focus.proof.lightkeeper_one',
        'page.dashboard.focus.proof.lightkeeper_other',
        { count: recommendation.progress.remaining }
      );
    }
    if (recommendation.isKappa) {
      return getCountLabel(
        recommendation.progress.remaining,
        'page.dashboard.focus.proof.kappa_one',
        'page.dashboard.focus.proof.kappa_other',
        { count: recommendation.progress.remaining }
      );
    }
    if (recommendation.reason === 'close') {
      return getCountLabel(
        recommendation.progress.remaining,
        'page.dashboard.focus.proof.close_one',
        'page.dashboard.focus.proof.close_other',
        { count: recommendation.progress.remaining }
      );
    }
    if (recommendation.progress.remaining <= 0) {
      return t('page.dashboard.focus.proof.ready_zero');
    }
    return getCountLabel(
      recommendation.progress.remaining,
      'page.dashboard.focus.proof.ready_one',
      'page.dashboard.focus.proof.ready_other',
      { count: recommendation.progress.remaining }
    );
  };
  const getContributionText = (recommendation: DashboardRecommendation) => {
    if (recommendation.kind === 'filters') return t('page.dashboard.focus.contribution.filters');
    if (recommendation.reason === 'complete')
      return t('page.dashboard.focus.contribution.complete');
    if (recommendation.unlockTraderName) {
      return t('page.dashboard.focus.contribution.unlock_trader', {
        trader: recommendation.unlockTraderName,
      });
    }
    if (recommendation.impact > 0) return formatImpactContribution(recommendation.impact);
    if (recommendation.isLightkeeper) return t('page.dashboard.focus.contribution.lightkeeper');
    if (recommendation.isKappa) return t('page.dashboard.focus.contribution.kappa');
    if (recommendation.chainTraderName) {
      return t('page.dashboard.focus.contribution.trader', {
        trader: recommendation.chainTraderName,
      });
    }
    return t('page.dashboard.focus.contribution.default');
  };
  const getStatusText = (recommendation: DashboardRecommendation) => {
    const blocker = getPrimaryBlocker(recommendation);
    switch (blocker.type) {
      case 'ready':
        if (recommendation.progress.remaining <= 0) {
          return t('page.dashboard.focus.status.ready_no_objectives');
        }
        return getCountLabel(
          recommendation.progress.remaining,
          'page.dashboard.focus.status.ready_one',
          'page.dashboard.focus.status.ready_other',
          { count: recommendation.progress.remaining }
        );
      case 'filters':
        return t('page.dashboard.focus.status.filters');
      case 'level':
        return getCountLabel(
          blocker.count ?? 0,
          'page.dashboard.focus.status.level_one',
          'page.dashboard.focus.status.level_other',
          { count: blocker.count ?? 0, required: blocker.required ?? 0 }
        );
      case 'prerequisite':
        return t('page.dashboard.focus.status.prerequisite', {
          tasks: (blocker.taskNames ?? []).join(', '),
        });
      case 'fence':
        return t(
          (blocker.required ?? 0) < 0
            ? 'page.dashboard.focus.status.fence_negative'
            : 'page.dashboard.focus.status.fence_positive',
          { required: formatNumericValue(blocker.required) }
        );
      case 'trader-unlock':
        return t('page.dashboard.focus.status.trader_unlock', {
          task: blocker.taskName,
          trader: blocker.traderName,
        });
      case 'complete':
        return t('page.dashboard.focus.status.complete');
      default:
        return t('page.dashboard.focus.status.ready_no_objectives');
    }
  };
  const primaryHeading = computed(() =>
    primaryRecommendation.value ? getPrimaryHeading(primaryRecommendation.value) : ''
  );
  const primarySummary = computed(() =>
    primaryRecommendation.value ? getPrimarySummary(primaryRecommendation.value) : ''
  );
  const primaryWhy = computed(() =>
    primaryRecommendation.value ? getProofText(primaryRecommendation.value) : ''
  );
  const primaryContribution = computed(() =>
    primaryRecommendation.value ? getContributionText(primaryRecommendation.value) : ''
  );
  const primaryStatus = computed(() =>
    primaryRecommendation.value ? getStatusText(primaryRecommendation.value) : ''
  );
  const primaryBadges = computed(() => {
    if (!primaryRecommendation.value) return [];
    const badges = new Set<string>();
    const recommendation = primaryRecommendation.value;
    if (recommendation.unlockTraderName) {
      badges.add(
        t('page.dashboard.focus.reason.unlock_trader', {
          trader: recommendation.unlockTraderName,
        })
      );
    }
    if (recommendation.impact > 0) {
      badges.add(formatImpactLabel(recommendation.impact));
    }
    if (recommendation.isKappa) {
      badges.add(t('page.dashboard.focus.reason.kappa'));
    }
    if (recommendation.isLightkeeper) {
      badges.add(t('page.dashboard.focus.reason.lightkeeper'));
    }
    if (
      recommendation.chainTraderName &&
      !recommendation.unlockTraderName &&
      !recommendation.isKappa &&
      !recommendation.isLightkeeper
    ) {
      badges.add(
        t('page.dashboard.focus.reason.trader', { trader: recommendation.chainTraderName })
      );
    }
    if (recommendation.kind === 'filters') {
      badges.add(t('page.dashboard.focus.reason.filters'));
    }
    return Array.from(badges).slice(0, 4);
  });
  const primaryCtaLabel = computed(() => {
    if (!primaryRecommendation.value || primaryRecommendation.value.kind === 'filters') {
      return t('page.dashboard.focus.cta.open_tasks');
    }
    if (primaryRecommendation.value.reason === 'complete') {
      return t('page.dashboard.focus.cta.open_tasks');
    }
    return t('page.dashboard.focus.cta.open_task');
  });
  const primaryCtaColor = computed(() => {
    if (!primaryRecommendation.value) return 'primary';
    switch (primaryRecommendation.value.tone) {
      case 'info':
        return 'info';
      case 'warning':
        return 'warning';
      case 'success':
        return 'success';
      case 'kappa':
        return 'error';
      case 'lightkeeper':
        return 'warning';
      default:
        return 'primary';
    }
  });
  const secondarySummary = computed(() => {
    if (!secondaryRecommendations.value.length) {
      return t('page.dashboard.focus.stat.secondary_empty');
    }
    return mode.value === 'blocked'
      ? t('page.dashboard.focus.stat.secondary_blocked')
      : t('page.dashboard.focus.stat.secondary_actionable');
  });
  const getSecondaryHeading = (recommendation: DashboardRecommendation) => {
    if (recommendation.kind === 'filters') {
      return t('page.dashboard.focus.heading.review_filters');
    }
    if (recommendation.reason === 'complete') {
      return t('page.dashboard.focus.heading.caught_up');
    }
    return recommendation.taskName || '';
  };
  const getSecondaryDescription = (recommendation: DashboardRecommendation) =>
    `${getCompactReasonText(recommendation)} · ${getStatusText(recommendation)}`;
  const handleRecommendationClick = (
    recommendation: DashboardRecommendation,
    variant: DashboardRecommendationClickVariant
  ) => {
    trackRecommendationClick({
      recommendationId: recommendation.id,
      reason: recommendation.reason,
      taskId: recommendation.taskId,
      variant,
    });
  };
</script>
