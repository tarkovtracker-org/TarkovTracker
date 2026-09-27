// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { versionCommitted } from './release-highlights.mjs';
import {
  analyzeCommits,
  generateNotes,
  INTERNAL_SCOPES,
  isInternalCommit,
} from './release-scope.mjs';
const config = JSON.parse(readFileSync(new URL('../.releaserc.json', import.meta.url), 'utf8'))
  .plugins[0][1];
const repo = 'https://github.com/tarkovtracker-org/TarkovTracker';
const reverted = '1e9c0d4b2612deeaa1b034ed5865b721f55eca69';
const context = (messages) => ({
  commits: messages.map((message, index) => ({
    hash: String(index + 1).padStart(40, '0'),
    message,
    committerDate: '2026-09-27T12:00:00Z',
  })),
  logger: { log: vi.fn() },
  cwd: process.cwd(),
  env: { GITHUB_TOKEN: 'fixture-token' },
  options: { repositoryUrl: `${repo}.git` },
  lastRelease: { gitTag: 'v1.83.3', version: '1.83.3' },
  nextRelease: { gitTag: 'v1.84.0', version: '1.84.0' },
});
vi.mock('./release-highlights.mjs', async (original) => ({
  ...(await original()),
  versionCommitted: vi.fn(() => true),
}));
afterEach(() => vi.unstubAllGlobals());
describe('release scope plugin', () => {
  it.each([
    ['fix(ci): honor verified gates (#946)', true],
    ['feat(Preview)!: new controller', true],
    ['fix(deps-dev): bump vitest', true],
    ['fix(dependencies): update package versions', true],
    ['fix(no-release): quiet change', true],
    ['fix(app): keep totals accurate', false],
    ['feat: unscoped feature', false],
    ['chore(release): 1.83.3', true],
    ['not conventional', false],
    [`Revert "fix(ci): honor verified gates"\n\nThis reverts commit ${reverted}.`, true],
    ['revert: feat(preview): new controller', true],
    ['Revert "Revert "feat(ci): add shadow gate""', true],
    ['Revert "revert: fix(deps): bump"', true],
    ['Revert "fix(app): keep totals accurate"', false],
    [undefined, false],
  ])('classifies %s as internal=%s', (message, expected) =>
    expect(isInternalCommit(message)).toBe(expected)
  );
  it('lists core automation scopes in sorted order', () => {
    expect(INTERNAL_SCOPES).toEqual(expect.arrayContaining(['ci', 'preview', 'release', 'deps']));
    expect([...INTERNAL_SCOPES].sort()).toEqual([...INTERNAL_SCOPES]);
  });
  it.each([
    [['fix(ci): honor verified gates', 'fix(preview): stabilize auth'], null],
    [['refactor(app): split store', 'docs(README): refresh', 'chore: tidy'], null],
    [['fix(ci): honor verified gates', 'fix(app): keep totals accurate'], 'patch'],
    [['perf(tasks): faster filters'], 'patch'],
    [[`Revert "fix(ci): honor verified gates"\n\nThis reverts commit ${reverted}.`], null],
    [[`Revert "fix(app): keep totals accurate"\n\nThis reverts commit ${reverted}.`], 'patch'],
    [['fix(release): gate', 'feat(maps): list objectives'], 'minor'],
  ])('releases %j as %s', async (messages, expected) => {
    expect(await analyzeCommits(config, context(messages))).toBe(expected);
  });
  it('omits internal-scope commits from generated notes and adds PR highlights', async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      const { number } = JSON.parse(init.body).variables;
      const note = number === 943 ? 'Smart Fill now spreads collected items evenly.' : 'none';
      const pullRequest = {
        body: `## Release note\n\n${note}\n`,
        merged: true,
        mergedAt: 'x',
        authorAssociation: 'MEMBER',
      };
      return Response.json({ data: { repository: { pullRequest } } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const notes = await generateNotes(
      config,
      context([
        'fix(ci): guard duplicate Codex review requests (#948)',
        'fix(app): make Smart Fill distribute collected totals (#943)',
        'feat(maps): list every objective under the cursor (#944)',
        'fix(deps): bump nuxt',
      ])
    );
    expect(notes).toContain('make Smart Fill distribute collected totals');
    expect(notes).toContain('list every objective under the cursor');
    expect(notes).not.toMatch(/Codex|bump nuxt|\*\*ci:\*\*|\*\*deps:\*\*/);
    expect(notes).toContain(
      '### Highlights\n\n* Smart Fill now spreads collected items evenly. ([#943](https://github.com/tarkovtracker-org/TarkovTracker/pull/943))'
    );
    // Internal-scope commits are filtered before any PR lookup.
    const numbers = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).variables.number);
    expect(numbers).toEqual([943, 944]);
  });
  it('keeps PR text out of pre-commit notes, which become CHANGELOG.md', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    versionCommitted.mockReturnValueOnce(false);
    const notes = await generateNotes(config, context(['fix(app): keep totals (#943)']));
    expect(notes).toContain('keep totals');
    expect(notes).not.toContain('Highlights');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('reports how many commits were ignored', async () => {
    const run = context(['fix(ci): a', 'fix(app): b']);
    await analyzeCommits(config, run);
    expect(run.logger.log).toHaveBeenCalledWith(
      'Ignoring %d internal-scope commit(s) for this release',
      1
    );
  });
});
