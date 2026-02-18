<template>
  <div>
    <UAlert
      v-if="!chapterProgress.length"
      icon="i-mdi-book-off-outline"
      color="neutral"
      variant="soft"
      :title="t('page.profile.no_storyline')"
    />
    <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="chapter in chapterProgress"
        :key="chapter.id"
        class="bg-surface-900 rounded-lg border border-white/10 p-3"
      >
        <div class="mb-2 flex items-center gap-2">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center">
            <img
              :src="`/img/storyline/${chapter.normalizedName}.webp`"
              :alt="chapter.name"
              class="h-8 w-8 object-contain"
              :class="chapter.complete ? '' : 'opacity-40'"
            />
          </div>
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
            <div class="text-surface-400 flex items-center gap-1.5 text-xs">
              <UBadge v-if="chapter.autoStart" variant="subtle" color="info" size="xs">
                {{ t('page.profile.storyline_auto_start') }}
              </UBadge>
              <UBadge v-else variant="subtle" color="neutral" size="xs">
                {{ t('page.profile.storyline_discovered') }}
              </UBadge>
            </div>
          </div>
          <UIcon
            v-if="chapter.complete"
            name="i-mdi-check-circle"
            class="text-success-400 h-5 w-5 shrink-0"
          />
        </div>
        <div v-if="chapter.requirements.length" class="mb-1.5">
          <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
            {{ t('page.profile.storyline_requires') }}
          </div>
          <div class="text-surface-300 text-xs">
            {{ chapter.requirements.map((r) => r.name).join(', ') }}
          </div>
        </div>
        <div v-if="chapter.mapUnlocks.length" class="mb-1.5">
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
        <div v-if="chapter.traderUnlocks.length" class="mb-1.5">
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
        <div v-if="chapter.description" class="mb-1.5">
          <div class="text-surface-400 text-xs">
            {{ chapter.description }}
          </div>
        </div>
        <div v-if="chapter.notes" class="mb-1.5">
          <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
            {{ t('page.profile.storyline_notes') }}
          </div>
          <div class="text-warning-400 text-xs">{{ chapter.notes }}</div>
        </div>
        <div v-if="chapter.mainObjectives.length" class="mb-1.5">
          <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
            {{ t('page.profile.storyline_objectives_main') }}
          </div>
          <div class="space-y-0.5">
            <label
              v-for="obj in chapter.mainObjectives"
              :key="obj.id"
              class="flex items-start gap-1.5 rounded px-1 py-0.5"
              :class="
                props.readOnly ? 'cursor-default opacity-70' : 'cursor-pointer hover:bg-white/5'
              "
            >
              <input
                type="checkbox"
                :checked="obj.complete"
                class="accent-success-500 mt-0.5 shrink-0"
                :disabled="props.readOnly"
                @change="handleObjectiveToggle(chapter.id, obj.id)"
              />
              <span
                class="text-xs"
                :class="obj.complete ? 'text-surface-500 line-through' : 'text-surface-300'"
              >
                {{ obj.description }}
              </span>
            </label>
          </div>
        </div>
        <div v-if="chapter.optionalObjectives.length" class="mb-1.5">
          <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
            {{ t('page.profile.storyline_objectives_optional') }}
          </div>
          <div class="space-y-0.5">
            <label
              v-for="obj in chapter.optionalObjectives"
              :key="obj.id"
              class="flex items-start gap-1.5 rounded px-1 py-0.5"
              :class="
                props.readOnly ? 'cursor-default opacity-70' : 'cursor-pointer hover:bg-white/5'
              "
            >
              <input
                type="checkbox"
                :checked="obj.complete"
                class="accent-info-500 mt-0.5 shrink-0"
                :disabled="props.readOnly"
                @change="handleObjectiveToggle(chapter.id, obj.id)"
              />
              <span
                class="text-xs"
                :class="obj.complete ? 'text-surface-500 line-through' : 'text-surface-300'"
              >
                {{ obj.description }}
              </span>
            </label>
          </div>
        </div>
        <div v-if="chapter.rewards" class="mb-1.5">
          <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
            {{ t('page.profile.storyline_rewards') }}
          </div>
          <div class="text-surface-300 text-xs">{{ chapter.rewards.description }}</div>
        </div>
        <div class="bg-surface-800/60 mt-2 h-1.5 overflow-hidden rounded-full">
          <div
            class="h-full rounded-full transition-[width] duration-300"
            :class="
              chapter.complete
                ? 'bg-success-500/70'
                : chapter.mainProgress > 0
                  ? 'bg-primary-500/70'
                  : 'bg-surface-700'
            "
            :style="{
              width:
                chapter.mainTotal > 0
                  ? `${(chapter.mainProgress / chapter.mainTotal) * 100}%`
                  : chapter.complete
                    ? '100%'
                    : '0%',
            }"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useStorylineChapters } from '@/composables/useStorylineChapters';
  interface Props {
    storyChapterCompletionState: Record<string, boolean>;
    storyObjectiveCompletionState: Record<string, Record<string, boolean>>;
    readOnly?: boolean;
  }
  const props = defineProps<Props>();
  const emit = defineEmits<{
    toggleObjective: [chapterId: string, objectiveId: string];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const { chapters } = useStorylineChapters({
    isChapterComplete: (chapterId: string) => props.storyChapterCompletionState[chapterId] === true,
  });
  interface ObjectiveProgress {
    id: string;
    order: number;
    type: 'main' | 'optional';
    description: string;
    notes?: string | null;
    mutuallyExclusiveWith?: string[];
    complete: boolean;
  }
  interface ChapterProgress {
    id: string;
    name: string;
    normalizedName: string;
    order: number;
    autoStart: boolean;
    complete: boolean;
    wikiLink: string;
    description?: string | null;
    notes?: string | null;
    rewards?: { description: string } | null;
    requirements: Array<{ id: string; name: string }>;
    mapUnlocks: Array<{ id: string; name: string }>;
    traderUnlocks: Array<{ id: string; name: string }>;
    mainObjectives: ObjectiveProgress[];
    optionalObjectives: ObjectiveProgress[];
    mainProgress: number;
    mainTotal: number;
  }
  const chapterProgress = computed<ChapterProgress[]>(() => {
    return chapters.value.map((chapter) => {
      const chapterObjState = props.storyObjectiveCompletionState[chapter.id] ?? {};
      const mainObjectives = chapter.objectives
        .filter((o) => o.type === 'main')
        .map((o) => ({ ...o, complete: chapterObjState[o.id] === true }));
      const optionalObjectives = chapter.objectives
        .filter((o) => o.type === 'optional')
        .map((o) => ({ ...o, complete: chapterObjState[o.id] === true }));
      const mainTotal = mainObjectives.length;
      const mainProgress = mainObjectives.filter((o) => o.complete).length;
      return {
        id: chapter.id,
        name: chapter.name || chapter.id,
        normalizedName: chapter.normalizedName,
        order: chapter.order,
        autoStart: chapter.autoStart ?? false,
        complete: chapter.complete,
        wikiLink: chapter.wikiLink,
        description: chapter.description,
        notes: chapter.notes,
        rewards: chapter.rewards,
        requirements: chapter.requirements,
        mapUnlocks: chapter.mapUnlocks,
        traderUnlocks: chapter.traderUnlocks,
        mainObjectives,
        optionalObjectives,
        mainProgress,
        mainTotal,
      };
    });
  });
  const handleObjectiveToggle = (chapterId: string, objectiveId: string) => {
    if (props.readOnly) {
      return;
    }
    emit('toggleObjective', chapterId, objectiveId);
  };
</script>
