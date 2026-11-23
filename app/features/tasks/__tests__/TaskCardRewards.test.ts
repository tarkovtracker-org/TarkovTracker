import { mountSuspended } from '@nuxt/test-utils/runtime';
import { DOMWrapper, flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import TaskCardRewards from '@/features/tasks/TaskCardRewards.vue';
const preferences = vi.hoisted(() => ({ showExperience: true }));
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({ getShowExperienceRewards: preferences.showExperience }),
}));
const tooltipStubs = { stubs: { AppTooltip: { template: '<span><slot /></span>' } } };
describe('TaskCardRewards', () => {
  const emptyRewards = {
    traderStandingRewards: [],
    skillRewards: [],
    itemRewards: [],
    offerUnlockRewards: [],
  };
  it('labels a short reward list by category without a visible Rewards heading', async () => {
    const item = {
      id: '5449016a4bdc2d6f028b456f',
      name: 'Roubles',
      image512pxLink: 'https://assets.tarkov.dev/roubles.webp',
    };
    const key = {
      id: 'key',
      name: 'Old house room key',
      iconLink: 'https://assets.tarkov.dev/key-icon.webp',
      image512pxLink: 'https://assets.tarkov.dev/key-512.webp',
      wikiLink: 'https://escapefromtarkov.fandom.com/wiki/Old_house_room_key',
    };
    const wrapper = await mountSuspended(TaskCardRewards, {
      global: tooltipStubs,
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
    const rewards = wrapper.findAll('[data-testid="task-reward-item"]');
    expect(rewards.map((reward) => reward.text())).toEqual([
      '85,000 ₽',
      'Old house room key ×1',
      'Old house room key',
    ]);
    const footer = wrapper.get('[data-testid="task-card-rewards"]');
    expect(footer.attributes('aria-label')).toBe('Rewards');
    expect(footer.text()).not.toContain('Rewards');
    expect(footer.findAll('[role="group"]').map((group) => group.attributes('aria-label'))).toEqual(
      ['Progression', 'Items & cash', 'Purchase unlocks']
    );
    expect(footer.text()).toContain('16,000 XP');
    const reward = rewards[1]!;
    expect(reward.findAll('a').map((link) => link.attributes('href'))).toEqual([
      key.wikiLink,
      'https://tarkov.dev/item/key',
    ]);
    const thumbnail = reward.get('button');
    expect(thumbnail.get('img').attributes('src')).toBe(key.iconLink);
    await thumbnail.trigger('contextmenu');
    expect(wrapper.emitted('itemContextMenu')?.[0]?.[1]).toEqual(key);
    await thumbnail.trigger('click');
    await flushPromises();
    const preview = new DOMWrapper(document.body).get(
      '[role="dialog"][aria-label="Old house room key"]'
    );
    expect(preview.get('img').attributes('src')).toBe(key.image512pxLink);
    await preview.get('img').trigger('error');
    expect(preview.get('img').attributes('hidden')).toBeDefined();
    const newSource = 'https://assets.tarkov.dev/updated-key.webp';
    await wrapper.setProps({
      itemRewards: [
        { item, count: 85000 },
        { item: { ...key, image512pxLink: newSource }, count: 1 },
      ],
    });
    expect(preview.get('img').attributes('src')).toBe(newSource);
    expect(preview.get('img').attributes('hidden')).toBeUndefined();
    wrapper.unmount();
  });
  it.each([
    ['5449016a4bdc2d6f028b456f', 'Roubles', '₽'],
    ['5696686a4bdc2da3298b456a', 'Dollars', '$'],
    ['569668774bdc2da2298b4568', 'Euros', '€'],
  ])('uses the standard reward item display for %s', async (id, name, symbol) => {
    const item = {
      id,
      name,
      iconLink: `https://assets.tarkov.dev/${id}-icon.webp`,
      image512pxLink: `https://assets.tarkov.dev/${id}-512.webp`,
      wikiLink: `https://escapefromtarkov.fandom.com/wiki/${name}`,
    };
    const wrapper = await mountSuspended(TaskCardRewards, {
      global: tooltipStubs,
      props: { ...emptyRewards, itemRewards: [{ item, count: 1250 }] },
    });
    const reward = wrapper.get('[data-testid="task-reward-item"]');
    expect(reward.text()).toBe(`1,250 ${symbol}`);
    expect(reward.findAll('a').map((link) => link.attributes('href'))).toEqual([
      item.wikiLink,
      `https://tarkov.dev/item/${id}`,
    ]);
    const thumbnail = reward.get('button');
    expect(thumbnail.get('img').attributes('src')).toBe(item.iconLink);
    await thumbnail.trigger('click');
    await flushPromises();
    const preview = new DOMWrapper(document.body).get(`[role="dialog"][aria-label="${name}"]`);
    expect(preview.get('img').attributes('src')).toBe(item.image512pxLink);
    wrapper.unmount();
  });
  it('omits the footer when XP is hidden and there are no other rewards', async () => {
    preferences.showExperience = false;
    try {
      const wrapper = await mountSuspended(TaskCardRewards, {
        global: tooltipStubs,
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
      global: tooltipStubs,
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
    expect(
      footer.findAll('[data-testid="task-reward-item"]').map((reward) => reward.text())
    ).toEqual(['MP-155 Ultima ×1', 'MP-155 Ultima', 'Tactical sword']);
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
      global: tooltipStubs,
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
      global: tooltipStubs,
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
    const group = wrapper.get('[role="group"][aria-label="Purchase unlocks"]');
    expect(group.text()).toMatch(/Unknown offer.*Skier LL4/);
    expect(wrapper.findAll('[data-testid="task-card-rewards"] [role="group"]')).toHaveLength(1);
    expect(wrapper.find('button').exists()).toBe(false);
    wrapper.unmount();
  });
  it('shows all fifteen skill gains without adding empty reward groups', async () => {
    const skillRewards = Array.from({ length: 15 }, (_, index) => ({
      name: `Skill ${index + 1}`,
      level: index + 1,
    }));
    const wrapper = await mountSuspended(TaskCardRewards, {
      global: tooltipStubs,
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
