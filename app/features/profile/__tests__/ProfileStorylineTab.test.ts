// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { StorylineNormalizedChapterView } from '@/composables/useStorylineChapters';
const TEST_CHAPTERS: StorylineNormalizedChapterView[] = [
  {
    id: 'chapter-1',
    name: 'Chapter 1',
    normalizedName: 'tour',
    order: 1,
    autoStart: false,
    complete: false,
    wikiLink: 'https://example.com/chapter-1',
    description: null,
    notes: null,
    rewards: null,
    requirements: [],
    mapUnlocks: [],
    traderUnlocks: [],
    objectiveMap: {
      'objective-1': {
        id: 'objective-1',
        order: 1,
        type: 'main',
        description: 'Complete main objective',
      },
    },
    objectives: [
      {
        id: 'objective-1',
        order: 1,
        type: 'main',
        description: 'Complete main objective',
        complete: false,
        hasEstimatedUnlocks: false,
        unlocks: [],
        routeAlternatives: [],
        routeBlockingAlternatives: [],
        routeState: 'open',
      },
    ],
    chapterUnlocks: [],
    mainObjectiveCompleted: 0,
    mainObjectiveTotal: 1,
    endings: [],
    mainRouteChoices: [],
    mainObjectives: [
      {
        id: 'objective-1',
        order: 1,
        type: 'main',
        description: 'Complete main objective',
        complete: false,
        hasEstimatedUnlocks: false,
        unlocks: [],
        routeAlternatives: [],
        routeBlockingAlternatives: [],
        routeState: 'open',
      },
    ],
    mainLinearObjectives: [
      {
        id: 'objective-1',
        order: 1,
        type: 'main',
        description: 'Complete main objective',
        complete: false,
        hasEstimatedUnlocks: false,
        unlocks: [],
        routeAlternatives: [],
        routeBlockingAlternatives: [],
        routeState: 'open',
      },
    ],
    optionalRouteChoices: [],
    optionalLinearObjectives: [],
    optionalObjectives: [],
  },
];
const createOptionalOnlyChapter = (): StorylineNormalizedChapterView => ({
  id: 'chapter-2',
  name: 'Chapter 2',
  normalizedName: 'choice',
  order: 2,
  autoStart: false,
  complete: false,
  wikiLink: 'https://example.com/chapter-2',
  description: null,
  notes: null,
  rewards: null,
  requirements: [],
  mapUnlocks: [],
  traderUnlocks: [],
  objectiveMap: {
    'objective-optional-1': {
      id: 'objective-optional-1',
      order: 1,
      type: 'optional',
      description: 'Complete optional objective',
    },
  },
  objectives: [
    {
      id: 'objective-optional-1',
      order: 1,
      type: 'optional',
      description: 'Complete optional objective',
      complete: false,
      hasEstimatedUnlocks: false,
      unlocks: [],
      routeAlternatives: [],
      routeBlockingAlternatives: [],
      routeState: 'open',
    },
  ],
  chapterUnlocks: [],
  mainObjectiveCompleted: 0,
  mainObjectiveTotal: 0,
  endings: [],
  mainRouteChoices: [],
  mainObjectives: [],
  mainLinearObjectives: [],
  optionalRouteChoices: [],
  optionalLinearObjectives: [
    {
      id: 'objective-optional-1',
      order: 1,
      type: 'optional',
      description: 'Complete optional objective',
      complete: false,
      hasEstimatedUnlocks: false,
      unlocks: [],
      routeAlternatives: [],
      routeBlockingAlternatives: [],
      routeState: 'open',
    },
  ],
  optionalObjectives: [
    {
      id: 'objective-optional-1',
      order: 1,
      type: 'optional',
      description: 'Complete optional objective',
      complete: false,
      hasEstimatedUnlocks: false,
      unlocks: [],
      routeAlternatives: [],
      routeBlockingAlternatives: [],
      routeState: 'open',
    },
  ],
});
const cloneTestChapters = () => structuredClone(TEST_CHAPTERS);
const normalizedChapters = ref(cloneTestChapters());
const requireDefined = <T>(value: T | null | undefined, message: string): T => {
  expect(value, message).toBeDefined();
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
};
vi.mock('@/composables/useStorylineChapters', () => ({
  useStorylineChapters: () => ({ normalizedChapters }),
}));
mockNuxtImport('useI18n', () => () => ({
  t: (key: string) => key,
}));
const createWrapper = async (readOnly: boolean) => {
  const { default: ProfileStorylineTab } =
    await import('@/features/profile/ProfileStorylineTab.vue');
  return mount(ProfileStorylineTab, {
    props: {
      storyChapterCompletionState: { 'chapter-1': false },
      storyObjectiveCompletionState: {
        'chapter-1': {
          'objective-1': false,
        },
      },
      readOnly,
    },
    global: {
      plugins: [createPinia()],
      stubs: {
        UAlert: {
          template: '<div><slot /></div>',
        },
        UBadge: {
          template: '<span><slot /></span>',
        },
        UIcon: true,
      },
    },
  });
};
describe('ProfileStorylineTab', () => {
  beforeEach(() => {
    normalizedChapters.value = cloneTestChapters();
  });
  it('does not emit objective toggle events when read-only', async () => {
    const wrapper = await createWrapper(true);
    const checkbox = wrapper.get('input[type="checkbox"]');
    expect(checkbox.attributes('disabled')).toBeDefined();
    await checkbox.trigger('change');
    expect(wrapper.emitted('toggleObjective')).toBeUndefined();
    wrapper.unmount();
  });
  it('emits objective toggle events when editable', async () => {
    const wrapper = await createWrapper(false);
    const checkbox = wrapper.get('input[type="checkbox"]');
    expect(checkbox.attributes('disabled')).toBeUndefined();
    await checkbox.trigger('change');
    expect(wrapper.emitted('toggleObjective')).toEqual([['chapter-1', 'objective-1']]);
    wrapper.unmount();
  });
  it('does not emit objective toggle events when route is blocked', async () => {
    const chapter = requireDefined(normalizedChapters.value[0], 'Expected first chapter');
    const mainObjective = requireDefined(
      chapter.mainObjectives[0],
      'Expected first main objective'
    );
    const mainLinearObjective = requireDefined(
      chapter.mainLinearObjectives[0],
      'Expected first main linear objective'
    );
    mainObjective.routeState = 'blocked';
    mainObjective.routeAlternatives = [
      { id: 'objective-2', label: 'Alternative objective', complete: true },
    ];
    mainObjective.routeBlockingAlternatives = [
      { id: 'objective-2', label: 'Alternative objective', complete: true },
    ];
    mainLinearObjective.routeState = 'blocked';
    mainLinearObjective.routeAlternatives = [
      { id: 'objective-2', label: 'Alternative objective', complete: true },
    ];
    mainLinearObjective.routeBlockingAlternatives = [
      { id: 'objective-2', label: 'Alternative objective', complete: true },
    ];
    const wrapper = await createWrapper(false);
    const checkbox = wrapper.get('input[type="checkbox"]');
    expect(checkbox.attributes('disabled')).toBeDefined();
    await checkbox.trigger('change');
    expect(wrapper.emitted('toggleObjective')).toBeUndefined();
    wrapper.unmount();
  });
  it('renders optional-only objectives and emits toggles for them', async () => {
    normalizedChapters.value = [createOptionalOnlyChapter()];
    const wrapper = await createWrapper(false);
    expect(wrapper.text()).toContain('Complete optional objective');
    const checkbox = wrapper.get('input[type="checkbox"]');
    expect(checkbox.attributes('disabled')).toBeUndefined();
    await checkbox.trigger('change');
    expect(wrapper.emitted('toggleObjective')).toEqual([['chapter-2', 'objective-optional-1']]);
    wrapper.unmount();
  });
});
