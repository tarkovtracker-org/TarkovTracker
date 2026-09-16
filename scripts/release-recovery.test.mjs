// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { findReleaseRecovery, publishRecoveredRelease } from './release-recovery.mjs';
import { releaseEligibility } from './release-gate.mjs';
function fixture() {
  const baseSha = 'a'.repeat(40);
  const sha = 'b'.repeat(40);
  const notes =
    '## [1.2.3](https://example.invalid/compare) (2026-09-16)\n\n### Bug Fixes\n\n* validated fix';
  const oldLog = '## [1.2.2](https://example.invalid/compare)\n\nPrevious release';
  const assets = {
    [`${baseSha}/package.json`]: JSON.stringify({ private: true, version: '1.2.2' }),
    [`${sha}/package.json`]: JSON.stringify({ private: true, version: '1.2.3' }),
    [`${baseSha}/CHANGELOG.md`]: `${oldLog}\n`,
    [`${sha}/CHANGELOG.md`]: `${notes}\n\n${oldLog}\n`,
  };
  const commit = {
    parents: [{ sha: baseSha }],
    commit: { message: 'chore(release): 1.2.3\n' },
    files: [
      { status: 'modified', filename: 'package.json' },
      { status: 'modified', filename: 'CHANGELOG.md' },
    ],
  };
  const check = {
    id: 1,
    name: 'CI Result',
    app: { id: 15368 },
    head_sha: sha,
    status: 'completed',
    conclusion: 'success',
  };
  const missing = () => Promise.reject(Object.assign(new Error('Not found'), { status: 404 }));
  const github = {
    paginate: vi.fn().mockResolvedValue([check]),
    rest: {
      checks: { listForRef: vi.fn() },
      repos: {
        getCommit: vi.fn().mockResolvedValue({ data: commit }),
        getContent: vi.fn(({ ref, path }) =>
          Promise.resolve({
            data: {
              type: 'file',
              encoding: 'base64',
              content: Buffer.from(assets[`${ref}/${path}`]).toString('base64'),
            },
          })
        ),
        getReleaseByTag: vi.fn(missing),
        createRelease: vi.fn().mockResolvedValue({ data: {} }),
      },
      git: { getRef: vi.fn(missing), createRef: vi.fn().mockResolvedValue({ data: {} }) },
    },
  };
  const context = { repo: { owner: 'owner', repo: 'repo' } };
  return {
    github,
    context,
    baseSha,
    sha,
    assets,
    commit,
    check,
    notes,
    recovery: { sha, version: '1.2.3', notes },
  };
}
describe('interrupted release recovery', () => {
  it('recovers immutable notes only for a CI-validated version child', async () => {
    const f = fixture();
    expect(await findReleaseRecovery(f)).toEqual(f.recovery);
    expect(f.github.paginate).toHaveBeenCalledWith(
      f.github.rest.checks.listForRef,
      expect.objectContaining({ ref: f.sha, check_name: 'CI Result', filter: 'latest' })
    );
  });
  it.each([
    [
      'unrelated parent',
      (f) => {
        f.commit.parents[0].sha = 'c'.repeat(40);
      },
    ],
    [
      'merge commit',
      (f) => {
        f.commit.parents.push({ sha: 'c'.repeat(40) });
      },
    ],
    [
      'wrong subject',
      (f) => {
        f.commit.commit.message = 'fix: unrelated';
      },
    ],
    [
      'extra file',
      (f) => {
        f.commit.files.push({ status: 'modified', filename: 'app/app.vue' });
      },
    ],
    [
      'renamed asset',
      (f) => {
        f.commit.files[0].status = 'renamed';
      },
    ],
  ])('rejects %s before publishing', async (_name, mutate) => {
    const f = fixture();
    mutate(f);
    expect(await findReleaseRecovery(f)).toBeNull();
    expect(f.github.paginate).not.toHaveBeenCalled();
  });
  it.each([
    [
      'failed',
      (f) => {
        f.check.conclusion = 'failure';
      },
    ],
    [
      'pending',
      (f) => {
        f.check.status = 'in_progress';
      },
    ],
    [
      'wrong provider',
      (f) => {
        f.check.app.id = 999;
      },
    ],
    [
      'wrong head',
      (f) => {
        f.check.head_sha = f.baseSha;
      },
    ],
    [
      'missing',
      (f) => {
        f.github.paginate.mockResolvedValue([]);
      },
    ],
    [
      'newer failure',
      (f) => {
        f.github.paginate.mockResolvedValue([
          f.check,
          { ...f.check, id: 2, conclusion: 'failure' },
        ]);
      },
    ],
  ])('rejects %s CI evidence', async (_name, mutate) => {
    const f = fixture();
    mutate(f);
    expect(await findReleaseRecovery(f)).toBeNull();
  });
  it.each([
    [
      'version',
      (f) => {
        f.assets[`${f.sha}/package.json`] = '{"private":true,"version":"9.9.9"}';
      },
    ],
    [
      'manifest',
      (f) => {
        f.assets[`${f.sha}/package.json`] = '{"private":false,"version":"1.2.3"}';
      },
    ],
    [
      'old notes',
      (f) => {
        f.assets[`${f.sha}/CHANGELOG.md`] += '\nUnrelated content';
      },
    ],
    [
      'new notes',
      (f) => {
        f.assets[`${f.sha}/CHANGELOG.md`] = f.assets[`${f.sha}/CHANGELOG.md`].replace(
          '1.2.3',
          '9.9.9'
        );
      },
    ],
  ])('rejects changed %s content', async (_name, mutate) => {
    const f = fixture();
    mutate(f);
    await expect(findReleaseRecovery(f)).rejects.toThrow();
  });
  it('fails closed when an immutable asset cannot be read', async () => {
    const f = fixture();
    f.github.rest.repos.getContent.mockResolvedValue({ data: { type: 'file', encoding: 'none' } });
    await expect(findReleaseRecovery(f)).rejects.toThrow('Unreadable release asset');
  });
  it('creates a missing exact tag and publishes the original notes', async () => {
    const f = fixture();
    await publishRecoveredRelease(f);
    expect(f.github.rest.git.createRef).toHaveBeenCalledWith({
      ...f.context.repo,
      ref: 'refs/tags/v1.2.3',
      sha: f.sha,
    });
    expect(f.github.rest.repos.createRelease).toHaveBeenCalledWith({
      ...f.context.repo,
      tag_name: 'v1.2.3',
      target_commitish: f.sha,
      name: 'v1.2.3',
      body: f.notes,
      draft: false,
      prerelease: false,
    });
  });
  it('resumes an existing exact tag without creating a second version', async () => {
    const f = fixture();
    f.github.rest.git.getRef.mockResolvedValue({
      data: { object: { type: 'commit', sha: f.sha } },
    });
    await publishRecoveredRelease(f);
    expect(f.github.rest.git.createRef).not.toHaveBeenCalled();
    expect(f.github.rest.repos.createRelease).toHaveBeenCalledOnce();
    f.github.rest.repos.getReleaseByTag.mockResolvedValue({
      data: { draft: false, prerelease: false },
    });
    await publishRecoveredRelease(f);
    expect(f.github.rest.repos.createRelease).toHaveBeenCalledOnce();
  });
  it('never overwrites a conflicting tag', async () => {
    const f = fixture();
    f.github.rest.git.getRef.mockResolvedValue({
      data: { object: { type: 'commit', sha: f.baseSha } },
    });
    await expect(publishRecoveredRelease(f)).rejects.toThrow('another commit');
    expect(f.github.rest.repos.createRelease).not.toHaveBeenCalled();
  });
  it('does not reinterpret permission errors as missing tags', async () => {
    const f = fixture();
    f.github.rest.git.getRef.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { status: 403 })
    );
    await expect(publishRecoveredRelease(f)).rejects.toThrow('Forbidden');
    expect(f.github.rest.git.createRef).not.toHaveBeenCalled();
  });
  it('does not publish an unexpected existing draft', async () => {
    const f = fixture();
    f.github.rest.repos.getReleaseByTag.mockResolvedValue({ data: { draft: true } });
    await expect(publishRecoveredRelease(f)).rejects.toThrow('not a stable publication');
  });
  it('permits recovery only on an explicitly enabled rerun of the trusted original CI event', async () => {
    const f = fixture();
    const run = {
      id: 12,
      event: 'push',
      head_branch: 'main',
      head_repository: { id: 42 },
      status: 'completed',
      conclusion: 'success',
      path: '.github/workflows/ci.yml',
      head_sha: f.baseSha,
      run_attempt: 1,
    };
    f.context.payload = { workflow_run: run, repository: { id: 42 } };
    f.github.rest.actions = { getWorkflowRun: vi.fn().mockResolvedValue({ data: run }) };
    f.github.rest.git.getRef.mockResolvedValue({ data: { object: { sha: f.sha } } });
    expect((await releaseEligibility(f)).release).toBe(false);
    expect(f.github.rest.repos.getCommit).not.toHaveBeenCalled();
    expect(await releaseEligibility({ ...f, allowRecovery: true })).toMatchObject({
      release: false,
      recovery: f.recovery,
    });
    f.commit.commit.message = 'fix: unrelated successor';
    expect(await releaseEligibility({ ...f, allowRecovery: true })).toMatchObject({
      release: false,
    });
    expect((await releaseEligibility({ ...f, allowRecovery: true })).recovery).toBeUndefined();
  });
});
