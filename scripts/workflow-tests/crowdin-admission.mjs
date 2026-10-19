import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { crowdinEligibility } from '../ci/review-admission-crowdin.mjs';
import { admissionDecision, crowdinCandidate } from '../ci/review-admission-policy.mjs';
import { jobBlock, workflowStep } from './helpers/workflow-blocks.mjs';
const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const source = 'c'.repeat(40);
const blob = 'd'.repeat(40);
const repository = { full_name: 'tarkovtracker-org/TarkovTracker', id: 1098874862 };
function archive(receipt) {
  return execFileSync(
    'python3',
    [
      '-c',
      'import io,json,sys,zipfile; data=json.load(sys.stdin); b=io.BytesIO(); z=zipfile.ZipFile(b,"w"); z.writestr(data["head"]+".json",json.dumps(data["receipt"])); z.close(); sys.stdout.buffer.write(b.getvalue())',
    ],
    { input: JSON.stringify({ head, receipt }) }
  );
}
function fixture() {
  const pr = {
    number: 1314,
    state: 'open',
    draft: false,
    changed_files: 1,
    title: 'anything',
    labels: [],
    user: { id: 41898282, type: 'Bot', login: 'github-actions[bot]' },
    head: { ref: 'locales', sha: head, repo: repository },
    base: { ref: 'main', sha: base, repo: repository },
  };
  const files = [
    {
      filename: 'app/locales/fr.json',
      status: 'modified',
      sha: blob,
      changes: 2,
      patch: '-old\n+new',
    },
  ];
  const receipt = {
    schema: 1,
    repository: repository.full_name,
    number: pr.number,
    headSha: head,
    runId: 77,
    runAttempt: 2,
    validation: 'format,i18n,systems',
  };
  const run = {
    id: 77,
    run_attempt: 2,
    path: '.github/workflows/crowdin.yml',
    head_branch: 'main',
    repository,
    head_repository: repository,
    event: 'schedule',
    status: 'in_progress',
    conclusion: null,
    head_sha: source,
  };
  const artifact = {
    id: 88,
    name: `crowdin-validated-${pr.number}-${head}`,
    expired: false,
    size_in_bytes: 900,
    workflow_run: { id: run.id },
  };
  const f = {
    pr,
    files,
    receipt,
    run,
    artifacts: [artifact],
    comparison: structuredClone(files),
    tree: [{ path: files[0].filename, type: 'blob', mode: '100644', sha: blob }],
    truncated: false,
    sourceStatus: 'ahead',
    calls: [],
  };
  f.github = {
    paginate: async (endpoint, params) => {
      f.calls.push({ endpoint, params });
      assert.equal(endpoint, 'GET /repos/{owner}/{repo}/actions/artifacts');
      assert.equal(params.name, `crowdin-validated-${pr.number}-${pr.head.sha}`);
      return f.artifacts;
    },
    rest: {
      repos: {
        compareCommits: async (params) => {
          f.calls.push({ endpoint: 'compare', params });
          if (params.head === 'main') {
            assert.equal(params.base, source);
            return { data: { status: f.sourceStatus } };
          }
          assert.equal(params.base, pr.base.sha);
          assert.equal(params.head, pr.head.sha);
          return { data: { files: f.comparison } };
        },
      },
      git: {
        getTree: async (params) => {
          f.calls.push({ endpoint: 'tree', params });
          assert.equal(params.tree_sha, pr.head.sha);
          return { data: { truncated: f.truncated, tree: f.tree } };
        },
      },
      actions: {
        getWorkflowRun: async ({ run_id }) => {
          assert.equal(run_id, 77);
          return { data: f.run };
        },
        downloadArtifact: async ({ artifact_id }) => {
          assert.equal(artifact_id, 88);
          return { data: archive(f.receipt) };
        },
      },
    },
  };
  return f;
}
function input(f, proof) {
  return {
    pr: f.pr,
    files: f.files,
    crowdinSafe: proof,
    reviews: [],
    comments: [],
    checks: [],
    threads: [],
    trusted: new Set(),
  };
}
test('only validated trusted Crowdin translations receive an explicitly labeled review exemption', async () => {
  const f = fixture();
  const proof = await crowdinEligibility(f.github, f.pr, f.files);
  assert.deepEqual(proof, {
    provider: 'crowdin-policy',
    kind: 'review-exempt',
    commit: head,
    runId: 77,
    runAttempt: 2,
    artifactId: 88,
    workflowSourceSha: source,
  });
  const decision = admissionDecision(input(f, proof));
  assert.equal(decision.approved, true);
  assert.equal(decision.risk, 'low');
  assert.equal(decision.review.kind, 'review-exempt');
  assert.equal(f.calls.filter((call) => call.endpoint === 'compare').length, 2);
});
test('spoofed Crowdin title/labels/author or repository identity cannot select the exemption', async () => {
  const changes = [
    (f) => {
      f.pr.user = { id: 9, type: 'User', login: 'github-actions[bot]' };
    },
    (f) => {
      f.pr.user.id = 9;
    },
    (f) => {
      f.pr.user.type = 'User';
    },
    (f) => {
      f.pr.user.login = 'crowdin[bot]';
    },
    (f) => {
      f.pr.head.repo = { ...repository, id: 9 };
    },
    (f) => {
      f.pr.base.repo = { ...repository, full_name: 'other/repo' };
    },
    (f) => {
      f.pr.head.ref = 'other';
    },
    (f) => {
      f.pr.base.ref = 'develop';
    },
    (f) => {
      f.pr.draft = true;
    },
  ];
  for (const change of changes) {
    const f = fixture();
    f.pr.title = 'chore(i18n): update translations from Crowdin';
    f.pr.labels = [{ name: 'crowdin' }];
    change(f);
    assert.equal(await crowdinEligibility(f.github, f.pr, f.files), null);
    assert.equal(f.calls.length, 0);
    assert.throws(() => admissionDecision(input(f, null)));
  }
});
test('mixed, renamed, deleted, English, nested or incomplete inventories require normal review', async () => {
  for (const path of [
    '.github/workflows/ci.yml',
    'app/locales/en.json',
    'app/locales/nested/fr.json',
    'app/components/Task.vue',
  ]) {
    const f = fixture();
    f.files.push({ ...f.files[0], filename: path });
    f.pr.changed_files = 2;
    assert.equal(await crowdinEligibility(f.github, f.pr, f.files), null);
    assert.throws(() => admissionDecision(input(f, null)), /independent review/);
  }
  for (const change of [
    (f) => {
      f.pr.changed_files = 2;
    },
    (f) => {
      f.files[0].status = 'removed';
    },
    (f) => {
      f.files[0].previous_filename = 'scripts/evil.mjs';
    },
    (f) => {
      f.files.push({ ...f.files[0] });
      f.pr.changed_files = 2;
    },
  ]) {
    const f = fixture();
    change(f);
    assert.equal(await crowdinEligibility(f.github, f.pr, f.files), null);
  }
});
test('immutable comparison and regular-blob tree proof reject truncated, stale or executable scopes', async () => {
  for (const change of [
    (f) => {
      f.comparison = [];
    },
    (f) => {
      f.comparison.push({ ...f.files[0], filename: 'scripts/evil.mjs' });
    },
    (f) => {
      f.comparison[0].sha = base;
    },
    (f) => {
      f.truncated = true;
    },
    (f) => {
      f.tree[0].mode = '100755';
    },
    (f) => {
      f.tree[0].mode = '120000';
    },
    (f) => {
      f.tree[0].type = 'tree';
    },
    (f) => {
      f.tree[0].sha = base;
    },
    (f) => {
      f.tree = [];
    },
  ]) {
    const f = fixture();
    change(f);
    assert.equal(await crowdinEligibility(f.github, f.pr, f.files), null);
  }
});
test('only current-attempt head-owned validated main Crowdin provenance can exempt review', async () => {
  for (const change of [
    (f) => {
      f.artifacts = [];
    },
    (f) => {
      f.artifacts[0].expired = true;
    },
    (f) => {
      f.artifacts[0].size_in_bytes = 100001;
    },
    (f) => {
      f.run.path = '.github/workflows/ci.yml';
    },
    (f) => {
      f.run.head_branch = 'locales';
    },
    (f) => {
      f.run.event = 'pull_request';
    },
    (f) => {
      f.run.repository = { ...repository, id: 9 };
    },
    (f) => {
      f.run.head_repository = { ...repository, full_name: 'other/repo' };
    },
    (f) => {
      f.run.status = 'completed';
      f.run.conclusion = 'failure';
    },
    (f) => {
      f.receipt.headSha = base;
    },
    (f) => {
      f.receipt.runAttempt = 1;
    },
    (f) => {
      f.receipt.runId = 9;
    },
    (f) => {
      f.receipt.number = 9;
    },
    (f) => {
      f.receipt.validation = 'format';
    },
  ]) {
    const f = fixture();
    change(f);
    assert.equal(await crowdinEligibility(f.github, f.pr, f.files), null);
  }
  const f = fixture();
  f.sourceStatus = 'diverged';
  await assert.rejects(crowdinEligibility(f.github, f.pr, f.files), /trusted main history/);
});
test('stale proof or scope changes cannot reuse an earlier Crowdin exemption', async () => {
  const f = fixture();
  const proof = await crowdinEligibility(f.github, f.pr, f.files);
  f.pr.head.sha = base;
  assert.throws(() => admissionDecision(input(f, proof)), /Trusted Crowdin validation/);
  f.pr.head.sha = head;
  f.files.push({ ...f.files[0], filename: '.github/workflows/ci.yml' });
  f.pr.changed_files = 2;
  assert.throws(() => admissionDecision(input(f, proof)), /independent review/);
});
test('Crowdin policy keeps unresolved review threads, changes requested and substantive findings', async () => {
  const f = fixture();
  const proof = await crowdinEligibility(f.github, f.pr, f.files);
  const pending = input(f, proof);
  pending.threads = [{ isResolved: false, isOutdated: false }];
  assert.throws(() => admissionDecision(pending), /Unresolved review findings/);
  const requested = input(f, proof);
  requested.reviews = [{ id: 4, state: 'CHANGES_REQUESTED', user: { id: 7 } }];
  assert.throws(() => admissionDecision(requested), /Changes requested/);
  const finding = input(f, proof);
  finding.reviews = [
    {
      id: 5,
      state: 'COMMENTED',
      commit_id: head,
      user: { id: 191113872, type: 'Bot' },
      submitted_at: '2026-10-19T00:00:00Z',
      body: '**1 issue found**',
    },
  ];
  assert.throws(() => admissionDecision(finding), /Substantive provider findings/);
  const comment = input(f, proof);
  comment.comments = [
    {
      id: 6,
      node_id: 'I_6',
      user: { id: 136622811, type: 'Bot', login: 'coderabbitai[bot]' },
      created_at: '2026-10-19T00:00:00Z',
      updated_at: '2026-10-19T00:00:00Z',
      lastEditedAt: null,
      editor: null,
      body: `<!-- final_review_risk_coverage:{"sourceCommitId":"${head}","coveredCommitId":"${head}","kind":"reviewed"} -->\nOutside diff range comments: 1`,
    },
  ];
  assert.throws(() => admissionDecision(comment), /Substantive provider findings/);
});
function assertProvenanceWorkflow(workflow) {
  const sync = jobBlock(workflow, 'sync');
  const validate = workflowStep(sync, 'Validate translations');
  const record = workflowStep(sync, 'Record validated Crowdin provenance');
  const upload = workflowStep(sync, 'Upload validated Crowdin provenance');
  const merge = workflowStep(sync, 'Merge validated translations');
  assert.ok(sync.indexOf(validate) < sync.indexOf(record));
  assert.ok(sync.indexOf(record) < sync.indexOf(upload));
  assert.ok(sync.indexOf(upload) < sync.indexOf(merge));
  for (const command of ['format:check', 'i18n:check', 'systems:check'])
    assert.ok(validate.includes(`pnpm run ${command}`));
  assert.match(upload, /name: crowdin-validated-/);
}
test('Crowdin provenance follows the actual token-free validation step, never unrelated decoys', () => {
  const workflow = readFileSync('.github/workflows/crowdin.yml', 'utf8');
  assertProvenanceWorkflow(workflow);
  const removed = workflow.replace('pnpm run i18n:check', 'echo missing validation');
  assert.throws(() =>
    assertProvenanceWorkflow(removed + '\n  decoy:\n    steps:\n      - run: pnpm run i18n:check\n')
  );
});
test('oversized locale inventories and duplicate immutable tree entries cannot exempt review', async () => {
  const large = fixture();
  large.files = Array.from({ length: 301 }, (_, index) => ({
    ...large.files[0],
    filename: `app/locales/x${index}.json`,
  }));
  large.pr.changed_files = large.files.length;
  assert.equal(await crowdinEligibility(large.github, large.pr, large.files), null);
  assert.equal(large.calls.length, 0);
  const duplicate = fixture();
  duplicate.tree.push({ ...duplicate.tree[0] });
  assert.equal(await crowdinEligibility(duplicate.github, duplicate.pr, duplicate.files), null);
});
test('unvalidated Crowdin heads explain the missing provenance and retain the normal human-review route', () => {
  const f = fixture();
  assert.throws(
    () => admissionDecision(input(f, null)),
    /Trusted Crowdin validation.*rerun Crowdin Sync on main/
  );
  const normal = input(f, null);
  normal.trusted = new Set(['maintainer']);
  normal.reviews = [
    {
      id: 19,
      state: 'APPROVED',
      commit_id: head,
      user: { id: 7, login: 'maintainer', type: 'User' },
    },
  ];
  assert.equal(admissionDecision(normal).review.provider, 'human');
});
test('Crowdin retains the existing bounded trusted merge path and permission boundary', () => {
  const workflow = readFileSync('.github/workflows/crowdin.yml', 'utf8');
  const gate = readFileSync('scripts/ci/crowdin-pr.sh', 'utf8');
  const shared = readFileSync('scripts/ci/github-ci-gate.sh', 'utf8');
  assert.match(workflow, /run: bash "\$RUNNER_TEMP\/crowdin-pr.sh" merge/);
  assert.doesNotMatch(workflow, /workflow_run:|handoff/);
  assert.match(shared, /attempt <= 120/);
  assert.match(shared, /inputs\[pull_request\]=\$number/);
  assert.match(shared, /"\$sha" "\$number" "\$admission_run"/);
  assert.match(gate, /wait_for_review_admission "\$PR_NUMBER" "\$HEAD_SHA"/);
  assert.match(gate, /enqueue_reviewed_pr "\$PR_NUMBER" "\$HEAD_SHA"/);
});
test('only the supported non-English locale inventory can use the exemption', async () => {
  const codes = [...readFileSync('app/utils/locales.ts', 'utf8').matchAll(/'([a-z]{2})'/g)]
    .map((match) => match[1])
    .filter((code) => code !== 'en');
  assert.equal(codes.length, 12);
  for (const code of codes) {
    const f = fixture();
    f.files[0].filename = `app/locales/${code}.json`;
    assert.equal(crowdinCandidate(f.pr, f.files), true, code);
  }
  for (const code of ['en', 'en-GB', 'en_US', 'EN', 'xx', 'fr-extra']) {
    const f = fixture();
    f.files[0].filename = `app/locales/${code}.json`;
    assert.equal(await crowdinEligibility(f.github, f.pr, f.files), null, code);
  }
});
test('dismissed or superseded findings clear while findings from a second provider still block', async () => {
  const f = fixture();
  const proof = await crowdinEligibility(f.github, f.pr, f.files);
  const issue = {
    id: 5,
    state: 'COMMENTED',
    commit_id: head,
    submitted_at: '2026-10-19T00:00:00Z',
    user: { id: 191113872, type: 'Bot' },
    body: '**1 issue found**',
  };
  const dismissed = input(f, proof);
  dismissed.reviews = [{ ...issue, state: 'DISMISSED' }];
  assert.equal(admissionDecision(dismissed).approved, true);
  const clean = {
    ...issue,
    id: 6,
    body: '<!-- cubic:review-summary:start -->**0 issues found**<!-- cubic:review-summary:end -->',
  };
  const refreshed = input(f, proof);
  refreshed.reviews = [issue, clean];
  assert.equal(admissionDecision(refreshed).approved, true);
  refreshed.reviews.push({
    ...issue,
    id: 7,
    user: { id: 136622811, type: 'Bot' },
    body: '**Actionable comments posted: 1**',
  });
  assert.throws(() => admissionDecision(refreshed), /Substantive provider findings/);
});
test('skipped or unfinished optional reviews do not reinstate a review requirement for verified Crowdin', async () => {
  const f = fixture();
  const proof = await crowdinEligibility(f.github, f.pr, f.files);
  for (const state of ['Review skipped', 'Review in progress', 'Rate limit exceeded']) {
    const candidate = input(f, proof);
    candidate.comments = [
      {
        id: 6,
        node_id: 'I_6',
        user: { id: 136622811, type: 'Bot', login: 'coderabbitai[bot]' },
        created_at: '2026-10-19T00:00:00Z',
        updated_at: '2026-10-19T00:00:00Z',
        lastEditedAt: null,
        editor: null,
        body: `<!-- final_review_risk_coverage:{"sourceCommitId":"${head}","coveredCommitId":"${head}","kind":"reviewed"} -->\n${state}`,
      },
    ];
    assert.equal(admissionDecision(candidate).review.kind, 'review-exempt');
  }
});
test('complete inventory means all changed files, not every supported locale on every PR', () => {
  const f = fixture();
  const codes = ['cs', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pl', 'pt', 'ru', 'uk', 'zh'];
  f.files = codes.map((code) => ({ ...f.files[0], filename: `app/locales/${code}.json` }));
  f.pr.changed_files = 12;
  assert.equal(crowdinCandidate(f.pr, f.files), true);
  assert.equal(crowdinCandidate(f.pr, f.files.slice(1)), false);
  f.pr.changed_files = 11;
  assert.equal(crowdinCandidate(f.pr, f.files.slice(1)), true);
});
test('arbitrary later provider comments cannot erase an unresolved exact-head finding', async () => {
  const f = fixture();
  const proof = await crowdinEligibility(f.github, f.pr, f.files);
  const finding = {
    id: 5,
    state: 'COMMENTED',
    commit_id: head,
    submitted_at: '2026-10-19T00:00:00Z',
    user: { id: 191113872, type: 'Bot' },
    body: '**1 issue found**',
  };
  for (const body of [
    'Acknowledged',
    'Review skipped',
    '<!-- cubic:review-summary:start -->Review incomplete<!-- cubic:review-summary:end -->',
  ]) {
    const candidate = input(f, proof);
    candidate.reviews = [finding, { ...finding, id: 6, body }];
    assert.throws(() => admissionDecision(candidate), /Substantive provider findings/);
  }
});
