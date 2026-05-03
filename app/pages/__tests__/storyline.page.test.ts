// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import StorylinePage from '@/pages/storyline.vue';
const toggleChapterMock = vi.fn();
const setStoryObjectiveCompleteMock = vi.fn();
const setStoryObjectiveUncompleteMock = vi.fn();
let objectiveCompletionState: Record<string, boolean> = {};
const isStoryObjectiveCompleteMock = vi.fn((chapterId: string, objectiveId: string) => {
  return objectiveCompletionState[`${chapterId}:${objectiveId}`] === true;
});
mockNuxtImport('definePageMeta', () => () => {});
mockNuxtImport('useSeoMeta', () => () => {});
vi.mock('@/composables/useStorylineChapters', () => ({
  useStorylineChapters: () => ({
    chapters: ref([
      {
        id: 'chapter-1',
        objectiveMap: {
          'obj-1': { mutuallyExclusiveWith: ['obj-2'] },
          'obj-2': { mutuallyExclusiveWith: ['obj-1'] },
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
    objectiveCompletionState = {};
  });
  const createWrapper = () =>
    mount(StorylinePage, {
      global: {
        stubs: {
          ChapterCard: {
            emits: ['toggle-chapter', 'toggle-objective'],
            template: `
              <div>
                <button data-testid="chapter-card" @click="$emit('toggle-chapter', 'chapter-1')" />
                <button
                  data-testid="objective-card"
                  @click="$emit('toggle-objective', 'chapter-1', 'obj-1')"
                />
              </div>
            `,
          },
          UAlert: true,
        },
      },
    });
  it('renders storyline chapter cards and forwards chapter toggle', async () => {
    const wrapper = createWrapper();
    const chapterCard = wrapper.find('[data-testid="chapter-card"]');
    expect(chapterCard.exists()).toBe(true);
    await chapterCard.trigger('click');
    expect(toggleChapterMock).toHaveBeenCalledWith('chapter-1');
    wrapper.unmount();
  });
  it('marks objective complete when no route blocker exists', async () => {
    const wrapper = createWrapper();
    const objectiveCard = wrapper.get('[data-testid="objective-card"]');
    await objectiveCard.trigger('click');
    expect(setStoryObjectiveCompleteMock).toHaveBeenCalledWith('chapter-1', 'obj-1');
    expect(setStoryObjectiveUncompleteMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('marks objective incomplete when objective is already complete', async () => {
    objectiveCompletionState['chapter-1:obj-1'] = true;
    const wrapper = createWrapper();
    const objectiveCard = wrapper.get('[data-testid="objective-card"]');
    await objectiveCard.trigger('click');
    expect(setStoryObjectiveUncompleteMock).toHaveBeenCalledWith('chapter-1', 'obj-1');
    expect(setStoryObjectiveCompleteMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('does not toggle blocked route objective', async () => {
    objectiveCompletionState['chapter-1:obj-2'] = true;
    const wrapper = createWrapper();
    const objectiveCard = wrapper.get('[data-testid="objective-card"]');
    await objectiveCard.trigger('click');
    expect(setStoryObjectiveCompleteMock).not.toHaveBeenCalled();
    expect(setStoryObjectiveUncompleteMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
