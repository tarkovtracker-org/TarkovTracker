// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collectHighlights,
  pullRequestNumber,
  cancelledCommits,
  releaseNotesFromBody,
  repositorySlug,
  unreviewedReason,
  versionCommitted,
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
  it('does not rebuild a tag from fragments left by tag removal', () => {
    const [note] = releaseNotesFromBody(template('Fixed <scr<b>ipt>alert(1)</scr</b>ipt> map.'));
    expect(note).not.toMatch(/<[a-z/!?]/i);
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
  it.each([
    ['[[trusted text](https://discard.example)](//evil.example/phish)', 'trusted text'],
    ['Open //evil.example/phish or www.evil.example today', 'Open or today'],
    ['Mirror at ftp://files.example/x', 'Mirror at'],
    ['Use [x][ref] style', 'Use xref style'],
    ['Mail support@example.com for help', 'Mail for help'],
  ])('leaves no link syntax or URL in %j', (note, expected) =>
    expect(releaseNotesFromBody(template(note))).toEqual([expected])
  );
  it('ignores release-note headings hidden in comments, even unterminated ones', () => {
    const hidden = `## Summary\n\n<!--\n## Release note\n\nSecurity update: reset your account.\n-->\n\n${template('none').slice('## Summary\n\nInternal detail.\n\n'.length)}`;
    expect(releaseNotesFromBody(hidden)).toEqual([]);
    expect(
      releaseNotesFromBody(`${template('Visible note.')}\n<!-- ## Release note\nHidden`)
    ).toEqual(['Visible note.']);
  });
  // A closed fence hides only its contents; an unterminated one hides the rest of the body.
  it.each([
    [
      'a longer fence containing a shorter one',
      '````md\n```\n## Release note\nFake\n```\n````',
      ['Real note.'],
    ],
    ['an unterminated fence', '```md\n## Release note\nFake', []],
    ['a tilde fence that backticks cannot close', '~~~\n```\n## Release note\nFake\n```', []],
  ])('ignores headings inside %s', (_label, fenced, expected) => {
    const real = template('Real note.').slice('## Summary\n\nInternal detail.\n\n'.length);
    expect(releaseNotesFromBody(`## Summary\n\n${fenced}\n\n${real}`)).toEqual(expected);
  });
  it('keeps at most three notes per PR', () => {
    const body = template(['- one', '- two', '- three', '- four'].join('\n'));
    expect(releaseNotesFromBody(body)).toEqual(['one', 'two', 'three']);
  });
  it('ignores release-note headings inside fenced code examples', () => {
    const body = `## Summary\n\n\`\`\`md\n## Release note\nnone\n\`\`\`\n\n~~~\n## Changes\n~~~\n\n${template('Real note.').slice('## Summary\n\nInternal detail.\n\n'.length)}`;
    expect(releaseNotesFromBody(body)).toEqual(['Real note.']);
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
    const [emoji] = releaseNotesFromBody(template('😀'.repeat(300)));
    expect(Array.from(emoji)).toHaveLength(280);
    expect(emoji).toBe(`${'😀'.repeat(279)}…`);
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
describe('reverted changes', () => {
  const original = { hash: 'a1b2c3d4'.padEnd(40, '0'), message: 'feat(maps): new layer (#10)' };
  const revert = {
    hash: 'f'.repeat(40),
    message: `Revert "feat(maps): new layer (#10)" (#11)\n\nThis reverts commit ${original.hash.slice(0, 12)}.`,
  };
  it('cancels a change and its revert when both are in the release', () => {
    const other = { hash: 'b'.repeat(40), message: 'fix(app): other (#12)' };
    expect([...cancelledCommits([original, other, revert])]).toEqual([original, revert]);
  });
  it('keeps a revert of a change from an earlier release', () => {
    expect(cancelledCommits([revert]).size).toBe(0);
  });
  it('resolves revert chains by parity so a restored change stays highlighted', () => {
    const restore = {
      hash: 'e'.repeat(40),
      message: `Revert "Revert "feat(maps): new layer (#10)" (#11)" (#12)\n\nThis reverts commit ${revert.hash}.`,
    };
    expect([...cancelledCommits([restore, revert, original])]).toEqual([restore, revert]);
  });
  it('pairs reverts before excluding commits, so an excluded revert still cancels', async () => {
    const internalRevert = {
      hash: 'f'.repeat(40),
      message: `fix(release): undo layer (#13)\n\nThis reverts commit ${original.hash}.`,
    };
    const fetchMock = vi.fn(async () => json({}));
    vi.stubGlobal('fetch', fetchMock);
    const env = { GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 't' };
    const excluded = (commit) => commit === internalRevert;
    await collectHighlights({
      commits: [internalRevert, original],
      excluded,
      env,
      logger: { log: vi.fn() },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not look up notes for cancelled PRs', async () => {
    const fetchMock = vi.fn(async () => json({}));
    vi.stubGlobal('fetch', fetchMock);
    const env = { GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 't' };
    await collectHighlights({ commits: [original, revert], env, logger: { log: vi.fn() } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
describe('version commit detection', () => {
  const repo = (subject) => {
    const cwd = mkdtempSync(join(tmpdir(), 'highlights-'));
    const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
    git('init', '-q');
    git(
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      subject
    );
    return cwd;
  };
  it.each([
    ['chore(release): 1.84.0', true],
    ['chore(release): 1.83.3', false],
    ['feat(maps): list objectives (#944)', false],
  ])('HEAD %s means committed=%s for 1.84.0', (subject, expected) => {
    const cwd = repo(subject);
    try {
      expect(versionCommitted({ cwd, nextRelease: { version: '1.84.0' } })).toBe(expected);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
  it('is false outside a repository', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'highlights-'));
    try {
      expect(versionCommitted({ cwd, nextRelease: { version: '1.84.0' } })).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
describe('reviewed release notes', () => {
  const mergedAt = '2026-09-27T12:00:00Z';
  const pull = (extra) => ({ merged: true, mergedAt, authorAssociation: 'MEMBER', ...extra });
  it.each([
    [pull({ lastEditedAt: null }), null],
    [pull({ lastEditedAt: '2026-09-27T11:59:59Z' }), null],
    [
      pull({ lastEditedAt: mergedAt, authorAssociation: 'OWNER' }),
      'description was edited after merge',
    ],
    [pull({ authorAssociation: 'COLLABORATOR' }), null],
    [pull({ lastEditedAt: '2026-09-27T12:00:01Z' }), 'description was edited after merge'],
    [pull({ authorAssociation: 'CONTRIBUTOR' }), 'PR author lacks write access'],
    [pull({ authorAssociation: 'NONE' }), 'PR author lacks write access'],
    [pull({ merged: false }), 'PR is not merged'],
    [null, 'PR is not merged'],
  ])('classifies %j', (value, expected) => expect(unreviewedReason(value)).toBe(expected));
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
          pullRequest: {
            body,
            merged: true,
            mergedAt: '2026-09-27T12:00:00Z',
            authorAssociation: 'MEMBER',
            author: { login: 'maintainer' },
            ...extra,
          },
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
    const fetchMock = vi.fn(async (url, init) =>
      url.includes('/collaborators/')
        ? json({ permission: 'write' })
        : responses[JSON.parse(init.body).variables.number]()
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
    // Four PR lookups plus a permission check for each of the two PRs with publishable notes.
    expect(fetchMock).toHaveBeenCalledTimes(6);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/graphql');
    expect(init.headers.Authorization).toBe('Bearer fixture-token');
    expect(JSON.parse(init.body).variables).toEqual({ owner: 'owner', name: 'repo', number: 943 });
    expect(logger.log).toHaveBeenCalledWith(
      'Skipping release note for #%d: %s',
      949,
      'GitHub returned 503'
    );
    expect(logger.log).toHaveBeenCalledWith(
      'Skipping release note for #%d: %s',
      950,
      'description was edited after merge'
    );
  });
  it('caps the total number of highlights per release', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) =>
        url.includes('/collaborators/')
          ? json({ permission: 'admin' })
          : merged(template('- a\n- b\n- c'))
      )
    );
    const many = Array.from({ length: 12 }, (_, i) => ({
      message: `fix(app): change (#${100 + i})`,
    }));
    const env = { GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 't' };
    expect(await collectHighlights({ commits: many, env, logger })).toHaveLength(5);
  });
  it.each([
    ['read', 'PR author lacks write access'],
    ['none', 'PR author lacks write access'],
    [null, 'GitHub returned 404'],
  ])('skips notes when the author permission is %s', async (role, reason) => {
    const log = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) =>
        url.includes('/collaborators/maintainer/permission')
          ? json(role ? { permission: role, role_name: 'custom-writer' } : {}, role ? 200 : 404)
          : merged(template('Note.'))
      )
    );
    const env = { GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 't' };
    expect(await collectHighlights({ commits: [commits[0]], env, logger: { log } })).toEqual([]);
    expect(log).toHaveBeenCalledWith('Skipping release note for #%d: %s', 943, reason);
  });
  it('accepts custom roles whose effective permission is write', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) =>
        url.includes('/collaborators/')
          ? json({ permission: 'write', role_name: 'release-editor' })
          : merged(template('Note.'))
      )
    );
    const env = { GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 't' };
    expect(await collectHighlights({ commits: [commits[0]], env, logger })).toEqual([
      { number: 943, text: 'Note.' },
    ]);
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
