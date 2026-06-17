import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useActionHistoryStore } from '@/stores/useActionHistoryStore';
const toastAdd = vi.fn();
vi.mock('@/composables/useSafeToast', () => ({
  useSafeToast: () => ({ add: toastAdd }),
}));
describe('useActionHistoryStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    toastAdd.mockClear();
  });
  it('pushes actions with a timestamp', () => {
    const store = useActionHistoryStore();
    store.pushAction({ id: 'a1', description: 'Did a thing', undo: vi.fn() });
    expect(store.undoStack).toHaveLength(1);
    expect(store.undoStack[0]?.timestamp).toBeTypeOf('number');
  });
  it('caps the undo stack at 15 entries, dropping the oldest', () => {
    const store = useActionHistoryStore();
    for (let i = 0; i < 20; i += 1) {
      store.pushAction({ id: `a${i}`, description: `action ${i}`, undo: vi.fn() });
    }
    expect(store.undoStack).toHaveLength(15);
    expect(store.undoStack[0]?.id).toBe('a5');
    expect(store.undoStack.at(-1)?.id).toBe('a19');
  });
  it('runs the most recent undo callback and pops it off the stack', async () => {
    const store = useActionHistoryStore();
    const firstUndo = vi.fn();
    const secondUndo = vi.fn();
    store.pushAction({ id: 'a1', description: 'first', undo: firstUndo });
    store.pushAction({ id: 'a2', description: 'second', undo: secondUndo });
    await store.undoLastAction();
    expect(secondUndo).toHaveBeenCalledTimes(1);
    expect(firstUndo).not.toHaveBeenCalled();
    expect(store.undoStack).toHaveLength(1);
    expect(toastAdd).toHaveBeenCalledTimes(1);
  });
  it('is a no-op when the stack is empty', async () => {
    const store = useActionHistoryStore();
    await expect(store.undoLastAction()).resolves.toBeUndefined();
    expect(toastAdd).not.toHaveBeenCalled();
  });
  it('keeps the action retryable when the undo callback throws', async () => {
    const store = useActionHistoryStore();
    store.pushAction({
      id: 'a1',
      description: 'boom',
      undo: () => {
        throw new Error('undo failed');
      },
    });
    await store.undoLastAction();
    expect(toastAdd).toHaveBeenCalledTimes(1);
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }));
    expect(store.undoStack).toHaveLength(1);
    expect(store.undoStack[0]?.id).toBe('a1');
  });
  it('clears the history', () => {
    const store = useActionHistoryStore();
    store.pushAction({ id: 'a1', description: 'first', undo: vi.fn() });
    store.clearHistory();
    expect(store.undoStack).toHaveLength(0);
  });
});
