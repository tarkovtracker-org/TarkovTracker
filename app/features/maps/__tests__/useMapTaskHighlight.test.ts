import { describe, expect, it } from 'vitest';
import { computed, ref } from 'vue';
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
  it('ignores quests that are hidden or gone, and everything outside quest coloring', () => {
    const { shown, enabled, highlightedTaskId, lockedTaskId, setHoveredTask, toggleLockedTask } =
      setup();
    toggleLockedTask('task-a');
    shown.value = new Set(['task-b']);
    expect(lockedTaskId.value).toBeNull();
    expect(highlightedTaskId.value).toBeNull();
    // A later click on the hidden quest starts a fresh highlight once it is shown again.
    toggleLockedTask('task-a');
    shown.value = new Set(['task-a', 'task-b']);
    expect(lockedTaskId.value).toBe('task-a');
    setHoveredTask('task-b');
    enabled.value = false;
    expect(highlightedTaskId.value).toBeNull();
    expect(lockedTaskId.value).toBeNull();
  });
});
