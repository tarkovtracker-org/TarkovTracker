// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import StorylinePage from '@/pages/storyline.vue';
const toggleChapterMock = vi.fn();
const setStoryObjectiveCompleteMock = vi.fn();
const setStoryObjectiveUncompleteMock = vi.fn();
const isStoryObjectiveCompleteMock = vi.fn(() => false);
mockNuxtImport('definePageMeta', () => () => {});
mockNuxtImport('useHead', () => () => {});
vi.mock('@/composables/useStorylineChapters', () => ({
  useStorylineChapters: () => ({
    chapters: ref([
      {
        id: 'chapter-1',
        objectiveMap: {
          'obj-1': { mutuallyExclusiveWith: [] },
        },
      },
    ]),
    normalizedChapters: ref([
      {
        complete: false,
        id: 'chapter-1',
        title: 'Chapter 1',
      },
    ]),
  }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    isStoryObjectiveComplete: isStoryObjectiveCompleteMock,
    setStoryObjectiveComplete: setStoryObjectiveCompleteMock,
    setStoryObjectiveUncomplete: setStoryObjectiveUncompleteMock,
    toggleStoryChapterComplete: toggleChapterMock,
  }),
}));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));
describe('storyline page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('renders storyline chapter cards and forwards chapter toggle', async () => {
    const wrapper = mount(StorylinePage, {
      global: {
        stubs: {
          ChapterCard: {
            emits: ['toggle-chapter', 'toggle-objective'],
            template:
              '<button data-testid="chapter-card" @click="$emit(\'toggle-chapter\', \'chapter-1\')" />',
          },
          UAlert: true,
        },
      },
    });
    const chapterCard = wrapper.find('[data-testid="chapter-card"]');
    expect(chapterCard.exists()).toBe(true);
    await chapterCard.trigger('click');
    expect(toggleChapterMock).toHaveBeenCalledWith('chapter-1');
  });
});
