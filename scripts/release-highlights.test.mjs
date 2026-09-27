// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collectHighlights,
  pullRequestNumber,
  releaseNotesFromBody,
  repositorySlug,
  unreviewedReason,
  withHighlights,
} from './release-highlights.mjs';
const template = (note) =>
  `## Summary\n\nInternal detail.\n\n## Release note\n\n<!-- For players. Write "none" for internal changes. -->\n\n${note}\n\n## Changes\n\n- Refactored the store\n`;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
afterEach(() => vi.unstubAllGlobals());
describe('release note parsing', () => {
  it.each([
    ['fix(app): keep totals (#943)', 943],
    ['feat(maps): list objectives (#919) (#944)', 944],
    ['fix(app): no reference', null],
    ['fix: body only\n\nsee (#12)', null],
    [undefined, null],
  ])('reads the PR number from %j', (message, expected) =>
    expect(pullRequestNumber(message)).toBe(expected)
  );
  it('uses the release note section, not the summary or later sections', () => {
    expect(
      releaseNotesFromBody(template('Smart Fill now spreads collected items evenly.'))
    ).toEqual(['Smart Fill now spreads collected items evenly.']);
  });
  it('keeps one entry per bullet and strips markup', () => {
    const body = template(
      '- Maps list every objective\n* <b>Faster</b>   task filters\n\n1. Third'
    );
    expect(releaseNotesFromBody(body)).toEqual([
      'Maps list every objective',
      'Faster task filters',
      'Third',
    ]);
  });
  it('keeps wrapped continuation lines with their bullet', () => {
    const body = template(
      '- Smart Fill now spreads items across every\n  matching objective.\n- Second note\n\nTrailing prose'
    );
    expect(releaseNotesFromBody(body)).toEqual([
      'Smart Fill now spreads items across every matching objective.',
      'Second note',
    ]);
  });
  it('keeps comparison text and strips links, images, URLs and tags', () => {
    expect(
      releaseNotesFromBody(template('Loads < 20 kg and > 5 kg now filter correctly.'))
    ).toEqual(['Loads < 20 kg and > 5 kg now filter correctly.']);
    const linked = template(
      'See [the new map](https://evil.example) ![x](https://img) at https://evil.example <a href="x">now</a>.'
    );
    expect(releaseNotesFromBody(linked)).toEqual(['See the new map at now.']);
  });
  it.each(['none', 'None.', 'N/A', '-', '', '<!-- only a comment -->'])(
    'treats %j as no player-facing note',
    (note) => expect(releaseNotesFromBody(template(note))).toEqual([])
  );
  it('handles missing sections, CRLF bodies, and very long notes', () => {
    expect(releaseNotesFromBody('## Summary\n\nNo note section')).toEqual([]);
    expect(releaseNotesFromBody(null)).toEqual([]);
    expect(releaseNotesFromBody('## Release notes\r\n\r\nWindows line endings\r\n')).toEqual([
      'Windows line endings',
    ]);
    const [long] = releaseNotesFromBody(template('x'.repeat(400)));
    expect(long).toHaveLength(280);
    expect(long.endsWith('…')).toBe(true);
  });
  it.each([
    [{ GITHUB_REPOSITORY: 'owner/repo' }, 'https://github.com/other/x.git', 'owner/repo'],
    [
      {},
      'https://github.com/tarkovtracker-org/TarkovTracker.git',
      'tarkovtracker-org/TarkovTracker',
    ],
    [{}, 'git@github.com:owner/repo.git', 'owner/repo'],
    [{ GITHUB_REPOSITORY: 'not a slug' }, 'https://gitlab.com/owner/repo', null],
  ])('derives the repository from %j and %s', (env, url, expected) =>
    expect(repositorySlug(env, url)).toBe(expected)
  );
});
describe('reviewed release notes', () => {
  const mergedAt = '2026-09-27T12:00:00Z';
  it.each([
    [{ merged: true, mergedAt, lastEditedAt: null }, null],
    [{ merged: true, mergedAt, lastEditedAt: '2026-09-27T11:59:59Z' }, null],
    [{ merged: true, mergedAt, lastEditedAt: mergedAt }, null],
    [
      { merged: true, mergedAt, lastEditedAt: '2026-09-27T12:00:01Z' },
      'description was edited after merge',
    ],
    [{ merged: false, mergedAt: null, lastEditedAt: null }, 'PR is not merged'],
    [null, 'PR is not merged'],
  ])('classifies %j', (pull, expected) => expect(unreviewedReason(pull)).toBe(expected));
});
describe('release highlights', () => {
  const logger = { log: vi.fn() };
  const commits = [
    { message: 'fix(app): make Smart Fill distribute totals (#943)' },
    { message: 'feat(maps): list objectives (#944)' },
    { message: 'fix(api): quiet change (#949)' },
    { message: 'fix(app): edited after merge (#950)' },
    { message: 'fix(app): direct push without a PR' },
    { message: 'fix(app): follow-up (#943)' },
  ];
  const merged = (body, extra = {}) =>
    json({
      data: {
        repository: {
          pullRequest: { body, merged: true, mergedAt: '2026-09-27T12:00:00Z', ...extra },
        },
      },
    });
  it('collects notes once per PR, skipping none, edited, and failed lookups', async () => {
    const responses = {
      943: () => merged(template('Smart Fill spreads items.')),
      944: () => merged(template('- Maps list objectives')),
      949: () => json({}, 503),
      950: () => merged(template('Edited later'), { lastEditedAt: '2026-09-30T00:00:00Z' }),
    };
    const fetchMock = vi.fn(async (_url, init) =>
      responses[JSON.parse(init.body).variables.number]()
    );
    vi.stubGlobal('fetch', fetchMock);
    const highlights = await collectHighlights({
      commits,
      env: { GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'fixture-token' },
      logger,
    });
    expect(highlights).toEqual([
      { number: 943, text: 'Smart Fill spreads items.' },
      { number: 944, text: 'Maps list objectives' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/graphql');
    expect(init.headers.Authorization).toBe('Bearer fixture-token');
    expect(JSON.parse(init.body).variables).toEqual({ owner: 'owner', name: 'repo', number: 943 });
    expect(logger.log).toHaveBeenCalledWith(
      'Skipping release note for #%d: %s',
      949,
      'GitHub returned 503 for #949'
    );
    expect(logger.log).toHaveBeenCalledWith(
      'Skipping release note for #%d: %s',
      950,
      'description was edited after merge'
    );
  });
  it.each([
    [{}, 'https://github.com/owner/repo.git'],
    [{ GITHUB_REPOSITORY: 'not a slug', GITHUB_TOKEN: 'x' }, 'https://gitlab.com/owner/repo'],
  ])('makes no requests without a repository and token: %j', async (env, repositoryUrl) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await collectHighlights({ commits, env, repositoryUrl, logger })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('places highlights directly below the version heading', () => {
    const notes = '## [1.84.0](url) (2026-09-29)\n\n\n### Bug Fixes\n\n* **app:** fix\n';
    expect(withHighlights(notes, [{ number: 943, text: 'Better Smart Fill.' }], 'o/r')).toBe(
      '## [1.84.0](url) (2026-09-29)\n\n\n### Highlights\n\n* Better Smart Fill. ([#943](https://github.com/o/r/pull/943))\n\n\n### Bug Fixes\n\n* **app:** fix\n'
    );
    expect(withHighlights(notes, [], 'o/r')).toBe(notes);
  });
});
