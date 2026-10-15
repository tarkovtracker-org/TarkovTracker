// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { recordPreparedVersion, clearPreparedVersion } from './release-note-state.mjs';
import { captureGitHubNotes } from './release-promotion-notes.mjs';
import { readPromotionArchive } from './release-promotion-receipt.mjs';
import { queuedRelease } from './release-promotion.mjs';
import { publishRecoveredRelease } from './release-recovery.mjs';
const highlight = 'Smart Fill now distributes collected items across every matching objective.';
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'release-owned-notes-'));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Release Test');
  git('config', 'user.email', 'release@example.invalid');
  writeFileSync(join(directory, 'package.json'), '{"name":"app","version":"1.0.0"}');
  writeFileSync(join(directory, 'CHANGELOG.md'), 'Previous notes');
  git('add', '.');
  git('commit', '-q', '-m', 'chore: initial');
  git('tag', 'v1.0.0');
  const last = git('rev-parse', 'HEAD');
  git('commit', '-q', '--allow-empty', '-m', 'fix(app): distribute collected items (#943)');
  const source = git('rev-parse', 'HEAD');
  writeFileSync(join(directory, 'package.json'), '{"name":"app","version":"1.0.1"}');
  const pureLog =
    '## [1.0.1](https://github.com/owner/repo/compare)\n\n* distribute collected items\n\nPrevious notes';
  writeFileSync(join(directory, 'CHANGELOG.md'), pureLog);
  git('add', '.');
  git('commit', '-q', '-m', 'chore(release): 1.0.1');
  const head = git('rev-parse', 'HEAD');
  const context = {
    cwd: directory,
    env: { RUNNER_TEMP: directory, GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'fixture-only' },
    nextRelease: { version: '1.0.1', gitHead: head, gitTag: 'v1.0.1' },
    lastRelease: { gitHead: last, gitTag: 'v1.0.0' },
    options: { repositoryUrl: 'https://github.com/owner/repo' },
    logger: { log: vi.fn() },
    commits: [{ hash: source, message: 'fix(app): distribute collected items (#943)' }],
  };
  writeFileSync(
    join(directory, 'release-promotion.json'),
    JSON.stringify({
      schema: 1,
      source,
      candidate: head,
      version: '1.0.1',
      pr: 'https://github.com/owner/repo/pull/901',
    })
  );
  return { directory, context, head, pureLog, source, git };
}
afterEach(() => vi.unstubAllGlobals());
function reviewedDescription() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) =>
      String(url).includes('/collaborators/')
        ? Response.json({ permission: 'write' })
        : Response.json({
            data: {
              repository: {
                pullRequest: {
                  merged: true,
                  mergedAt: '2026-09-27T00:00:00Z',
                  lastEditedAt: null,
                  authorAssociation: 'MEMBER',
                  author: { login: 'maintainer' },
                  body: `## Release note\n\n${highlight}`,
                },
              },
            },
          })
    )
  );
}
it('initial async publication retains authorized sanitized GitHub highlights in its owned receipt, never CHANGELOG', async () => {
  const f = fixture();
  try {
    reviewedDescription();
    recordPreparedVersion(f.context, f.head);
    await captureGitHubNotes(f.context);
    const receipt = JSON.parse(readFileSync(join(f.directory, 'release-promotion.json'), 'utf8'));
    expect(receipt.githubNotes).toContain('### Highlights');
    expect(receipt.githubNotes).toContain('Smart Fill now distributes collected items');
    expect(receipt.githubNotes).toContain('#943');
    expect(readFileSync(join(f.directory, 'CHANGELOG.md'), 'utf8')).toBe(f.pureLog);
    expect(f.git('diff', '--name-only')).toBe('');
  } finally {
    clearPreparedVersion(f.context);
    rmSync(f.directory, { recursive: true, force: true });
  }
});
it('authored release-shaped commits cannot substitute for process-local preparation proof', async () => {
  const f = fixture();
  try {
    reviewedDescription();
    await expect(captureGitHubNotes(f.context)).rejects.toThrow('prepared version proof');
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    rmSync(f.directory, { recursive: true, force: true });
  }
});
function archive(receipt, filename = 'release-promotion.json') {
  return execFileSync(
    'python3',
    [
      '-c',
      'import io,json,sys,zipfile; data=json.load(sys.stdin); buffer=io.BytesIO(); archive=zipfile.ZipFile(buffer,"w",compression=zipfile.ZIP_DEFLATED); archive.writestr(data["filename"],json.dumps(data["receipt"])); archive.close(); sys.stdout.buffer.write(buffer.getvalue())',
    ],
    { input: JSON.stringify({ receipt, filename }) }
  );
}
it('owned publication archive is bounded JSON only; renamed entries, malformed archives and bombs are rejected', async () => {
  const receipt = { githubNotes: 'Sanitized highlights' };
  expect(await readPromotionArchive(archive(receipt))).toEqual(receipt);
  await expect(readPromotionArchive(archive(receipt, 'evil.mjs'))).rejects.toThrow('Unexpected');
  await expect(readPromotionArchive(Buffer.alloc(1024 * 1024 + 1))).rejects.toThrow('oversized');
  await expect(readPromotionArchive(Buffer.from('not a zip'))).rejects.toThrow();
  const bomb = archive({ githubNotes: 'x'.repeat(1024 * 1024 + 1) });
  expect(bomb.byteLength).toBeLessThan(8192);
  await expect(readPromotionArchive(bomb)).rejects.toThrow(/ENOBUFS|maxBuffer/);
});
function boundedUnzip(mode, expectedCode) {
  const directory = mkdtempSync(join(tmpdir(), 'release-unzip-bound-'));
  const executable = join(directory, 'unzip');
  writeFileSync(
    executable,
    `#!/usr/bin/env python3
import os, signal, sys, time
signal.signal(signal.SIGTERM, signal.SIG_IGN)
mode = ${JSON.stringify(mode)}
if mode == 'receipt' and sys.argv[1] == '-Z1':
  sys.stdout.write('release-promotion.json\\n')
else:
  if mode != 'timeout': os.write(1, b'x' * (2 * 1024 * 1024))
  while True: time.sleep(1)
`
  );
  chmodSync(executable, 0o755);
  const harness = `import { readPromotionArchive } from ${JSON.stringify(new URL('./release-promotion-receipt.mjs', import.meta.url).href)};
try { await readPromotionArchive(Buffer.from('fixture archive')); process.exitCode = 2; }
catch (error) { if (error.code === ${JSON.stringify(expectedCode)}) console.log('bounded'); else process.exitCode = 3; }`;
  try {
    // GNU timeout kills this fixture's whole process group if a guard regresses. An ignored TERM
    // must never leave either the main Vitest worker blocked or an orphan fixture unzip alive.
    return execFileSync(
      'timeout',
      ['--signal=KILL', '12s', process.execPath, '--input-type=module', '-e', harness],
      {
        env: {
          PATH: `${directory}:${dirname(process.execPath)}:/usr/bin:/bin`,
          HOME: directory,
          TMPDIR: directory,
        },
        encoding: 'utf8',
        maxBuffer: 8192,
        timeout: 14000,
        killSignal: 'SIGKILL',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
it.each([
  ['listing', 'ENOBUFS'],
  ['receipt', 'ENOBUFS'],
  ['timeout', 'ETIMEDOUT'],
])(
  'bounds receipt unzip %s even when SIGTERM is ignored',
  (mode, code) => {
    expect(boundedUnzip(mode, code)).toBe('bounded\n');
  },
  20000
);
function finalizationClient(f, receipt, merged) {
  const repo = { owner: 'owner', repo: 'repo' };
  const pr = {
    number: 901,
    state: 'closed',
    merged_at: '2026-10-14T11:00:00Z',
    merge_commit_sha: merged,
    user: { id: 41898282, type: 'Bot' },
    base: { ref: 'main' },
    head: { sha: f.head, ref: 'wip/release-1.0.1-123-1', repo: { full_name: 'owner/repo' } },
  };
  const publicationZip = archive(receipt);
  const admission = {
    schema: 1,
    number: 901,
    repository: 'owner/repo',
    statusSha: f.head,
    headSha: f.head,
    approved: true,
    runId: 984,
    runAttempt: 1,
    workflowSourceSha: f.source,
    review: { commit: f.head },
  };
  const admissionZip = archive(admission, `${f.head}.json`);
  const ownedArtifacts = new Map([
    [
      123,
      [
        {
          id: 100,
          name: `release-promotion-${f.head}`,
          expired: false,
          size_in_bytes: publicationZip.byteLength,
        },
      ],
    ],
    [
      984,
      [
        {
          id: 200,
          name: `review-admission-${f.head}`,
          expired: false,
          size_in_bytes: admissionZip.byteLength,
        },
      ],
    ],
  ]);
  const reviewRun = {
    id: 984,
    run_attempt: 1,
    head_sha: f.source,
    path: '.github/workflows/review-admission.yml',
    event: 'workflow_dispatch',
    head_branch: 'main',
    repository: { full_name: 'owner/repo' },
    status: 'completed',
    conclusion: 'success',
  };
  const previewRun = {
    id: 555,
    path: '.github/workflows/preview.yml',
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_repository: { full_name: 'owner/repo' },
    repository: { full_name: 'owner/repo' },
    status: 'completed',
    conclusion: 'success',
  };
  const state = { previewSha: null, tag: null };
  const missing = async () => {
    throw Object.assign(new Error('missing'), { status: 404 });
  };
  const rest = {
    pulls: { list: vi.fn() },
    checks: { listForRef: vi.fn() },
    repos: {
      getContent: vi.fn(async ({ ref, path }) => ({
        data: {
          type: 'file',
          encoding: 'base64',
          content: Buffer.from(f.git('show', `${ref}:${path}`)).toString('base64'),
        },
      })),
      getCommit: vi.fn(async ({ ref }) => ({
        data: {
          parents: [{ sha: f.source }],
          commit: {
            message: f.git('show', '-s', '--format=%B', ref),
            tree: { sha: f.git('rev-parse', `${ref}^{tree}`) },
          },
          files: [
            { status: 'modified', filename: 'CHANGELOG.md' },
            { status: 'modified', filename: 'package.json' },
          ],
        },
      })),
      compareCommits: vi.fn(async () => ({ data: { status: 'ahead' } })),
      listCommitStatusesForRef: vi.fn(),
      getReleaseByTag: vi.fn(missing),
      createRelease: vi.fn(async () => ({ data: {} })),
    },
    git: {
      getRef: vi.fn(async () =>
        state.tag ? { data: { object: { sha: state.tag, type: 'commit' } } } : missing()
      ),
      createRef: vi.fn(async ({ sha }) => {
        state.tag = sha;
        return { data: {} };
      }),
    },
    actions: {
      getWorkflowRunAttempt: vi.fn(async () => ({
        data: {
          id: 123,
          run_attempt: 1,
          path: '.github/workflows/release.yml',
          event: 'workflow_dispatch',
          head_branch: 'main',
          head_repository: { full_name: 'owner/repo' },
          head_sha: f.source,
          status: 'completed',
          conclusion: 'success',
        },
      })),
      getWorkflowRun: vi.fn(async ({ run_id }) => ({
        data: run_id === 984 ? reviewRun : previewRun,
      })),
      downloadArtifact: vi.fn(async ({ artifact_id }) => ({
        data: artifact_id === 100 ? publicationZip : admissionZip,
      })),
      listWorkflowRunArtifacts: vi.fn(),
      listJobsForWorkflowRun: vi.fn(),
    },
  };
  const pages = new Map([
    [rest.pulls.list, () => [pr]],
    [
      rest.checks.listForRef,
      (p) => [
        { id: 1, app: { id: 15368 }, head_sha: p.ref, status: 'completed', conclusion: 'success' },
      ],
    ],
    [
      rest.repos.listCommitStatusesForRef,
      (p) => {
        state.previewSha = p.ref;
        return [
          {
            id: 2,
            context: 'Review Admission',
            state: 'success',
            creator: { id: 41898282, type: 'Bot' },
            target_url: 'https://github.com/owner/repo/actions/runs/984',
          },
          {
            id: 1,
            context: 'Preview Result',
            state: 'success',
            target_url: 'https://github.com/owner/repo/actions/runs/555',
          },
        ];
      },
    ],
    [
      rest.actions.listWorkflowRunArtifacts,
      (p) =>
        ownedArtifacts.get(p.run_id) ?? [
          { id: 300, name: `preview-deployment-${state.previewSha}`, expired: false },
        ],
    ],
    [
      rest.actions.listJobsForWorkflowRun,
      () => [{ name: 'Publish preview result', conclusion: 'success' }],
    ],
  ]);
  return {
    repo,
    rest,
    github: { rest, paginate: vi.fn(async (endpoint, params) => pages.get(endpoint)(params)) },
  };
}
it('end to end: prepared GitHub-only highlights survive actual squash-SHA finalization and publication', async () => {
  const f = fixture();
  try {
    reviewedDescription();
    recordPreparedVersion(f.context, f.head);
    await captureGitHubNotes(f.context);
    const receipt = JSON.parse(readFileSync(join(f.directory, 'release-promotion.json'), 'utf8'));
    const merged = f.git(
      'commit-tree',
      f.git('rev-parse', 'HEAD^{tree}'),
      '-p',
      f.source,
      '-m',
      'chore(release): 1.0.1 (#901)'
    );
    expect(merged).not.toBe(f.head);
    const api = finalizationClient(f, receipt, merged);
    const context = { repo: api.repo };
    const result = await queuedRelease({
      github: api.github,
      context,
      sha: merged,
      requireValidation: true,
    });
    await publishRecoveredRelease({ github: api.github, context, recovery: result.recovery });
    expect(api.rest.repos.createRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        tag_name: 'v1.0.1',
        target_commitish: merged,
        body: expect.stringContaining('Smart Fill now distributes collected items'),
      })
    );
    expect(readFileSync(join(f.directory, 'CHANGELOG.md'), 'utf8')).toBe(f.pureLog);
  } finally {
    clearPreparedVersion(f.context);
    rmSync(f.directory, { recursive: true, force: true });
  }
});
