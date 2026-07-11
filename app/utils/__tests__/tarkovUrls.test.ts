import { describe, expect, it } from 'vitest';
import {
  buildItemImageUrl,
  buildItemPageUrl,
  buildSkillImageUrl,
  buildTaskPageUrl,
} from '@/utils/tarkovUrls';
describe('buildItemImageUrl', () => {
  it('builds a 512px image URL by default', () => {
    expect(buildItemImageUrl('item1')).toBe('https://assets.tarkov.dev/item1-512.webp');
  });
  it('builds an icon URL when size is icon', () => {
    expect(buildItemImageUrl('item1', 'icon')).toBe('https://assets.tarkov.dev/item1-icon.webp');
  });
  it('encodes the item id', () => {
    expect(buildItemImageUrl('item with spaces')).toBe(
      'https://assets.tarkov.dev/item%20with%20spaces-512.webp'
    );
  });
});
describe('buildItemPageUrl', () => {
  it('builds the tarkov.dev item page URL', () => {
    expect(buildItemPageUrl('item1')).toBe('https://tarkov.dev/item/item1');
  });
  it('encodes the item id', () => {
    expect(buildItemPageUrl('item/slash')).toBe('https://tarkov.dev/item/item%2Fslash');
  });
});
describe('buildTaskPageUrl', () => {
  it('builds the tarkov.dev task page URL', () => {
    expect(buildTaskPageUrl('task1')).toBe('https://tarkov.dev/task/task1');
  });
  it('encodes the task id', () => {
    expect(buildTaskPageUrl('task with spaces')).toBe(
      'https://tarkov.dev/task/task%20with%20spaces'
    );
  });
});
describe('buildSkillImageUrl', () => {
  it('builds a skill icon URL from a skill id', () => {
    expect(buildSkillImageUrl('Vitality')).toBe(
      'https://assets.tarkov.dev/skill-Vitality-icon.webp'
    );
  });
  it('builds URLs for known skill ids from the tarkov.dev GraphQL API', () => {
    const knownSkillIds = [
      'Health',
      'Sniper',
      'StressResistance',
      'Perception',
      'Surgery',
      'Metabolism',
      'Attention',
      'Strength',
      'Endurance',
      'CovertMovement',
    ];
    for (const skillId of knownSkillIds) {
      expect(buildSkillImageUrl(skillId)).toBe(
        `https://assets.tarkov.dev/skill-${skillId}-icon.webp`
      );
    }
  });
  it('encodes the skill id', () => {
    expect(buildSkillImageUrl('skill with spaces')).toBe(
      'https://assets.tarkov.dev/skill-skill%20with%20spaces-icon.webp'
    );
  });
});
