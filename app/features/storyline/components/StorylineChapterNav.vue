<template>
  <nav ref="navRef" :aria-label="t('page.storyline.chapter_nav_label')">
    <ul
      ref="listRef"
      class="relative -mx-3 flex snap-x gap-2 overflow-x-auto px-3 py-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-1"
    >
      <li
        v-for="chapter in chapters"
        :key="chapter.id"
        class="shrink-0 snap-start"
        :data-chapter-id="chapter.id"
      >
        <UTooltip :text="tileLabel(chapter)" :content="{ side: 'right' }">
          <button
            type="button"
            class="relative flex size-16 cursor-pointer items-center justify-center overflow-hidden rounded-md border transition-colors lg:size-18"
            :class="
              chapter.id === selectedId
                ? 'border-primary-400/80 bg-primary-500/25'
                : 'bg-surface-900 border-white/10 hover:border-white/25 hover:bg-white/5'
            "
            :aria-label="tileLabel(chapter)"
            :aria-current="chapter.id === selectedId ? 'true' : undefined"
            @click="emit('select', chapter.id)"
          >
            <img
              :src="`/img/storyline/${chapter.normalizedName}.webp`"
              alt=""
              class="size-3/5 object-contain"
              :class="chapter.id === selectedId || chapter.complete ? '' : 'opacity-60'"
            />
            <UIcon
              v-if="chapter.complete"
              name="i-mdi-check-bold"
              class="bg-success-600/90 absolute top-0 right-0 size-4 rounded-bl p-0.5 text-white"
            />
            <span class="absolute inset-x-0 bottom-0 h-1 bg-black/40">
              <span
                class="block h-full"
                :class="chapter.complete ? 'bg-success-500/80' : 'bg-primary-400/80'"
                :style="{ width: `${progressPercent(chapter)}%` }"
              ></span>
            </span>
          </button>
        </UTooltip>
      </li>
    </ul>
  </nav>
</template>
<script setup lang="ts">
  import type { StorylineNormalizedChapterView } from '@/composables/useStorylineChapters';
  const props = defineProps<{
    chapters: StorylineNormalizedChapterView[];
    selectedId: string | null;
  }>();
  const emit = defineEmits<{ select: [chapterId: string] }>();
  const { t } = useI18n({ useScope: 'global' });
  const progressPercent = (chapter: StorylineNormalizedChapterView) => {
    if (chapter.complete) return 100;
    if (!chapter.mainObjectiveTotal) return 0;
    return (chapter.mainObjectiveCompleted / chapter.mainObjectiveTotal) * 100;
  };
  const tileProgress = (chapter: StorylineNormalizedChapterView) => {
    if (chapter.complete) return ` (${t('common.completed', 'Completed')})`;
    if (!chapter.mainObjectiveTotal) return '';
    return ` (${chapter.mainObjectiveCompleted}/${chapter.mainObjectiveTotal})`;
  };
  const tileLabel = (chapter: StorylineNormalizedChapterView) =>
    `${chapter.name}${tileProgress(chapter)}`;
  // Keep the selected tile in view. On narrow screens the list scrolls sideways; on wide screens the
  // nav is the vertical rail. Only the rail's own offsets move, never the page, and each scroll is a
  // no-op on the layout where that element does not scroll.
  const navRef = ref<HTMLElement | null>(null);
  const listRef = ref<HTMLElement | null>(null);
  const revealSelected = () => {
    const nav = navRef.value;
    const list = listRef.value;
    const tiles = list?.querySelectorAll<HTMLElement>('[data-chapter-id]') ?? [];
    const tile = [...tiles].find((element) => element.dataset.chapterId === props.selectedId);
    if (!nav || !list || !tile) return;
    list.scrollTo({ left: tile.offsetLeft - (list.clientWidth - tile.offsetWidth) / 2 });
    const tileTop = list.offsetTop + tile.offsetTop;
    nav.scrollTo({ top: tileTop - (nav.clientHeight - tile.offsetHeight) / 2 });
  };
  onMounted(revealSelected);
  watch(() => props.selectedId, revealSelected, { flush: 'post' });
</script>
