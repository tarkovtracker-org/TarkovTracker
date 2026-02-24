import { describe, expect, it, vi } from 'vitest';
import { computed, nextTick, reactive, ref } from 'vue';
import { useTasksPageEffects } from '@/features/tasks/composables/useTasksPageEffects';
import type { Task } from '@/types/tarkov';
const createTask = (id: string): Task =>
  ({
    experience: 0,
    id,
    kappaRequired: false,
    lightkeeperRequired: false,
    minPlayerLevel: 1,
    name: `Task ${id}`,
    objectives: [],
    taskRequirements: [],
  }) as Task;
describe('useTasksPageEffects', () => {
  it('fetches map spawns, resets paging, and handles deep-link query', async () => {
    const metadataStore = {
      fetchMapSpawnsData: vi.fn(async () => undefined),
    };
    const showMapDisplay = computed(() => true);
    const selectedMapData = computed(() => ({ id: 'woods' }));
    const isMapPanelExpanded = ref(true);
    const stopResize = vi.fn();
    const filteredTasksState = ref([createTask('1')]);
    const filteredTasks = computed(() => filteredTasksState.value);
    const visibleTaskCount = ref(8);
    const checkAndLoadMore = vi.fn(async () => undefined);
    const route = reactive({ query: { task: 'task-1', highlightObjective: undefined } });
    const tasksLoading = ref(false);
    const handleTaskQueryParam = vi.fn();
    useTasksPageEffects({
      batchSize: 8,
      checkAndLoadMore,
      filteredTasks,
      handleTaskQueryParam,
      isMapPanelExpanded,
      metadataStore,
      route: route as { query: Record<string, unknown> },
      selectedMapData,
      showMapDisplay,
      stopResize,
      tasksLoading,
      visibleTaskCount,
    });
    filteredTasksState.value = [createTask('1'), createTask('2')];
    await nextTick();
    await nextTick();
    expect(metadataStore.fetchMapSpawnsData).toHaveBeenCalledTimes(1);
    expect(visibleTaskCount.value).toBe(2);
    expect(checkAndLoadMore).toHaveBeenCalled();
    expect(handleTaskQueryParam).toHaveBeenCalledTimes(1);
    expect(stopResize).not.toHaveBeenCalled();
  });
});
