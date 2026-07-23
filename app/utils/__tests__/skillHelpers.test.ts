import { describe, expect, it } from 'vitest';
import {
  buildSkillKeyAliases,
  collapseSkillOffsets,
  getCanonicalSkillKey,
  normalizeSkillToken,
  readSkillObjective,
  resolveSkillKey,
} from '@/utils/skillHelpers';
import type { Task, TaskObjective } from '@/types/tarkov';
const skillObjective = (overrides: Partial<TaskObjective> = {}): TaskObjective => ({
  id: 'objective-1',
  type: 'skill',
  skillLevel: {
    id: 'skill-requirement-1',
    name: 'Vitality',
    level: 5,
    skill: { id: 'Vitality', name: 'Vitality', imageLink: 'https://example.com/vitality.webp' },
  },
  ...overrides,
});
describe('normalizeSkillToken', () => {
  it('returns null for null', () => {
    expect(normalizeSkillToken(null)).toBeNull();
  });
  it('returns null for undefined', () => {
    expect(normalizeSkillToken(undefined)).toBeNull();
  });
  it('returns null for empty string', () => {
    expect(normalizeSkillToken('')).toBeNull();
  });
  it('returns null for whitespace-only string', () => {
    expect(normalizeSkillToken('   ')).toBeNull();
  });
  it('trims and returns valid string', () => {
    expect(normalizeSkillToken('  Strength  ')).toBe('Strength');
  });
  it('returns valid string unchanged', () => {
    expect(normalizeSkillToken('Endurance')).toBe('Endurance');
  });
});
describe('getCanonicalSkillKey', () => {
  it('prefers skillId over skillName', () => {
    expect(getCanonicalSkillKey('Starke', 'Strength')).toBe('Strength');
  });
  it('falls back to skillName when skillId is null', () => {
    expect(getCanonicalSkillKey('Starke', null)).toBe('Starke');
  });
  it('falls back to skillName when skillId is undefined', () => {
    expect(getCanonicalSkillKey('Starke')).toBe('Starke');
  });
  it('falls back to skillName when skillId is empty', () => {
    expect(getCanonicalSkillKey('Starke', '')).toBe('Starke');
  });
  it('falls back to skillName when skillId is whitespace', () => {
    expect(getCanonicalSkillKey('Starke', '   ')).toBe('Starke');
  });
  it('returns null when both are null', () => {
    expect(getCanonicalSkillKey(null, null)).toBeNull();
  });
  it('returns null when both are empty', () => {
    expect(getCanonicalSkillKey('', '')).toBeNull();
  });
});
describe('readSkillObjective', () => {
  it('reads name, id, level and image from a skill objective', () => {
    expect(readSkillObjective(skillObjective())).toEqual({
      skillKey: 'Vitality',
      skillName: 'Vitality',
      skillId: 'Vitality',
      requiredLevel: 5,
      imageLink: 'https://example.com/vitality.webp',
    });
  });
  it.each(['giveItem', 'findQuestItem', 'shoot', 'visit', 'taskStatus', 'playerLevel'])(
    'ignores the %s objective type',
    (type) => {
      expect(readSkillObjective(skillObjective({ type }))).toBeNull();
    }
  );
  it('ignores an objective with no type', () => {
    expect(readSkillObjective(skillObjective({ type: undefined }))).toBeNull();
  });
  it('ignores a skill objective with no skillLevel', () => {
    expect(readSkillObjective(skillObjective({ skillLevel: undefined }))).toBeNull();
  });
  it('ignores a skill objective with a blank skill name', () => {
    const objective = skillObjective();
    objective.skillLevel = { id: 'req', name: '', level: 5 };
    expect(readSkillObjective(objective)).toBeNull();
  });
  it('ignores a whitespace-only skill name that has no usable id', () => {
    const objective = skillObjective();
    objective.skillLevel = { id: 'req', name: '   ', level: 5 };
    expect(readSkillObjective(objective)).toBeNull();
  });
  it('falls back to the skill name when the nested skill ref is absent', () => {
    const objective = skillObjective();
    objective.skillLevel = { id: 'req', name: 'Endurance', level: 3 };
    expect(readSkillObjective(objective)).toMatchObject({
      skillKey: 'Endurance',
      skillName: 'Endurance',
      skillId: undefined,
      requiredLevel: 3,
      imageLink: undefined,
    });
  });
  it('prefers the nested skill id over the name as the canonical key', () => {
    const objective = skillObjective();
    objective.skillLevel = {
      id: 'req',
      name: 'Vitalität',
      level: 2,
      skill: { id: 'Vitality', name: 'Vitality' },
    };
    expect(readSkillObjective(objective)).toMatchObject({
      skillKey: 'Vitality',
      skillName: 'Vitalität',
    });
  });
  it('defaults a missing level to 0', () => {
    const objective = skillObjective();
    objective.skillLevel = { id: 'req', name: 'Strength', level: 0 };
    expect(readSkillObjective(objective)?.requiredLevel).toBe(0);
  });
});
describe('buildSkillKeyAliases', () => {
  it('returns an empty map for tasks with no objectives or rewards', () => {
    expect(buildSkillKeyAliases([{ id: 'task-1', name: 'Debut' }] as Task[]).size).toBe(0);
  });
  it('aliases the localized name and the id onto the canonical key', () => {
    const tasks = [
      {
        id: 'task-1',
        name: 'Debut',
        objectives: [
          {
            id: 'objective-1',
            type: 'skill',
            skillLevel: {
              id: 'req',
              name: 'Vitalität',
              level: 5,
              skill: { id: 'Vitality', name: 'Vitality' },
            },
          },
        ],
      },
    ] as Task[];
    const aliases = buildSkillKeyAliases(tasks);
    expect(aliases.get('Vitalität')).toBe('Vitality');
    expect(aliases.get('Vitality')).toBe('Vitality');
  });
  it('skips non-skill objectives', () => {
    const tasks = [
      {
        id: 'task-1',
        name: 'Debut',
        objectives: [
          { id: 'objective-1', type: 'giveItem', items: [{ id: 'item-1', name: 'Salewa' }] },
        ],
      },
    ] as Task[];
    expect(buildSkillKeyAliases(tasks).size).toBe(0);
  });
  it('aliases skill level rewards as well as objectives', () => {
    const tasks = [
      {
        id: 'task-1',
        name: 'Debut',
        objectives: [],
        finishRewards: {
          skillLevelReward: [
            { name: 'Stärke', level: 1, skill: { id: 'Strength', name: 'Strength' } },
          ],
        },
      },
    ] as Task[];
    const aliases = buildSkillKeyAliases(tasks);
    expect(aliases.get('Stärke')).toBe('Strength');
    expect(aliases.get('Strength')).toBe('Strength');
  });
  it('ignores rewards with no name', () => {
    const tasks = [
      {
        id: 'task-1',
        name: 'Debut',
        objectives: [],
        finishRewards: { skillLevelReward: [{ name: '', level: 1 }] },
      },
    ] as unknown as Task[];
    expect(buildSkillKeyAliases(tasks).size).toBe(0);
  });
  it('ignores rewards with a whitespace-only name and no skill id', () => {
    const tasks = [
      {
        id: 'task-1',
        name: 'Debut',
        objectives: [],
        finishRewards: { skillLevelReward: [{ name: '   ', level: 1 }] },
      },
    ] as unknown as Task[];
    expect(buildSkillKeyAliases(tasks).size).toBe(0);
  });
  it('merges aliases across multiple tasks', () => {
    const tasks = [
      {
        id: 'task-1',
        name: 'Debut',
        objectives: [
          {
            id: 'objective-1',
            type: 'skill',
            skillLevel: { id: 'req', name: 'Vitality', level: 5 },
          },
        ],
      },
      {
        id: 'task-2',
        name: 'Shootout Picnic',
        objectives: [
          {
            id: 'objective-2',
            type: 'skill',
            skillLevel: { id: 'req', name: 'Endurance', level: 2 },
          },
        ],
      },
    ] as Task[];
    const aliases = buildSkillKeyAliases(tasks);
    expect(aliases.get('Vitality')).toBe('Vitality');
    expect(aliases.get('Endurance')).toBe('Endurance');
  });
});
describe('resolveSkillKey', () => {
  it('returns the original name when it is empty or whitespace-only', () => {
    const aliases = new Map<string, string>([['Strength', 'Strength']]);
    expect(resolveSkillKey('', aliases)).toBe('');
    expect(resolveSkillKey('   ', aliases)).toBe('   ');
  });
  it('falls back to the normalized name when no alias exists', () => {
    const aliases = new Map<string, string>();
    expect(resolveSkillKey('Endurance', aliases)).toBe('Endurance');
  });
  it('returns an alias when present', () => {
    const aliases = new Map<string, string>([['Starke', 'Strength']]);
    expect(resolveSkillKey('Starke', aliases)).toBe('Strength');
  });
});
describe('collapseSkillOffsets', () => {
  const identity = (key: string) => key;
  it('returns empty map for null offsets', () => {
    expect(collapseSkillOffsets(null, identity).size).toBe(0);
  });
  it('returns empty map for undefined offsets', () => {
    expect(collapseSkillOffsets(undefined, identity).size).toBe(0);
  });
  it('returns empty map for empty offsets', () => {
    expect(collapseSkillOffsets({}, identity).size).toBe(0);
  });
  it('passes through a single offset unchanged', () => {
    const result = collapseSkillOffsets({ Strength: 5 }, identity);
    expect(result.size).toBe(1);
    expect(result.get('Strength')?.offset).toBe(5);
    expect(result.get('Strength')?.isCanonical).toBe(true);
  });
  it('rounds offsets to two decimal places', () => {
    const result = collapseSkillOffsets({ Strength: 5.556 }, identity);
    expect(result.get('Strength')?.offset).toBe(5.56);
  });
  it('replaces non-finite offsets with 0', () => {
    const result = collapseSkillOffsets({ A: NaN, B: Infinity, C: -Infinity }, identity);
    expect(result.get('A')?.offset).toBe(0);
    expect(result.get('B')?.offset).toBe(0);
    expect(result.get('C')?.offset).toBe(0);
  });
  it('canonical entry wins over non-canonical alias', () => {
    const resolve = (key: string) => (key === 'Starke' ? 'Strength' : key);
    const result = collapseSkillOffsets({ Starke: 12, Strength: 5 }, resolve);
    expect(result.size).toBe(1);
    expect(result.get('Strength')?.offset).toBe(5);
    expect(result.get('Strength')?.sourceKey).toBe('Strength');
    expect(result.get('Strength')?.isCanonical).toBe(true);
  });
  it('canonical entry wins regardless of iteration order', () => {
    const resolve = (key: string) => (key === 'Starke' ? 'Strength' : key);
    const result = collapseSkillOffsets({ Strength: 5, Starke: 12 }, resolve);
    expect(result.size).toBe(1);
    expect(result.get('Strength')?.offset).toBe(5);
    expect(result.get('Strength')?.isCanonical).toBe(true);
  });
  it('keeps larger absolute offset when two non-canonical aliases collide', () => {
    const resolve = (key: string) => (key === 'Starke' || key === 'Kraft' ? 'Strength' : key);
    const result = collapseSkillOffsets({ Starke: 5, Kraft: 12 }, resolve);
    expect(result.size).toBe(1);
    expect(result.get('Strength')?.offset).toBe(12);
    expect(result.get('Strength')?.sourceKey).toBe('Kraft');
  });
  it('keeps larger absolute offset with negative values', () => {
    const resolve = (key: string) => (key === 'A' || key === 'B' ? 'Canonical' : key);
    const result = collapseSkillOffsets({ A: -10, B: 3 }, resolve);
    expect(result.size).toBe(1);
    expect(result.get('Canonical')?.offset).toBe(-10);
  });
  it('handles multiple independent skills', () => {
    const result = collapseSkillOffsets({ Strength: 5, Endurance: 3, Vitality: 7 }, identity);
    expect(result.size).toBe(3);
    expect(result.get('Strength')?.offset).toBe(5);
    expect(result.get('Endurance')?.offset).toBe(3);
    expect(result.get('Vitality')?.offset).toBe(7);
  });
  it('handles mix of colliding and independent skills', () => {
    const resolve = (key: string) => (key === 'Starke' ? 'Strength' : key);
    const result = collapseSkillOffsets({ Starke: 12, Strength: 5, Endurance: 3 }, resolve);
    expect(result.size).toBe(2);
    expect(result.get('Strength')?.offset).toBe(5);
    expect(result.get('Endurance')?.offset).toBe(3);
  });
});
