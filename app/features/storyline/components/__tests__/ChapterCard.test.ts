// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import ChapterCard from '@/features/storyline/components/ChapterCard.vue';
import type { StorylineNormalizedChapterView } from '@/composables/useStorylineChapters';
vi.mock('@/composables/useWikiLink', () => ({
  useWikiLink: () => ({ toWikiUrl: (link: string) => link }),
}));
mockNuxtImport('useI18n', () => () => ({
  t: (key: string, values?: Record<string, unknown> | string) =>
    typeof values === 'object' && values !== null ? `${key}:${JSON.stringify(values)}` : key,
}));
const objective = (
  id: string,
  overrides: Partial<StorylineNormalizedChapterView['objectives'][number]> = {}
): StorylineNormalizedChapterView['objectives'][number] => ({
  complete: false,
  description: `Objective ${id}`,
  hasEstimatedUnlocks: false,
  id,
  order: 1,
  routeAlternatives: [],
  routeBlockingAlternatives: [],
  routeState: 'open',
  type: 'main',
  unlocks: [],
  ...overrides,
});
const createChapter = (
  overrides: Partial<StorylineNormalizedChapterView> = {}
): StorylineNormalizedChapterView => ({
  autoStart: true,
  chapterUnlocks: [],
  complete: false,
  coveragePartial: false,
  declaredEndings: [],
  description: null,
  endings: [],
  id: 'the-ticket',
  mainLinearObjectives: [],
  mainObjectiveCompleted: 0,
  mainObjectiveTotal: 0,
  mainObjectives: [],
  mainRouteChoices: [],
  mapUnlocks: [],
  mutuallyExclusiveQuestPairs: [],
  name: 'The Ticket',
  normalizedName: 'the-ticket',
  notes: null,
  objectiveMap: {},
  objectives: [],
  optionalLinearObjectives: [],
  optionalObjectives: [],
  optionalRouteChoices: [],
  order: 9,
  questRouteChoices: [],
  requirements: [],
  rewards: null,
  staleObjectiveIds: [],
  traderUnlocks: [],
  wikiLink: 'https://example.com/the-ticket',
  ...overrides,
});
const mountCard = (chapter: StorylineNormalizedChapterView, readOnly = false) =>
  mount(ChapterCard, {
    props: { chapter, readOnly },
    global: {
      stubs: {
        UBadge: { template: '<span><slot /></span>' },
        UButton: { template: '<button><slot /></button>' },
        UIcon: true,
      },
    },
  });
describe('ChapterCard story contract rendering', () => {
  it('renders overlay-declared endings with progress and pending evidence', () => {
    const wrapper = mountCard(
      createChapter({
        endings: [
          {
            evidencePending: false,
            id: 'ending-resolved',
            label: 'Escaped From Tarkov For Humanity',
            objectiveCompleted: 1,
            objectiveId: '',
            objectiveLabel: '',
            objectiveTotal: 2,
            routeBlockingAlternatives: [],
            routeChoiceIndex: null,
            routeState: 'open',
            systemName: 'EscapedFromTarkovForHumanity',
          },
          {
            evidencePending: true,
            id: 'ending-pending',
            label: 'You Didnt Escape From Yourself',
            objectiveCompleted: 0,
            objectiveId: '',
            objectiveLabel: '',
            objectiveTotal: 0,
            routeBlockingAlternatives: [],
            routeChoiceIndex: null,
            routeState: 'open',
            systemName: 'YouDidntEscapeFromYourself',
          },
        ],
      })
    );
    const text = wrapper.text();
    expect(text).toContain('Escaped From Tarkov For Humanity');
    expect(text).toContain('page.storyline.ending_progress:{"completed":1,"total":2}');
    expect(text).toContain('page.storyline.ending_evidence_pending');
    wrapper.unmount();
  });
  it('renders mutually exclusive quest routes without blocking objective toggles', () => {
    const chapter = createChapter({
      mainObjectives: [objective('obj-hand', { description: 'Hand the case over' })],
      mainLinearObjectives: [objective('obj-hand', { description: 'Hand the case over' })],
      objectives: [objective('obj-hand', { description: 'Hand the case over' })],
      questRouteChoices: [
        {
          branches: [
            {
              complete: true,
              completedCount: 1,
              id: 'quest-keep',
              label: 'Keep the case',
              totalCount: 1,
            },
            {
              complete: false,
              completedCount: 0,
              id: 'quest-hand-over',
              label: 'Hand the case over',
              totalCount: 1,
            },
          ],
          chosenBranchId: 'quest-keep',
          id: 'the-ticket-quest-route-quest-hand-over-quest-keep',
        },
      ],
    });
    const wrapper = mountCard(chapter);
    expect(wrapper.text()).toContain('page.storyline.quest_route_exclusive');
    expect(wrapper.text()).not.toContain('common.blocked');
    expect(wrapper.text()).toContain(
      'page.storyline.quest_route_progress:{"completed":1,"total":1}'
    );
    expect(wrapper.get('input[type="checkbox"]').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });
  it('flags partial upstream coverage and stale saved marks', () => {
    const wrapper = mountCard(
      createChapter({ coveragePartial: true, staleObjectiveIds: ['the-ticket-main-10'] })
    );
    expect(wrapper.text()).toContain('page.storyline.partial_data');
    expect(wrapper.text()).toContain('page.storyline.stale_progress:{"count":1}');
    wrapper.unmount();
  });
  it('hides stale saved marks on a read-only profile', () => {
    const wrapper = mountCard(createChapter({ staleObjectiveIds: ['the-ticket-main-10'] }), true);
    expect(wrapper.text()).not.toContain('page.storyline.stale_progress');
    wrapper.unmount();
  });
});
