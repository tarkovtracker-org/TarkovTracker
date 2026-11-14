import { describe, expect, it } from 'vitest';
import { computed, ref } from 'vue';
import { useMapTaskHighlight } from '@/features/maps/composables/useMapTaskHighlight';
const setup = () => {
  const shown = ref(new Set(['task-a', 'task-b', 'task-c']));
  const enabled = ref(true);
  const highlight = useMapTaskHighlight({
    shownTaskIds: computed(() => shown.value),
    enabled: computed(() => enabled.value),
  });
  return { shown, enabled, ...highlight };
};
describe('useMapTaskHighlight', () => {
  it('highlights a hovered quest over a clicked one and falls back when hover ends', () => {
    const { highlightedTaskId, lockedTaskId, setLegendTask, toggleLockedTask } = setup();
    expect(highlightedTaskId.value).toBeNull();
    toggleLockedTask('task-a');
    expect(lockedTaskId.value).toBe('task-a');
    expect(highlightedTaskId.value).toBe('task-a');
    setLegendTask('task-b');
    expect(highlightedTaskId.value).toBe('task-b');
    setLegendTask(null);
    expect(highlightedTaskId.value).toBe('task-a');
    toggleLockedTask('task-a');
    expect(lockedTaskId.value).toBeNull();
    expect(highlightedTaskId.value).toBeNull();
  });
  it('keeps a focused legend entry highlighted when the pointer leaves a marker', () => {
    const { highlightedTaskId, setLegendTask, setMarkerTask } = setup();
    setLegendTask('task-a');
    setMarkerTask('task-b');
    expect(highlightedTaskId.value).toBe('task-b');
    setMarkerTask(null);
    expect(highlightedTaskId.value).toBe('task-a');
    // ...and leaving the legend keeps a marker that is still hovered.
    setMarkerTask('task-c');
    setLegendTask(null);
    expect(highlightedTaskId.value).toBe('task-c');
  });
  it('moves a click to another quest instead of stacking highlights', () => {
    const { lockedTaskId, toggleLockedTask } = setup();
    toggleLockedTask('task-a');
    toggleLockedTask('task-b');
    expect(lockedTaskId.value).toBe('task-b');
  });
  it('ends a lock when its quest is hidden and does not restore it when the quest returns', () => {
    const { shown, highlightedTaskId, lockedTaskId, toggleLockedTask } = setup();
    toggleLockedTask('task-a');
    shown.value = new Set(['task-b']);
    expect(lockedTaskId.value).toBeNull();
    expect(highlightedTaskId.value).toBeNull();
    shown.value = new Set(['task-a', 'task-b']);
    expect(lockedTaskId.value).toBeNull();
    expect(highlightedTaskId.value).toBeNull();
  });
  it('drops every highlight outside quest coloring and keeps no lock after it returns', () => {
    const { enabled, highlightedTaskId, lockedTaskId, setMarkerTask, toggleLockedTask } = setup();
    toggleLockedTask('task-a');
    setMarkerTask('task-b');
    enabled.value = false;
    expect(highlightedTaskId.value).toBeNull();
    expect(lockedTaskId.value).toBeNull();
    setMarkerTask(null);
    enabled.value = true;
    expect(lockedTaskId.value).toBeNull();
    expect(highlightedTaskId.value).toBeNull();
  });
});
