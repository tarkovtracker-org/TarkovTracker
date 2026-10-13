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
  it('renders the tutorial baseline checked and read-only while dialogue stays independent', () => {
    const escape = objective('escape', {
      complete: true,
      completionPolicy: 'tutorial',
      routeState: 'chosen',
    });
    const therapist = objective('therapist');
    const wrapper = mountCard(
      createChapter({
        mainObjectives: [escape, therapist],
        mainLinearObjectives: [escape, therapist],
        objectives: [escape, therapist],
      })
    );
    const inputs = wrapper.findAll('input[type="checkbox"]');
    expect((inputs[0]!.element as HTMLInputElement).checked).toBe(true);
    expect((inputs[0]!.element as HTMLInputElement).disabled).toBe(true);
    expect((inputs[1]!.element as HTMLInputElement).checked).toBe(false);
    expect((inputs[1]!.element as HTMLInputElement).disabled).toBe(false);
    expect(wrapper.text()).toContain('page.storyline.completed_during_tutorial');
    expect(wrapper.emitted('toggleObjective')).toBeUndefined();
    wrapper.unmount();
  });
  it.each(['main route', 'timeline', 'optional route', 'optional linear', 'chapter'])(
    'renders distinct unlock notes as visible text for %s',
    (location) => {
      const note = 'Unlocked after completing the Woods stage.';
      const unlocks = [
        {
          estimated: false,
          id: 'peacekeeper',
          label: 'Peacekeeper',
          note,
          type: 'trader' as const,
        },
        { estimated: false, id: 'shoreline', label: 'Shoreline', note, type: 'map' as const },
      ];
      const step = objective('step', { unlocks });
      const route = { id: 'route', chosenObjectiveId: null, objectives: [step] };
      const cases: Record<string, Partial<StorylineNormalizedChapterView>> = {
        'main route': { mainObjectives: [step], mainRouteChoices: [route] },
        timeline: { mainObjectives: [step], mainLinearObjectives: [step] },
        'optional route': { optionalObjectives: [step], optionalRouteChoices: [route] },
        'optional linear': { optionalObjectives: [step], optionalLinearObjectives: [step] },
        chapter: { chapterUnlocks: unlocks },
      };
      const wrapper = mountCard(createChapter(cases[location]));
      expect(wrapper.text().split(note)).toHaveLength(2);
      expect(
        wrapper.findAll('[title]').some((element) => element.attributes('title') === note)
      ).toBe(false);
      wrapper.unmount();
    }
  );
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
            objectiveTotal: 3,
            routeBlockingAlternatives: [],
            routeChoiceIndex: null,
            routeState: 'open',
            systemName: 'YouDidntEscapeFromYourself',
          },
          {
            evidencePending: true,
            id: 'ending-unmapped',
            label: 'Unmapped Ending',
            objectiveCompleted: 0,
            objectiveId: '',
            objectiveLabel: '',
            objectiveTotal: 0,
            routeBlockingAlternatives: [],
            routeChoiceIndex: null,
            routeState: 'open',
            systemName: 'UnmappedEnding',
          },
        ],
      })
    );
    const text = wrapper.text();
    expect(text).toContain('Escaped From Tarkov For Humanity');
    expect(text).toContain('page.storyline.ending_progress:{"completed":1,"total":2}');
    expect(text).toContain('page.storyline.ending_evidence_pending');
    expect(text).toContain('page.storyline.ending_progress:{"completed":0,"total":3}');
    expect(wrapper.findAll('[role="progressbar"]')).toHaveLength(0);
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
              evidencePending: true,
              id: 'quest-hand-over',
              knownStepsComplete: false,
              label: '5d25e2e286f77444001e2e48',
              totalCount: 0,
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
    expect(wrapper.text()).toContain('page.storyline.quest_route_unnamed:{"index":2}');
    expect(wrapper.text()).not.toContain('5d25e2e286f77444001e2e48');
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
    const readOnly = mountCard(
      createChapter({
        mainObjectives: [chosen, blocked],
        mainObjectiveTotal: 2,
        mainRouteChoices: [
          { chosenObjectiveId: 'obj-keep', id: 'route-main', objectives: [chosen, blocked] },
        ],
      }),
      true
    );
    expect(readOnly.text()).toContain('page.storyline.route_selected_hint');
    expect(readOnly.text()).not.toContain('page.storyline.route_switch_hint');
    readOnly.unmount();
  });
  it('lays steps, optional objectives, and unlocks out as one chronological timeline', async () => {
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
    const side = objective('obj-optional', { order: 2, type: 'optional' });
    const last = objective('obj-last', { complete: true, order: 3, routeState: 'chosen' });
    const wrapper = mountCard(
      createChapter({
        complete: true,
        mainLinearObjectives: [last, step],
        mainObjectiveCompleted: 1,
        mainObjectiveTotal: 2,
        mainObjectives: [step, last],
        optionalLinearObjectives: [side],
        optionalObjectives: [side],
      })
    );
    const text = wrapper.text();
    expect(text).toContain('page.storyline.timeline_objective');
    expect(text).toContain('page.storyline.timeline_unlocks');
    expect(text).toContain('1/2');
    expect(text).not.toContain('route_unlocks_here');
    expect(text).toContain('page.storyline.route_unlock_map:{"name":"Woods"}');
    expect(text).toContain('page.storyline.route_unlock_trader:{"name":"Skier"}');
    expect(text).toContain('page.storyline.route_unlock_reward:{"name":"Rubles"}');
    expect(text).toContain('page.storyline.route_unlocks_estimated');
    expect(text).toContain('page.storyline.route_choice');
    expect(text).toContain('page.storyline.route_blocks:{"objectives":"Visit Customs"}');
    const rows = wrapper.findAll('ol > li');
    expect(rows.map((row) => row.find('input').attributes('id'))).toEqual([
      'storyline-objective-the-ticket-obj-step',
      'storyline-objective-the-ticket-obj-optional',
      'storyline-objective-the-ticket-obj-last',
    ]);
    // The optional objective keeps its place but takes no step number, so the next step is still 2.
    expect(rows[0]!.text()).toMatch(/^1/);
    expect(rows[1]!.get('[data-storyline-objective]').classes()).toContain('border-dashed');
    expect(rows[1]!.text()).toContain('common.optional');
    expect(rows[2]!.find('[data-storyline-objective]').text()).toContain('Objective obj-last');
    expect(rows[2]!.text()).not.toMatch(/^2/);
    expect(rows[2]!.text()).not.toContain('page.storyline.route_chosen');
    const progress = wrapper.get('[role="progressbar"]');
    expect(progress.attributes()).toMatchObject({
      'aria-valuemax': '2',
      'aria-valuemin': '0',
      'aria-valuenow': '1',
    });
    await wrapper.get('#storyline-objective-the-ticket-obj-step').trigger('change');
    await wrapper.get('#storyline-objective-the-ticket-obj-optional').trigger('change');
    expect(wrapper.emitted('toggleObjective')).toEqual([
      ['the-ticket', 'obj-step'],
      ['the-ticket', 'obj-optional'],
    ]);
    wrapper.unmount();
  });
  it('places route decisions at their position in the timeline', async () => {
    const first = objective('obj-first');
    const keep = objective('obj-keep', { order: 2, description: 'Keep the case' });
    const give = objective('obj-give', { order: 3, description: 'Give the case' });
    const wrapper = mountCard(
      createChapter({
        mainLinearObjectives: [first],
        mainObjectiveTotal: 2,
        mainObjectives: [first, keep, give],
        mainRouteChoices: [{ chosenObjectiveId: null, id: 'route-main', objectives: [keep, give] }],
      })
    );
    const rows = wrapper.findAll('ol > li');
    expect(rows).toHaveLength(2);
    expect(rows[1]!.text()).toContain('page.storyline.route_decision:{"index":1}');
    expect(rows[1]!.text()).toMatch(/^2/);
    expect(wrapper.text()).not.toContain('page.storyline.timeline_objective');
    await wrapper.get('#storyline-objective-the-ticket-obj-give').trigger('change');
    expect(wrapper.emitted('toggleObjective')).toEqual([['the-ticket', 'obj-give']]);
    wrapper.unmount();
  });
  it('groups several optional children on their main row with independent IDs, progress and unlocks', async () => {
    const parent = objective('parent', { order: 2, complete: true, sourceQuestId: 'quest-a' });
    const first = objective('first', {
      order: 1,
      type: 'optional',
      sourceQuestId: 'quest-a',
      parentObjectiveId: parent.id,
      unlocks: [{ estimated: false, id: 'woods', label: 'Woods', type: 'map' }],
    });
    const second = objective('second', {
      order: 4,
      type: 'optional',
      sourceQuestId: 'quest-a',
      parentObjectiveId: parent.id,
    });
    const unlinked = objective('unlinked', { order: 3, type: 'optional' });
    const last = objective('last', { order: 5 });
    const chapter = createChapter({
      mainObjectives: [parent, last],
      mainLinearObjectives: [parent, last],
      mainObjectiveTotal: 2,
      mainObjectiveCompleted: 1,
      optionalObjectives: [first, unlinked, second],
      optionalLinearObjectives: [second, unlinked, first],
    });
    const wrapper = mountCard(chapter);
    const rows = wrapper.findAll('ol > li');
    expect(rows).toHaveLength(3);
    expect(rows[0]!.findAll('input').map((input) => input.attributes('id'))).toEqual([
      'storyline-objective-the-ticket-parent',
      'storyline-objective-the-ticket-first',
      'storyline-objective-the-ticket-second',
    ]);
    expect(rows[1]!.get('input').attributes('id')).toBe('storyline-objective-the-ticket-unlinked');
    expect(rows[2]!.text()).toMatch(/^2/);
    expect(rows[0]!.text()).toContain('page.storyline.route_unlock_map:{"name":"Woods"}');
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('1');
    expect(
      wrapper.get<HTMLInputElement>('#storyline-objective-the-ticket-parent').element.checked
    ).toBe(true);
    const childInput = wrapper.get<HTMLInputElement>('#storyline-objective-the-ticket-first');
    expect(childInput.element.checked).toBe(false);
    await childInput.trigger('change');
    expect(wrapper.emitted('toggleObjective')).toEqual([['the-ticket', 'first']]);
    await wrapper.get('#storyline-objective-the-ticket-parent').trigger('change');
    expect(wrapper.emitted('toggleObjective')).toEqual([
      ['the-ticket', 'first'],
      ['the-ticket', 'parent'],
    ]);
    await wrapper.setProps({ readOnly: true });
    expect(
      rows[0]!.findAll('input').every((input) => input.attributes('disabled') !== undefined)
    ).toBe(true);
    wrapper.unmount();
  });
  it.each(['missing', 'other-quest'])(
    'leaves an optional with a %s parent in its own timeline row',
    (kind) => {
      const parent = objective('parent', { sourceQuestId: 'quest-a' });
      const child = objective('child', {
        type: 'optional',
        order: 2,
        parentObjectiveId: kind === 'missing' ? 'missing' : parent.id,
        sourceQuestId: kind === 'other-quest' ? 'quest-b' : 'quest-a',
      });
      const wrapper = mountCard(
        createChapter({
          mainObjectives: [parent],
          mainLinearObjectives: [parent],
          optionalObjectives: [child],
          optionalLinearObjectives: [child],
        })
      );
      expect(wrapper.findAll('ol > li')).toHaveLength(2);
      expect(wrapper.findAll('input')).toHaveLength(2);
      wrapper.unmount();
    }
  );
  it('labels a linked optional with its parent when that parent is a route option', () => {
    const parent = objective('parent', { description: 'Keep the case', sourceQuestId: 'quest-a' });
    const other = objective('other', {
      description: 'Hand over the case',
      sourceQuestId: 'quest-b',
    });
    const child = objective('child', {
      type: 'optional',
      parentObjectiveId: parent.id,
      sourceQuestId: 'quest-a',
    });
    const wrapper = mountCard(
      createChapter({
        mainObjectives: [parent, other],
        mainRouteChoices: [{ id: 'choice', chosenObjectiveId: null, objectives: [parent, other] }],
        optionalObjectives: [child],
        optionalLinearObjectives: [child],
      })
    );
    expect(wrapper.findAll('ol > li')).toHaveLength(1);
    expect(wrapper.get('[data-parent-objective-id="parent"]').text()).toContain('Keep the case');
    expect(wrapper.find('#storyline-objective-the-ticket-child').exists()).toBe(true);
    expect(wrapper.text()).toContain('common.optional');
    wrapper.unmount();
  });
  it('lists route option unlocks in the unlock lane under their option', () => {
    const keep = objective('obj-keep', {
      description: 'Keep the case',
      unlocks: [{ estimated: false, id: 'woods', label: 'Woods', type: 'map' }],
    });
    const give = objective('obj-give', { order: 2, description: 'Give the case' });
    const wrapper = mountCard(
      createChapter({
        mainObjectiveTotal: 1,
        mainObjectives: [keep, give],
        mainRouteChoices: [{ chosenObjectiveId: null, id: 'route-main', objectives: [keep, give] }],
      })
    );
    expect(wrapper.text()).toContain('page.storyline.timeline_unlocks');
    // The badge renders once, in the lane, not again inside the option's box.
    const optionRows = wrapper.findAll('[data-storyline-objective]');
    expect(optionRows.some((row) => row.text().includes('route_unlock_map'))).toBe(false);
    const lane = wrapper.get('ol > li').findAll(':scope > div').at(-1)!;
    expect(lane.text()).toBe('Keep the casepage.storyline.route_unlock_map:{"name":"Woods"}');
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
    expect(wrapper.text()).not.toContain('page.storyline.timeline_objective');
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
    expect(wrapper.get('h2').text()).toBe('The Ticket');
    expect(wrapper.get('img').attributes('alt')).toBe('');
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
