import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskHiding } from '@/features/tasks/composables/useTaskHiding';
import { usePreferencesStore } from '@/stores/usePreferences';
import type { Pinia } from 'pinia';
const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }));
mockNuxtImport('useToast', () => () => ({ add: toastAdd }));
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
const task = { id: 'task-1', name: 'Task One' };
describe('useTaskHiding', () => {
  let pinia: Pinia;
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    toastAdd.mockReset();
  });
  it('hides and unhides a task without touching progress', () => {
    const store = usePreferencesStore();
    const { hiddenTaskIds: _initialHidden, ...otherPreferences } = JSON.parse(
      JSON.stringify(store.$state)
    );
    const { isHidden, toggleHidden } = useTaskHiding(() => task);
    expect(isHidden.value).toBe(false);
    toggleHidden();
    expect(isHidden.value).toBe(true);
    expect(store.hiddenTaskIds).toEqual(['task-1']);
    const { hiddenTaskIds: _hidden, ...preferencesAfterHide } = JSON.parse(
      JSON.stringify(store.$state)
    );
    expect(preferencesAfterHide).toEqual(otherPreferences);
    expect(Object.keys(pinia.state.value)).toEqual([store.$id]);
    expect(toastAdd.mock.calls[0]?.[0].title).toBe('page.tasks.hidden_tasks.hidden_toast');
    toggleHidden();
    expect(isHidden.value).toBe(false);
    expect(toastAdd.mock.calls[1]?.[0].title).toBe('page.tasks.hidden_tasks.unhidden_toast');
  });
  it('undoes a hide from the toast action', () => {
    const { isHidden, toggleHidden } = useTaskHiding(() => task);
    toggleHidden();
    toastAdd.mock.calls[0]?.[0].actions[0].onClick();
    expect(isHidden.value).toBe(false);
  });
  it('ignores a stale undo once the task was toggled back', () => {
    const { isHidden, toggleHidden } = useTaskHiding(() => task);
    toggleHidden();
    toggleHidden();
    toastAdd.mock.calls[0]?.[0].actions[0].onClick();
    expect(isHidden.value).toBe(false);
  });
});
