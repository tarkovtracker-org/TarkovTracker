// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import semanticRelease from 'semantic-release';
import { afterEach, expect, it, vi } from 'vitest';
import * as releaseScope from './release-scope.mjs';
const note = 'Smart Fill now spreads collected items across every matching objective.';
function repository() {
  const root = mkdtempSync(join(tmpdir(), 'release-highlights-'));
  const repo = join(root, 'repo');
  const remote = join(root, 'remote.git');
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  const commit = (message) =>
    git(
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      message
    );
  commit('chore: initial');
  git('tag', 'v1.0.0');
  commit('fix(ci): internal gate (#1)');
  commit('fix(app): make Smart Fill distribute collected totals (#943)');
  git('remote', 'add', 'origin', remote);
  git('push', '-q', 'origin', 'main', '--tags');
  git('branch', '-q', '-u', 'origin/main');
  return { root, repo, remote, commit, git };
}
afterEach(() => vi.unstubAllGlobals());
it('publishes highlights in the GitHub release but not the committed changelog', async () => {
  const f = repository();
  const pullRequest = {
    body: `## Release note\n\n${note}\n`,
    merged: true,
    mergedAt: '2026-09-27T00:00:00Z',
    lastEditedAt: null,
    authorAssociation: 'MEMBER',
    author: { login: 'maintainer' },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) =>
      String(url).includes('/collaborators/')
        ? Response.json({ permission: 'write' })
        : Response.json({ data: { repository: { pullRequest } } })
    )
  );
  let published = '';
  const output = new PassThrough();
  output.resume();
  try {
    const result = await semanticRelease(
      {
        branches: ['main'],
        ci: false,
        dryRun: false,
        repositoryUrl: `file://${f.remote}`,
        plugins: [
          {
            analyzeCommits: releaseScope.analyzeCommits,
            generateNotes: releaseScope.generateNotes,
          },
          {
            // Mirrors the changelog + release-commit prepare steps, including the generated
            // assets: the changelog and a manifest whose only change is the version.
            prepare: (_config, { nextRelease }) => {
              writeFileSync(join(f.repo, 'CHANGELOG.md'), nextRelease.notes);
              writeFileSync(
                join(f.repo, 'package.json'),
                JSON.stringify({ name: 'fixture', version: nextRelease.version })
              );
              f.git('add', 'CHANGELOG.md', 'package.json');
              f.commit(`chore(release): ${nextRelease.version}`);
            },
          },
          {
            publish: (_config, { nextRelease }) => {
              published = nextRelease.notes;
              return { name: 'fixture' };
            },
          },
        ],
      },
      {
        cwd: f.repo,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          GITHUB_REPOSITORY: 'owner/repo',
          GITHUB_TOKEN: 'fixture-token',
        },
        stdout: output,
        stderr: output,
      }
    );
    expect(result.nextRelease.version).toBe('1.0.1');
    expect(published).toContain(`### Highlights\n\n* ${note} ([#943](`);
    expect(published).not.toContain('internal gate');
    const changelog = readFileSync(join(f.repo, 'CHANGELOG.md'), 'utf8');
    expect(changelog).toContain('make Smart Fill distribute collected totals');
    expect(changelog).not.toContain('Highlights');
    expect(changelog).not.toContain(note);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
