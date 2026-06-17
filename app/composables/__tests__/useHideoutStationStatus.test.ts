import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { useHideoutStationStatus } from '@/composables/useHideoutStationStatus';
import type {
  HideoutLevel,
  HideoutStation,
  SkillRequirement,
  StationLevelRequirement,
  TraderRequirement,
} from '@/types/tarkov';
const mockState = reactive({
  requireStationLevels: true,
  requireSkillLevels: true,
  requireTraderLoyalty: true,
  hideoutLevels: {} as Record<string, { self: number }>,
  skills: {} as Record<string, number>,
  traderLevels: {} as Record<string, number>,
});
vi.mock('@/stores/usePreferences', () => ({
  usePreferencesStore: () => ({
    get getHideoutRequireStationLevels() {
      return mockState.requireStationLevels;
    },
    get getHideoutRequireSkillLevels() {
      return mockState.requireSkillLevels;
    },
    get getHideoutRequireTraderLoyalty() {
      return mockState.requireTraderLoyalty;
    },
  }),
}));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({
    get hideoutLevels() {
      return mockState.hideoutLevels;
    },
  }),
}));
vi.mock('@/stores/useTarkov', () => ({
  useTarkovStore: () => ({
    getTraderLevel: (id: string) => mockState.traderLevels[id] ?? 0,
  }),
}));
vi.mock('@/composables/useSkillCalculation', () => ({
  useSkillCalculation: () => ({
    getSkillLevel: (name: string) => mockState.skills[name] ?? 0,
  }),
}));
const createLevel = (level: number, overrides: Partial<HideoutLevel> = {}): HideoutLevel => ({
  id: `level-${level}`,
  level,
  description: `Level ${level}`,
  constructionTime: 0,
  itemRequirements: [],
  stationLevelRequirements: [],
  skillRequirements: [],
  traderRequirements: [],
  crafts: [],
  ...overrides,
});
const createStation = (levels: HideoutLevel[]): HideoutStation => ({
  id: 'station-main',
  name: 'Main Station',
  levels,
});
const createRequirements = () => {
  const stationRequirement: StationLevelRequirement = {
    id: 'req-station',
    station: { id: 'station-prereq', name: 'Prereq' },
    level: 1,
  };
  const skillRequirement: SkillRequirement = {
    id: 'req-skill',
    name: 'Strength',
    level: 2,
  };
  const traderRequirement: TraderRequirement = {
    id: 'req-trader',
    trader: { id: 'trader-1', name: 'Trader' },
    value: 2,
  };
  return { stationRequirement, skillRequirement, traderRequirement };
};
describe('useHideoutStationStatus', () => {
  beforeEach(() => {
    mockState.requireStationLevels = true;
    mockState.requireSkillLevels = true;
    mockState.requireTraderLoyalty = true;
    mockState.hideoutLevels = {};
    mockState.skills = {};
    mockState.traderLevels = {};
    vi.clearAllMocks();
  });
  it('returns maxed when no next level exists', () => {
    mockState.hideoutLevels = { 'station-main': { self: 1 } };
    const station = createStation([createLevel(1)]);
    const { getStationStatus } = useHideoutStationStatus();
    expect(getStationStatus(station)).toBe('maxed');
  });
  it('returns available when prerequisites are met', () => {
    const { stationRequirement, skillRequirement, traderRequirement } = createRequirements();
    mockState.hideoutLevels = {
      'station-main': { self: 0 },
      'station-prereq': { self: 1 },
    };
    mockState.skills = { Strength: 3 };
    mockState.traderLevels = { 'trader-1': 2 };
    const level = createLevel(1, {
      stationLevelRequirements: [stationRequirement],
      skillRequirements: [skillRequirement],
      traderRequirements: [traderRequirement],
    });
    const station = createStation([level]);
    const { arePrereqsMet, getStationStatus } = useHideoutStationStatus();
    expect(arePrereqsMet(level)).toBe(true);
    expect(getStationStatus(station)).toBe('available');
  });
  it('returns locked when a skill requirement is unmet', () => {
    const { stationRequirement, skillRequirement, traderRequirement } = createRequirements();
    mockState.hideoutLevels = {
      'station-main': { self: 0 },
      'station-prereq': { self: 1 },
    };
    mockState.skills = { Strength: 1 };
    mockState.traderLevels = { 'trader-1': 2 };
    const level = createLevel(1, {
      stationLevelRequirements: [stationRequirement],
      skillRequirements: [skillRequirement],
      traderRequirements: [traderRequirement],
    });
    const station = createStation([level]);
    const { getStationStatus, isSkillReqMet } = useHideoutStationStatus();
    expect(isSkillReqMet(skillRequirement)).toBe(false);
    expect(getStationStatus(station)).toBe('locked');
  });
  it('matches a skill requirement by skill.id when the display name differs (issue #420)', () => {
    // Hideout requirement uses the spaced display name, but the level is stored
    // under the canonical id key (as produced by task rewards / SkillsCard).
    mockState.hideoutLevels = { 'station-main': { self: 0 } };
    mockState.skills = { HideoutManagement: 11 };
    const requirement: SkillRequirement = {
      id: 'req-hideout-mgmt',
      name: 'Hideout Management',
      level: 5,
      skill: { id: 'HideoutManagement', name: 'Hideout Management' },
    };
    const level = createLevel(1, { skillRequirements: [requirement] });
    const station = createStation([level]);
    const { getStationStatus, isSkillReqMet } = useHideoutStationStatus();
    expect(isSkillReqMet(requirement)).toBe(true);
    expect(getStationStatus(station)).toBe('available');
  });
  it('returns locked when a trader requirement is unmet', () => {
    const { stationRequirement, skillRequirement, traderRequirement } = createRequirements();
    mockState.hideoutLevels = {
      'station-main': { self: 0 },
      'station-prereq': { self: 1 },
    };
    mockState.skills = { Strength: 3 };
    mockState.traderLevels = { 'trader-1': 1 };
    const level = createLevel(1, {
      stationLevelRequirements: [stationRequirement],
      skillRequirements: [skillRequirement],
      traderRequirements: [traderRequirement],
    });
    const station = createStation([level]);
    const { getStationStatus, isTraderReqMet } = useHideoutStationStatus();
    expect(isTraderReqMet(traderRequirement)).toBe(false);
    expect(getStationStatus(station)).toBe('locked');
  });
  it('ignores skill requirements when disabled', () => {
    const { stationRequirement, skillRequirement, traderRequirement } = createRequirements();
    mockState.requireSkillLevels = false;
    mockState.hideoutLevels = {
      'station-main': { self: 0 },
      'station-prereq': { self: 1 },
    };
    mockState.skills = { Strength: 0 };
    mockState.traderLevels = { 'trader-1': 2 };
    const level = createLevel(1, {
      stationLevelRequirements: [stationRequirement],
      skillRequirements: [skillRequirement],
      traderRequirements: [traderRequirement],
    });
    const station = createStation([level]);
    const { getStationStatus, isSkillReqMet } = useHideoutStationStatus();
    expect(isSkillReqMet(skillRequirement)).toBe(true);
    expect(getStationStatus(station)).toBe('available');
  });
  it('respects station requirement preferences', () => {
    const stationRequirement: StationLevelRequirement = {
      id: 'req-station',
      station: { id: 'station-missing', name: 'Missing' },
      level: 2,
    };
    mockState.hideoutLevels = { 'station-missing': { self: 1 } };
    const { isStationReqMet } = useHideoutStationStatus();
    expect(isStationReqMet(stationRequirement)).toBe(false);
    mockState.requireStationLevels = false;
    expect(isStationReqMet(stationRequirement)).toBe(true);
  });
});
