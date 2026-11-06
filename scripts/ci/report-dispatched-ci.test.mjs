// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { reportDispatchedCi } from './report-dispatched-ci.mjs';
function fixture() {
  return {
    github: { rest: { repos: { createCommitStatus: vi.fn().mockResolvedValue({}) } } },
    context: {
      eventName: 'workflow_dispatch',
      repo: { owner: 'example', repo: 'repo' },
      sha: 'a'.repeat(40),
      serverUrl: 'https://github.com',
      runId: 123,
    },
    outcome: 'success',
  };
}
function localesFixture() {
  const f = fixture();
  const repository = 'example/repo';
  f.context.ref = 'refs/heads/locales';
  f.pull = {
    number: 881,
    state: 'open',
    draft: false,
    head: { ref: 'locales', sha: f.context.sha, repo: { full_name: repository } },
    base: { ref: 'main', sha: 'b'.repeat(40), repo: { full_name: repository } },
    merge_commit_sha: 'c'.repeat(40),
  };
  f.github.rest.pulls = {
    list: vi.fn().mockResolvedValue({ data: [f.pull] }),
    get: vi.fn().mockResolvedValue({ data: f.pull }),
  };
  f.github.rest.git = {
    getCommit: vi.fn().mockResolvedValue({ data: { tree: { sha: 'd'.repeat(40) } } }),
    getRef: vi.fn().mockResolvedValue({ data: { object: { sha: f.pull.base.sha } } }),
  };
  return f;
}
function queueFixture() {
  const f = localesFixture();
  f.admissionAppId = 987654;
  const own = { ruleset_id: 43, ruleset_source_type: 'Repository', ruleset_source: 'example/repo' };
  f.rules = [
    {
      ...own,
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: false,
        required_status_checks: [
          { context: 'CI Result', integration_id: 15368 },
          { context: 'Preview Result', integration_id: 15368 },
          { context: 'Review Admission', integration_id: f.admissionAppId },
        ],
      },
    },
    {
      ...own,
      type: 'merge_queue',
      parameters: {
        grouping_strategy: 'ALLGREEN',
        max_entries_to_build: 1,
        max_entries_to_merge: 1,
        min_entries_to_merge: 1,
        merge_method: 'SQUASH',
      },
    },
    { ...own, type: 'pull_request', parameters: { required_review_thread_resolution: true } },
  ];
  f.github.rest.repos.getBranchRules = vi.fn();
  f.github.paginate = vi.fn().mockImplementation(async () => f.rules);
  f.github.rest.git.getRef.mockResolvedValue({ data: { object: { sha: 'e'.repeat(40) } } });
  f.github.rest.git.getCommit
    .mockResolvedValueOnce({ data: { tree: { sha: 'd'.repeat(40) } } })
    .mockResolvedValueOnce({ data: { tree: { sha: 'e'.repeat(40) } } });
  return f;
}
describe('verified Crowdin integration queue admission', () => {
  it.each(['success', 'failure'])(
    'reports only exact behind head %s without attesting a merge tree',
    async (outcome) => {
      const f = queueFixture();
      await reportDispatchedCi({ ...f, outcome });
      expect(f.github.paginate).toHaveBeenCalledExactlyOnceWith(
        f.github.rest.repos.getBranchRules,
        {
          ...f.context.repo,
          branch: 'main',
          per_page: 100,
        }
      );
      expect(f.github.rest.pulls.get).toHaveBeenCalledExactlyOnceWith({
        ...f.context.repo,
        pull_number: f.pull.number,
      });
      expect(f.github.rest.git.getRef).not.toHaveBeenCalled();
      expect(f.github.rest.git.getCommit).not.toHaveBeenCalled();
      expect(f.github.rest.repos.createCommitStatus).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ sha: f.context.sha, state: outcome })
      );
    }
  );
  it.each([
    [
      'foreign queue',
      (f) => {
        f.rules[1].ruleset_source = 'other/repo';
      },
    ],
    [
      'different ruleset',
      (f) => {
        f.rules[1].ruleset_id = 44;
      },
    ],
    [
      'missing admission',
      (f) => {
        f.rules[0].parameters.required_status_checks.pop();
      },
    ],
    [
      'Actions admission issuer',
      (f) => {
        f.admissionAppId = 15368;
      },
    ],
    [
      'unconfigured issuer',
      (f) => {
        f.admissionAppId = 0;
      },
    ],
    [
      'spoofed issuer',
      (f) => {
        f.rules[0].parameters.required_status_checks[2].integration_id = 1;
      },
    ],
    [
      'wrong CI issuer',
      (f) => {
        f.rules[0].parameters.required_status_checks[0].integration_id = 1;
      },
    ],
    [
      'wrong preview issuer',
      (f) => {
        f.rules[0].parameters.required_status_checks[1].integration_id = 1;
      },
    ],
    [
      'HEADGREEN',
      (f) => {
        f.rules[1].parameters.grouping_strategy = 'HEADGREEN';
      },
    ],
    [
      'multiple builds',
      (f) => {
        f.rules[1].parameters.max_entries_to_build = 2;
      },
    ],
    [
      'multiple merges',
      (f) => {
        f.rules[1].parameters.max_entries_to_merge = 2;
      },
    ],
    [
      'multiple minimum entries',
      (f) => {
        f.rules[1].parameters.min_entries_to_merge = 2;
      },
    ],
    [
      'wrong merge method',
      (f) => {
        f.rules[1].parameters.merge_method = 'MERGE';
      },
    ],
    [
      'unresolved threads',
      (f) => {
        f.rules[2].parameters.required_review_thread_resolution = false;
      },
    ],
    [
      'separate thread policy',
      (f) => {
        f.rules[2].ruleset_id = 44;
      },
    ],
    [
      'coexisting strict policy',
      (f) => {
        f.rules.push({
          ...f.rules[0],
          ruleset_id: 45,
          parameters: { ...f.rules[0].parameters, strict_required_status_checks_policy: true },
        });
      },
    ],
  ])('retains strict exact-tree denial for %s', async (_, change) => {
    const f = queueFixture();
    change(f);
    await expect(reportDispatchedCi(f)).rejects.toThrow('Cannot attest');
    expect(f.github.rest.repos.createCommitStatus).not.toHaveBeenCalled();
  });
  it('retains strict different-tree denial with a configured admission issuer', async () => {
    const f = queueFixture();
    f.rules[0].parameters.strict_required_status_checks_policy = true;
    f.github.rest.git.getRef.mockResolvedValue({ data: { object: { sha: f.pull.base.sha } } });
    await expect(reportDispatchedCi(f)).rejects.toThrow('Cannot attest');
    expect(f.github.rest.git.getCommit).toHaveBeenCalledTimes(2);
    expect(f.github.rest.repos.createCommitStatus).not.toHaveBeenCalled();
  });
  it.each([
    [
      'API error',
      (f) => {
        f.github.paginate.mockRejectedValue(new Error('rules unavailable'));
      },
    ],
    [
      'malformed response',
      (f) => {
        f.rules = {};
      },
    ],
    [
      'malformed rule',
      (f) => {
        f.rules = [null];
      },
    ],
    [
      'invalid app',
      (f) => {
        f.admissionAppId = 'unknown';
      },
    ],
    [
      'ambiguous PR',
      (f) => {
        f.github.rest.pulls.list.mockResolvedValue({ data: [f.pull, f.pull] });
      },
    ],
    [
      'draft PR',
      (f) => {
        f.github.rest.pulls.list.mockResolvedValue({ data: [{ ...f.pull, draft: true }] });
      },
    ],
    [
      'invalid PR number',
      (f) => {
        f.github.rest.pulls.list.mockResolvedValue({ data: [{ ...f.pull, number: null }] });
      },
    ],
    [
      'foreign PR',
      (f) => {
        f.github.rest.pulls.list.mockResolvedValue({
          data: [{ ...f.pull, head: { ...f.pull.head, repo: { full_name: 'other/repo' } } }],
        });
      },
    ],
    [
      'raced head',
      (f) => {
        f.github.rest.pulls.get.mockResolvedValue({
          data: { ...f.pull, head: { ...f.pull.head, sha: 'e'.repeat(40) } },
        });
      },
    ],
    [
      'closed PR',
      (f) => {
        f.github.rest.pulls.get.mockResolvedValue({ data: { ...f.pull, state: 'closed' } });
      },
    ],
    [
      'raced base',
      (f) => {
        f.github.rest.pulls.get.mockResolvedValue({
          data: { ...f.pull, base: { ...f.pull.base, sha: 'e'.repeat(40) } },
        });
      },
    ],
  ])('fails closed before any status publication for %s', async (_, change) => {
    const f = queueFixture();
    change(f);
    await expect(reportDispatchedCi(f)).rejects.toThrow();
    expect(f.github.rest.repos.createCommitStatus).not.toHaveBeenCalled();
  });
});
describe('dispatched CI commit status', () => {
  it('reports the real aggregate success on the exact validated SHA with a run link', async () => {
    const f = fixture();
    await reportDispatchedCi(f);
    expect(f.github.rest.repos.createCommitStatus).toHaveBeenCalledExactlyOnceWith({
      owner: 'example',
      repo: 'repo',
      sha: f.context.sha,
      context: 'CI Result',
      state: 'success',
      description: 'All selected CI jobs passed.',
      target_url: 'https://github.com/example/repo/actions/runs/123',
    });
  });
  it.each(['failure', 'cancelled', 'skipped', '', undefined])(
    'fails closed for outcome %s',
    async (outcome) => {
      const f = fixture();
      await reportDispatchedCi({ ...f, outcome });
      expect(f.github.rest.repos.createCommitStatus).toHaveBeenCalledWith(
        expect.objectContaining({ sha: f.context.sha, state: 'failure' })
      );
    }
  );
  it.each(['push', 'pull_request', 'pull_request_target'])(
    'does not publish for %s',
    async (eventName) => {
      const f = fixture();
      f.context.eventName = eventName;
      await reportDispatchedCi(f);
      expect(f.github.rest.repos.createCommitStatus).not.toHaveBeenCalled();
    }
  );
  it('propagates publication failure so the CI Result job cannot pass', async () => {
    const f = fixture();
    f.github.rest.repos.createCommitStatus.mockRejectedValue(new Error('GitHub rejected status'));
    await expect(reportDispatchedCi(f)).rejects.toThrow('GitHub rejected status');
  });
});
describe('Crowdin merge tree attestation', () => {
  it('attests an unchanged Crowdin test merge with the identical validated tree', async () => {
    const f = localesFixture();
    await reportDispatchedCi(f);
    expect(f.github.rest.pulls.list).toHaveBeenCalledWith({
      ...f.context.repo,
      state: 'open',
      head: 'example:locales',
      base: 'main',
      per_page: 100,
    });
    expect(f.github.rest.git.getCommit).toHaveBeenCalledTimes(2);
    expect(f.github.rest.git.getRef).toHaveBeenCalledTimes(2);
    expect(f.github.rest.pulls.get).toHaveBeenCalledTimes(2);
    expect(f.github.rest.repos.createCommitStatus).toHaveBeenCalledTimes(2);
    expect(f.github.rest.repos.createCommitStatus).toHaveBeenLastCalledWith({
      ...f.context.repo,
      sha: f.pull.merge_commit_sha,
      context: 'CI Result',
      state: 'success',
      description: `Validated identical tree on locales head ${f.context.sha.slice(0, 12)}.`,
      target_url: 'https://github.com/example/repo/actions/runs/123',
    });
  });
  it('does not attest a merge with a different tree', async () => {
    const f = localesFixture();
    f.github.rest.git.getCommit
      .mockResolvedValueOnce({ data: { tree: { sha: 'd'.repeat(40) } } })
      .mockResolvedValueOnce({ data: { tree: { sha: 'e'.repeat(40) } } });
    await expect(reportDispatchedCi(f)).rejects.toThrow('Cannot attest');
    expect(f.github.rest.pulls.get).toHaveBeenCalledTimes(1);
    expect(f.github.rest.repos.createCommitStatus).not.toHaveBeenCalled();
  });
  it.each([
    ['head', (pull) => ({ ...pull, head: { ...pull.head, sha: 'e'.repeat(40) } })],
    ['base', (pull) => ({ ...pull, base: { ...pull.base, sha: 'e'.repeat(40) } })],
    ['merge commit', (pull) => ({ ...pull, merge_commit_sha: 'e'.repeat(40) })],
  ])('does not attest a changed %s after the tree comparison', async (_, change) => {
    const f = localesFixture();
    f.github.rest.pulls.get
      .mockResolvedValueOnce({ data: f.pull })
      .mockResolvedValueOnce({ data: change(f.pull) });
    await expect(reportDispatchedCi(f)).rejects.toThrow('Cannot attest');
    expect(f.github.rest.repos.createCommitStatus).not.toHaveBeenCalled();
  });
  it('fetches a test merge SHA missing from the pull request list', async () => {
    const f = localesFixture();
    f.github.rest.pulls.list.mockResolvedValue({
      data: [{ ...f.pull, merge_commit_sha: null }],
    });
    await reportDispatchedCi(f);
    expect(f.github.rest.repos.createCommitStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ sha: f.pull.merge_commit_sha, state: 'success' })
    );
  });
  it('retries while GitHub calculates the test merge SHA', async () => {
    vi.useFakeTimers();
    try {
      const f = localesFixture();
      f.github.rest.pulls.get
        .mockResolvedValueOnce({ data: { ...f.pull, merge_commit_sha: null } })
        .mockResolvedValue({ data: f.pull });
      const result = reportDispatchedCi(f);
      await vi.runAllTimersAsync();
      await result;
      expect(f.github.rest.pulls.get).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
  it('fails closed when the test merge SHA never becomes available', async () => {
    vi.useFakeTimers();
    try {
      const f = localesFixture();
      f.github.rest.pulls.get.mockResolvedValue({ data: { ...f.pull, merge_commit_sha: null } });
      const result = expect(reportDispatchedCi(f)).rejects.toThrow('Cannot attest');
      await vi.runAllTimersAsync();
      await result;
      expect(f.github.rest.pulls.get).toHaveBeenCalledTimes(12);
      expect(f.github.rest.repos.createCommitStatus).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
describe('Crowdin merge attestation guards', () => {
  it('does not attest a pull request whose captured base is behind main', async () => {
    const f = localesFixture();
    f.github.rest.git.getRef.mockResolvedValue({ data: { object: { sha: 'e'.repeat(40) } } });
    await expect(reportDispatchedCi(f)).rejects.toThrow('Cannot attest');
    expect(f.github.rest.git.getCommit).not.toHaveBeenCalled();
    expect(f.github.rest.repos.createCommitStatus).not.toHaveBeenCalled();
  });
  it('does not attest when main advances after the tree comparison', async () => {
    const f = localesFixture();
    f.github.rest.git.getRef
      .mockResolvedValueOnce({ data: { object: { sha: f.pull.base.sha } } })
      .mockResolvedValueOnce({ data: { object: { sha: 'e'.repeat(40) } } });
    await expect(reportDispatchedCi(f)).rejects.toThrow('Cannot attest');
    expect(f.github.rest.repos.createCommitStatus).not.toHaveBeenCalled();
  });
  it.each([
    ['draft', (pull) => ({ ...pull, draft: true })],
    [
      'foreign repository',
      (pull) => ({
        ...pull,
        head: { ...pull.head, repo: { full_name: 'other/repo' } },
      }),
    ],
    ['different head', (pull) => ({ ...pull, head: { ...pull.head, sha: 'e'.repeat(40) } })],
  ])('does not attest a %s Crowdin pull request', async (_, change) => {
    const f = localesFixture();
    f.github.rest.pulls.list.mockResolvedValue({ data: [change(f.pull)] });
    await expect(reportDispatchedCi(f)).rejects.toThrow('Cannot attest');
    expect(f.github.rest.git.getCommit).not.toHaveBeenCalled();
    expect(f.github.rest.repos.createCommitStatus).not.toHaveBeenCalled();
  });
  it('does not attest ambiguous Crowdin pull requests', async () => {
    const f = localesFixture();
    f.github.rest.pulls.list.mockResolvedValue({ data: [f.pull, f.pull] });
    await expect(reportDispatchedCi(f)).rejects.toThrow('Cannot attest');
    expect(f.github.rest.repos.createCommitStatus).not.toHaveBeenCalled();
  });
  it('replaces a passing test-merge status when a later dispatch fails', async () => {
    const failed = localesFixture();
    await reportDispatchedCi(failed);
    await reportDispatchedCi({ ...failed, outcome: 'failure' });
    expect(failed.github.rest.repos.createCommitStatus).toHaveBeenCalledTimes(4);
    expect(failed.github.rest.repos.createCommitStatus).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ sha: failed.context.sha, state: 'failure' })
    );
    expect(failed.github.rest.repos.createCommitStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ sha: failed.pull.merge_commit_sha, state: 'failure' })
    );
  });
  it('does not look up a pull request for non-Crowdin dispatches', async () => {
    const other = localesFixture();
    other.context.ref = 'refs/heads/wip/release-1';
    await reportDispatchedCi(other);
    expect(other.github.rest.pulls.list).not.toHaveBeenCalled();
  });
  it('propagates a merge-attestation publication failure', async () => {
    const f = localesFixture();
    f.github.rest.repos.createCommitStatus
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('GitHub rejected merge status'));
    await expect(reportDispatchedCi(f)).rejects.toThrow('GitHub rejected merge status');
  });
});
