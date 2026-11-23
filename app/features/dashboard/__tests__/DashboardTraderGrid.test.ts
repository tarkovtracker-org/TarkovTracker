// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import DashboardTraderGrid from '@/features/dashboard/DashboardTraderGrid.vue';
import type { TraderStats } from '@/composables/useDashboardStats';
const layout = vi.hoisted(() => ({
  resize: (_entries: ResizeObserverEntry[]) => {},
}));
vi.mock('@vueuse/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vueuse/core')>()),
  useResizeObserver: (_target: unknown, resize: typeof layout.resize) => {
    layout.resize = resize;
  },
}));
const traders: Array<TraderStats & { unlock: { kind: 'unknown' } | null }> = [
  'prapor',
  'therapist',
  'fence',
  'skier',
  'peacekeeper',
].map((id) => ({
  id,
  name: id,
  normalizedName: id,
  imageLink: undefined,
  levels: [],
  totalTasks: 10,
  completedTasks: 2,
  percentage: 20,
  unlock: null,
}));
const createGrid = () =>
  mount(DashboardTraderGrid, {
    props: { traders, highlightedTraderId: null },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        DashboardTraderCard: {
          emits: ['toggle'],
          template: '<button @click="$emit(\'toggle\')"></button>',
        },
        DashboardTraderEditor: { template: '<div><input /></div>' },
      },
    },
  });
const editorSelector = '[id^="dashboard-trader-editor-"]';
it.each([
  [1, 'therapist', 'therapist'],
  [2, 'prapor', 'therapist'],
  [4, 'therapist', 'skier'],
])(
  'places the editor after the selected row at %i columns',
  async (columns, selected, lastTrader) => {
    const grid = createGrid();
    const button = grid.get(`#dashboard-trader-${selected}`);
    const target = button.element.parentElement!;
    const style = window.getComputedStyle(target);
    const getStyle = vi.spyOn(globalThis, 'getComputedStyle').mockReturnValueOnce({
      ...style,
      gridTemplateColumns: Array<string>(columns).fill('100px').join(' '),
    } as CSSStyleDeclaration);
    try {
      layout.resize([
        {
          target,
          contentRect: new DOMRectReadOnly(0, 0, 400, 100),
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ]);
      await button.trigger('click');
      const editor = grid.get(`#dashboard-trader-editor-${selected}`);
      expect(editor.element.previousElementSibling?.id).toBe(`dashboard-trader-${lastTrader}`);
    } finally {
      getStyle.mockRestore();
      grid.unmount();
    }
  }
);
it('moves the existing editor with its trader and opens only one editor at a time', async () => {
  const grid = createGrid();
  await grid.get('#dashboard-trader-therapist').trigger('click');
  const draft = grid.get('#dashboard-trader-editor-therapist input');
  await draft.setValue('0.85');
  await grid.setProps({ traders: [traders[1]!, traders[0]!, ...traders.slice(2)] });
  const editor = grid.get('#dashboard-trader-editor-therapist');
  expect(editor.element.previousElementSibling?.id).toBe('dashboard-trader-therapist');
  expect(editor.get('input').element).toBe(draft.element);
  expect(editor.get('input').element.value).toBe('0.85');
  await grid.get('#dashboard-trader-prapor').trigger('click');
  expect(grid.findAll(editorSelector).map((item) => item.element.id)).toEqual([
    'dashboard-trader-editor-prapor',
  ]);
  grid.unmount();
});
it('closes the editor when the selected trader locks and keeps it closed after unlocking', async () => {
  const grid = createGrid();
  await grid.get('#dashboard-trader-prapor').trigger('click');
  await grid.setProps({
    traders: [{ ...traders[0]!, unlock: { kind: 'unknown' } }, ...traders.slice(1)],
  });
  expect(grid.find('details').exists()).toBe(false);
  const locked = grid.get('#dashboard-trader-prapor');
  expect(locked.element.previousElementSibling?.id).toBe('dashboard-trader-peacekeeper');
  expect(grid.find(editorSelector).exists()).toBe(false);
  await grid.setProps({ traders });
  expect(grid.find(editorSelector).exists()).toBe(false);
  grid.unmount();
});
