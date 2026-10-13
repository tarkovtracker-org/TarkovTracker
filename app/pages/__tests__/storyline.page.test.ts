// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { nextTick, ref } from 'vue';
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
const getCurrentProgressDataMock = vi.fn(() => ({
  storyChapters: {
    'chapter-1': {
      objectives: {
        'obj-3': { complete: true },
        'obj-4': { complete: false },
        'the-ticket-main-10': { complete: true },
      },
    },
  },
}));
mockNuxtImport('definePageMeta', () => () => {});
mockNuxtImport('useSeoMeta', () => () => {});
const router = await vi.hoisted(async () => {
  const { reactive } = await import('vue');
  return {
    route: reactive({ path: '/storyline', hash: '', query: {} as Record<string, string> }),
    replace: vi.fn(),
  };
});
mockNuxtImport('useRoute', () => () => router.route);
mockNuxtImport('useRouter', () => () => ({ replace: router.replace }));
const storyline = await vi.hoisted(async () => {
  const { ref } = await import('vue');
  return { normalizedChapters: ref<Record<string, unknown>[]>([]) };
});
const createNormalizedChapters = () => [
  {
    complete: true,
    id: 'chapter-0',
    mainObjectiveCompleted: 2,
    mainObjectiveTotal: 2,
    name: 'Chapter 0',
    normalizedName: 'chapter-0',
  },
  {
    complete: false,
    id: 'chapter-1',
    mainObjectiveCompleted: 1,
    mainObjectiveTotal: 3,
    name: 'Chapter 1',
    normalizedName: 'chapter-1',
  },
];
const storylineOptions = vi.fn();
vi.mock('@/composables/useStorylineChapters', () => ({
  useStorylineChapters: (options: { completedObjectiveIds?: (chapterId: string) => string[] }) => {
    storylineOptions(options);
    return {
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
      normalizedChapters: storyline.normalizedChapters,
    };
  },
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getCurrentProgressData: getCurrentProgressDataMock,
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
    router.route.query = {};
    storyline.normalizedChapters.value = createNormalizedChapters();
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
          UTooltip: { template: '<slot />' },
          UIcon: true,
        },
      },
    });
  it('reports only completed objective marks to the storyline view', () => {
    const wrapper = createWrapper();
    const options = storylineOptions.mock.calls.at(-1)?.[0] as {
      completedObjectiveIds?: (chapterId: string) => string[];
    };
    expect(options?.completedObjectiveIds?.('chapter-1')).toEqual(['obj-3', 'the-ticket-main-10']);
    expect(options?.completedObjectiveIds?.('missing-chapter')).toEqual([]);
    wrapper.unmount();
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
  it('opens the first incomplete chapter and switches chapters from the rail', async () => {
    const wrapper = mount(StorylinePage, {
      global: {
        stubs: {
          ChapterCard: {
            props: ['chapter'],
            template: '<div data-testid="chapter-detail">{{ chapter.id }}</div>',
          },
          UAlert: true,
          UTooltip: { template: '<slot />' },
          UIcon: true,
        },
      },
    });
    expect(wrapper.get('[data-testid="chapter-detail"]').text()).toBe('chapter-1');
    const tile = wrapper.get('button[aria-label="Chapter 0 (common.completed)"]');
    await tile.trigger('click');
    expect(wrapper.get('[data-testid="chapter-detail"]').text()).toBe('chapter-0');
    expect(tile.attributes('aria-current')).toBe('true');
    wrapper.unmount();
  });
  it('keeps the shown chapter selected after it is completed and scrolls the rail to it', async () => {
    // Tiles sit 100px apart and are 80px square in a 200px rail, so centring tile N scrolls the
    // sideways list to N*100-60. The vertical rail lays tiles 90px apart below a 40px list offset in
    // a 100px nav, so it scrolls to 40+N*90-10; both targets are positive, so a browser would not clamp
    // them and a selected tile below the visible rail is covered.
    const scrollCalls: Array<[string, ScrollToOptions]> = [];
    const scrollTo = vi.fn(function (this: HTMLElement, ...args: unknown[]) {
      scrollCalls.push([this.tagName, args[0] as ScrollToOptions]);
    });
    vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(scrollTo);
    vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return Number(this.dataset.chapterId?.split('-')[1] ?? 0) * 100;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.tagName === 'UL' ? 40 : Number(this.dataset.chapterId?.split('-')[1] ?? 0) * 90;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(80);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(80);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    const wrapper = mount(StorylinePage, {
      global: {
        stubs: {
          ChapterCard: {
            props: ['chapter'],
            template: '<div data-testid="chapter-detail">{{ chapter.id }}</div>',
          },
          UAlert: true,
          UTooltip: { template: '<slot />' },
          UIcon: true,
        },
      },
    });
    await nextTick();
    expect(scrollCalls).toEqual([
      ['UL', { left: 40 }],
      ['NAV', { top: 120 }],
    ]);
    storyline.normalizedChapters.value = storyline.normalizedChapters.value.map((chapter) => ({
      ...chapter,
      complete: true,
    }));
    await nextTick();
    expect(wrapper.get('[data-testid="chapter-detail"]').text()).toBe('chapter-1');
    expect(wrapper.find('button[aria-label="Chapter 1 (common.completed)"]').exists()).toBe(true);
    await wrapper.get('button[aria-label="Chapter 0 (common.completed)"]').trigger('click');
    await nextTick();
    expect(scrollCalls.slice(2)).toEqual([
      ['UL', { left: -60 }],
      ['NAV', { top: 30 }],
    ]);
    wrapper.unmount();
  });
  it('opens the chapter named by the chapter query', () => {
    router.route.query = { chapter: 'chapter-0' };
    const wrapper = mount(StorylinePage, {
      global: {
        stubs: {
          ChapterCard: {
            props: ['chapter'],
            template: '<div data-testid="chapter-detail">{{ chapter.id }}</div>',
          },
          UAlert: true,
          UTooltip: { template: '<slot />' },
          UIcon: true,
        },
      },
    });
    expect(wrapper.get('[data-testid="chapter-detail"]').text()).toBe('chapter-0');
    wrapper.unmount();
  });
  it('focuses a deep-linked objective and drops the focus query', async () => {
    router.route.query = { chapter: 'chapter-1', objective: 'obj-1', tab: 'keep' };
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    onTestFinished(() => {
      Element.prototype.scrollIntoView = originalScrollIntoView;
      wrapper.unmount();
    });
    const wrapper = mount(StorylinePage, {
      attachTo: document.body,
      global: {
        stubs: {
          ChapterCard: {
            template: `
              <div id="storyline-chapter-chapter-1">
                <label data-testid="objective-row">
                  <input id="storyline-objective-chapter-1-obj-1" type="checkbox" />
                </label>
              </div>
            `,
          },
          UAlert: true,
          UTooltip: { template: '<slot />' },
          UIcon: true,
        },
      },
    });
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(wrapper.get('[data-testid="objective-row"]').classes()).toContain('ring-2');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith({
      hash: '',
      path: '/storyline',
      query: { tab: 'keep' },
    });
  });
  it('moves the highlight when another objective in the same chapter is linked', async () => {
    router.route.query = { chapter: 'chapter-1', objective: 'obj-1' };
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn();
    onTestFinished(() => {
      Element.prototype.scrollIntoView = originalScrollIntoView;
      wrapper.unmount();
    });
    const wrapper = mount(StorylinePage, {
      attachTo: document.body,
      global: {
        stubs: {
          ChapterCard: {
            template: `
              <div id="storyline-chapter-chapter-1">
                <label data-testid="row-1"><input id="storyline-objective-chapter-1-obj-1" /></label>
                <label data-testid="row-2"><input id="storyline-objective-chapter-1-obj-2" /></label>
              </div>
            `,
          },
          UAlert: true,
          UTooltip: { template: '<slot />' },
          UIcon: true,
        },
      },
    });
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(wrapper.get('[data-testid="row-1"]').classes()).toContain('ring-2');
    router.route.query = { chapter: 'chapter-1', objective: 'obj-2' };
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledTimes(2));
    expect(wrapper.get('[data-testid="row-2"]').classes()).toContain('ring-2');
    expect(wrapper.get('[data-testid="row-1"]').classes()).not.toContain('ring-2');
  });
});
