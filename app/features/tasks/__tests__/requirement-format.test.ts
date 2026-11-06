import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  formatActionVerbs,
  formatComparison,
  formatCurrentStatus,
  formatExpectedStatuses,
  formatReputation,
  isRequirementConflict,
} from '@/features/tasks/requirement-format';
import type { RequirementComparison } from '@/types/tarkov';
const en = JSON.parse(readFileSync('app/locales/en.json', 'utf8'));
const t = (key: string, params: Record<string, unknown> = {}) => {
  const template = key
    .split('.')
    .reduce<unknown>((value, part) => (value as Record<string, unknown>)?.[part], en);
  if (typeof template !== 'string') throw new Error(`missing en key ${key}`);
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name]));
};
describe('requirement-format', () => {
  it.each<[RequirementComparison | undefined, string]>([
    ['>=', '15+'],
    [undefined, '15+'],
    ['>', 'above 15'],
    ['<=', '15 or lower'],
    ['<', 'below 15'],
    ['=', 'exactly 15'],
    ['==', 'exactly 15'],
    ['!=', 'not 15'],
  ])('formats %s without raw operators', (method, expected) => {
    const text = formatComparison(t, method, 15);
    expect(text).toBe(expected);
    expect(text).not.toMatch(/[<>=!]/);
  });
  it('formats reputation with two decimals', () => {
    expect(formatReputation(0.2)).toBe('0.20');
    expect(formatReputation(undefined)).toBe('0.00');
  });
  it('uses one status vocabulary', () => {
    expect(formatExpectedStatuses(t, ['completed', 'active', 'active'])).toBe(
      'completed or accepted'
    );
    expect(formatCurrentStatus(t, 'not_started')).toBe(
      en.page.tasks.questcard.requirement_status_not_started
    );
    expect(formatActionVerbs(t, ['completed', 'failed'])).toBe(
      `${en.common.complete} or ${en.common.fail}`
    );
  });
  it('flags only terminal conflicts', () => {
    expect(isRequirementConflict(['completed'], 'failed')).toBe(true);
    expect(isRequirementConflict(['failed'], 'completed')).toBe(true);
    expect(isRequirementConflict(['completed', 'failed'], 'failed')).toBe(false);
    expect(isRequirementConflict(['completed'], 'not_started')).toBe(false);
    expect(isRequirementConflict([], 'failed')).toBe(false);
  });
});
