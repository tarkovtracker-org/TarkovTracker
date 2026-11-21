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
    await preview.get('img').trigger('error');
    expect(preview.get('img').attributes('hidden')).toBeDefined();
    const newSource = 'https://assets.tarkov.dev/updated-roubles.webp';
    await wrapper.setProps({
      itemRewards: [{ item: { ...item, image512pxLink: newSource }, count: 85000 }],
    });
    expect(preview.get('img').attributes('src')).toBe(newSource);
    expect(preview.get('img').attributes('hidden')).toBeUndefined();
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
  it('groups a mixed reward list and keeps full purchase names available in previews', async () => {
    const shotgun = {
      id: 'shotgun',
      name: 'MP-155 12ga semi-automatic shotgun Ultima',
      shortName: 'MP-155 Ultima',
    };
    const trader = { id: 'skier', name: 'Skier' };
    const wrapper = await mountSuspended(TaskCardRewards, {
      props: {
        ...emptyRewards,
        experience: 65000,
        skillRewards: [{ name: 'Shotgun', level: 4 }],
        itemRewards: [{ item: shotgun, count: 1 }],
        offerUnlockRewards: [
          { id: 'shotgun-offer', item: shotgun, trader, level: 4 },
          { id: 'sword-offer', item: { id: 'sword', name: 'Tactical sword' }, trader, level: 4 },
        ],
      },
    });
    const footer = wrapper.get('[data-testid="task-card-rewards"]');
    expect(footer.text()).toContain('Progression');
    expect(footer.text()).toContain('Items & cash');
    expect(footer.text().match(/Purchase unlock/gi)).toEqual(['Purchase unlock']);
    expect(footer.findAll('button').map((chip) => chip.text())).toEqual([
      'MP-155 Ultima ×1',
      'MP-155 Ultima',
      'Tactical sword',
    ]);
    await footer.findAll('button')[1]!.trigger('click');
    await flushPromises();
    const preview = new DOMWrapper(document.body).get(
      '[role="dialog"][aria-label="MP-155 12ga semi-automatic shotgun Ultima"]'
    );
    expect(preview.text()).toContain('Skier LL4');
    wrapper.unmount();
  });
  it('distinguishes variants with shared short names within an unlock group', async () => {
    const trader = { id: 'peacekeeper', name: 'Peacekeeper' };
    const variants = [
      ['Urban', 'ACS sight (Urban)', 'ACS'],
      ['Forest', 'ACS sight (Forest)', 'ACS'],
      ['First optic', 'First named optic', 'Optic'],
      ['Second optic', 'Second named optic', 'Optic'],
    ] as const;
    const wrapper = await mountSuspended(TaskCardRewards, {
      props: {
        ...emptyRewards,
        offerUnlockRewards: variants.map(([id, name, shortName]) => ({
          id,
          item: { id, name, shortName },
          trader,
          level: 4,
        })),
      },
    });
    expect(wrapper.findAll('[data-testid="task-reward-item"]').map((chip) => chip.text())).toEqual([
      'ACS (Urban)',
      'ACS (Forest)',
      'First named optic',
      'Second named optic',
    ]);
    wrapper.unmount();
  });
  it('retains the trader level when an unlock lacks an item preview', async () => {
    const wrapper = await mountSuspended(TaskCardRewards, {
      props: {
        ...emptyRewards,
        offerUnlockRewards: [
          {
            id: 'offer',
            item: { id: '', name: 'Unknown offer' },
            trader: { id: 'skier', name: 'Skier' },
            level: 4,
          },
        ],
      },
    });
    expect(wrapper.text()).toMatch(/Purchase unlock · Unknown offer.*Skier LL4/);
    expect(wrapper.find('button').exists()).toBe(false);
    wrapper.unmount();
  });
  it('shows all fifteen skill gains without adding empty reward groups', async () => {
    const skillRewards = Array.from({ length: 15 }, (_, index) => ({
      name: `Skill ${index + 1}`,
      level: index + 1,
    }));
    const wrapper = await mountSuspended(TaskCardRewards, {
      props: { ...emptyRewards, skillRewards },
    });
    const footer = wrapper.get('[data-testid="task-card-rewards"]');
    expect(footer.text()).toContain('Progression');
    expect(footer.text().match(/Skill \d+/g)).toHaveLength(15);
    expect(footer.text()).not.toMatch(/Items & cash|Purchase unlocks/);
    expect(footer.find('button').exists()).toBe(false);
    wrapper.unmount();
  });
});
