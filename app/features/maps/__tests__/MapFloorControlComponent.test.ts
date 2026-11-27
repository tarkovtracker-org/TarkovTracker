import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import maps from '@/data/maps.json';
import MapFloorControl from '@/features/maps/MapFloorControl.vue';
describe('Icebreaker floor picker', () => {
  it('shows the selected group and follows floor changes from the map', async () => {
    const { floors, floorGroups } = maps.icebreaker.tile;
    const wrapper = await mountSuspended(MapFloorControl, {
      props: { floors, groups: floorGroups, selectedFloor: 'Infirmary' },
      global: { stubs: { AppTooltip: { template: '<slot />' } } },
    });
    const [main, engine] = wrapper.findAll('button');
    expect(main?.text()).toBe('Main Decks');
    expect(main?.attributes('aria-pressed')).toBe('true');
    expect(engine?.text()).toBe('Engine Room');
    const options = () => wrapper.findAll('option').map((option) => option.attributes('value'));
    expect(options()).toEqual(floorGroups[0]?.floors);
    await engine?.trigger('click');
    expect(wrapper.emitted('select')).toEqual([['Engine Room']]);
    await wrapper.setProps({ selectedFloor: 'Engine Room' });
    expect(engine?.attributes('aria-pressed')).toBe('true');
    expect(options()).toEqual(floorGroups[1]?.floors);
    await engine?.trigger('click');
    expect(wrapper.emitted('select')).toHaveLength(1);
    await wrapper.get('select').setValue('Fuel Pumps');
    expect(wrapper.emitted('select')?.at(-1)).toEqual(['Fuel Pumps']);
    await wrapper.setProps({ selectedFloor: 'Helipad' });
    expect(main?.attributes('aria-pressed')).toBe('true');
    expect(options()).toEqual(floorGroups[0]?.floors);
    expect(wrapper.get('select').element.value).toBe('Helipad');
    wrapper.unmount();
  });
});
