import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
type MockTask = {
  id: string;
  name: string;
  wikiLink?: string | null;
};
const setup = async (task: MockTask) => {
  const metadataStore = {
    objectives: [
      {
        id: 'obj-1',
        taskId: task.id,
        description: 'Find the location',
        count: 1,
      },
    ],
    tasks: [task],
  };
  const tarkovStore = {
    isTaskObjectiveComplete: vi.fn(() => false),
    getObjectiveCount: vi.fn(() => 0),
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
  const wrapper = mount(LeafletObjectiveTooltip, {
    props: {
      objectiveId: 'obj-1',
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
  return { wrapper };
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
});
