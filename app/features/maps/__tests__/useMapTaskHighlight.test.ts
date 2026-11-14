import { describe, expect, it } from 'vitest';
import { computed, nextTick, ref } from 'vue';
import { useMapTaskHighlight } from '@/features/maps/composables/useMapTaskHighlight';
const setup = () => {
  const shown = ref(new Set(['task-a', 'task-b']));
  const enabled = ref(true);
  const highlight = useMapTaskHighlight({
    shownTaskIds: computed(() => shown.value),
    enabled: computed(() => enabled.value),
  });
  return { shown, enabled, ...highlight };
};
describe('useMapTaskHighlight', () => {
  it('highlights a hovered quest over a clicked one and falls back when hover ends', () => {
    const { highlightedTaskId, lockedTaskId, setHoveredTask, toggleLockedTask } = setup();
    expect(highlightedTaskId.value).toBeNull();
    toggleLockedTask('task-a');
    expect(lockedTaskId.value).toBe('task-a');
    expect(highlightedTaskId.value).toBe('task-a');
    setHoveredTask('task-b');
    expect(highlightedTaskId.value).toBe('task-b');
    setHoveredTask(null);
    expect(highlightedTaskId.value).toBe('task-a');
    toggleLockedTask('task-a');
    expect(lockedTaskId.value).toBeNull();
    expect(highlightedTaskId.value).toBeNull();
  });
  it('moves a click to another quest instead of stacking highlights', () => {
    const { lockedTaskId, toggleLockedTask } = setup();
    toggleLockedTask('task-a');
    toggleLockedTask('task-b');
    expect(lockedTaskId.value).toBe('task-b');
  });
  it('ends a lock when its quest is hidden and does not restore it when the quest returns', async () => {
    const { shown, highlightedTaskId, lockedTaskId, toggleLockedTask } = setup();
    toggleLockedTask('task-a');
    shown.value = new Set(['task-b']);
    expect(lockedTaskId.value).toBeNull();
    expect(highlightedTaskId.value).toBeNull();
    await nextTick();
    shown.value = new Set(['task-a', 'task-b']);
    expect(lockedTaskId.value).toBeNull();
    expect(highlightedTaskId.value).toBeNull();
  });
  it('drops every highlight outside quest coloring and keeps none after it returns', async () => {
    const { enabled, highlightedTaskId, lockedTaskId, setHoveredTask, toggleLockedTask } = setup();
    toggleLockedTask('task-a');
    setHoveredTask('task-b');
    enabled.value = false;
    expect(highlightedTaskId.value).toBeNull();
    expect(lockedTaskId.value).toBeNull();
    await nextTick();
    setHoveredTask(null);
    enabled.value = true;
    expect(lockedTaskId.value).toBeNull();
    expect(highlightedTaskId.value).toBeNull();
  });
});
