<template>
  <section class="bg-primary-950/10 border-primary-700/30 rounded-md border p-3">
    <div class="mb-2 flex items-center justify-between gap-2">
      <h3 class="text-primary-300 text-xs font-semibold tracking-wide uppercase">
        {{ t('page.storyline.endings') }}
      </h3>
      <UBadge variant="subtle" color="primary" size="md">
        {{ endings.length }}
      </UBadge>
    </div>
    <div class="space-y-1.5">
      <div
        v-for="ending in endings"
        :key="ending.id"
        class="rounded border p-2.5"
        :class="ENDING_STATES[ending.routeState].card"
      >
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="light:text-surface-50 text-sm font-semibold text-white">
            {{ ending.label }}
          </span>
          <UBadge
            v-if="ending.routeChoiceIndex !== null"
            variant="subtle"
            color="warning"
            size="md"
          >
            {{ t('page.storyline.route_decision', { index: ending.routeChoiceIndex }) }}
          </UBadge>
          <UBadge variant="subtle" :color="ENDING_STATES[ending.routeState].color" size="md">
            {{ t(...ENDING_STATES[ending.routeState].label) }}
          </UBadge>
        </div>
        <div
          v-if="ending.objectiveLabel && ending.objectiveLabel !== ending.label"
          :class="META_CLASS"
        >
          {{ ending.objectiveLabel }}
        </div>
        <div v-if="ending.objectiveTotal" :class="META_CLASS">
          {{
            t('page.storyline.ending_progress', {
              completed: ending.objectiveCompleted ?? 0,
              total: ending.objectiveTotal,
            })
          }}
        </div>
        <div v-else-if="ending.evidencePending" :class="META_CLASS">
          {{ t('page.storyline.ending_evidence_pending') }}
        </div>
        <div
          v-if="ending.routeState === 'blocked' && ending.routeBlockingAlternatives.length"
          class="text-error-300 mt-1 text-xs leading-snug"
        >
          {{
            t('page.storyline.route_blocked_by', {
              objectives: ending.routeBlockingAlternatives.map((entry) => entry.label).join(', '),
            })
          }}
        </div>
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
  import type {
    StorylineEndingView,
    StorylineObjectiveProgress,
  } from '@/composables/useStorylineChapters';
  defineProps<{ endings: StorylineEndingView[] }>();
  const { t } = useI18n({ useScope: 'global' });
  const META_CLASS = 'text-surface-400 mt-1 text-xs leading-snug';
  const ENDING_STATES: Record<
    StorylineObjectiveProgress['routeState'],
    { card: string; color: 'success' | 'error' | 'neutral'; label: [string, string] }
  > = {
    chosen: {
      card: 'border-success-700/40 bg-success-950/20',
      color: 'success',
      label: ['page.storyline.route_chosen', 'Route selected'],
    },
    blocked: {
      card: 'border-error-700/30 bg-error-950/10 opacity-70',
      color: 'error',
      label: ['common.blocked', 'Blocked'],
    },
    open: {
      card: 'border-white/10 bg-surface-900/40',
      color: 'neutral',
      label: ['common.available', 'Available'],
    },
  };
</script>
