import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createI18n } from 'vue-i18n';
import { useGroupedItemTracking } from '@/features/neededitems/useGroupedItemTracking';
import en from '@/locales/en.json';
import { useActionHistoryStore } from '@/stores/useActionHistoryStore';
import { useTarkovStore } from '@/stores/useTarkov';
import type { NeededItemHideoutModule, NeededItemTaskObjective } from '@/types/tarkov';
import { createTestLocaleMessages } from '#tests/test-helpers/i18nMessages';
const finished = vi.hoisted(() => new Set<string>());
vi.mock('@/features/neededitems/useNeedSelfCompletion', () => ({
  useNeedSelfCompletion: () => ({
    isSelfCompleted: (need: { id: string }) => finished.has(need.id),
  }),
}));
vi.mock('@/composables/useItemDistribution', () => ({
  useItemDistribution: () => ({
    sortTaskObjectives: (needs: unknown[]) => needs,
    sortHideoutModules: (needs: unknown[]) => needs,
  }),
}));
type Need = NeededItemTaskObjective | NeededItemHideoutModule;
const task = (id: string, count: number, foundInRaid = false) =>
  ({ id, taskId: id, needType: 'taskObjective', count, foundInRaid }) as NeededItemTaskObjective;
const part = (id: string, count: number) =>
  ({ id, needType: 'hideoutModule', count }) as NeededItemHideoutModule;
let wrapper: ReturnType<typeof mount>;
const setup = (needs: Need[]) => {
  let tracking!: ReturnType<typeof useGroupedItemTracking>;
  wrapper = mount(
    defineComponent({
      setup() {
        tracking = useGroupedItemTracking(
          () => needs,
          () => 'Bolts'
        );
        return () => null;
      },
    }),
    {
      global: {
        plugins: [
          createI18n({ legacy: false, locale: 'en', messages: createTestLocaleMessages(en) }),
        ],
      },
    }
  );
  return tracking;
};
describe('inline grouped tracking', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    finished.clear();
  });
  afterEach(() => wrapper?.unmount());
  it('preserves existing assignments and offers scoped undo', async () => {
    const store = useTarkovStore();
    store.setObjectiveCount('later', 8);
    const tracking = setup([task('first', 5), task('later', 10)]);
    tracking.setCount(false, 11);
    expect(store.getObjectiveCount('first')).toBe(3);
    expect(store.getObjectiveCount('later')).toBe(8);
    expect(tracking.remaining.value).toBe(4);
    await useActionHistoryStore().undoLastAction();
    expect(store.getObjectiveCount('first')).toBe(0);
    expect(store.getObjectiveCount('later')).toBe(8);
  });
  it('keeps FIR and Non-FIR changes separate', () => {
    const store = useTarkovStore();
    const tracking = setup([task('fir', 3, true), task('ordinary', 5)]);
    tracking.setCount(true, 2);
    expect(store.getObjectiveCount('fir')).toBe(2);
    expect(store.getObjectiveCount('ordinary')).toBe(0);
    tracking.setCount(false, 4);
    expect(store.getObjectiveCount('fir')).toBe(2);
    expect(tracking.rows.value.map((row) => row.current)).toEqual([2, 4]);
  });
  it('removes from the last allocation and leaves completed parents alone', () => {
    const store = useTarkovStore();
    finished.add('done');
    store.setObjectiveCount('first', 2);
    store.setObjectiveCount('last', 4);
    const tracking = setup([task('done', 3), task('first', 5), task('last', 5)]);
    tracking.setCount(false, 6);
    expect(store.getObjectiveCount('done')).toBe(0);
    expect(store.getObjectiveCount('first')).toBe(2);
    expect(store.getObjectiveCount('last')).toBe(1);
    tracking.setCount(false, 0);
    expect(tracking.rows.value[0]?.current).toBe(3);
    expect(tracking.rows.value[0]?.minimum).toBe(3);
  });
  it('understands legacy checked parts and restores their completion on undo', async () => {
    const store = useTarkovStore();
    store.setHideoutPartComplete('old');
    const tracking = setup([part('old', 3)]);
    expect(tracking.rows.value[0]?.current).toBe(3);
    tracking.setCount(false, 2);
    expect(store.getHideoutPartCount('old')).toBe(2);
    expect(store.isHideoutPartComplete('old')).toBe(false);
    await useActionHistoryStore().undoLastAction();
    expect(store.getHideoutPartCount('old')).toBe(0);
    expect(store.isHideoutPartComplete('old')).toBe(true);
  });
  it('ignores duplicate and teammate-only hidden targets', () => {
    const store = useTarkovStore();
    const own = task('own', 3);
    const hidden = { ...task('hidden', 10), hiddenForSelf: true };
    const tracking = setup([own, own, hidden]);
    tracking.setCount(false, 20);
    expect(store.getObjectiveCount('own')).toBe(3);
    expect(store.getObjectiveCount('hidden')).toBe(0);
    expect(tracking.rows.value[0]?.total).toBe(3);
  });
  it('cannot apply an old edit to a different game mode', () => {
    const store = useTarkovStore();
    const tracking = setup([task('one', 3)]);
    store.currentGameMode = 'pve';
    tracking.setCount(false, 2);
    expect(store.getObjectiveCount('one')).toBe(0);
    expect(useActionHistoryStore().undoStack).toHaveLength(0);
  });
  it('keeps Undo usable after a filtered-out card unmounts', async () => {
    const store = useTarkovStore();
    const tracking = setup([task('one', 3)]);
    tracking.setCount(false, 3);
    wrapper.unmount();
    await useActionHistoryStore().undoLastAction();
    expect(store.getObjectiveCount('one')).toBe(0);
  });
  it('undoes the latest edit after persistence reorders record fields', async () => {
    const store = useTarkovStore();
    const tracking = setup([part('one', 10)]);
    tracking.setCount(false, 1);
    tracking.setCount(false, 7);
    store.$patch((state) => {
      const current = state[state.currentGameMode].hideoutParts.one!;
      state[state.currentGameMode].hideoutParts.one = {
        complete: current.complete,
        count: current.count,
        timestamp: current.timestamp,
      };
    });
    await useActionHistoryStore().undoLastAction();
    expect(store.getHideoutPartCount('one')).toBe(1);
  });
  it('does not undo over newer progress, even when the quantity is unchanged', async () => {
    const store = useTarkovStore();
    const tracking = setup([task('one', 3)]);
    tracking.setCount(false, 2);
    store.$patch((state) => {
      const current = state[state.currentGameMode].taskObjectives.one!;
      current.timestamp = (current.timestamp ?? 0) + 1;
    });
    expect(() => useActionHistoryStore().undoStack.at(-1)!.undo()).toThrow();
    expect(store.getObjectiveCount('one')).toBe(2);
  });
  it('accepts persisted defaults when undoing a filled objective', async () => {
    const store = useTarkovStore();
    const tracking = setup([task('one', 3)]);
    tracking.setCount(false, 3);
    store.$patch((state) => {
      const current = state[state.currentGameMode].taskObjectives.one!;
      current.complete ??= false;
      current.timestamp ??= 0;
    });
    await useActionHistoryStore().undoLastAction();
    expect(store.getObjectiveCount('one')).toBe(0);
  });
  it('creates no history entry for an unchanged count', () => {
    const tracking = setup([task('one', 3)]);
    tracking.setCount(false, 0);
    expect(useActionHistoryStore().undoStack).toHaveLength(0);
  });
});
