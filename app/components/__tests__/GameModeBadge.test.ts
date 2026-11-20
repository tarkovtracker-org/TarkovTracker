import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import GameModeBadge from '@/components/GameModeBadge.vue';
describe('GameModeBadge', () => {
  it('renders badges only for Tarkov game modes', async () => {
    const wrapper = mount(GameModeBadge, { props: { mode: 'pvp' } });
    expect(wrapper.get('img').attributes('src')).toBe('/img/game-modes/pvp.png');
    await wrapper.setProps({ mode: 'arena' });
    expect(wrapper.find('img').exists()).toBe(false);
    await wrapper.setProps({ mode: 'unknown' });
    expect(wrapper.find('img').exists()).toBe(false);
    await wrapper.setProps({ mode: 'seasonal' });
    expect(wrapper.get('img').attributes('src')).toBe('/img/game-modes/seasonal.png');
    wrapper.unmount();
  });
});
