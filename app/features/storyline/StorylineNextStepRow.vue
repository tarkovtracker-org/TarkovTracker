<template>
  <NuxtLink
    :to="{ path: '/storyline', query: { chapter: item.chapterId, objective: item.objectiveId } }"
    class="focus-visible:ring-primary-400 flex min-w-0 items-start gap-3 px-4 py-3 transition-colors hover:bg-white/4 focus-visible:ring-2 focus-visible:ring-inset"
    data-testid="up-next-storyline"
    @click="onClick"
  >
    <UIcon
      name="i-mdi-book-open-page-variant-outline"
      class="text-primary-400 mt-0.5 h-5 w-5 shrink-0"
      aria-hidden="true"
    />
    <div class="min-w-0 flex-1">
      <span class="text-primary-400 block text-xs font-medium">
        {{ t('page.dashboard.up_next.storyline.chapter', { chapter: item.chapterName }) }}
      </span>
      <span class="text-surface-100 light:text-surface-50 mt-1 block font-medium">{{ label }}</span>
      <span class="text-surface-400 mt-1 block text-xs">{{ detail }}</span>
      <span
        v-if="benefit"
        class="text-success-400 light:text-success-700 mt-1 block text-xs"
        data-testid="storyline-benefit"
      >
        {{ benefit }}
      </span>
    </div>
    <UIcon
      name="i-mdi-arrow-right"
      class="text-surface-400 mt-1 h-4 w-4 shrink-0"
      aria-hidden="true"
    />
  </NuxtLink>
</template>
<script setup lang="ts">
  import { useDashboardFocusAnalytics } from '@/composables/useDashboardFocusAnalytics';
  import type { StorylineNextStep } from '@/features/storyline/nextStep';
  const props = withDefaults(defineProps<{ item: StorylineNextStep; trackClicks?: boolean }>(), {
    trackClicks: true,
  });
  const { t } = useI18n({ useScope: 'global' });
  const { clearRecommendationAttribution } = useDashboardFocusAnalytics();
  const onClick = () => {
    if (props.trackClicks) clearRecommendationAttribution();
  };
  const label = computed(
    () => props.item.description ?? t(`page.dashboard.up_next.storyline.${props.item.kind}`)
  );
  const detail = computed(() => t(`page.dashboard.up_next.storyline.${props.item.kind}_hint`));
  const benefit = computed(() => {
    const labels = props.item.unlocks.map((unlock) =>
      t('page.dashboard.up_next.storyline.unlocks', { unlock })
    );
    if (props.item.opens)
      labels.push(
        t(
          props.item.opens === 1
            ? 'page.dashboard.up_next.reason.opens_one'
            : 'page.dashboard.up_next.reason.opens_other',
          { count: props.item.opens }
        )
      );
    return labels.join(' · ');
  });
</script>
