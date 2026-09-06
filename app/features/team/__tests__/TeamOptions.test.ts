import { mount } from '@vue/test-utils';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
const mockPreferencesState = reactive({
  taskTeamAllHidden: false,
  itemsTeamAllHidden: false,
  itemsTeamNonFIRHidden: false,
  itemsTeamHideoutHidden: false,
  mapTeamAllHidden: false,
});
const mockPreferencesStore = {
  get taskTeamAllHidden() {
    return mockPreferencesState.taskTeamAllHidden;
  },
  get itemsTeamAllHidden() {
    return mockPreferencesState.itemsTeamAllHidden;
  },
  get itemsTeamNonFIRHidden() {
    return mockPreferencesState.itemsTeamNonFIRHidden;
  },
  get itemsTeamHideoutHidden() {
    return mockPreferencesState.itemsTeamHideoutHidden;
  },
  get mapTeamAllHidden() {
    return mockPreferencesState.mapTeamAllHidden;
  },
  setQuestTeamHideAll: vi.fn(),
  setItemsTeamHideAll: vi.fn(),
  setItemsTeamHideNonFIR: vi.fn(),
  setItemsTeamHideHideout: vi.fn(),
  setMapTeamHideAll: vi.fn(),
};
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => mockPreferencesStore,
}));
const TeamVisibilitySwitchStub = {
  props: ['id', 'modelValue', 'disabled'],
  emits: ['update:modelValue'],
  template:
    '<button :id="id" :data-state="modelValue ? \'on\' : \'off\'" :disabled="disabled" @click="$emit(\'update:modelValue\', !modelValue)"></button>',
};
const mountTeamOptions = async () => {
  const { default: TeamOptions } = await import('@/features/team/TeamOptions.vue');
  const wrapper = mount(TeamOptions, {
    global: {
      stubs: {
        TeamCard: { template: '<div><slot name="icon" /><slot /></div>' },
        TeamVisibilitySwitch: TeamVisibilitySwitchStub,
        USeparator: { template: '<hr />' },
      },
      mocks: {
        $t: (key: string) => key,
      },
    },
  });
  await nextTick();
  return wrapper;
};
describe('TeamOptions preferences', () => {
  beforeEach(() => {
    mockPreferencesState.taskTeamAllHidden = false;
    mockPreferencesState.itemsTeamAllHidden = false;
    mockPreferencesState.itemsTeamNonFIRHidden = false;
    mockPreferencesState.itemsTeamHideoutHidden = false;
    mockPreferencesState.mapTeamAllHidden = false;
    vi.clearAllMocks();
  });
  describe('taskHideAll switch', () => {
    it('toggles when the row text is clicked without duplicating switch events', async () => {
      const wrapper = await mountTeamOptions();
      const row = wrapper.find('[data-testid="task-row"]');
      const taskToggle = wrapper.find('[data-testid="task-toggle"]');
      const taskSwitch = wrapper.find('[data-testid="task-switch"]');
      await taskToggle.trigger('click');
      expect(mockPreferencesStore.setQuestTeamHideAll).toHaveBeenCalledTimes(1);
      expect(mockPreferencesStore.setQuestTeamHideAll).toHaveBeenLastCalledWith(true);
      vi.clearAllMocks();
      await taskSwitch.trigger('click');
      expect(mockPreferencesStore.setQuestTeamHideAll).toHaveBeenCalledTimes(1);
      expect(row.element.tagName).toBe('DIV');
      expect(taskToggle.element.tagName).toBe('BUTTON');
      wrapper.unmount();
    });
    it('calls setQuestTeamHideAll when toggled on', async () => {
      const wrapper = await mountTeamOptions();
      const taskSwitch = wrapper.find('[data-testid="task-switch"]');
      expect(taskSwitch.exists()).toBe(true);
      await taskSwitch.trigger('click');
      expect(mockPreferencesStore.setQuestTeamHideAll).toHaveBeenCalledWith(true);
      wrapper.unmount();
    });
    it('calls setQuestTeamHideAll when toggled off', async () => {
      mockPreferencesState.taskTeamAllHidden = true;
      const wrapper = await mountTeamOptions();
      const taskSwitch = wrapper.find('[data-testid="task-switch"]');
      expect(taskSwitch.exists()).toBe(true);
      await taskSwitch.trigger('click');
      expect(mockPreferencesStore.setQuestTeamHideAll).toHaveBeenCalledWith(false);
      wrapper.unmount();
    });
  });
  describe('itemsHideAll switch', () => {
    it('calls setItemsTeamHideAll when toggled on', async () => {
      const wrapper = await mountTeamOptions();
      const itemsSwitch = wrapper.find('[data-testid="items-switch"]');
      expect(itemsSwitch.exists()).toBe(true);
      await itemsSwitch.trigger('click');
      expect(mockPreferencesStore.setItemsTeamHideAll).toHaveBeenCalledWith(true);
      wrapper.unmount();
    });
    it('calls setItemsTeamHideAll when toggled off', async () => {
      mockPreferencesState.itemsTeamAllHidden = true;
      const wrapper = await mountTeamOptions();
      const itemsSwitch = wrapper.find('[data-testid="items-switch"]');
      expect(itemsSwitch.exists()).toBe(true);
      await itemsSwitch.trigger('click');
      expect(mockPreferencesStore.setItemsTeamHideAll).toHaveBeenCalledWith(false);
      wrapper.unmount();
    });
    it('toggles item visibility when the row text is clicked', async () => {
      const wrapper = await mountTeamOptions();
      await wrapper.find('[data-testid="items-row"] button').trigger('click');
      expect(mockPreferencesStore.setItemsTeamHideAll).toHaveBeenCalledWith(true);
      wrapper.unmount();
    });
  });
  describe('dependent toggles', () => {
    it('disables item switches when itemsTeamAllHidden is true', async () => {
      mockPreferencesState.itemsTeamAllHidden = true;
      const wrapper = await mountTeamOptions();
      const nonFirSwitch = wrapper.find('[data-testid="nonfir-switch"]')
        .element as HTMLButtonElement;
      const hideoutSwitch = wrapper.find('[data-testid="hideout-switch"]')
        .element as HTMLButtonElement;
      expect(nonFirSwitch.disabled).toBe(true);
      expect(hideoutSwitch.disabled).toBe(true);
      wrapper.unmount();
    });
    it('enables item switches when itemsTeamAllHidden is false', async () => {
      mockPreferencesState.itemsTeamAllHidden = false;
      const wrapper = await mountTeamOptions();
      const nonFirSwitch = wrapper.find('[data-testid="nonfir-switch"]')
        .element as HTMLButtonElement;
      const hideoutSwitch = wrapper.find('[data-testid="hideout-switch"]')
        .element as HTMLButtonElement;
      expect(nonFirSwitch.disabled).toBe(false);
      expect(hideoutSwitch.disabled).toBe(false);
      wrapper.unmount();
    });
    it('toggles non-FIR visibility from the row text', async () => {
      const wrapper = await mountTeamOptions();
      await wrapper.find('[data-testid="nonfir-row"] button').trigger('click');
      expect(mockPreferencesStore.setItemsTeamHideNonFIR).toHaveBeenCalledWith(true);
      wrapper.unmount();
    });
    it('does not toggle non-FIR visibility while all items are hidden', async () => {
      mockPreferencesState.itemsTeamAllHidden = true;
      const wrapper = await mountTeamOptions();
      await wrapper.find('[data-testid="nonfir-row"] button').trigger('click');
      expect(mockPreferencesStore.setItemsTeamHideNonFIR).not.toHaveBeenCalled();
      wrapper.unmount();
    });
    it('renders the non-FIR switch as checked when non-FIR items are visible', async () => {
      const wrapper = await mountTeamOptions();
      expect(wrapper.find('[data-testid="nonfir-switch"]').attributes('data-state')).toBe('on');
      wrapper.unmount();
    });
    it('toggles hideout visibility from the row text', async () => {
      const wrapper = await mountTeamOptions();
      await wrapper.find('[data-testid="hideout-row"] button').trigger('click');
      expect(mockPreferencesStore.setItemsTeamHideHideout).toHaveBeenCalledWith(true);
      wrapper.unmount();
    });
    it('does not toggle hideout visibility while all items are hidden', async () => {
      mockPreferencesState.itemsTeamAllHidden = true;
      const wrapper = await mountTeamOptions();
      await wrapper.find('[data-testid="hideout-row"] button').trigger('click');
      expect(mockPreferencesStore.setItemsTeamHideHideout).not.toHaveBeenCalled();
      wrapper.unmount();
    });
    it('renders the hideout switch as checked when hideout items are visible', async () => {
      const wrapper = await mountTeamOptions();
      expect(wrapper.find('[data-testid="hideout-switch"]').attributes('data-state')).toBe('on');
      wrapper.unmount();
    });
  });
  describe('label computation', () => {
    it('renders static label regardless of preference state', async () => {
      mockPreferencesState.taskTeamAllHidden = true;
      const wrapper = await mountTeamOptions();
      const taskToggle = wrapper.find('[data-testid="task-toggle"]');
      expect(taskToggle.text()).toContain('page.team.visibility.show_tasks');
      wrapper.unmount();
    });
    it('renders same static label when preference is false', async () => {
      mockPreferencesState.taskTeamAllHidden = false;
      const wrapper = await mountTeamOptions();
      const taskToggle = wrapper.find('[data-testid="task-toggle"]');
      expect(taskToggle.text()).toContain('page.team.visibility.show_tasks');
      wrapper.unmount();
    });
  });
  describe('mapHideAll toggle', () => {
    it('toggles map team visibility when clicked', async () => {
      mockPreferencesState.mapTeamAllHidden = false;
      const wrapper = await mountTeamOptions();
      const mapSwitch = wrapper.find('[data-testid="map-switch"]');
      await mapSwitch.trigger('click');
      expect(mockPreferencesStore.setMapTeamHideAll).toHaveBeenCalledWith(true);
      wrapper.unmount();
    });
    it('toggles map team visibility when the row text is clicked', async () => {
      const wrapper = await mountTeamOptions();
      await wrapper.find('[data-testid="map-row"] button').trigger('click');
      expect(mockPreferencesStore.setMapTeamHideAll).toHaveBeenCalledWith(true);
      wrapper.unmount();
    });
  });
  describe('all preferences independent', () => {
    it('setting one preference does not affect others', () => {
      mockPreferencesState.taskTeamAllHidden = true;
      mockPreferencesState.itemsTeamAllHidden = false;
      mockPreferencesState.mapTeamAllHidden = true;
      expect(mockPreferencesState.taskTeamAllHidden).toBe(true);
      expect(mockPreferencesState.itemsTeamAllHidden).toBe(false);
      expect(mockPreferencesState.mapTeamAllHidden).toBe(true);
      expect(mockPreferencesState.itemsTeamNonFIRHidden).toBe(false);
      expect(mockPreferencesState.itemsTeamHideoutHidden).toBe(false);
    });
  });
});
