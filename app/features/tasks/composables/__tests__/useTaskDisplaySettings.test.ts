import { describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { useTaskDisplaySettings } from '@/features/tasks/composables/useTaskDisplaySettings';
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
const store = reactive({
  getHideTaskRewards: true,
  getShowFailedFilter: false,
  setHideTaskRewards: vi.fn((value: boolean) => {
    store.getHideTaskRewards = value;
  }),
  setShowFailedFilter: vi.fn(),
});
vi.mock('@/stores/usePreferences', () => ({ usePreferencesStore: () => store }));
const findSetting = (groupKey: string, settingKey: string) => {
  const { groups } = useTaskDisplaySettings();
  const group = groups.value.find((candidate) => candidate.key === groupKey);
  const setting = group?.settings.find((candidate) => candidate.key === settingKey);
  if (!setting) throw new Error(`missing ${groupKey}.${settingKey}`);
  return setting;
};
describe('useTaskDisplaySettings', () => {
  it('groups card, status tab, and behavior preferences in display order', () => {
    const { groups } = useTaskDisplaySettings();
    expect(groups.value.map((group) => group.key)).toEqual(['cards', 'status_tabs', 'behavior']);
    expect(groups.value[1]?.settings.map((setting) => setting.key)).toEqual([
      'all',
      'available',
      'locked',
      'completed',
      'failed',
    ]);
  });
  it('shows rewards as a positive switch over the saved hide preference', () => {
    const rewards = findSetting('cards', 'rewards');
    expect(rewards.get()).toBe(false);
    rewards.set(true);
    expect(store.setHideTaskRewards).toHaveBeenCalledWith(false);
    expect(rewards.get()).toBe(true);
  });
  it('writes status tab visibility to its own preference', () => {
    findSetting('status_tabs', 'failed').set(true);
    expect(store.setShowFailedFilter).toHaveBeenCalledWith(true);
  });
});
