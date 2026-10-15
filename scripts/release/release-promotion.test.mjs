// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ReleasePrepared } from './release-commit.mjs';
import {
  candidateEvidence,
  promotionBranch,
  queuedRelease,
  rollbackPromotion,
} from './release-promotion.mjs';
import { runRelease } from './release-run.mjs';
vi.mock('./release-promotion-receipt.mjs', () => ({
  readPromotionArchive: vi.fn(async (bytes) => JSON.parse(String(bytes))),
}));
vi.mock('../ci/review-admission-binding.mjs', () => ({
  requireReviewAdmission: vi.fn(async () => ({ approved: true })),
}));
const { requireReviewAdmission } = await import(
  new URL('../ci/review-admission-binding.mjs', import.meta.url)
);
const source = 'a'.repeat(40);
const candidateSha = 'b'.repeat(40);
const mergedSha = 'c'.repeat(40);
function fixture() {
  const repo = { owner: 'owner', repo: 'repo' };
  const pr = {
    number: 901,
    state: 'closed',
    draft: false,
    merged_at: '2026-10-14T10:00:00Z',
    merge_commit_sha: mergedSha,
    user: { id: 41898282, type: 'Bot' },
    base: { ref: 'main' },
    head: { ref: 'wip/release-1.2.3-123-1', sha: candidateSha, repo: { full_name: 'owner/repo' } },
  };
  const run = {
    id: 123,
    run_attempt: 1,
    path: '.github/workflows/release.yml',
    event: 'schedule',
    head_branch: 'main',
    head_sha: source,
    head_repository: { full_name: 'owner/repo' },
    status: 'completed',
    conclusion: 'success',
  };
  const candidate = {
    parents: [{ sha: source }],
    commit: { message: 'chore(release): 1.2.3', tree: { sha: 'd'.repeat(40) } },
    files: [
      { status: 'modified', filename: 'CHANGELOG.md' },
      { status: 'modified', filename: 'package.json' },
    ],
  };
  const merged = structuredClone(candidate);
  merged.commit.message += ' (#901)';
  const oldLog = '## [1.2.2](https://example.invalid)\n\nOld notes';
  const notes = '## [1.2.3](https://example.invalid)\n\nNew notes';
  const assets = {
    [`${source}/package.json`]: '{"name":"app","version":"1.2.2"}',
    [`${source}/CHANGELOG.md`]: oldLog,
    [`${candidateSha}/package.json`]: '{"name":"app","version":"1.2.3"}',
    [`${candidateSha}/CHANGELOG.md`]: notes + '\n\n' + oldLog,
    [`${mergedSha}/package.json`]: '{"name":"app","version":"1.2.3"}',
    [`${mergedSha}/CHANGELOG.md`]: notes + '\n\n' + oldLog,
  };
  const rest = {
    pulls: { list: vi.fn(), get: vi.fn(async () => ({ data: pr })) },
    git: {
      getRef: vi.fn(async () => {
        throw Object.assign(new Error('missing'), { status: 404 });
      }),
    },
    repos: {
      getReleaseByTag: vi.fn(async () => {
        throw Object.assign(new Error('missing'), { status: 404 });
      }),
      listCommitStatusesForRef: vi.fn(),
      getCommit: vi.fn(async ({ ref }) => ({ data: ref === candidateSha ? candidate : merged })),
      getContent: vi.fn(async ({ ref, path }) => ({
        data: {
          type: 'file',
          encoding: 'base64',
          content: Buffer.from(assets[`${ref}/${path}`]).toString('base64'),
        },
      })),
      compareCommits: vi.fn(async () => ({ data: { status: 'ahead' } })),
    },
    checks: { listForRef: vi.fn() },
    actions: {
      downloadArtifact: vi.fn(async () => ({
        data: Buffer.from(
          JSON.stringify({
            schema: 1,
            source,
            candidate: candidateSha,
            version: '1.2.3',
            pr: 'https://github.com/owner/repo/pull/901',
            githubNotes: notes,
          })
        ),
      })),
      getWorkflowRunAttempt: vi.fn(async () => ({ data: run })),
      getWorkflowRun: vi.fn(async () => ({
        data: {
          id: 555,
          path: '.github/workflows/preview.yml',
          event: 'workflow_dispatch',
          head_branch: 'main',
          head_repository: { full_name: 'owner/repo' },
          repository: { full_name: 'owner/repo' },
          status: 'completed',
          conclusion: 'success',
        },
      })),
      listJobsForWorkflowRun: vi.fn(),
      listWorkflowRunArtifacts: vi.fn(),
    },
  };
  let previewSha;
  const prs = [pr];
  const pages = new Map([
    [rest.pulls.list, () => prs],
    [
      rest.checks.listForRef,
      (params) => [
        {
          id: 1,
          app: { id: 15368 },
          head_sha: params.ref,
          status: 'completed',
          conclusion: 'success',
        },
      ],
    ],
    [
      rest.repos.listCommitStatusesForRef,
      (params) => {
        previewSha = params.ref;
        return [
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
      rest.actions.listJobsForWorkflowRun,
      () => [{ name: 'Publish preview result', conclusion: 'success' }],
    ],
    [
      rest.actions.listWorkflowRunArtifacts,
      (params) =>
        params.run_id === 123
          ? [
              {
                id: 321,
                size_in_bytes: 1000,
                name: `release-promotion-${candidateSha}`,
                expired: false,
              },
            ]
          : [{ name: `preview-deployment-${previewSha}`, expired: false }],
    ],
  ]);
  const github = {
    rest,
    paginate: vi.fn(async (endpoint, params) => {
      if (!pages.has(endpoint)) throw new Error('Unexpected endpoint');
      return pages.get(endpoint)(params);
    }),
  };
  return {
    github,
    context: { repo },
    sha: mergedSha,
    requireValidation: true,
    pr,
    prs,
    run,
    candidate,
    merged,
    assets,
    pages,
    oldLog,
    notes,
  };
}
function sameVersionHistory() {
  const f = fixture();
  f.prs.unshift({
    ...structuredClone(f.pr),
    number: 900,
    merged_at: '2026-10-14T09:00:00Z',
    merge_commit_sha: 'd'.repeat(40),
    head: { ...structuredClone(f.pr.head), sha: 'e'.repeat(40), ref: 'wip/release-1.2.3-122-1' },
  });
  return f;
}
function publishedHistory() {
  const f = sameVersionHistory();
  f.sha = 'f'.repeat(40); // Ordinary main commit after rollback, fresh merge and publication.
  f.assets[`${f.sha}/package.json`] = f.assets[`${mergedSha}/package.json`];
  f.github.rest.git.getRef.mockResolvedValue({
    data: { object: { type: 'commit', sha: mergedSha } },
  });
  f.github.rest.repos.getReleaseByTag.mockResolvedValue({
    data: { draft: false, prerelease: false },
  });
  return f;
}
describe('asynchronous release promotion', () => {
  it('publishes only actual merged SHA after authenticating source run, assets, CI and preview', async () => {
    const f = fixture();
    expect(await queuedRelease(f)).toMatchObject({
      release: false,
      recovery: { sha: mergedSha, version: '1.2.3', notes: f.notes },
    });
    expect(f.github.rest.actions.getWorkflowRunAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ run_id: 123, attempt_number: 1 })
    );
  });
  it('keeps an open immutable version PR pending instead of duplicating or waiting on it', async () => {
    const f = fixture();
    f.sha = source;
    f.context.eventName = 'schedule';
    f.pr.state = 'open';
    f.pr.merged_at = null;
    expect(await queuedRelease(f)).toMatchObject({
      release: false,
      reason: expect.stringContaining('awaits reviewed merge'),
    });
    expect(f.github.rest.repos.getCommit).toHaveBeenCalled();
  });
  it.each([
    ['failed source run', (f) => (f.run.conclusion = 'failure')],
    ['unfinished source run', (f) => (f.run.status = 'in_progress')],
    ['foreign run code', (f) => (f.run.path = '.github/workflows/ci.yml')],
    ['branch run code', (f) => (f.run.head_branch = 'evil')],
    ['foreign source repository', (f) => (f.run.head_repository.full_name = 'other/repo')],
    ['PR source trigger', (f) => (f.run.event = 'pull_request')],
    ['changed source', (f) => (f.candidate.parents[0].sha = mergedSha)],
    [
      'application edits',
      (f) => f.candidate.files.push({ status: 'modified', filename: 'app/code.ts' }),
    ],
    ['renamed version asset', (f) => (f.candidate.files[0].status = 'renamed')],
    ['altered title', (f) => (f.candidate.commit.message = 'ordinary')],
    [
      'manifest dependency edit',
      (f) => (f.assets[`${candidateSha}/package.json`] = '{"name":"other","version":"1.2.3"}'),
    ],
    ['rewritten changelog history', (f) => (f.assets[`${candidateSha}/CHANGELOG.md`] = f.notes)],
    ['queue interleaving', (f) => (f.merged.parents[0].sha = 'e'.repeat(40))],
    ['queue tree mismatch', (f) => (f.merged.commit.tree.sha = 'e'.repeat(40))],
    [
      'newer main',
      (f) => {
        f.assets[`${'e'.repeat(40)}/package.json`] = f.assets[`${mergedSha}/package.json`];
        f.sha = 'e'.repeat(40);
      },
    ],
  ])('rejects %s before publication', async (_name, mutate) => {
    const f = fixture();
    mutate(f);
    await expect(queuedRelease(f)).rejects.toThrow();
  });
  it('rejects an unreviewed or administratively bypassed candidate despite otherwise valid merge evidence', async () => {
    const f = fixture();
    requireReviewAdmission.mockRejectedValueOnce(new Error('Review Admission missing'));
    await expect(queuedRelease(f)).rejects.toThrow('Review Admission missing');
  });
  it('rejects a missing or expired run-owned preparation receipt', async () => {
    const f = fixture();
    const handler = f.pages.get(f.github.rest.actions.listWorkflowRunArtifacts);
    f.pages.set(f.github.rest.actions.listWorkflowRunArtifacts, (params) =>
      params.run_id === 123 ? [] : handler(params)
    );
    await expect(queuedRelease(f)).rejects.toThrow('run-owned version preparation receipt');
    f.pages.set(f.github.rest.actions.listWorkflowRunArtifacts, (params) =>
      params.run_id === 123
        ? [{ name: `release-promotion-${candidateSha}`, expired: true }]
        : handler(params)
    );
    await expect(queuedRelease(f)).rejects.toThrow('run-owned version preparation receipt');
  });
  it('publishes captured GitHub-only highlights from the authenticated preparation receipt', async () => {
    const f = fixture();
    f.github.rest.actions.downloadArtifact.mockResolvedValue({
      data: Buffer.from(
        JSON.stringify({
          schema: 1,
          source,
          candidate: candidateSha,
          version: '1.2.3',
          pr: 'https://github.com/owner/repo/pull/901',
          githubNotes: f.notes + '\n\n### Highlights\n\n* Sanitized player highlight',
        })
      ),
    });
    expect((await queuedRelease(f)).recovery.notes).toContain('Sanitized player highlight');
  });
  it('rejects notes receipts whose source/head/version/PR provenance was changed', async () => {
    const f = fixture();
    f.github.rest.actions.downloadArtifact.mockResolvedValue({
      data: Buffer.from(
        JSON.stringify({
          schema: 1,
          source: mergedSha,
          candidate: candidateSha,
          version: '1.2.3',
          pr: 'https://github.com/owner/repo/pull/901',
          githubNotes: 'forged',
        })
      ),
    });
    await expect(queuedRelease(f)).rejects.toThrow('provenance changed');
  });
  it('finalizes the exact fresh same-version merge after stale merge, rollback and reprepare history', async () => {
    const f = sameVersionHistory(); // Immutable history survives reviewed rollback/reprepare.
    expect((await queuedRelease(f)).recovery).toMatchObject({ sha: mergedSha, version: '1.2.3' });
    expect(f.github.rest.actions.getWorkflowRunAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ run_id: 123 })
    );
    expect(f.github.rest.actions.getWorkflowRunAttempt).not.toHaveBeenCalledWith(
      expect.objectContaining({ run_id: 122 })
    );
  });
  it('permits later ordinary main after the unique tagged fresh same-version promotion was published', async () => {
    const f = publishedHistory();
    expect(await queuedRelease(f)).toBeNull();
    expect(f.github.rest.git.getRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: 'tags/v1.2.3' })
    );
    expect(f.github.rest.repos.getReleaseByTag).toHaveBeenCalledWith(
      expect.objectContaining({ tag: 'v1.2.3' })
    );
    expect(f.github.rest.actions.getWorkflowRunAttempt).not.toHaveBeenCalled();
  });
  it('holds a newer untagged same-version merge even when an older matching merge was published', async () => {
    const f = publishedHistory();
    f.github.rest.git.getRef.mockResolvedValue({
      data: { object: { type: 'commit', sha: f.prs[0].merge_commit_sha } },
    });
    await expect(queuedRelease(f)).rejects.toThrow('multiple unpublished');
  });
  it.each([
    [
      'wrong tag target',
      (f) => {
        f.github.rest.git.getRef.mockResolvedValue({
          data: { object: { type: 'commit', sha: source } },
        });
      },
    ],
    [
      'noncommit tag',
      (f) => {
        f.github.rest.git.getRef.mockResolvedValue({
          data: { object: { type: 'tag', sha: mergedSha } },
        });
      },
    ],
    [
      'missing tag',
      (f) => {
        f.github.rest.git.getRef.mockRejectedValue(
          Object.assign(new Error('missing'), { status: 404 })
        );
      },
    ],
    [
      'missing publication',
      (f) => {
        f.github.rest.repos.getReleaseByTag.mockRejectedValue(
          Object.assign(new Error('missing'), { status: 404 })
        );
      },
    ],
    [
      'draft publication',
      (f) => {
        f.github.rest.repos.getReleaseByTag.mockResolvedValue({
          data: { draft: true, prerelease: false },
        });
      },
    ],
    [
      'prerelease publication',
      (f) => {
        f.github.rest.repos.getReleaseByTag.mockResolvedValue({
          data: { draft: false, prerelease: true },
        });
      },
    ],
    [
      'ambiguous tagged provenance',
      (f) => {
        f.prs[0].merge_commit_sha = mergedSha;
      },
    ],
  ])('holds multiple historical same-version merges with %s', async (_, change) => {
    const f = publishedHistory();
    change(f);
    await expect(queuedRelease(f)).rejects.toThrow();
    expect(f.github.rest.actions.getWorkflowRunAttempt).not.toHaveBeenCalled();
  });
  it('ignores authored PR body source/commit spoofing', async () => {
    const f = fixture();
    f.pr.body = `Source: ${mergedSha}\nCandidate: ${source}`;
    expect((await queuedRelease(f)).recovery.sha).toBe(mergedSha);
  });
  it('fails closed on GitHub API errors instead of treating them as absent evidence', async () => {
    const f = fixture();
    f.github.rest.git.getRef.mockRejectedValue(new Error('API unavailable'));
    await expect(queuedRelease(f)).rejects.toThrow('API unavailable');
  });
  it('permits preview setup but requires exact merged validation before publication', async () => {
    const f = fixture();
    const handler = f.pages.get(f.github.rest.checks.listForRef);
    f.pages.set(f.github.rest.checks.listForRef, (params) =>
      params.ref === mergedSha
        ? [{ ...handler(params)[0], conclusion: 'failure' }]
        : handler(params)
    );
    expect((await queuedRelease({ ...f, requireValidation: false })).recovery.sha).toBe(mergedSha);
    await expect(queuedRelease(f)).rejects.toThrow('Merged version CI/preview');
  });
  it('rejects tag conflicts and recovers an existing correct tag without a release', async () => {
    const f = fixture();
    f.github.rest.git.getRef.mockResolvedValue({
      data: { object: { sha: source, type: 'commit' } },
    });
    await expect(queuedRelease(f)).rejects.toThrow('tag conflicts');
    f.github.rest.git.getRef.mockResolvedValue({
      data: { object: { sha: mergedSha, type: 'commit' } },
    });
    f.github.rest.repos.getReleaseByTag.mockRejectedValue(
      Object.assign(new Error('missing'), { status: 404 })
    );
    expect((await queuedRelease(f)).recovery.sha).toBe(mergedSha);
    f.github.rest.repos.getReleaseByTag.mockResolvedValue({
      data: { draft: false, prerelease: false },
    });
    expect(await queuedRelease(f)).toBeNull();
  });
});
describe('unpublished promotion recovery', () => {
  it('restores only previous generated assets for a reviewed rollback and retains intervening manifest fields', async () => {
    const f = fixture();
    f.assets[`${mergedSha}/package.json`] = '{"name":"app","version":"1.2.3","newSetting":true}';
    const result = await rollbackPromotion({ ...f, prNumber: 901 });
    expect(JSON.parse(result.manifest)).toEqual({
      name: 'app',
      version: '1.2.2',
      newSetting: true,
    });
    expect(result.changelog).toBe(f.oldLog);
  });
  it.each([
    ['changed changelog', (f) => (f.assets[`${mergedSha}/CHANGELOG.md`] += '\nnew notes')],
    ['changed version', (f) => (f.assets[`${mergedSha}/package.json`] = '{"version":"2.0.0"}')],
    [
      'published tag',
      (f) => f.github.rest.git.getRef.mockResolvedValue({ data: { object: { sha: mergedSha } } }),
    ],
    [
      'nonancestor promotion',
      (f) => f.github.rest.repos.compareCommits.mockResolvedValue({ data: { status: 'diverged' } }),
    ],
  ])('rejects unsafe rollback for %s', async (_name, mutate) => {
    const f = fixture();
    mutate(f);
    await expect(rollbackPromotion({ ...f, prNumber: 901 })).rejects.toThrow();
  });
});
describe('staging runner', () => {
  it('treats only the actual successful preparation signal as a nonpublishing success', async () => {
    expect(
      await runRelease(
        async () => {
          throw new ReleasePrepared();
        },
        async () => {}
      )
    ).toBe(false);
    await expect(
      runRelease(async () => {
        throw Object.assign(new Error('tool failure'), { code: 'RELEASE_PR_PREPARED' });
      })
    ).rejects.toThrow('tool failure');
  });
});
function staleOpenFixture() {
  const f = fixture();
  f.pr.state = 'open';
  f.pr.merged_at = null;
  f.context.eventName = 'schedule';
  f.assets[`${mergedSha}/package.json`] = f.assets[`${source}/package.json`];
  f.github.graphql = vi.fn(async () => ({
    repository: { pullRequest: { headRefOid: candidateSha, mergeQueueEntry: null } },
  }));
  f.github.rest.git.getRef.mockImplementation(async ({ ref }) => {
    if (ref === 'heads/main') return { data: { object: { sha: mergedSha } } };
    throw Object.assign(new Error('missing'), { status: 404 });
  });
  f.github.rest.pulls.get.mockImplementation(async () => ({ data: structuredClone(f.pr) }));
  f.github.rest.pulls.update = vi.fn(async ({ state }) => {
    f.pr.state = state;
    return { data: structuredClone(f.pr) };
  });
  f.github.rest.issues = { createComment: vi.fn(async () => ({ data: {} })) };
  return f;
}
function failedOpenFixture() {
  const f = staleOpenFixture();
  f.sha = source;
  f.run.conclusion = 'failure';
  f.github.rest.git.getRef.mockImplementation(async ({ ref }) => {
    if (ref === 'heads/main') return { data: { object: { sha: source } } };
    throw Object.assign(new Error('missing'), { status: 404 });
  });
  f.github.rest.repos.compareCommits.mockResolvedValue({ data: { status: 'identical' } });
  const artifacts = f.pages.get(f.github.rest.actions.listWorkflowRunArtifacts);
  f.pages.set(f.github.rest.actions.listWorkflowRunArtifacts, (params) =>
    params.run_id === 123 ? [] : artifacts(params)
  );
  return f;
}
describe('failed ordinary preparation retry', () => {
  it.each([
    ['notes generation', source, 'identical'],
    ['receipt artifact upload', mergedSha, 'ahead'],
  ])(
    'replaces an unchanged orphan after failed %s without accepting its missing receipt',
    async (_stage, currentMain, history) => {
      const f = failedOpenFixture();
      f.sha = currentMain;
      const ref = f.github.rest.git.getRef.getMockImplementation();
      f.github.rest.git.getRef.mockImplementation((params) =>
        params.ref === 'heads/main' ? { data: { object: { sha: currentMain } } } : ref(params)
      );
      f.github.rest.repos.compareCommits.mockResolvedValue({ data: { status: history } });
      await expect(
        candidateEvidence(f.github, f.context.repo, f.pr, promotionBranch(f.pr, f.context.repo))
      ).rejects.toThrow('Preparation did not succeed');
      expect(await queuedRelease(f)).toBeNull();
      expect(f.github.rest.pulls.update).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ pull_number: 901, state: 'closed' })
      );
      expect(f.github.rest.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.stringContaining('trusted preparation failed') })
      );
      expect(f.github.rest.actions.downloadArtifact).not.toHaveBeenCalled();
    }
  );
  it('allows cancelled preparation to regenerate on ordinary dispatch, never CI completion', async () => {
    const f = failedOpenFixture();
    f.run.conclusion = 'cancelled';
    f.context.eventName = 'workflow_run';
    expect((await queuedRelease(f)).release).toBe(false);
    expect(f.github.rest.pulls.update).not.toHaveBeenCalled();
    f.context.eventName = 'workflow_dispatch';
    expect(await queuedRelease(f)).toBeNull();
  });
  it('holds in-progress source attempts and already queued or advanced-main candidates', async () => {
    const running = failedOpenFixture();
    running.run.status = 'in_progress';
    running.run.conclusion = null;
    expect((await queuedRelease(running)).release).toBe(false);
    expect(running.github.rest.pulls.update).not.toHaveBeenCalled();
    const queued = failedOpenFixture();
    queued.github.graphql.mockResolvedValue({
      repository: { pullRequest: { headRefOid: candidateSha, mergeQueueEntry: { id: 'queued' } } },
    });
    expect((await queuedRelease(queued)).reason).toContain('still queued');
    expect(queued.github.rest.pulls.update).not.toHaveBeenCalled();
    const advanced = failedOpenFixture();
    const ref = advanced.github.rest.git.getRef.getMockImplementation();
    advanced.github.rest.git.getRef.mockImplementation((params) =>
      params.ref === 'heads/main' ? { data: { object: { sha: mergedSha } } } : ref(params)
    );
    expect((await queuedRelease(advanced)).reason).toContain('fresh validated main');
    expect(advanced.github.rest.pulls.update).not.toHaveBeenCalled();
  });
  it.each([
    [
      'forged workflow',
      (f) => {
        f.run.path = '.github/workflows/evil.yml';
      },
    ],
    [
      'fork source',
      (f) => {
        f.run.head_repository.full_name = 'fork/repo';
      },
    ],
    [
      'mismatched run',
      (f) => {
        f.run.id = 124;
      },
    ],
    [
      'mismatched attempt',
      (f) => {
        f.run.run_attempt = 2;
      },
    ],
    [
      'changed source parent',
      (f) => {
        f.candidate.parents = [{ sha: mergedSha }];
      },
    ],
    [
      'application asset',
      (f) => {
        f.candidate.files.push({ status: 'modified', filename: 'app/evil.mjs' });
      },
    ],
    [
      'edited live head',
      (f) => {
        f.github.rest.pulls.get.mockResolvedValue({
          data: { ...f.pr, head: { ...f.pr.head, sha: mergedSha } },
        });
      },
    ],
    [
      'missing queue state',
      (f) => {
        f.github.graphql.mockResolvedValue({
          repository: { pullRequest: { headRefOid: candidateSha } },
        });
      },
    ],
    [
      'tagged version',
      (f) => {
        const read = f.github.rest.git.getRef.getMockImplementation();
        f.github.rest.git.getRef.mockImplementation((params) =>
          params.ref === 'tags/v1.2.3' ? { data: { object: { sha: candidateSha } } } : read(params)
        );
      },
    ],
    [
      'published version',
      (f) => {
        f.github.rest.repos.getReleaseByTag.mockResolvedValue({
          data: { draft: false, prerelease: false },
        });
      },
    ],
    [
      'unknown ancestry',
      (f) => {
        f.github.rest.repos.compareCommits.mockResolvedValue({ data: { status: 'diverged' } });
      },
    ],
    [
      'failed candidate CI',
      (f) => {
        f.pages.set(f.github.rest.checks.listForRef, () => [
          {
            app: { id: 15368 },
            head_sha: candidateSha,
            status: 'completed',
            conclusion: 'failure',
          },
        ]);
      },
    ],
  ])('refuses orphan replacement with %s', async (_, change) => {
    const f = failedOpenFixture();
    change(f);
    await expect(queuedRelease(f)).rejects.toThrow();
    expect(f.github.rest.pulls.update).not.toHaveBeenCalled();
  });
  it('holds a live PR already merged instead of trying to close it', async () => {
    const f = failedOpenFixture();
    f.github.rest.pulls.get.mockResolvedValue({
      data: { ...f.pr, merged: true, merged_at: '2026-10-14T11:00:00Z' },
    });
    expect((await queuedRelease(f)).reason).toContain('no longer open');
    expect(f.github.rest.pulls.update).not.toHaveBeenCalled();
  });
});
describe('safe ordinary stale-source retry', () => {
  it('closes only a proven unchanged unqueued unpublished generated snapshot and allows fresh preparation', async () => {
    const f = staleOpenFixture();
    expect(await queuedRelease(f)).toBeNull();
    expect(f.github.rest.pulls.update).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ pull_number: 901, state: 'closed' })
    );
    expect(f.github.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining('Branch history is retained') })
    );
  });
  it('CI completion wakeups never close or prepare stale snapshots', async () => {
    const f = staleOpenFixture();
    f.context.eventName = 'workflow_run';
    expect((await queuedRelease(f)).release).toBe(false);
    expect(f.github.rest.pulls.update).not.toHaveBeenCalled();
  });
  it('holds queued or edited version heads and source/tag/history uncertainty instead of replacing them', async () => {
    const queued = staleOpenFixture();
    queued.github.graphql.mockResolvedValue({
      repository: { pullRequest: { headRefOid: candidateSha, mergeQueueEntry: { id: 'queued' } } },
    });
    expect((await queuedRelease(queued)).reason).toContain('still queued');
    expect(queued.github.rest.pulls.update).not.toHaveBeenCalled();
    const edited = staleOpenFixture();
    edited.github.rest.pulls.get.mockResolvedValue({
      data: { ...edited.pr, head: { ...edited.pr.head, sha: mergedSha } },
    });
    await expect(queuedRelease(edited)).rejects.toThrow('Edited promotion');
    expect(edited.github.rest.pulls.update).not.toHaveBeenCalled();
    const unknown = staleOpenFixture();
    unknown.github.rest.repos.compareCommits.mockResolvedValue({ data: { status: 'diverged' } });
    await expect(queuedRelease(unknown)).rejects.toThrow('proven main ancestor');
    expect(unknown.github.rest.pulls.update).not.toHaveBeenCalled();
  });
  it('reopens and holds a snapshot edited during non-atomic GitHub PR closure', async () => {
    const f = staleOpenFixture();
    f.github.rest.pulls.update.mockImplementation(async ({ state }) => {
      f.pr.state = state;
      f.pr.head.sha = mergedSha;
      return { data: structuredClone(f.pr) };
    });
    await expect(queuedRelease(f)).rejects.toThrow('reopened and held');
    expect(f.github.rest.pulls.update.mock.calls.map(([p]) => p.state)).toEqual(['closed', 'open']);
    expect(f.github.rest.issues.createComment).not.toHaveBeenCalled();
  });
});
