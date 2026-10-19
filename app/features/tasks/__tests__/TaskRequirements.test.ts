import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import TaskPoolDetails from '@/features/tasks/TaskPoolDetails.vue';
import TaskRequirementChips from '@/features/tasks/TaskRequirementChips.vue';
import TaskRequirementSummary from '@/features/tasks/TaskRequirementSummary.vue';
import type { TaskRequirementRow } from '@/features/tasks/composables/useTaskRequirements';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));
const row = (label: string, met = false, extra: Partial<TaskRequirementRow> = {}) =>
  ({ kind: 'task', met, label, ...extra }) satisfies TaskRequirementRow;
const global = {
  stubs: { UIcon: true, RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } },
};
const mountRequirements = (rows: TaskRequirementRow[], variant: 'blocking' | 'summary') =>
  variant === 'blocking'
    ? mount(TaskRequirementChips, { props: { rows }, global })
    : mount(TaskRequirementSummary, { props: { rows, id: 'task-1' }, global });
describe('task requirement components', () => {
  it('renders nothing without rows', () => {
    expect(mountRequirements([], 'blocking').html()).not.toContain('task-requirements');
    expect(mountRequirements([], 'summary').html()).not.toContain('task-requirements');
  });
  it('caps blocking chips at three and expands the rest inline', async () => {
    const wrapper = mountRequirements(
      ['A', 'B', 'C', 'D', 'E'].map((label) => row(label)),
      'blocking'
    );
    const chips = () => wrapper.findAll('[data-testid="task-requirement-chip"]');
    expect(chips()).toHaveLength(3);
    const toggle = wrapper.get('button');
    expect(toggle.text()).toContain('"count":2');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    await toggle.trigger('click');
    expect(chips()).toHaveLength(5);
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(toggle.text()).toBe('page.tasks.requirements.show_less');
  });
  it('drops the show-less toggle once the expanded rows fit under the cap', async () => {
    const wrapper = mountRequirements(
      ['A', 'B', 'C', 'D'].map((label) => row(label)),
      'blocking'
    );
    await wrapper.get('button').trigger('click');
    await wrapper.setProps({ rows: [row('A'), row('B')] });
    expect(wrapper.findAll('[data-testid="task-requirement-chip"]')).toHaveLength(2);
    expect(wrapper.find('button').exists()).toBe(false);
  });
  it('shows progress on chips and dedupes hints', () => {
    const wrapper = mountRequirements(
      [
        row('A', false, { progress: 'you: 1', hint: 'Locked' }),
        row('B', false, { hint: 'Locked' }),
      ],
      'blocking'
    );
    expect(wrapper.get('[data-testid="task-requirement-chip"]').text()).toContain('· you: 1');
    expect(wrapper.findAll('p')).toHaveLength(1);
  });
  it('shows hints only while their requirement chips are visible', async () => {
    const wrapper = mountRequirements(
      [
        row('A', false, { hint: 'Visible conflict' }),
        row('B', false, { hint: 'Visible conflict' }),
        row('C'),
        row('D', false, { hint: 'Hidden conflict' }),
      ],
      'blocking'
    );
    const hints = () => wrapper.findAll('p').map((hint) => hint.text());
    expect(hints()).toEqual(['Visible conflict']);
    await wrapper.get('button').trigger('click');
    expect(hints()).toEqual(['Visible conflict', 'Hidden conflict']);
    await wrapper.get('button').trigger('click');
    expect(hints()).toEqual(['Visible conflict']);
  });
  it('lists every requirement with its met state once expanded', async () => {
    const wrapper = mountRequirements(
      [
        row('Level 15+', true, { progress: 'you: 20' }),
        row('Debut', false, { progress: 'not started' }),
      ],
      'summary'
    );
    const toggle = wrapper.get('button');
    expect(toggle.text()).toContain('"met":1,"total":2');
    expect(wrapper.find('ul').exists()).toBe(false);
    await toggle.trigger('click');
    expect(toggle.attributes('aria-controls')).toBe('task-requirements-task-1');
    const items = wrapper.findAll('li').map((item) => item.text());
    expect(items[0]).toMatch(/^page\.tasks\.requirements\.met:\s*Level 15\+$/);
    expect(items[1]).toMatch(/^page\.tasks\.requirements\.unmet:\s*Debut\s*· not started$/);
  });
  const poolRow = (): TaskRequirementRow =>
    row('Mechanic LL2 tasks', true, {
      kind: 'task_pool',
      progress: '0/3 tracked',
      pool: {
        id: 'pool',
        candidate: true,
        confirmed: true,
        groups: [
          {
            key: 'a',
            anyOf: false,
            complete: false,
            tasks: [{ id: 'a', name: 'First task', status: 'available', current: false }],
          },
        ],
      },
    });
  it('emits the selected pool from its chip without truncating the label', async () => {
    const wrapper = mountRequirements([poolRow()], 'blocking');
    const chip = wrapper.get('[data-testid="task-requirement-chip"]');
    expect(chip.find('.truncate').exists()).toBe(false);
    await chip.get('button').trigger('click');
    expect(wrapper.emitted('showPool')).toEqual([['pool']]);
  });
  it('opens the requested candidate pool, preserves tracked progress and links contributors', async () => {
    const wrapper = mount(TaskRequirementSummary, {
      props: { id: 'target', rows: [poolRow()], requestedPool: { id: 'pool' } },
      global,
    });
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true');
    expect(wrapper.text()).toContain('0/3 tracked');
    expect(wrapper.text()).toContain('page.tasks.requirements.pool_confirmed');
    expect(wrapper.get('[data-testid="task-pool-caveat"]').text()).toContain('pool_caveat');
    expect(wrapper.get('[data-testid="task-pool-details"]').text()).toContain('First task');
    expect(wrapper.get('[data-testid="task-pool-details"] a').attributes('href')).toBe(
      '/tasks?task=a'
    );
    const toggle = wrapper.findAll('button')[1]!;
    expect(toggle.attributes('aria-controls')).toBe('task-requirements-target-pool');
    await toggle.trigger('click');
    expect(wrapper.find('[data-testid="task-pool-details"]').exists()).toBe(false);
    await wrapper.setProps({ requestedPool: { id: 'pool' } });
    expect(wrapper.find('[data-testid="task-pool-details"]').exists()).toBe(true);
  });
  it('never claims an earned group credit for unresolved candidate completions', async () => {
    const pool = poolRow().pool!;
    pool.groups = [
      {
        key: 'pair',
        anyOf: true,
        complete: true,
        tasks: [
          { id: 'bear', name: 'BEAR variant', status: 'completed', current: false },
          { id: 'usec', name: 'USEC variant', status: 'unavailable', current: false },
        ],
      },
    ];
    const wrapper = mount(TaskPoolDetails, { props: { pool }, global });
    expect(wrapper.text()).toContain('pool_candidate_explanation');
    expect(wrapper.text()).not.toContain('pool_credit_earned');
    await wrapper.setProps({ pool: { ...pool, candidate: false } });
    expect(wrapper.text()).toContain('pool_credit_earned');
    expect(wrapper.text()).toContain('pool_explanation');
  });
});
