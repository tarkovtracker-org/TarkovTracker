<template>
  <div class="grid gap-4 xl:grid-cols-3">
    <div class="space-y-4 xl:col-span-2">
      <GenericCard
        icon="i-mdi-timeline-clock"
        :highlight-color="timelineHighlight"
        :title="t('page.profile.activity_timeline')"
        :subtitle="t('page.profile.timeline_subtitle')"
        :fill-height="false"
      >
        <template #content>
          <div class="space-y-3 p-4">
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div class="bg-panel border-border rounded-md border p-2.5">
                <div
                  class="text-foreground-subtle text-[11px] font-semibold tracking-wider uppercase"
                >
                  {{ t('page.profile.started') }}
                </div>
                <div class="text-foreground mt-1 text-sm font-medium">
                  {{ firstProgressLabel }}
                </div>
              </div>
              <div class="bg-panel border-border rounded-md border p-2.5">
                <div
                  class="text-foreground-subtle text-[11px] font-semibold tracking-wider uppercase"
                >
                  {{ t('page.profile.latest_activity') }}
                </div>
                <div class="text-foreground mt-1 text-sm font-medium">
                  {{ latestProgressLabel }}
                </div>
              </div>
              <div class="bg-panel border-border rounded-md border p-2.5">
                <div
                  class="text-foreground-subtle text-[11px] font-semibold tracking-wider uppercase"
                >
                  {{ t('page.profile.recent_momentum') }}
                </div>
                <div class="text-foreground mt-1 text-sm font-medium">
                  {{
                    t('page.profile.recent_momentum_value', {
                      count: formatNumber(recentCompletedTasks),
                    })
                  }}
                </div>
              </div>
            </div>
            <div v-if="timelineEvents.length" class="space-y-2">
              <article
                v-for="event in timelineEvents"
                :key="event.key"
                class="bg-panel border-border-muted flex items-start gap-3 rounded-md border p-3"
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
                  <div class="text-foreground truncate text-sm font-medium">
                    {{ event.title }}
                  </div>
                  <div class="text-foreground-muted truncate text-xs">
                    {{ event.subtitle }}
                  </div>
                </div>
                <div class="text-foreground-subtle shrink-0 text-[11px]">
                  {{ formatDateTime(event.timestamp) }}
                </div>
              </article>
            </div>
            <UAlert
              v-else
              icon="i-mdi-map-marker-question"
              color="neutral"
              variant="soft"
              :title="t('page.profile.no_timeline')"
            />
          </div>
        </template>
      </GenericCard>
    </div>
    <div class="space-y-4">
      <GenericCard
        icon="i-mdi-book-open-variant"
        :highlight-color="storyHighlight"
        :title="t('page.profile.progress_overview')"
        :subtitle="t('page.profile.progress_overview_subtitle')"
        :fill-height="false"
      >
        <template #content>
          <div class="space-y-3 p-4 text-sm">
            <p class="text-foreground leading-relaxed">
              {{ storyParagraph }}
            </p>
            <div class="bg-panel border-border rounded-md border p-3">
              <div
                class="text-foreground-subtle text-[11px] font-semibold tracking-wider uppercase"
              >
                {{ t('page.profile.next_milestone') }}
              </div>
              <p class="text-foreground mt-1">
                {{ nextMilestoneCopy }}
              </p>
            </div>
            <div class="bg-panel border-border rounded-md border p-3">
              <div
                class="text-foreground-subtle text-[11px] font-semibold tracking-wider uppercase"
              >
                {{ t('page.profile.total_actions') }}
              </div>
              <p class="text-foreground mt-1">
                {{
                  t('page.profile.total_actions_value', {
                    count: formatNumber(totalTrackedActions),
                  })
                }}
              </p>
            </div>
          </div>
        </template>
      </GenericCard>
      <GenericCard
        icon="i-mdi-trophy-outline"
        highlight-color="kappa"
        :title="t('page.profile.achievements')"
        :subtitle="t('page.profile.achievements_subtitle')"
        :fill-height="false"
      >
        <template #content>
          <div class="space-y-3 p-4">
            <article
              v-for="achievement in achievementRows"
              :key="achievement.id"
              class="bg-panel border-border rounded-md border p-3"
            >
              <div class="mb-2 flex items-center justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2 leading-none">
                  <UIcon
                    :name="achievement.icon"
                    class="h-4.5 w-4.5 shrink-0"
                    :class="achievement.iconClass"
                  />
                  <span class="text-foreground truncate text-sm leading-none font-medium">
                    {{ achievement.title }}
                  </span>
                </div>
                <span class="text-foreground-muted shrink-0 text-xs leading-none">
                  {{ formatNumber(achievement.completed) }}/{{ formatNumber(achievement.total) }}
                </span>
              </div>
              <div class="bg-field h-1.5 overflow-hidden rounded-full">
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
        :title="t('page.profile.kappa_projection')"
        :subtitle="t('page.profile.kappa_projection_subtitle')"
        :fill-height="false"
      >
        <template #content>
          <div class="space-y-3 p-4 text-sm">
            <p class="text-foreground font-semibold">{{ kappaProjection.headline }}</p>
            <p class="text-foreground-muted">{{ kappaProjection.detail }}</p>
            <div
              v-if="kappaProjection.etaTimestamp"
              class="bg-panel border-border rounded-md border p-3"
            >
              <div
                class="text-foreground-subtle text-[11px] font-semibold tracking-wider uppercase"
              >
                {{ t('page.profile.estimated_finish') }}
              </div>
              <p class="text-foreground mt-1 text-sm font-medium">
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
                  t('page.profile.kappa_remaining', {
                    count: formatNumber(Math.max(totalKappaTasks - completedKappaTasks, 0)),
                  })
                }}
              </UBadge>
            </div>
          </div>
        </template>
      </GenericCard>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import type {
    AchievementRow,
    KappaProjection,
    TimelineEvent,
    TimelineTone,
  } from '@/features/profile/profileTypes';
  import type { SemanticColor } from '@/types/theme';
  interface Props {
    timelineHighlight: SemanticColor;
    storyHighlight: SemanticColor;
    firstProgressLabel: string;
    latestProgressLabel: string;
    recentCompletedTasks: number;
    timelineEvents: TimelineEvent[];
    timelineToneClasses: Record<TimelineTone, { chip: string; icon: string }>;
    storyParagraph: string;
    nextMilestoneCopy: string;
    totalTrackedActions: number;
    achievementRows: AchievementRow[];
    kappaProjection: KappaProjection;
    kappaConfidenceClass: string;
    kappaConfidenceLabel: string;
    completedKappaTasks: number;
    totalKappaTasks: number;
    formatDate: (timestamp: number | null) => string;
    formatDateTime: (timestamp: number) => string;
  }
  defineProps<Props>();
  const { t } = useI18n({ useScope: 'global' });
  const formatNumber = useLocaleNumberFormatter();
</script>
