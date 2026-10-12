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
              completedCount: 1,
              evidencePending: false,
              id: 'quest-keep',
              knownStepsComplete: true,
              label: 'Keep the case',
              totalCount: 1,
            },
            {
              completedCount: 0,
              evidencePending: false,
              id: 'quest-hand-over',
              knownStepsComplete: false,
              label: 'Hand the case over',
              totalCount: 1,
            },
          ],
          chosenBranchId: 'quest-keep',
          conflicting: false,
          coveragePartial: false,
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
  it('reports known-step progress rather than a chosen route under partial coverage', () => {
    const wrapper = mountCard(
      createChapter({
        coveragePartial: true,
        questRouteChoices: [
          {
            branches: [
              {
                completedCount: 1,
                evidencePending: false,
                id: 'quest-keep',
                knownStepsComplete: true,
                label: 'Keep the case',
                totalCount: 1,
              },
              {
                completedCount: 0,
                evidencePending: true,
                id: 'quest-hand-over',
                knownStepsComplete: false,
                label: 'quest-hand-over',
                totalCount: 0,
              },
            ],
            chosenBranchId: null,
            conflicting: false,
            coveragePartial: true,
            id: 'the-ticket-quest-route-quest-hand-over-quest-keep',
          },
        ],
      })
    );
    const text = wrapper.text();
    expect(text).toContain('page.storyline.quest_route_known_steps_done');
    expect(text).toContain('page.storyline.quest_route_evidence_pending');
    expect(text).not.toContain('page.storyline.route_chosen');
    wrapper.unmount();
  });
  it('warns when more than one route reads as finished', () => {
    const branch = (id: string) => ({
      completedCount: 1,
      evidencePending: false,
      id,
      knownStepsComplete: true,
      label: id,
      totalCount: 1,
    });
    const wrapper = mountCard(
      createChapter({
        coveragePartial: true,
        questRouteChoices: [
          {
            branches: [branch('quest-keep'), branch('quest-hand-over')],
            chosenBranchId: null,
            conflicting: true,
            coveragePartial: true,
            id: 'the-ticket-quest-route-quest-hand-over-quest-keep',
          },
        ],
      })
    );
    expect(wrapper.text()).toContain('page.storyline.quest_route_conflict');
    wrapper.unmount();
  });
  it('flags partial upstream coverage and stale saved marks', () => {
    const wrapper = mountCard(
      createChapter({ coveragePartial: true, staleObjectiveIds: ['the-ticket-main-10'] })
    );
    expect(wrapper.text()).toContain('page.storyline.partial_data');
    expect(wrapper.text()).toContain('page.storyline.stale_progress_one:{"count":1}');
    wrapper.unmount();
  });
  it('uses the plural stale-mark label for more than one mark', () => {
    const wrapper = mountCard(
      createChapter({ staleObjectiveIds: ['the-ticket-main-10', 'the-ticket-main-11'] })
    );
    expect(wrapper.text()).toContain('page.storyline.stale_progress_other:{"count":2}');
    wrapper.unmount();
  });
  it('hides stale saved marks on a read-only profile', () => {
    const wrapper = mountCard(createChapter({ staleObjectiveIds: ['the-ticket-main-10'] }), true);
    expect(wrapper.text()).not.toContain('page.storyline.stale_progress_one');
    wrapper.unmount();
  });
  it('renders route decisions with chosen and blocked options and forwards toggles', async () => {
    const chosen = objective('obj-keep', {
      description: 'Keep the case',
      routeState: 'chosen',
      routeAlternatives: [{ complete: false, id: 'obj-give', label: 'Give the case' }],
    });
    const blocked = objective('obj-give', {
      description: 'Give the case',
      routeState: 'blocked',
      routeBlockingAlternatives: [{ complete: true, id: 'obj-keep', label: 'Keep the case' }],
    });
    const optionalChoice = objective('obj-side', { description: 'Side route', type: 'optional' });
    const wrapper = mountCard(
      createChapter({
        mainObjectives: [chosen, blocked],
        mainObjectiveTotal: 2,
        mainRouteChoices: [
          { chosenObjectiveId: 'obj-keep', id: 'route-main', objectives: [chosen, blocked] },
        ],
        optionalObjectives: [optionalChoice],
        optionalRouteChoices: [
          { chosenObjectiveId: null, id: 'route-optional', objectives: [optionalChoice] },
        ],
      })
    );
    const text = wrapper.text();
    expect(text).toContain('page.storyline.route_decision:{"index":1}');
    expect(text).toContain('page.storyline.route_switch_hint');
    expect(text).toContain('page.storyline.route_selected_hint');
    expect(text).toContain('page.storyline.route_blocked_by:{"objectives":"Keep the case"}');
    expect(text).toContain('page.profile.storyline_objectives_optional');
    expect(wrapper.get('#storyline-objective-the-ticket-obj-give').attributes('disabled')).toBe('');
    await wrapper.get('#storyline-objective-the-ticket-obj-keep').trigger('change');
    await wrapper.get('#storyline-objective-the-ticket-obj-side').trigger('change');
    expect(wrapper.emitted('toggleObjective')).toEqual([
      ['the-ticket', 'obj-keep'],
      ['the-ticket', 'obj-side'],
    ]);
    wrapper.unmount();
  });
  it('lists linear steps with unlocks, route notes, and indented optional steps', async () => {
    const step = objective('obj-step', {
      description: 'Visit Woods',
      hasEstimatedUnlocks: true,
      routeAlternatives: [{ complete: false, id: 'obj-other', label: 'Visit Customs' }],
      unlocks: [
        { estimated: false, id: 'woods', label: 'Woods', type: 'map' },
        { estimated: false, id: 'skier', label: 'Skier', type: 'trader' },
        { estimated: true, id: 'reward', label: 'Rubles', type: 'reward' },
      ],
    });
    const side = objective('obj-optional', { type: 'optional' });
    const wrapper = mountCard(
      createChapter({
        complete: true,
        mainLinearObjectives: [step],
        mainObjectiveCompleted: 1,
        mainObjectiveTotal: 2,
        mainObjectives: [step],
        optionalLinearObjectives: [side],
        optionalObjectives: [side],
      })
    );
    const text = wrapper.text();
    expect(text).toContain('page.storyline.route_required_steps');
    expect(text).toContain('1/2');
    expect(text).toContain('page.storyline.route_unlocks_here:');
    expect(text).toContain('page.storyline.route_unlock_map:{"name":"Woods"}');
    expect(text).toContain('page.storyline.route_unlock_trader:{"name":"Skier"}');
    expect(text).toContain('page.storyline.route_unlock_reward:{"name":"Rubles"}');
    expect(text).toContain('page.storyline.route_unlocks_estimated');
    expect(text).toContain('page.storyline.route_choice');
    expect(text).toContain('page.storyline.route_blocks:{"objectives":"Visit Customs"}');
    expect(text).toContain('common.optional');
    await wrapper.get('#storyline-objective-the-ticket-obj-step').trigger('change');
    expect(wrapper.emitted('toggleObjective')).toEqual([['the-ticket', 'obj-step']]);
    expect(
      wrapper.get('#storyline-objective-the-ticket-obj-optional').element.closest('li')?.className
    ).toContain('border-l');
    wrapper.unmount();
  });
  it('shows standalone optional steps when a chapter has no main objectives', async () => {
    const side = objective('obj-optional', { complete: true, type: 'optional' });
    const chapter = createChapter({ optionalLinearObjectives: [side], optionalObjectives: [side] });
    const editable = mountCard(chapter);
    await editable.get('#storyline-objective-the-ticket-obj-optional').trigger('change');
    expect(editable.emitted('toggleObjective')).toEqual([['the-ticket', 'obj-optional']]);
    editable.unmount();
    const wrapper = mountCard(chapter, true);
    expect(wrapper.text()).toContain('page.storyline.route_optional_steps');
    expect(wrapper.text()).not.toContain('page.storyline.route_required_steps');
    expect(wrapper.get('#storyline-objective-the-ticket-obj-optional').attributes('disabled')).toBe(
      ''
    );
    wrapper.unmount();
  });
  it('renders requirements, chapter unlocks, and ending route states in the side panel', () => {
    const ending = {
      evidencePending: false,
      objectiveCompleted: 0,
      objectiveId: 'obj-end',
      objectiveTotal: 0,
      routeBlockingAlternatives: [],
      routeChoiceIndex: null,
      routeState: 'open' as const,
      systemName: 'Ending',
    };
    const wrapper = mountCard(
      createChapter({
        chapterUnlocks: [{ estimated: false, id: 'tour', label: 'Tour', type: 'reward' }],
        endings: [
          {
            ...ending,
            id: 'ending-chosen',
            label: 'Savior',
            objectiveLabel: 'Give the case',
            routeChoiceIndex: 2,
            routeState: 'chosen',
          },
          {
            ...ending,
            id: 'ending-blocked',
            label: 'Fallen',
            objectiveLabel: 'Fallen',
            routeBlockingAlternatives: [{ complete: true, id: 'obj-give', label: 'Give the case' }],
            routeState: 'blocked',
          },
        ],
        requirements: [{ id: 'req-1', label: 'Finish Tour' }],
      })
    );
    const text = wrapper.text();
    expect(text).toContain('common.requires');
    expect(text).toContain('Finish Tour');
    expect(text).toContain('page.storyline.route_unlocks_chapter');
    expect(text).toContain('page.storyline.route_decision:{"index":2}');
    expect(text).toContain('Give the case');
    expect(text).toContain('page.storyline.route_chosen');
    expect(text).toContain('common.blocked');
    expect(text).toContain('page.storyline.route_blocked_by:{"objectives":"Give the case"}');
    wrapper.unmount();
  });
  it('toggles the chapter from the icon and the header action', async () => {
    const wrapper = mountCard(createChapter({ autoStart: false, complete: true }));
    expect(wrapper.text()).toContain('page.profile.storyline_discovered');
    expect(wrapper.text()).toContain('common.completed');
    await wrapper.get('button[aria-label="page.storyline.mark_incomplete"]').trigger('click');
    for (const button of wrapper.findAll('button:not([aria-label])')) await button.trigger('click');
    expect(wrapper.emitted('toggleChapter')).toEqual([
      ['the-ticket'],
      ['the-ticket'],
      ['the-ticket'],
    ]);
    wrapper.unmount();
  });
  it('hides chapter actions on a read-only card', () => {
    const wrapper = mountCard(createChapter(), true);
    expect(wrapper.find('button').exists()).toBe(false);
    wrapper.unmount();
  });
});
