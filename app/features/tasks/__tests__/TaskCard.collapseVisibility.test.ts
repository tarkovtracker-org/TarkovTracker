import { describe, expect, it } from 'vitest';
import { computed, nextTick, ref, watch, type ComputedRef } from 'vue';
type TaskExpansionState = {
  isCollapsible: ComputedRef<boolean>;
  taskExpanded: ComputedRef<boolean>;
  rewardsVisible: ComputedRef<boolean>;
  toggleTaskVisibility: () => void;
  setDensity: (density: 'comfortable' | 'compact') => void;
  setCollapseDefault: (collapse: boolean) => void;
  setOnMapView: (onMapView: boolean) => void;
  setHideTaskRewards: (hide: boolean) => void;
  setIsDeepLinked: (linked: boolean) => void;
};
const createTaskExpansionState = (options: {
  density?: 'comfortable' | 'compact';
  collapseDefault?: boolean;
  hideTaskRewards?: boolean;
  isDeepLinked?: boolean;
  onMapView?: boolean;
}): TaskExpansionState => {
  const density = ref(options.density ?? 'comfortable');
  const collapseDefault = ref(options.collapseDefault ?? false);
  const hideTaskRewards = ref(options.hideTaskRewards ?? false);
  const isDeepLinked = ref(options.isDeepLinked ?? false);
  const onMapView = ref(options.onMapView ?? false);
  const isCompact = computed(() => density.value === 'compact');
  const taskToggle = ref(true);
  const isCollapsible = computed(() => onMapView.value || isCompact.value);
  watch(
    () => isCompact.value && !onMapView.value && collapseDefault.value,
    (collapseByDefault) => {
      taskToggle.value = !(collapseByDefault && !isDeepLinked.value);
    },
    { immediate: true }
  );
  const taskExpanded = computed(() => {
    return !isCollapsible.value || taskToggle.value;
  });
  const rewardsVisible = computed(() => {
    return taskExpanded.value && !(isCompact.value && hideTaskRewards.value);
  });
  watch(isDeepLinked, (linked) => {
    if (linked) taskToggle.value = true;
  });
  const toggleTaskVisibility = () => {
    if (!isCollapsible.value) return;
    taskToggle.value = !taskToggle.value;
  };
  return {
    isCollapsible,
    taskExpanded,
    rewardsVisible,
    toggleTaskVisibility,
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
    setIsDeepLinked: (value) => {
      isDeepLinked.value = value;
    },
  };
};
describe('TaskCard collapse behavior', () => {
  it('stays expanded and non-collapsible in comfortable density', async () => {
    const state = createTaskExpansionState({ collapseDefault: true });
    await nextTick();
    expect(state.isCollapsible.value).toBe(false);
    expect(state.taskExpanded.value).toBe(true);
    state.toggleTaskVisibility();
    await nextTick();
    expect(state.taskExpanded.value).toBe(true);
  });
  it('starts expanded in compact mode when collapse-by-default is off', async () => {
    const state = createTaskExpansionState({ density: 'compact' });
    await nextTick();
    expect(state.isCollapsible.value).toBe(true);
    expect(state.taskExpanded.value).toBe(true);
  });
  it('starts collapsed in compact mode when collapse-by-default is on', async () => {
    const state = createTaskExpansionState({ density: 'compact', collapseDefault: true });
    await nextTick();
    expect(state.taskExpanded.value).toBe(false);
    state.toggleTaskVisibility();
    await nextTick();
    expect(state.taskExpanded.value).toBe(true);
  });
  it('keeps deep-linked tasks expanded even when collapse-by-default is on', async () => {
    const state = createTaskExpansionState({
      density: 'compact',
      collapseDefault: true,
      isDeepLinked: true,
    });
    await nextTick();
    expect(state.taskExpanded.value).toBe(true);
  });
  it('expands a collapsed task when it becomes deep-linked', async () => {
    const state = createTaskExpansionState({ density: 'compact', collapseDefault: true });
    await nextTick();
    expect(state.taskExpanded.value).toBe(false);
    state.setIsDeepLinked(true);
    await nextTick();
    expect(state.taskExpanded.value).toBe(true);
    state.setIsDeepLinked(false);
    await nextTick();
    expect(state.taskExpanded.value).toBe(true);
  });
  it('collapses and expands cards when the preference changes', async () => {
    const state = createTaskExpansionState({ density: 'compact' });
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
    const state = createTaskExpansionState({
      density: 'compact',
      collapseDefault: true,
      onMapView: true,
    });
    await nextTick();
    expect(state.taskExpanded.value).toBe(true);
  });
  it('hides rewards in compact mode when hide-rewards is on, even when expanded', async () => {
    const state = createTaskExpansionState({ density: 'compact', hideTaskRewards: true });
    await nextTick();
    expect(state.taskExpanded.value).toBe(true);
    expect(state.rewardsVisible.value).toBe(false);
  });
  it('shows rewards in comfortable density even when hide-rewards is on', async () => {
    const state = createTaskExpansionState({ hideTaskRewards: true });
    await nextTick();
    expect(state.rewardsVisible.value).toBe(true);
  });
  it('hides rewards while collapsed and restores them on expand', async () => {
    const state = createTaskExpansionState({ density: 'compact', collapseDefault: true });
    await nextTick();
    expect(state.rewardsVisible.value).toBe(false);
    state.toggleTaskVisibility();
    await nextTick();
    expect(state.rewardsVisible.value).toBe(true);
  });
});
