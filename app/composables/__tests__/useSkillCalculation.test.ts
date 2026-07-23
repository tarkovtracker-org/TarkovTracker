/**
 * Test file for useSkillCalculation composable
 */
import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSkillCalculation } from '@/composables/useSkillCalculation';
import { useMetadataStore } from '@/stores/useMetadata';
import { useTarkovStore } from '@/stores/useTarkov';
import { MAX_SKILL_LEVEL } from '@/utils/constants';
import { logger } from '@/utils/logger';
import type { Task } from '@/types/tarkov';
// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));
describe('useSkillCalculation', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const metadataStore = useMetadataStore();
    metadataStore.tasks = [];
    vi.clearAllMocks();
  });
  it('sets total skill level correctly', () => {
    const { setTotalSkillLevel, totalSkills } = useSkillCalculation();
    const skillName = 'Strength';
    expect(setTotalSkillLevel(skillName, 10)).toBe(true);
    expect(totalSkills.value[skillName]).toBe(10);
  });
  it('validates and clamps totalLevel input', () => {
    const { setTotalSkillLevel, totalSkills } = useSkillCalculation();
    const skillName = 'Strength';
    expect(setTotalSkillLevel(skillName, -5)).toBe(true);
    expect(totalSkills.value[skillName] || 0).toBe(0);
    expect(setTotalSkillLevel(skillName, 100)).toBe(true);
    expect(totalSkills.value[skillName]).toBe(MAX_SKILL_LEVEL);
    expect(setTotalSkillLevel(skillName, NaN)).toBe(false);
    expect(totalSkills.value[skillName]).toBe(MAX_SKILL_LEVEL);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Invalid totalLevel "NaN" for skill "Strength"')
    );
    const previousValue = totalSkills.value[skillName];
    expect(setTotalSkillLevel(skillName, Infinity)).toBe(false);
    expect(totalSkills.value[skillName]).toBe(previousValue);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Invalid totalLevel "Infinity" for skill "Strength"')
    );
  });
  it('preserves decimal totalLevel', () => {
    const { setTotalSkillLevel, totalSkills } = useSkillCalculation();
    const skillName = 'Strength';
    expect(setTotalSkillLevel(skillName, 10.7)).toBe(true);
    expect(totalSkills.value[skillName]).toBe(10.7);
  });
  it('limits totalLevel precision to two decimals', () => {
    const { setTotalSkillLevel, totalSkills } = useSkillCalculation();
    const skillName = 'Strength';
    expect(setTotalSkillLevel(skillName, 10.789)).toBe(true);
    expect(totalSkills.value[skillName]).toBe(10.79);
  });
  it('supports fractional quest rewards when setting target skill level', () => {
    const metadataStore = useMetadataStore();
    const tarkovStore = useTarkovStore();
    metadataStore.tasks = [
      {
        id: 'task-perception-bonus',
        name: 'Task Perception Bonus',
        objectives: [],
        finishRewards: {
          skillLevelReward: [{ name: 'Perception', level: 1.5 }],
        },
      },
    ] as Task[];
    tarkovStore.setTaskComplete('task-perception-bonus');
    const { getSkillOffset, setTotalSkillLevel, totalSkills } = useSkillCalculation();
    expect(setTotalSkillLevel('Perception', 16)).toBe(true);
    expect(totalSkills.value.Perception).toBe(16);
    expect(getSkillOffset('Perception')).toBe(14.5);
  });
  it('collects skills required by task objectives', () => {
    const metadataStore = useMetadataStore();
    metadataStore.tasks = [
      {
        id: 'task-vitality',
        name: 'Shootout Picnic',
        objectives: [
          {
            id: 'objective-vitality',
            type: 'skill',
            skillLevel: {
              id: 'req-vitality',
              name: 'Vitality',
              level: 5,
              skill: {
                id: 'Vitality',
                name: 'Vitality',
                imageLink: 'https://example.com/vitality.webp',
              },
            },
          },
          { id: 'objective-item', type: 'giveItem', items: [{ id: 'item-1', name: 'Salewa' }] },
        ],
      },
    ] as Task[];
    const { allGameSkills } = useSkillCalculation();
    const vitality = allGameSkills.value.find((skill) => skill.key === 'Vitality');
    expect(vitality).toMatchObject({
      id: 'Vitality',
      imageLink: 'https://example.com/vitality.webp',
      name: 'Vitality',
      requiredByTasks: ['Shootout Picnic'],
      requiredLevels: [5],
    });
    expect(allGameSkills.value.some((skill) => skill.key === 'Salewa')).toBe(false);
  });
  it('merges required levels for a skill demanded by several tasks', () => {
    const metadataStore = useMetadataStore();
    const objective = (id: string, level: number) => ({
      id,
      type: 'skill',
      skillLevel: {
        id: `req-${id}`,
        name: 'Endurance',
        level,
        skill: { id: 'Endurance', name: 'Endurance' },
      },
    });
    metadataStore.tasks = [
      { id: 'task-a', name: 'Task A', objectives: [objective('a', 6)] },
      { id: 'task-b', name: 'Task B', objectives: [objective('b', 2)] },
      { id: 'task-c', name: 'Task C', objectives: [objective('c', 6)] },
    ] as Task[];
    const { allGameSkills } = useSkillCalculation();
    const endurance = allGameSkills.value.find((skill) => skill.key === 'Endurance');
    expect(endurance?.requiredByTasks).toEqual(['Task A', 'Task B', 'Task C']);
    expect(endurance?.requiredLevels).toEqual([2, 6]);
  });
  it('ignores tasks with no name when collecting objective skills', () => {
    const metadataStore = useMetadataStore();
    metadataStore.tasks = [
      {
        id: 'task-unnamed',
        objectives: [
          {
            id: 'objective-vitality',
            type: 'skill',
            skillLevel: { id: 'req', name: 'Vitality', level: 5 },
          },
        ],
      },
    ] as Task[];
    const { allGameSkills } = useSkillCalculation();
    expect(allGameSkills.value).toEqual([]);
  });
});
