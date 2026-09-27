// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { releaseBullets } from '@/utils/changelog';
import {
  collectHighlights,
  MAX_CONCURRENT_LOOKUPS,
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
  it('keeps nested list content with its top-level bullet', () => {
    expect(
      releaseNotesFromBody(template('- Added map filters:\n  - by trader\n  - by location.'))
    ).toEqual(['Added map filters: by trader by location.']);
  });
  it('does not lift indented markers or code into top-level notes', () => {
    // An indented-only block is not a list; the whole section stays one prose entry.
    expect(releaseNotesFromBody(template('Handles the new flags:\n\n    - example flag.'))).toEqual(
      ['Handles the new flags: - example flag.']
    );
    expect(releaseNotesFromBody(template('  - nested only\n  - markers do not split.'))).toEqual([
      '- nested only - markers do not split.',
    ]);
  });
  it('does not rebuild a tag from fragments left by tag removal', () => {
    const [note] = releaseNotesFromBody(template('Fixed <scr<b>ipt>alert(1)</scr</b>ipt> map.'));
    expect(note).not.toMatch(/<[a-z/!?]/i);
  });
  it('checks autolinks after removing HTML and Markdown fragments', () => {
    expect(releaseNotesFromBody(template('Fixed https:/<b></b>/evil.example map.'))).toEqual([
      'Fixed map.',
    ]);
    expect(releaseNotesFromBody(template('Fixed https:/**/evil.example map.'))).toEqual([
      'Fixed map.',
    ]);
  });
  it('publishes emphasized conventional notes as plain text', () => {
    const notes = releaseNotesFromBody(template('**release:** __Smart Fill__ keeps totals.'));
    expect(notes).toEqual(['release: Smart Fill keeps totals.']);
    expect(releaseBullets(`### Highlights\n\n- ${notes[0]}`, '')).toEqual([
      'Release: Smart Fill keeps totals.',
    ]);
  });
  it('does not let a comment opener inside a fence consume the real section', () => {
    const body = '## Summary\n\n```html\n<!--\n```\n\n## Release note\n\nReal update.\n';
    expect(releaseNotesFromBody(body)).toEqual(['Real update.']);
  });
  it('does not let comment-looking code before the release section consume it', () => {
    expect(
      releaseNotesFromBody('`<!--` is an example token.\n\n## Release note\n\nReal update.')
    ).toEqual(['Real update.']);
    expect(releaseNotesFromBody('    <!--\n\n## Release note\n\nReal update.')).toEqual([
      'Real update.',
    ]);
    expect(
      releaseNotesFromBody('` unmatched\n<!-- hidden -->\n\n## Release note\n\nReal update.')
    ).toEqual(['Real update.']);
    expect(releaseNotesFromBody(template('Use `code` as a marker.'))).toEqual([
      'Use code as a marker.',
    ]);
  });
  it('does not join inline code across Markdown blocks or expose comments', () => {
    expect(releaseNotesFromBody('## Release note\n\nIntro `\n> <!-- secret --> `\n')).toEqual([
      'Intro',
    ]);
    expect(releaseNotesFromBody('<!--\n    -->\n\n## Release note\n\nReal update.')).toEqual([
      'Real update.',
    ]);
    const body =
      '## Summary\n\nUnmatched `.\n\n## Release note\n\n<!-- Secret update -->\n\nReal ` update.\n';
    expect(releaseNotesFromBody(body)).toEqual(['Real update.']);
    expect(
      releaseNotesFromBody(
        'Unmatched `\n```html\nexample\n```\n<!-- hidden -->\n## Release note\nReal ` update.'
      )
    ).toEqual(['Real update.']);
    expect(releaseNotesFromBody(template('Real update <!-- hidden\ncontinues -->'))).toEqual([
      'Real update',
    ]);
    expect(
      releaseNotesFromBody('Escaped \\` <!-- hidden --> `\n## Release note\nReal update.')
    ).toEqual(['Real update.']);
  });
  it.each(['- First\n\n- Second', '- First\n- Second'])(
    'keeps the first item when a section starts with a newline (%j)',
    (items) =>
      expect(releaseNotesFromBody(`## Release note\n${items}`)).toEqual(['First', 'Second'])
  );
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
    ['Open (www.evil.example/phish) today', 'Open today'],
    ['Open (WWW.evil.example/phish) today', 'Open today'],
    ['Mirror at ftp://files.example/x', 'Mirror at'],
    ['Use [x][ref] style', 'Use xref style'],
    ['Mail support@example.com for help', 'Mail for help'],
  ])('leaves no link syntax or URL in %j', (note, expected) =>
    expect(releaseNotesFromBody(template(note))).toEqual([expected])
  );
  it('strips punctuated email autolinks without superlinear matching', () => {
    expect(releaseNotesFromBody(template('Ask (help@example.com) for docs.'))).toEqual([
      'Ask for docs.',
    ]);
    // Pathological input previously stalled Node for seconds here.
    const adversarial = `Totals spread. ${'a@'.repeat(2500)} stop.`;
    const start = performance.now();
    const [note] = releaseNotesFromBody(template(adversarial));
    expect(note).toHaveLength(280);
    expect(performance.now() - start).toBeLessThan(1000);
  });
  it('keeps prose that merely contains a colon', () => {
    expect(releaseNotesFromBody(template('Beware e.g.: cases without any URL'))).toEqual([
      'Beware e.g.: cases without any URL',
    ]);
  });
  it('bounds the parsed body and every bullet before sanitization', () => {
    const body = `## Release note\n\n${'y@'.repeat(40_000)} end\n`;
    const start = performance.now();
    const [note] = releaseNotesFromBody(body);
    expect(note).toHaveLength(280);
    expect(performance.now() - start).toBeLessThan(1000);
  });
  it('ignores release-note headings hidden in comments, even unterminated ones', () => {
    const hidden = `## Summary\n\n<!--\n## Release note\n\nSecurity update: reset your account.\n-->\n\n${template('none').slice('## Summary\n\nInternal detail.\n\n'.length)}`;
    expect(releaseNotesFromBody(hidden)).toEqual([]);
    expect(
      releaseNotesFromBody(`${template('Visible note.')}\n<!-- ## Release note\nHidden`)
    ).toEqual(['Visible note.']);
  });
  it.each(['\t', ' \t', '  \t', '   \t', '    '])(
    'keeps a real note after an indented literal fence (%j)',
    (indent) => {
      const body = `## Summary\n\n${indent}\`\`\`\n\n## Release note\n\nReal note.`;
      expect(releaseNotesFromBody(body)).toEqual(['Real note.']);
    }
  );
  it.each([' \t', '  \t', '   \t'])(
    'ignores a comment opener in mixed-indent code (%j)',
    (indent) => {
      expect(
        releaseNotesFromBody(`## Summary\n\n${indent}<!--\n\n## Release note\n\nReal note.`)
      ).toEqual(['Real note.']);
    }
  );
  it('keeps the real note after an invalid backtick-fence info string', () => {
    expect(
      releaseNotesFromBody('## Summary\n\n```lang`invalid\n\n## Release note\n\nReal note.')
    ).toEqual(['Real note.']);
  });
  it('separates parenthesized ordered notes and keeps nested content with its parent', () => {
    expect(releaseNotesFromBody(template('1) First\n   1) Detail\n2) Second'))).toEqual([
      'First Detail',
      'Second',
    ]);
  });
  it.each(['## Release note ##', '## Release notes ###'])(
    'accepts closing heading hashes (%s)',
    (heading) => {
      expect(releaseNotesFromBody(`${heading}\n\nReal note.`)).toEqual(['Real note.']);
    }
  );
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
  const committed = ({ subject, version = '1.84.0', extra = {} }) => {
    const cwd = mkdtempSync(join(tmpdir(), 'highlights-'));
    const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
    git('init', '-q');
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'fixture', version }));
    writeFileSync(join(cwd, 'CHANGELOG.md'), '## [1.84.0](url)\n');
    for (const [name, content] of Object.entries(extra)) writeFileSync(join(cwd, name), content);
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', subject);
    return cwd;
  };
  it.each([
    ['chore(release): 1.84.0', '1.84.0', true],
    ['chore(release): 1.84.0', '1.83.3', false],
    ['chore(release): 1.83.3', '1.84.0', false],
    ['feat(maps): list objectives (#944)', '1.84.0', false],
  ])('HEAD %s with committed manifest %s is a version commit: %s', (subject, version, expected) => {
    const cwd = committed({ subject, version });
    try {
      expect(versionCommitted({ cwd, nextRelease: { version: '1.84.0' } })).toBe(expected);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
  it('is false when an unrelated file changed with the generated assets', () => {
    const cwd = committed({ subject: 'chore(release): 1.84.0', extra: { 'unrelated.txt': 'x' } });
    try {
      expect(versionCommitted({ cwd, nextRelease: { version: '1.84.0' } })).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
  it('is false when only the manifest changed', () => {
    const cwd = committed({ subject: 'chore(release): 1.83.3', version: '1.83.3' });
    const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
    try {
      writeFileSync(
        join(cwd, 'package.json'),
        JSON.stringify({ name: 'fixture', version: '1.84.0' })
      );
      git('-c', 'user.name=t', '-c', 'user.email=t@t', 'add', 'package.json');
      git(
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        'commit',
        '-q',
        '-m',
        'chore(release): 1.84.0'
      );
      expect(versionCommitted({ cwd, nextRelease: { version: '1.84.0' } })).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
  it('is false when the matching subject changed no generated asset', () => {
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
      'chore(release): 1.84.0'
    );
    try {
      expect(versionCommitted({ cwd, nextRelease: { version: '1.84.0' } })).toBe(false);
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
  it('attaches validated commit hashes for each PR and renders commit links', async () => {
    const sha = 'A'.repeat(40);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) =>
        url.includes('/collaborators/') ? json({ permission: 'write' }) : merged(template('Note.'))
      )
    );
    const highlights = await collectHighlights({
      commits: [
        { hash: sha, message: 'fix(app): first (#943)' },
        { hash: 'b'.repeat(40), message: 'fix(app): second (#943)' },
        { hash: sha, message: 'fix(app): duplicate commit metadata (#943)' },
        { hash: 'not-a-sha', message: 'fix(app): third (#943)' },
      ],
      env: { GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 't' },
      logger,
    });
    expect(highlights).toEqual([
      { number: 943, text: 'Note.', shas: [sha.toLowerCase(), 'b'.repeat(40)] },
    ]);
    expect(withHighlights('## [1.84.0](url) (2026-09-29)\n', highlights, 'o/r')).toContain(
      '* Note. ([#943](https://github.com/o/r/pull/943)) ([aaaaaaa](https://github.com/o/r/commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)) ([bbbbbbb](https://github.com/o/r/commit/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb))'
    );
    expect(
      withHighlights(
        '## [1.84.0](url) (2026-09-29)\n',
        [{ number: 943, text: 'Note.', shas: ['a'.repeat(39), 'g'.repeat(40), 'c'.repeat(40)] }],
        'o/r'
      )
    ).toContain(
      '[ccccccc](https://github.com/o/r/commit/cccccccccccccccccccccccccccccccccccccccc)'
    );
    expect(
      withHighlights(
        '## [1.84.0](url) (2026-09-29)\n',
        [{ number: 943, text: 'Note.', shas: ['c'.repeat(40)] }],
        'o/r'
      )
    ).toContain(
      '[ccccccc](https://github.com/o/r/commit/cccccccccccccccccccccccccccccccccccccccc)'
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
describe('bounded lookups', () => {
  const logger = { log: vi.fn() };
  const env = { GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 't' };
  const pull = () =>
    json({
      data: {
        repository: {
          pullRequest: {
            body: template('- note a\n- note b\n- note c'),
            merged: true,
            mergedAt: '2026-09-27T12:00:00Z',
            authorAssociation: 'MEMBER',
            author: { login: 'maintainer' },
          },
        },
      },
    });
  it('bounds request concurrency and stops launching at the release cap', async () => {
    let active = 0;
    let peak = 0;
    const looked = new Set();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        active += 1;
        peak = Math.max(peak, active);
        try {
          if (url.includes('/collaborators/')) return json({ permission: 'write' });
          const { number } = JSON.parse(init.body).variables;
          looked.add(number);
          // The first PR completes alone while the next batch is still running.
          await new Promise((resolve) => setTimeout(resolve, number === 100 ? 20 : 60));
          return pull();
        } finally {
          active -= 1;
        }
      })
    );
    const commits = Array.from({ length: 12 }, (_, i) => ({
      message: `fix(app): change (#${100 + i})`,
    }));
    const highlights = await collectHighlights({ commits, env, logger });
    expect(highlights).toHaveLength(5);
    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENT_LOOKUPS);
    // PRs are looked up in commit order until five notes are collected; the tail is untouched.
    const fetched = [...looked].sort((a, b) => a - b);
    expect(fetched).toEqual([100, 101, 102, 103, 104]);
    expect(looked).not.toContain(111);
  });
});
