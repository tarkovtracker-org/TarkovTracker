// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import StorylinePage from '@/pages/storyline.vue';
const setStoryChapterCompleteMock = vi.fn();
const setStoryChapterUncompleteMock = vi.fn();
const setStoryObjectiveCompleteMock = vi.fn();
const setStoryObjectiveUncompleteMock = vi.fn();
let chapterCompletionState: Record<string, boolean> = {};
let objectiveCompletionState: Record<string, boolean> = {};
const isStoryChapterCompleteMock = vi.fn((chapterId: string) => {
  return chapterCompletionState[chapterId] === true;
});
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
        objectives: [
          {
            id: 'obj-1',
            order: 1,
            type: 'main',
            description: 'Route A',
            mutuallyExclusiveWith: ['obj-2'],
          },
          {
            id: 'obj-2',
            order: 2,
            type: 'main',
            description: 'Route B',
            mutuallyExclusiveWith: ['obj-1'],
          },
          { id: 'obj-3', order: 3, type: 'main', description: 'Linear objective' },
          { id: 'obj-4', order: 4, type: 'optional', description: 'Optional linear' },
        ],
        objectiveMap: {
          'obj-1': { mutuallyExclusiveWith: ['obj-2'] },
          'obj-2': { mutuallyExclusiveWith: ['obj-1'] },
          'obj-3': {},
          'obj-4': {},
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
    isStoryChapterComplete: isStoryChapterCompleteMock,
    isStoryObjectiveComplete: isStoryObjectiveCompleteMock,
    setStoryChapterComplete: setStoryChapterCompleteMock,
    setStoryChapterUncomplete: setStoryChapterUncompleteMock,
    setStoryObjectiveComplete: setStoryObjectiveCompleteMock,
    setStoryObjectiveUncomplete: setStoryObjectiveUncompleteMock,
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
    chapterCompletionState = {};
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
  it('marks chapter complete and auto-completes non-route-choice objectives', async () => {
    const wrapper = createWrapper();
    const chapterCard = wrapper.find('[data-testid="chapter-card"]');
    await chapterCard.trigger('click');
    expect(setStoryChapterCompleteMock).toHaveBeenCalledWith('chapter-1');
    expect(setStoryChapterUncompleteMock).not.toHaveBeenCalled();
    expect(setStoryObjectiveCompleteMock).toHaveBeenCalledWith('chapter-1', 'obj-3');
    expect(setStoryObjectiveCompleteMock).toHaveBeenCalledWith('chapter-1', 'obj-4');
    expect(setStoryObjectiveCompleteMock).not.toHaveBeenCalledWith('chapter-1', 'obj-1');
    expect(setStoryObjectiveCompleteMock).not.toHaveBeenCalledWith('chapter-1', 'obj-2');
    wrapper.unmount();
  });
  it('marks chapter incomplete and auto-uncompletes non-route-choice objectives', async () => {
    chapterCompletionState['chapter-1'] = true;
    objectiveCompletionState['chapter-1:obj-3'] = true;
    objectiveCompletionState['chapter-1:obj-4'] = true;
    const wrapper = createWrapper();
    const chapterCard = wrapper.find('[data-testid="chapter-card"]');
    await chapterCard.trigger('click');
    expect(setStoryChapterUncompleteMock).toHaveBeenCalledWith('chapter-1');
    expect(setStoryChapterCompleteMock).not.toHaveBeenCalled();
    expect(setStoryObjectiveUncompleteMock).toHaveBeenCalledWith('chapter-1', 'obj-3');
    expect(setStoryObjectiveUncompleteMock).toHaveBeenCalledWith('chapter-1', 'obj-4');
    wrapper.unmount();
  });
  it('skips already-complete linear objectives when marking chapter complete', async () => {
    objectiveCompletionState['chapter-1:obj-3'] = true;
    const wrapper = createWrapper();
    await wrapper.get('[data-testid="chapter-card"]').trigger('click');
    expect(setStoryChapterCompleteMock).toHaveBeenCalledWith('chapter-1');
    expect(setStoryObjectiveCompleteMock).toHaveBeenCalledWith('chapter-1', 'obj-4');
    expect(setStoryObjectiveCompleteMock).not.toHaveBeenCalledWith('chapter-1', 'obj-3');
    wrapper.unmount();
  });
  it('skips already-incomplete linear objectives when marking chapter incomplete', async () => {
    chapterCompletionState['chapter-1'] = true;
    objectiveCompletionState['chapter-1:obj-3'] = true;
    const wrapper = createWrapper();
    await wrapper.get('[data-testid="chapter-card"]').trigger('click');
    expect(setStoryChapterUncompleteMock).toHaveBeenCalledWith('chapter-1');
    expect(setStoryObjectiveUncompleteMock).toHaveBeenCalledWith('chapter-1', 'obj-3');
    expect(setStoryObjectiveUncompleteMock).not.toHaveBeenCalledWith('chapter-1', 'obj-4');
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
