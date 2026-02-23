import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, ref, type PropType } from 'vue';
import QuestObjectives from '@/features/tasks/QuestObjectives.vue';
import type { TaskObjective } from '@/types/tarkov';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    locale: ref('en'),
    t: (key: string) => key,
  }),
}));
const TaskObjectiveItemGroupStub = defineComponent({
  props: {
    title: {
      type: String,
      required: true,
    },
    iconName: {
      type: String,
      required: true,
    },
    objectives: {
      type: Array as PropType<TaskObjective[]>,
      required: true,
    },
    optional: {
      type: Boolean,
      default: false,
    },
  },
  template: `<div
    data-testid="group-row"
    :data-title="title"
    :data-icon="iconName"
    :data-objective-ids="objectives.map((objective) => objective.id).join(',')"
    :data-optional="String(optional)"
  />`,
});
const TaskObjectiveStub = defineComponent({
  props: {
    objective: {
      type: Object as PropType<TaskObjective>,
      required: true,
    },
  },
  template: '<div data-testid="solo-row" :data-objective-id="objective.id" />',
});
const mountComponent = (objectives: TaskObjective[]) => {
  return mount(QuestObjectives, {
    props: {
      objectives,
      irrelevantCount: 0,
      uncompletedIrrelevant: 0,
    },
    global: {
      stubs: {
        'i18n-t': true,
        TaskObjective: TaskObjectiveStub,
        TaskObjectiveItemGroup: TaskObjectiveItemGroupStub,
        UIcon: true,
      },
    },
  });
};
describe('QuestObjectives item grouping', () => {
  it('groups give-only objectives for normal items into one section', () => {
    const wrapper = mountComponent([
      {
        id: 'give-a',
        item: { id: 'item-a', name: 'Item A' },
        optional: true,
        type: 'giveItem',
      },
      {
        id: 'give-b',
        item: { id: 'item-b', name: 'Item B' },
        optional: false,
        type: 'giveItem',
      },
      {
        description: 'Visit location',
        id: 'visit-c',
        type: 'visit',
      },
    ] as TaskObjective[]);
    const groupRows = wrapper.findAll('[data-testid="group-row"]');
    expect(groupRows).toHaveLength(1);
    expect(groupRows[0]!.attributes('data-objective-ids')).toBe('give-a,give-b');
    expect(groupRows[0]!.attributes('data-title')).toBe('page.tasks.questcard.hand_over');
    expect(groupRows[0]!.attributes('data-optional')).toBe('false');
    const soloRows = wrapper.findAll('[data-testid="solo-row"]');
    expect(soloRows).toHaveLength(1);
    expect(soloRows[0]!.attributes('data-objective-id')).toBe('visit-c');
  });
  it('keeps quest-item give-only objectives for different items in separate groups', () => {
    const wrapper = mountComponent([
      {
        id: 'give-a',
        questItem: { id: 'quest-a', name: 'Quest Item A' },
        type: 'giveQuestItem',
      },
      {
        id: 'give-b',
        questItem: { id: 'quest-b', name: 'Quest Item B' },
        type: 'giveQuestItem',
      },
    ] as TaskObjective[]);
    const groupRows = wrapper.findAll('[data-testid="group-row"]');
    expect(groupRows).toHaveLength(2);
    expect(groupRows[0]!.attributes('data-objective-ids')).toBe('give-a');
    expect(groupRows[1]!.attributes('data-objective-ids')).toBe('give-b');
    expect(groupRows[0]!.attributes('data-title')).toBe('page.tasks.questcard.hand_over');
    expect(groupRows[1]!.attributes('data-title')).toBe('page.tasks.questcard.hand_over');
  });
  it('keeps find and give objectives for the same item in one combined group', () => {
    const wrapper = mountComponent([
      {
        foundInRaid: true,
        id: 'find-a',
        item: { id: 'item-a', name: 'Item A' },
        optional: true,
        type: 'findItem',
      },
      {
        foundInRaid: true,
        id: 'give-a',
        item: { id: 'item-a', name: 'Item A' },
        optional: true,
        type: 'giveItem',
      },
    ] as TaskObjective[]);
    const groupRows = wrapper.findAll('[data-testid="group-row"]');
    expect(groupRows).toHaveLength(1);
    expect(groupRows[0]!.attributes('data-objective-ids')).toBe('find-a,give-a');
    expect(groupRows[0]!.attributes('data-title')).toBe(
      'page.tasks.questcard.find_and_hand_over_fir'
    );
    expect(groupRows[0]!.attributes('data-icon')).toBe('mdi-package-variant-closed');
    expect(groupRows[0]!.attributes('data-optional')).toBe('true');
  });
});
