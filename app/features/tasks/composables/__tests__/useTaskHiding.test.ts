import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskHiding } from '@/features/tasks/composables/useTaskHiding';
import { usePreferencesStore } from '@/stores/usePreferences';
const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }));
mockNuxtImport('useToast', () => () => ({ add: toastAdd }));
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
const task = { id: 'task-1', name: 'Task One' };
describe('useTaskHiding', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    toastAdd.mockReset();
  });
  it('hides and unhides a task without touching progress', () => {
    const store = usePreferencesStore();
    const { isHidden, toggleHidden } = useTaskHiding(() => task);
    expect(isHidden.value).toBe(false);
    toggleHidden();
    expect(isHidden.value).toBe(true);
    expect(store.hiddenTaskIds).toEqual(['task-1']);
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
});
