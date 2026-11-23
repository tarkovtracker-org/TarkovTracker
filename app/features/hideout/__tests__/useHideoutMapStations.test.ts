import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { useHideoutMapStations } from '@/features/hideout/useHideoutMapStations';
import type { HideoutStation } from '@/types/tarkov';
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }));
const progress = reactive({ count: 0, complete: false, prerequisite: false, level: 0 });
vi.mock('@/composables/useHideoutStationStatus', () => ({
  useHideoutStationStatus: () => ({ isStationReqMet: () => progress.prerequisite }),
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({
    get hideoutLevels() {
      return { gym: { self: progress.level } };
    },
  }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getHideoutPartCount: () => progress.count,
    isHideoutPartComplete: () => progress.complete,
  }),
}));
it('updates the mapped upgrade as prerequisites, legacy completion flags, partial counts and levels change', () => {
  const station: HideoutStation = {
    id: 'gym',
    name: 'Gym',
    normalizedName: 'gym',
    levels: [
      {
        level: 1,
        id: 'gym-tier',
        constructionTime: 0,
        crafts: [],
        stationLevelRequirements: [
          { id: 'wall-prereq', station: { id: 'wall', name: 'Wall' }, level: 6 },
        ],
        skillRequirements: [],
        traderRequirements: [],
        itemRequirements: [
          { id: 'part', item: { id: 'tool', name: 'Toolset' }, quantity: 2, count: 2 },
        ],
      },
    ],
  };
  const entries = useHideoutMapStations(() => [station]);
  const entry = () => entries.value[0]!;
  expect(entry()).toMatchObject({ pin: { area: 'gym' }, state: 'locked' });
  progress.prerequisite = true;
  expect(entry().state).toBe('items');
  progress.complete = true;
  expect(entry().state).toBe('ready');
  progress.count = 1;
  expect(entry().state).toBe('items');
  progress.count = 2;
  expect(entry().state).toBe('ready');
  progress.level = 1;
  expect(entry().state).toBe('maxed');
});
