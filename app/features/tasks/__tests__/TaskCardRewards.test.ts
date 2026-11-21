import { mountSuspended } from '@nuxt/test-utils/runtime';
import { DOMWrapper, flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import TaskCardRewards from '@/features/tasks/TaskCardRewards.vue';
const preferences = vi.hoisted(() => ({ showExperience: true }));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({ getShowExperienceRewards: preferences.showExperience }),
}));
describe('TaskCardRewards', () => {
  const emptyRewards = {
    traderStandingRewards: [],
    skillRewards: [],
    itemRewards: [],
    offerUnlockRewards: [],
  };
  it('shows individual item quantities and distinguishes purchase unlocks in the footer', async () => {
    const item = {
      id: '5449016a4bdc2d6f028b456f',
      name: 'Roubles',
      image512pxLink: 'https://assets.tarkov.dev/roubles.webp',
    };
    const key = { id: 'key', name: 'Old house room key' };
    const wrapper = await mountSuspended(TaskCardRewards, {
      props: {
        ...emptyRewards,
        itemRewards: [
          { item, count: 85000 },
          { item: key, count: 1 },
        ],
        offerUnlockRewards: [
          { id: 'offer', item: key, trader: { id: 'm', name: 'Mechanic' }, level: 3 },
        ],
        experience: 16000,
      },
    });
    const chips = wrapper.findAll('[data-testid="task-reward-item"]');
    expect(chips.map((chip) => chip.text())).toEqual([
      '85,000 ₽',
      'Old house room key ×1',
      'Purchase unlock · Old house room key',
    ]);
    expect(wrapper.get('[data-testid="task-card-rewards"]').attributes('role')).toBeUndefined();
    expect(wrapper.text()).toContain('16,000 XP');
    await chips[0]!.trigger('contextmenu');
    expect(wrapper.emitted('itemContextMenu')?.[0]?.[1]).toEqual(item);
    await chips[0]!.trigger('click');
    await flushPromises();
    const preview = new DOMWrapper(document.body).get('[role="dialog"][aria-label="Roubles"]');
    expect(preview.get('img').attributes('src')).toBe(item.image512pxLink);
    expect(preview.get('a').attributes('href')).toBe('https://tarkov.dev/item/' + item.id);
    wrapper.unmount();
  });
  it('omits the footer when XP is hidden and there are no other rewards', async () => {
    preferences.showExperience = false;
    try {
      const wrapper = await mountSuspended(TaskCardRewards, {
        props: { ...emptyRewards, experience: 16000 },
      });
      expect(wrapper.find('[data-testid="task-card-rewards"]').exists()).toBe(false);
      wrapper.unmount();
    } finally {
      preferences.showExperience = true;
    }
  });
});
