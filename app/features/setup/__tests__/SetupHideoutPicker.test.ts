import { shallowMount } from '@vue/test-utils';
import { expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import SetupHideoutPicker from '@/features/setup/SetupHideoutPicker.vue';
it('places trader navigation before applying station prerequisites', async () => {
  const wrapper = shallowMount(SetupHideoutPicker, {
    props: {
      stations: [],
      levels: new Map(),
      saving: false,
      blockedDetails: [
        {
          moduleId: 'workbench-2',
          stationId: 'workbench',
          stationName: 'Workbench',
          level: 2,
          missingStations: [
            { stationId: 'security', stationName: 'Security', requiredLevel: 2, currentLevel: 1 },
          ],
          missingTraders: [
            { traderId: 'mechanic', traderName: 'Mechanic', requiredLevel: 2, currentLevel: 1 },
          ],
          missingSkills: [],
        },
      ],
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', missingWarn: false })],
      stubs: {
        UAlert: { template: '<div><slot name="description" /></div>' },
        UButton: { template: '<button><slot /></button>' },
      },
    },
  });
  const buttons = wrapper.findAll('button');
  expect(buttons.map((button) => button.text())).toEqual([
    'setup.hideout_open_traders',
    'setup.hideout_include_prereqs',
  ]);
  await buttons[0]!.trigger('click');
  await buttons[1]!.trigger('click');
  expect(wrapper.emitted('openTradersTab')).toHaveLength(1);
  expect(wrapper.emitted('includeStationPrereqs')).toHaveLength(1);
  wrapper.unmount();
});
