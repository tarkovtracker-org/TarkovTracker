<template>
  <div
    class="bg-surface-900 rounded-lg border border-white/10 p-4 transition-colors"
    :class="chapter.complete ? 'border-success-700/30' : ''"
  >
    <div class="mb-3 flex items-center gap-3">
      <button
        class="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center"
        :aria-label="
          chapter.complete ? t('page.storyline.mark_incomplete') : t('page.storyline.mark_complete')
        "
        @click="emit('toggleChapter', chapter.id)"
      >
        <img
          :src="`/img/storyline/${chapter.normalizedName}.webp`"
          :alt="chapter.name"
          class="h-10 w-10 object-contain"
          :class="chapter.complete ? '' : 'opacity-40'"
        />
        <UIcon
          v-if="chapter.complete"
          name="i-mdi-check-bold"
          class="bg-success-600/80 absolute right-0 bottom-0 h-3.5 w-3.5 rounded-tl p-0.5 text-white"
        />
      </button>
      <div class="min-w-0 flex-1">
        <a
          :href="chapter.wikiLink"
          target="_blank"
          rel="noopener noreferrer"
          class="text-link hover:text-link-hover flex items-center gap-1 text-sm font-semibold no-underline"
        >
          <span class="truncate">{{ chapter.name }}</span>
          <UIcon
            name="i-mdi-open-in-new"
            class="text-surface-400 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
        </a>
        <div class="flex items-center gap-1.5">
          <UBadge v-if="chapter.autoStart" variant="subtle" color="info" size="xs">
            {{ t('page.profile.storyline_auto_start') }}
          </UBadge>
          <UBadge v-else variant="subtle" color="neutral" size="xs">
            {{ t('page.profile.storyline_discovered') }}
          </UBadge>
        </div>
      </div>
    </div>
    <div
      v-if="chapter.requirements.length"
      class="bg-surface-950/20 mb-2 rounded-md border border-white/5 p-2"
    >
      <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
        {{ t('page.profile.storyline_requires') }}
      </div>
      <ul class="space-y-0.5">
        <li
          v-for="requirement in chapter.requirements"
          :key="requirement.id"
          class="text-surface-300 text-xs"
        >
          {{ requirement.label }}
        </li>
      </ul>
    </div>
    <div
      v-if="chapter.mainObjectives.length || chapter.optionalObjectives.length"
      class="bg-surface-950/20 mb-2 rounded-md border border-white/5 p-2"
    >
      <div v-if="chapter.mainObjectives.length">
        <div
          class="text-surface-500 mb-0.5 flex items-center justify-between text-[11px] font-medium tracking-wider uppercase"
        >
          <span>{{ t('page.profile.storyline_objectives_main') }}</span>
          <span>{{ chapter.mainObjectiveCompleted }}/{{ chapter.mainObjectiveTotal }}</span>
        </div>
        <div class="space-y-0.5">
          <label
            v-for="objective in chapter.mainObjectives"
            :key="objective.id"
            class="flex cursor-pointer items-start gap-1.5 rounded px-1 py-0.5 hover:bg-white/5"
          >
            <input
              type="checkbox"
              :checked="objective.complete"
              class="accent-success-500 mt-0.5 shrink-0"
              @change="emit('toggleObjective', chapter.id, objective.id)"
            />
            <span
              class="text-xs"
              :class="objective.complete ? 'text-surface-500 line-through' : 'text-surface-300'"
            >
              {{ objective.description }}
            </span>
          </label>
        </div>
      </div>
      <div
        v-if="chapter.optionalObjectives.length"
        :class="chapter.mainObjectives.length ? 'mt-2 border-t border-white/5 pt-2' : ''"
      >
        <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
          {{ t('page.profile.storyline_objectives_optional') }}
        </div>
        <div class="space-y-0.5">
          <label
            v-for="objective in chapter.optionalObjectives"
            :key="objective.id"
            class="flex cursor-pointer items-start gap-1.5 rounded px-1 py-0.5 hover:bg-white/5"
          >
            <input
              type="checkbox"
              :checked="objective.complete"
              class="accent-info-500 mt-0.5 shrink-0"
              @change="emit('toggleObjective', chapter.id, objective.id)"
            />
            <span
              class="text-xs"
              :class="objective.complete ? 'text-surface-500 line-through' : 'text-surface-300'"
            >
              {{ objective.description }}
            </span>
          </label>
        </div>
      </div>
    </div>
    <div
      v-if="chapter.mapUnlocks.length"
      class="bg-surface-950/20 mb-2 rounded-md border border-white/5 p-2"
    >
      <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
        {{ t('page.profile.storyline_unlocks_maps') }}
      </div>
      <div class="flex flex-wrap gap-1">
        <UBadge
          v-for="map in chapter.mapUnlocks"
          :key="map.id"
          variant="subtle"
          color="primary"
          size="xs"
        >
          {{ map.name }}
        </UBadge>
      </div>
    </div>
    <div
      v-if="chapter.traderUnlocks.length"
      class="bg-surface-950/20 mb-2 rounded-md border border-white/5 p-2"
    >
      <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
        {{ t('page.profile.storyline_unlocks_traders') }}
      </div>
      <div class="flex flex-wrap gap-1">
        <UBadge
          v-for="trader in chapter.traderUnlocks"
          :key="trader.id"
          variant="subtle"
          color="warning"
          size="xs"
        >
          {{ trader.name }}
        </UBadge>
      </div>
    </div>
    <div class="mt-3 flex items-center justify-end border-t border-white/5 pt-2">
      <UButton
        size="xs"
        :variant="chapter.complete ? 'soft' : 'ghost'"
        :color="chapter.complete ? 'success' : 'neutral'"
        @click="emit('toggleChapter', chapter.id)"
      >
        {{ chapter.complete ? t('page.storyline.completed') : t('page.storyline.mark_complete') }}
      </UButton>
    </div>
  </div>
</template>
<script setup lang="ts">
  import type { StorylineNormalizedChapterView } from '@/composables/useStorylineChapters';
  interface Props {
    chapter: StorylineNormalizedChapterView;
  }
  const props = defineProps<Props>();
  const chapter = computed(() => props.chapter);
  const emit = defineEmits<{
    toggleChapter: [chapterId: string];
    toggleObjective: [chapterId: string, objectiveId: string];
  }>();
  const { t } = useI18n({ useScope: 'global' });
</script>
