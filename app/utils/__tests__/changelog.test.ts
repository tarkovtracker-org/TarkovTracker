import { describe, expect, it } from 'vitest';
import {
  cleanText,
  extractReleaseBullets,
  normalizeCommitMessage,
  toSentence,
} from '@/utils/changelog';
describe('public changelog text', () => {
  it('removes markdown, PR suffixes, and redundant whitespace', () => {
    expect(cleanText(' **Fix** [task](https://example.com) `map/view` (#42)')).toBe(
      'Fix task map view'
    );
    expect(cleanText('Change [skip ci]')).toBe('Change');
  });
  it.each([
    ['', ''],
    ['fixed maps', 'Fixed maps.'],
    ['fixed maps!', 'Fixed maps!'],
    ['ready?', 'Ready?'],
  ])('normalizes sentence %s', (input, expected) => expect(toSentence(input)).toBe(expected));
  it('uses release bullets rather than headings and surrounding prose', () => {
    expect(extractReleaseBullets('# Release\nIntro\n- First\n* Second\n1. Third')).toEqual([
      'First',
      'Second',
      'Third',
    ]);
    expect(extractReleaseBullets('# Release\n\nPlain summary')).toEqual(['Plain summary']);
    expect(extractReleaseBullets(null)).toEqual([]);
  });
  it.each([
    ['feat(tasks): tracker (#42)', 'Added tracker.'],
    ['fix: broken map', 'Fixed broken map.'],
    ['perf: task rendering', 'Improved task rendering.'],
    ['ui: filters', 'Updated filters.'],
    ['refactor: progress cache', 'Improved progress cache.'],
    ['Adds map filters', 'Added map filters.'],
    ['Fixes stale counts', 'Fixed stale counts.'],
    ['Updates trader cards', 'Updated trader cards.'],
  ])('renders user-facing change %s', (input, expected) =>
    expect(normalizeCommitMessage(input)).toBe(expected)
  );
  it.each([
    null,
    '',
    '\nfix: second line',
    'Merge branch main',
    'Revert task UI',
    'chore: dependencies',
    'docs: guide',
    'test: fixtures',
    'unknown message',
    'fix: **',
  ])('omits non-user-facing or empty change %s', (input) =>
    expect(normalizeCommitMessage(input)).toBeNull()
  );
});
