import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
type MockTask = {
  id: string;
  name: string;
  wikiLink?: string | null;
  minPlayerLevel?: number;
  trader?: { id: string; name?: string; imageLink?: string };
};
const setup = async (
  task: MockTask,
  extraProps: Record<string, unknown> = {},
  objectiveOverrides: Record<string, unknown> = {},
  progress = { complete: false, count: 0 }
) => {
  const metadataStore = {
    objectives: [
      {
        id: 'obj-1',
        taskId: task.id,
        description: 'Find the location',
        count: 1,
        ...objectiveOverrides,
      },
    ],
    tasks: [task],
  };
  const tarkovStore = {
    isTaskObjectiveComplete: vi.fn(() => progress.complete),
    getObjectiveCount: vi.fn(() => progress.count),
    isTaskComplete: vi.fn(() => false),
    isTaskFailed: vi.fn(() => false),
    setTaskObjectiveUncomplete: vi.fn(),
    setObjectiveCount: vi.fn(),
    setTaskObjectiveComplete: vi.fn(),
  };
  vi.doMock('@/stores/useMetadata', () => ({
    useMetadataStore: () => metadataStore,
  }));
  vi.doMock('@/stores/useTarkov', () => ({
    useTarkovStore: () => tarkovStore,
  }));
  vi.doMock('@/utils/logger', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
  }));
  const { default: LeafletObjectiveTooltip } =
    await import('@/features/maps/LeafletObjectiveTooltip.vue');
  const onClose = vi.fn();
  const wrapper = mount(LeafletObjectiveTooltip, {
    props: {
      objectiveId: 'obj-1',
      onClose,
      ...extraProps,
    },
    global: {
      provide: {
        router: {
          currentRoute: {
            value: {
              query: {},
            },
          },
          replace: vi.fn(),
        },
      },
      stubs: {
        AppTooltip: {
          template: '<span><slot /></span>',
        },
        UIcon: true,
      },
    },
  });
  return { onClose, wrapper, tarkovStore };
};
describe('LeafletObjectiveTooltip', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  it('renders wiki and Tarkov.dev task links in objective tooltip', async () => {
    const { wrapper } = await setup({
      id: 'task-1',
      name: 'Operation Aquarius',
      wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Operation_Aquarius',
    });
    const wikiLinks = wrapper.findAll(
      'a[href="https://escapefromtarkov.fandom.com/wiki/Operation_Aquarius"]'
    );
    expect(wikiLinks.length).toBeGreaterThan(0);
    const tarkovDevLink = wrapper.find('a[href="https://tarkov.dev/task/task-1"]');
    expect(tarkovDevLink.exists()).toBe(true);
    expect(tarkovDevLink.attributes('target')).toBe('_blank');
    expect(tarkovDevLink.attributes('rel')).toContain('noopener');
    expect(tarkovDevLink.attributes('rel')).toContain('noreferrer');
  });
  it('renders Tarkov.dev task link when task has no wiki link', async () => {
    const { wrapper } = await setup({
      id: 'task-2',
      name: 'No Wiki Task',
      wikiLink: null,
    });
    expect(wrapper.find('a[href="https://tarkov.dev/task/task-2"]').exists()).toBe(true);
    expect(wrapper.find('a[href*="escapefromtarkov.fandom.com/wiki/"]').exists()).toBe(false);
  });
  it('renders the task title as plain text when the wiki link is untrusted', async () => {
    const { wrapper } = await setup({
      id: 'task-3',
      name: 'Untrusted Wiki Task',
      wikiLink: 'javascript:alert(1)',
    });
    const hrefs = wrapper.findAll('a').map((link) => link.attributes('href'));
    expect(hrefs).toEqual(['https://tarkov.dev/task/task-3']);
  });
  it('emits close when the tooltip close button is clicked', async () => {
    const { onClose, wrapper } = await setup({
      id: 'task-3',
      name: 'Focused Task',
      wikiLink: null,
    });
    await wrapper.get('[data-testid="objective-close-button"]').trigger('click');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
  it('omits map hide controls unless the page provides them', async () => {
    const { wrapper } = await setup({ id: 'task-1', name: 'Task' });
    expect(wrapper.find('[data-testid="objective-hide-task"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="objective-show-only-task"]').exists()).toBe(false);
  });
  it('hides the quest or shows only it from the marker popup', async () => {
    const taskVisibilityActions = { hideTask: vi.fn(), showOnlyTask: vi.fn() };
    const { wrapper, onClose } = await setup(
      { id: 'task-1', name: 'Task' },
      { taskVisibilityActions }
    );
    await wrapper.find('[data-testid="objective-show-only-task"]').trigger('click');
    expect(taskVisibilityActions.showOnlyTask).toHaveBeenCalledWith('task-1');
    await wrapper.find('[data-testid="objective-hide-task"]').trigger('click');
    expect(onClose).toHaveBeenCalled();
    expect(taskVisibilityActions.hideTask).toHaveBeenCalledWith('task-1');
  });
  it('shows the trader, the full task name and the objective action (#1394)', async () => {
    const { wrapper } = await setup({
      id: 'task-1',
      name: 'The Survivalist Path - Unprotected but Dangerous',
      minPlayerLevel: 15,
      trader: { id: 'jaeger', name: 'Jaeger', imageLink: 'https://assets.tarkov.dev/jaeger.webp' },
    });
    const image = wrapper.get('[data-testid="objective-trader-image"]');
    expect(image.attributes('src')).toBe('https://assets.tarkov.dev/jaeger.webp');
    // The name is shown beside the portrait, so the portrait itself is decorative.
    expect(image.attributes('alt')).toBe('');
    expect(wrapper.get('[data-testid="objective-trader-name"]').text()).toBe('Jaeger');
    const title = wrapper.get('[data-testid="objective-task-title"]');
    expect(title.text()).toBe('The Survivalist Path - Unprotected but Dangerous');
    expect(title.classes()).not.toContain('truncate');
    expect(wrapper.text()).toContain('common.lvl_level');
    expect(wrapper.get('[data-testid="objective-action"]').text()).toBe(
      'maps.objective_icons.kinds.other'
    );
  });
  it('falls back to a trader placeholder when the task has no trader image', async () => {
    const { wrapper } = await setup({ id: 'task-1', name: 'Task', trader: { id: 'x' } });
    expect(wrapper.find('[data-testid="objective-trader-image"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="objective-trader-name"]').exists()).toBe(false);
  });
  it('lists the item, FIR, required keys and progress for the objective', async () => {
    const { wrapper } = await setup(
      { id: 'task-1', name: 'Task' },
      {},
      {
        type: 'plantItem',
        count: 3,
        foundInRaid: true,
        item: {
          id: 'shemagh',
          name: 'Shemagh (Green)',
          iconLink: 'https://assets.tarkov.dev/s.webp',
        },
        requiredKeys: [[{ id: 'k1', name: 'Dorm room 314 marked key' }]],
      },
      { complete: false, count: 1 }
    );
    expect(wrapper.get('[data-testid="objective-action"]').text()).toBe(
      'maps.objective_icons.kinds.plant'
    );
    const item = wrapper.get('[data-testid="objective-item"]');
    expect(item.text()).toContain('Shemagh (Green) ×3');
    expect(item.text()).toContain('common.fir');
    expect(item.get('img').attributes('src')).toBe('https://assets.tarkov.dev/s.webp');
    expect(wrapper.get('[data-testid="objective-key"]').text()).toBe('maps.tooltip.key');
    const bar = wrapper.get('[data-testid="objective-progress"] [role="progressbar"]');
    expect(bar.attributes('aria-valuenow')).toBe('1');
    expect(bar.attributes('aria-valuemax')).toBe('3');
  });
  it('labels the completion toggle and completes a counted objective in full', async () => {
    const { wrapper, tarkovStore } = await setup({ id: 'task-1', name: 'Task' }, {}, { count: 2 });
    const toggle = wrapper.get('[data-testid="objective-complete-toggle"]');
    expect(toggle.text()).toContain('common.mark_complete');
    expect(toggle.attributes('aria-label')).toBe('common.mark_complete');
    expect(toggle.attributes('aria-pressed')).toBe('false');
    await toggle.trigger('click');
    expect(tarkovStore.setTaskObjectiveComplete).toHaveBeenCalledWith('obj-1');
    expect(tarkovStore.setObjectiveCount).toHaveBeenCalledWith('obj-1', 2);
  });
  it('shows a completed objective as done and hides editing in read-only popups', async () => {
    const done = await setup({ id: 'task-1', name: 'Task' }, {}, {}, { complete: true, count: 0 });
    expect(done.wrapper.find('[data-testid="objective-complete-badge"]').exists()).toBe(true);
    expect(done.wrapper.get('[data-testid="objective-complete-toggle"]').text()).toContain(
      'common.completed'
    );
    vi.resetModules();
    const readOnly = await setup({ id: 'task-1', name: 'Task' }, { readOnly: true }, { count: 3 });
    expect(readOnly.wrapper.find('[data-testid="objective-complete-toggle"]').exists()).toBe(false);
    expect(readOnly.wrapper.find('[data-testid="objective-progress"]').exists()).toBe(false);
  });
});
