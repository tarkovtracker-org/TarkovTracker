<template>
  <header class="flex items-center gap-3 @3xl/card:gap-4">
    <component
      :is="canToggle ? 'button' : 'div'"
      :type="canToggle ? 'button' : undefined"
      class="relative flex size-10 shrink-0 items-center justify-center @3xl/card:size-16"
      :class="canToggle ? 'cursor-pointer' : ''"
      :aria-label="canToggle ? toggleLabel : undefined"
      @click="canToggle && emit('toggle')"
    >
      <img
        :src="`/img/storyline/${chapter.normalizedName}.webp`"
        alt=""
        class="size-full object-contain"
        :class="chapter.complete ? '' : 'opacity-40'"
      />
      <UIcon
        v-if="chapter.complete"
        name="i-mdi-check-bold"
        class="bg-success-600/80 absolute right-0 bottom-0 size-3.5 rounded-tl p-0.5 text-white"
      />
    </component>
    <div class="min-w-0 flex-1">
      <p class="text-surface-400 hidden text-xs tracking-widest uppercase @3xl/card:block">
        {{ t('page.storyline.chapter_eyebrow') }}
      </p>
      <h2>
        <a
          :href="toWikiUrl(chapter.wikiLink)"
          target="_blank"
          rel="noopener noreferrer"
          class="text-surface-50 hover:text-link-hover flex items-center gap-1.5 text-base font-semibold no-underline @3xl/card:text-2xl"
        >
          <span class="truncate">{{ chapter.name }}</span>
          <UIcon
            name="i-mdi-open-in-new"
            class="text-surface-400 size-4 shrink-0"
            aria-hidden="true"
          />
        </a>
      </h2>
      <div class="mt-1 flex flex-wrap items-center gap-1.5">
        <UBadge variant="subtle" :color="chapter.autoStart ? 'info' : 'neutral'" size="md">
          {{
            chapter.autoStart
              ? t('page.profile.storyline_auto_start')
              : t('page.profile.storyline_discovered')
          }}
        </UBadge>
        <UBadge
          v-if="chapter.coveragePartial"
          variant="subtle"
          color="warning"
          size="md"
          :title="t('page.storyline.partial_data_hint')"
        >
          {{ t('page.storyline.partial_data') }}
        </UBadge>
      </div>
    </div>
    <UButton
      v-if="canToggle"
      class="hidden shrink-0 @3xl/card:inline-flex"
      :icon="chapter.complete ? 'i-mdi-check-circle' : 'i-mdi-check-circle-outline'"
      :variant="chapter.complete ? 'soft' : 'outline'"
      :color="chapter.complete ? 'success' : 'neutral'"
      @click="emit('toggle')"
    >
      {{ completeButtonLabel }}
    </UButton>
  </header>
</template>
<script setup lang="ts">
  import { useWikiLink } from '@/composables/useWikiLink';
  import type { StorylineNormalizedChapterView } from '@/composables/useStorylineChapters';
  const props = defineProps<{
    chapter: StorylineNormalizedChapterView;
    canToggle: boolean;
    completeButtonLabel: string;
  }>();
  const emit = defineEmits<{ toggle: [] }>();
  const { t } = useI18n({ useScope: 'global' });
  const { toWikiUrl } = useWikiLink();
  const toggleLabel = computed(() =>
    props.chapter.complete
      ? t('page.storyline.mark_incomplete')
      : t('common.mark_complete', 'Mark complete')
  );
</script>
