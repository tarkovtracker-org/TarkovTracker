import { describe, expect, it } from 'vitest';
import { computed, nextTick, ref, type ComputedRef } from 'vue';
import { useTaskCardExpansion } from '@/features/tasks/composables/useTaskCardExpansion';
type ExpansionHarness = {
  isCollapsible: ComputedRef<boolean>;
  taskExpanded: ComputedRef<boolean>;
  rewardsVisible: ComputedRef<boolean>;
  toggleTaskVisibility: () => void;
  setDensity: (density: 'comfortable' | 'compact') => void;
  setCollapseDefault: (collapse: boolean) => void;
  setOnMapView: (onMapView: boolean) => void;
  setHideTaskRewards: (hide: boolean) => void;
  setRouteTaskId: (taskId: string | undefined) => void;
};
const createExpansionHarness = (options: {
  density?: 'comfortable' | 'compact';
  collapseDefault?: boolean;
  hideTaskRewards?: boolean;
  routeTaskId?: string;
  onMapView?: boolean;
}): ExpansionHarness => {
  const density = ref(options.density ?? 'comfortable');
  const collapseDefault = ref(options.collapseDefault ?? false);
  const hideTaskRewards = ref(options.hideTaskRewards ?? false);
  const routeTaskId = ref<string | undefined>(options.routeTaskId);
  const onMapView = ref(options.onMapView ?? false);
  const isCompact = computed(() => density.value === 'compact');
  const expansion = useTaskCardExpansion({
    taskId: () => 'task-1',
    isCompact,
    onMapView,
    collapseByDefault: () => collapseDefault.value,
    hideTaskRewards: () => hideTaskRewards.value,
    routeTaskId: () => routeTaskId.value,
  });
  const rewardsVisible = computed(
    () => expansion.taskExpanded.value && !expansion.rewardsHidden.value
  );
  return {
    isCollapsible: expansion.isCollapsible,
    taskExpanded: expansion.taskExpanded,
    rewardsVisible,
    toggleTaskVisibility: expansion.toggleTaskVisibility,
    setDensity: (value) => {
      density.value = value;
    },
    setCollapseDefault: (value) => {
      collapseDefault.value = value;
    },
    setOnMapView: (value) => {
      onMapView.value = value;
    },
    setHideTaskRewards: (value) => {
      hideTaskRewards.value = value;
    },
    setRouteTaskId: (value) => {
      routeTaskId.value = value;
    },
  };
};
describe('useTaskCardExpansion', () => {
  it('stays expanded and non-collapsible in comfortable density', async () => {
    const state = createExpansionHarness({ collapseDefault: true });
    await nextTick();
    expect(state.isCollapsible.value).toBe(false);
    expect(state.taskExpanded.value).toBe(true);
    state.toggleTaskVisibility();
    await nextTick();
    expect(state.taskExpanded.value).toBe(true);
  });
  it('starts expanded in compact mode when collapse-by-default is off', async () => {
    const state = createExpansionHarness({ density: 'compact' });
    await nextTick();
    expect(state.isCollapsible.value).toBe(true);
    expect(state.taskExpanded.value).toBe(true);
  });
  it('starts collapsed in compact mode when collapse-by-default is on', async () => {
    const state = createExpansionHarness({ density: 'compact', collapseDefault: true });
    await nextTick();
    expect(state.taskExpanded.value).toBe(false);
    state.toggleTaskVisibility();
    await nextTick();
    expect(state.taskExpanded.value).toBe(true);
  });
  it('keeps deep-linked tasks expanded even when collapse-by-default is on', async () => {
    const state = createExpansionHarness({
      density: 'compact',
      collapseDefault: true,
      routeTaskId: 'task-1',
    });
    await nextTick();
    expect(state.taskExpanded.value).toBe(true);
  });
  it('expands a collapsed task when it becomes deep-linked', async () => {
    const state = createExpansionHarness({ density: 'compact', collapseDefault: true });
    await nextTick();
    expect(state.taskExpanded.value).toBe(false);
    state.setRouteTaskId('task-1');
    await nextTick();
    expect(state.taskExpanded.value).toBe(true);
    state.setRouteTaskId(undefined);
    await nextTick();
    expect(state.taskExpanded.value).toBe(true);
  });
  it('collapses and expands cards when the preference changes', async () => {
    const state = createExpansionHarness({ density: 'compact' });
    await nextTick();
    expect(state.taskExpanded.value).toBe(true);
    state.setCollapseDefault(true);
    await nextTick();
    expect(state.taskExpanded.value).toBe(false);
    state.setCollapseDefault(false);
    await nextTick();
    expect(state.taskExpanded.value).toBe(true);
  });
  it('stays expanded on map view regardless of the preference', async () => {
    const state = createExpansionHarness({
      density: 'compact',
      collapseDefault: true,
      onMapView: true,
    });
    await nextTick();
    expect(state.taskExpanded.value).toBe(true);
  });
  it('hides rewards in compact mode when hide-rewards is on, even when expanded', async () => {
    const state = createExpansionHarness({ density: 'compact', hideTaskRewards: true });
    await nextTick();
    expect(state.taskExpanded.value).toBe(true);
    expect(state.rewardsVisible.value).toBe(false);
  });
  it('shows rewards in comfortable density even when hide-rewards is on', async () => {
    const state = createExpansionHarness({ hideTaskRewards: true });
    await nextTick();
    expect(state.rewardsVisible.value).toBe(true);
  });
  it('hides rewards while collapsed and restores them on expand', async () => {
    const state = createExpansionHarness({ density: 'compact', collapseDefault: true });
    await nextTick();
    expect(state.rewardsVisible.value).toBe(false);
    state.toggleTaskVisibility();
    await nextTick();
    expect(state.rewardsVisible.value).toBe(true);
  });
});
