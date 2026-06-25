import { describe, expect, it, vi } from 'vitest';
import { computed, nextTick, reactive, ref } from 'vue';
import { useTasksPageEffects } from '@/features/tasks/composables/useTasksPageEffects';
import type { Task } from '@/types/tarkov';
type TestRoute = {
  query: Record<string, string | undefined>;
};
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
const createRoute = (task?: string, highlightObjective?: string) =>
  reactive<TestRoute>({ query: { task, highlightObjective } });
describe('useTasksPageEffects', () => {
  it('does not run load-more when filtered task ids are unchanged', async () => {
    const metadataStore = {
      fetchMapSpawnsData: vi.fn(async () => undefined),
    };
    const showMapDisplay = computed(() => true);
    const selectedMapData = computed(() => ({ id: 'woods' }));
    const stopResize = vi.fn();
    const filteredTasksState = ref([createTask('1')]);
    const filteredTasks = computed(() => filteredTasksState.value);
    const visibleTaskCount = ref(8);
    const checkAndLoadMore = vi.fn(async () => undefined);
    const route = createRoute();
    const tasksLoading = ref(false);
    const handleTaskQueryParam = vi.fn();
    useTasksPageEffects({
      batchSize: 8,
      checkAndLoadMore,
      filteredTasks,
      handleTaskQueryParam,
      metadataStore,
      route,
      selectedMapData,
      showMapDisplay,
      stopResize,
      tasksLoading,
      visibleTaskCount,
    });
    filteredTasksState.value = [createTask('1')];
    await nextTick();
    await nextTick();
    expect(checkAndLoadMore).not.toHaveBeenCalled();
  });
  it('fetches map spawns, resets paging, and handles deep-link query', async () => {
    const metadataStore = {
      fetchMapSpawnsData: vi.fn(async () => undefined),
    };
    const showMapDisplay = computed(() => true);
    const selectedMapData = computed(() => ({ id: 'woods' }));
    const stopResize = vi.fn();
    const filteredTasksState = ref([createTask('1')]);
    const filteredTasks = computed(() => filteredTasksState.value);
    const visibleTaskCount = ref(8);
    const checkAndLoadMore = vi.fn(async () => undefined);
    const route = createRoute('task-1');
    const tasksLoading = ref(false);
    const handleTaskQueryParam = vi.fn(() => {
      route.query.task = undefined;
    });
    useTasksPageEffects({
      batchSize: 8,
      checkAndLoadMore,
      filteredTasks,
      handleTaskQueryParam,
      metadataStore,
      route,
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
  it('attempts deep-link handling immediately even when filtered tasks are empty', async () => {
    const metadataStore = {
      fetchMapSpawnsData: vi.fn(async () => undefined),
    };
    const showMapDisplay = computed(() => false);
    const selectedMapData = computed(() => null);
    const stopResize = vi.fn();
    const filteredTasksState = ref<Task[]>([]);
    const filteredTasks = computed(() => filteredTasksState.value);
    const visibleTaskCount = ref(8);
    const checkAndLoadMore = vi.fn(async () => undefined);
    const route = createRoute('task-1');
    const tasksLoading = ref(false);
    const handleTaskQueryParam = vi.fn();
    useTasksPageEffects({
      batchSize: 8,
      checkAndLoadMore,
      filteredTasks,
      handleTaskQueryParam,
      metadataStore,
      route,
      selectedMapData,
      showMapDisplay,
      stopResize,
      tasksLoading,
      visibleTaskCount,
    });
    await nextTick();
    expect(handleTaskQueryParam).toHaveBeenCalledTimes(1);
  });
  it('retries deep-link handling when filtered task ids change without a count change', async () => {
    const metadataStore = {
      fetchMapSpawnsData: vi.fn(async () => undefined),
    };
    const showMapDisplay = computed(() => false);
    const selectedMapData = computed(() => null);
    const stopResize = vi.fn();
    const filteredTasksState = ref<Task[]>([createTask('task-hidden')]);
    const filteredTasks = computed(() => filteredTasksState.value);
    const visibleTaskCount = ref(8);
    const checkAndLoadMore = vi.fn(async () => undefined);
    const route = createRoute('task-target');
    const tasksLoading = ref(false);
    const handleTaskQueryParam = vi.fn();
    useTasksPageEffects({
      batchSize: 8,
      checkAndLoadMore,
      filteredTasks,
      handleTaskQueryParam,
      metadataStore,
      route,
      selectedMapData,
      showMapDisplay,
      stopResize,
      tasksLoading,
      visibleTaskCount,
    });
    await nextTick();
    handleTaskQueryParam.mockClear();
    filteredTasksState.value = [createTask('task-target')];
    await nextTick();
    await nextTick();
    expect(handleTaskQueryParam).toHaveBeenCalledTimes(1);
  });
});
