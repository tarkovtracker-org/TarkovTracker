import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref } from 'vue';
import { useMapTaskReveal } from '@/features/maps/composables/useMapTaskReveal';
import { buildMapTaskVisibilityState } from '@/features/maps/utils/mapTaskVisibility';
const mockPreferencesStore = {
  toggleMapFocusTask: vi.fn(),
  toggleMapHiddenTask: vi.fn(),
};
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => mockPreferencesStore,
}));
const setup = (hidden: string[], focus: string[], initialTaskIds: string[]) => {
  const mapTaskIds = ref(initialTaskIds);
  const mapTaskVisibilityState = computed(() =>
    buildMapTaskVisibilityState(hidden, focus, mapTaskIds.value)
  );
  const { requestTaskReveal } = useMapTaskReveal({
    mapTaskIds: computed(() => mapTaskIds.value),
    mapTaskVisibilityState,
  });
  return { mapTaskIds, requestTaskReveal };
};
describe('useMapTaskReveal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('un-hides a hidden task on the current map', async () => {
    const { requestTaskReveal } = setup(['task-a'], [], ['task-a', 'task-b']);
    requestTaskReveal('task-a');
    await nextTick();
    expect(mockPreferencesStore.toggleMapHiddenTask).toHaveBeenCalledWith('task-a');
  });
  it('does nothing for a task that is already shown', async () => {
    const { requestTaskReveal } = setup([], [], ['task-a']);
    requestTaskReveal('task-a');
    await nextTick();
    expect(mockPreferencesStore.toggleMapHiddenTask).not.toHaveBeenCalled();
    expect(mockPreferencesStore.toggleMapFocusTask).not.toHaveBeenCalled();
  });
  it('waits for a map switch and uses the destination map focus state', async () => {
    // task-x is focused on the destination map only; on the current map focus is inactive.
    const { mapTaskIds, requestTaskReveal } = setup([], ['task-x'], ['task-current']);
    requestTaskReveal('task-y');
    await nextTick();
    expect(mockPreferencesStore.toggleMapFocusTask).not.toHaveBeenCalled();
    mapTaskIds.value = ['task-x', 'task-y'];
    await nextTick();
    expect(mockPreferencesStore.toggleMapFocusTask).toHaveBeenCalledWith('task-y');
    expect(mockPreferencesStore.toggleMapHiddenTask).not.toHaveBeenCalled();
  });
});
