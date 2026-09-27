import { describe, expect, it } from 'vitest';
import {
  cleanText,
  extractReleaseBullets,
  normalizeCommitMessage,
  releaseBullets,
  releaseEntries,
  toReleaseBullet,
  toSentence,
} from '@/utils/changelog';
const repo = 'https://github.com/tarkovtracker-org/TarkovTracker';
const sha = '1e9c0d4b2612deeaa1b034ed5865b721f55eca69';
const entry = (scope: string, subject: string, commit = sha) =>
  `**${scope}:** ${subject} ([#946](${repo}/issues/946)) ([${commit.slice(0, 7)}](${repo}/commit/${commit}))`;
const releaseBody = (...entries: string[]) =>
  `## [1.83.1](${repo}/compare/v1.83.0...v1.83.1) (2026-09-27)\n\n\n### Bug Fixes\n\n${entries.map((line) => `* ${line}`).join('\n')}\n`;
describe('public changelog text', () => {
  it('removes markdown, PR suffixes, and redundant whitespace', () => {
    expect(cleanText(' **Fix** [task](https://example.com) `map/view` (#42)')).toBe(
      'Fix task map view'
    );
    expect(cleanText('Change [skip ci]')).toBe('Change');
    expect(cleanText('Retire legacy routes (#720) (#859)')).toBe('Retire legacy routes');
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
  it('renders semantic-release entries without scopes, issue links, or commit hashes', () => {
    expect(toReleaseBullet(entry('app', 'make Smart Fill distribute collected totals'))).toBe(
      'Make Smart Fill distribute collected totals.'
    );
    expect(
      toReleaseBullet(
        `**app:** rank buildable needs ([#940](${repo}/issues/940)) ([ce67df4](${repo}/commit/${sha})), closes [#917](${repo}/issues/917)`
      )
    ).toBe('Rank buildable needs.');
    expect(toReleaseBullet('unscoped change ([#1](url))')).toBe('Unscoped change.');
    expect(
      toReleaseBullet(
        `**ui:** menu closes after navigation ([#5](${repo}/issues/5)), closes [#3](${repo}/issues/3), [#4](${repo}/issues/4)`
      )
    ).toBe('Menu closes after navigation.');
    expect(
      toReleaseBullet(
        `**app:** team sync ([abc1234](${repo}/commit/${sha})), closes [#643](${repo}/issues/643) [#644](${repo}/issues/644)`
      )
    ).toBe('Team sync.');
  });
  it.each(['ci', 'preview', 'release', 'test', 'deps', 'dependencies', 'Docs', 'config'])(
    'hides release entries with the internal %s scope',
    (scope) => expect(toReleaseBullet(entry(scope, 'harden the pipeline'))).toBeNull()
  );
  it('keeps user-facing entries, hides internal-only releases, and falls back to labels', () => {
    expect(
      releaseBullets(
        releaseBody(entry('ci', 'guard review requests'), entry('maps', 'list every objective')),
        'v1.83.1'
      )
    ).toEqual(['List every objective.']);
    expect(releaseBullets(releaseBody(entry('ci', 'guard review requests')), 'v1.83.3')).toEqual(
      []
    );
    expect(releaseBullets('', 'v2 launch')).toEqual(['V2 launch.']);
    expect(releaseBullets(null, '')).toEqual([]);
  });
  it('pairs each release entry with the full commit SHAs it links', () => {
    const other = 'ce67df4f5bc7aa72d28d4b18d68ef6a6ef6ab288';
    expect(
      releaseEntries(
        releaseBody(
          entry('app', 'one'),
          entry('ci', 'hidden'),
          entry('maps', 'two', other.toUpperCase())
        ),
        'v1'
      )
    ).toEqual([
      { text: 'One.', shas: [sha] },
      { text: 'Two.', shas: [other] },
    ]);
    expect(releaseEntries('', 'v1')).toEqual([{ text: 'V1.', shas: [] }]);
  });
  it.each([
    ['feat(tasks): tracker (#42)', 'Added tracker.'],
    ['fix: broken map', 'Fixed broken map.'],
    ['perf: task rendering', 'Improved task rendering.'],
    ['ui: filters', 'Updated filters.'],
    ['fix(api)!: expired token handling', 'Fixed expired token handling.'],
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
    'refactor: progress cache',
    'style: format',
    'fix(ci): honor verified gates',
    'fix(preview): stabilize comment authorization',
    'feat(release): batch versions',
    'fix(deps): bump nuxt',
    'unknown message',
    'fix: **',
  ])('omits non-user-facing or empty change %s', (input) =>
    expect(normalizeCommitMessage(input)).toBeNull()
  );
});
