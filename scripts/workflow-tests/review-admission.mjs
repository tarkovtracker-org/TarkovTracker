import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, verify } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fixture as automationFixture } from './helpers/automation-fixture.mjs';
import { jobBlock, permissionsBlock, workflowStep } from './helpers/workflow-blocks.mjs';
const { activeQueueGroup, admissionRun, reviewThreads, queueIdentity, validateAdmissionReceipt } =
  await import('../ci/review-admission-api.mjs');
const { readAdmissionArchive, requireReviewAdmission } =
  await import('../ci/review-admission-binding.mjs');
const { safeDependencyManifests, dependencyEligibility } =
  await import('../ci/review-admission-dependencies.mjs');
const { releaseAssetsEligibility, safeReleaseManifest, requireReleaseSource } =
  await import('../ci/review-admission-release.mjs');
const { readCodeRabbitComments } = await import('../ci/review-admission-coderabbit.mjs');
const { AdmissionPending, admissionDecision, classifyRisk } =
  await import('../ci/review-admission-policy.mjs');
const { createReviewPublisher, publisherConfig, requireReceiptIssuer } =
  await import('../ci/review-admission-issuer.mjs');
const { safeLockfileChange } = await import('../ci/review-admission-lock.mjs');
const {
  evaluateAdmission,
  publishReviewAdmission,
  publishReviewScope,
  runReviewAdmission,
  runReviewAdmissionStep,
  relevantComment,
  filterAdmission,
} = await import('../ci/review-admission.mjs');
const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const queued = 'c'.repeat(40);
const repo = { owner: 'example', repo: 'repo' };
const queueRulesRoute = 'GET /repos/{owner}/{repo}/rules/branches/{branch}';
function queueRules() {
  return [
    {
      type: 'merge_queue',
      ruleset_id: 43,
      ruleset_source_type: 'Repository',
      ruleset_source: 'example/repo',
      parameters: {
        max_entries_to_build: 1,
        max_entries_to_merge: 1,
        min_entries_to_merge: 1,
        grouping_strategy: 'ALLGREEN',
        merge_method: 'SQUASH',
        check_response_timeout_minutes: 60,
      },
    },
  ];
}
function fixture() {
  return {
    pr: {
      number: 1,
      changed_files: 1,
      state: 'open',
      draft: false,
      user: { id: 3 },
      head: { sha: head, ref: 'fix', repo: { full_name: 'example/repo' } },
      base: { sha: base, ref: 'main', repo: { full_name: 'example/repo' } },
    },
    files: [{ filename: 'app/components/TaskButton.vue', changes: 2, patch: '-old\n+new' }],
    reviews: [
      {
        id: 10,
        user: { id: 191113872, type: 'Bot' },
        commit_id: head,
        state: 'COMMENTED',
        submitted_at: '2026-10-14T00:00:00Z',
        body: '<!-- cubic:review-summary:start -->**0 issues found**<!-- cubic:review-summary:end -->',
      },
    ],
    threads: [],
    comments: [],
    checks: [],
    trusted: new Set(['maintainer']),
    [queueRulesRoute]: queueRules(),
  };
}
function human(state = 'APPROVED', change = {}) {
  return {
    id: 20,
    state,
    commit_id: head,
    user: { id: 7, login: 'maintainer', type: 'User' },
    ...change,
  };
}
// Summary emitted by Cubic on PR #1230's exact head (review 5527226774).
const cubicCleanSummary = `<!-- cubic:review-summary:start -->
<!-- cubic:review-summary:confidence-score:5/5 -->
**No issues found** across 1 file

Confidence score: **5/5**
- Automated review surfaced no issues in the provided summaries.
- No files require special attention.
<!-- cubic:review-summary:end -->`;
test('Cubic admission requires one clean overall summary instead of quoted or conflicting results', () => {
  const f = fixture();
  for (const result of [
    '**No issues found** across 1 file',
    '**0 issues found**',
    '**0 issues found across 1 file (changes from recent commits).**',
    '**All reported issues were addressed** across 3 files',
  ]) {
    f.reviews[0].body = cubicCleanSummary.replace('**No issues found** across 1 file', result);
    assert.equal(admissionDecision(f).approved, true, result);
  }
  for (const body of [
    cubicCleanSummary + '\n**1 issue found**',
    cubicCleanSummary + '\nReview skipped',
    cubicCleanSummary + '\n> **No issues found**',
    cubicCleanSummary.replace('No files require special attention.', 'Review skipped'),
    cubicCleanSummary.replace('No files require special attention.', '> **No issues found**'),
    cubicCleanSummary.replace('**No issues found**', '**1 issue found**') + '\n**No issues found**',
    cubicCleanSummary.replace('**No issues found**', '**1 issue found**') +
      '\n' +
      cubicCleanSummary,
    cubicCleanSummary.replace(
      '**No issues found** across 1 file',
      '**No issues found** for file A\n**1 issue found** for file B'
    ),
    cubicCleanSummary.replace(
      'No files require special attention.',
      '1 issue found in another file.'
    ),
    cubicCleanSummary.replace(
      '**No issues found**',
      'Review skipped; previously **No issues found**'
    ),
  ]) {
    f.reviews[0].body = body;
    assert.throws(() => admissionDecision(f), /Completed exact-head independent review/, body);
  }
});
test('live Cubic clean summary admits the reviewed head while preserving admission guards', () => {
  const f = fixture();
  f.reviews[0].body = cubicCleanSummary;
  f.checks = [{ app: { id: 1082092 }, head_sha: head, status: 'completed', conclusion: 'success' }];
  assert.equal(admissionDecision(f).review.provider, 'Cubic');
  for (const change of [
    { commit_id: base },
    { user: { id: 55, type: 'Bot' } },
    { state: 'PENDING' },
    { submitted_at: null },
    { body: cubicCleanSummary.replace('**No issues found**', '**1 issue found**') },
    { body: cubicCleanSummary.replace('**No issues found**', 'Review skipped') },
  ]) {
    assert.throws(() => admissionDecision({ ...f, reviews: [{ ...f.reviews[0], ...change }] }));
  }
  f.threads = [{ isResolved: false, isOutdated: false }];
  assert.throws(() => admissionDecision(f), /Unresolved review findings/);
  f.threads = [];
  f.files[0].filename = '.github/workflows/ci.yml';
  assert.throws(() => admissionDecision(f), /exact-head collaborator approval/);
});
test('only completed authenticated exact-head provider review admits ordinary fixes', () => {
  assert.equal(admissionDecision(fixture()).risk, 'low');
  for (const change of [
    { commit_id: base },
    { body: '' },
    { body: '<!-- cubic:review-summary:start -->Review skipped<!-- cubic:review-summary:end -->' },
    { state: 'PENDING' },
    { submitted_at: null },
    { user: { id: 55, type: 'Bot' } },
  ]) {
    const f = fixture();
    f.reviews = [{ ...f.reviews[0], ...change }];
    assert.throws(() => admissionDecision(f));
  }
  const f = fixture();
  f.reviews = [];
  f.checks = [{ status: 'completed', conclusion: 'success' }];
  assert.throws(() => admissionDecision(f));
});
test('provider check app identity and exact-head completion cannot be substituted', () => {
  for (const change of [
    { head_sha: base },
    { status: 'in_progress' },
    { conclusion: 'failure' },
    { conclusion: 'skipped' },
  ]) {
    const f = fixture();
    f.checks = [
      {
        app: { id: 1082092 },
        head_sha: head,
        status: 'completed',
        conclusion: 'success',
        ...change,
      },
    ];
    assert.throws(() => admissionDecision(f));
  }
});
test('CodeRabbit empty inline replies and unresolved outside findings are not completion', () => {
  const f = fixture();
  f.reviews[0].user.id = 136622811;
  f.reviews[0].body = '**Actionable comments posted: 1**';
  assert.throws(() => admissionDecision(f));
  f.reviews[0].body = '**Actionable comments posted: 0**';
  assert.equal(admissionDecision(f).review.provider, 'CodeRabbit');
});
test('unresolved current threads and outstanding changes requested always block', () => {
  const f = fixture();
  f.threads = [{ isResolved: false, isOutdated: false }];
  assert.throws(() => admissionDecision(f));
  f.threads[0].isOutdated = true;
  assert.equal(admissionDecision(f).approved, true);
  f.reviews.push(human('CHANGES_REQUESTED', { commit_id: base }));
  assert.throws(() => admissionDecision(f));
  f.reviews.push(human('DISMISSED', { id: 21 }));
  assert.equal(admissionDecision(f).approved, true);
});
test('approval on another revision or by author/non-collaborator cannot admit', () => {
  for (const change of [
    { commit_id: base },
    { user: { id: 3, login: 'maintainer', type: 'User' } },
    { user: { id: 99, login: 'stranger', type: 'User' } },
  ]) {
    const f = fixture();
    f.reviews = [human('APPROVED', change)];
    assert.throws(() => admissionDecision(f));
  }
});
test('sensitive paths require human head-bound approval plus independent review', () => {
  for (const filename of [
    'supabase/migrations/new.sql',
    'app/plugins/supabase.client.ts',
    'app/stores/progressState.ts',
    'app/pages/account.vue',
    '.github/workflows/ci.yml',
    'scripts/ops/prod-db.mjs',
    'nuxt.config.ts',
    'workers/contract-tests/client.ts',
    'CLAUDE.md',
    'app/features/CLAUDE.md',
    'code_review.md',
    'unknown/file.js',
  ]) {
    const f = fixture();
    f.files[0].filename = filename;
    assert.throws(() => admissionDecision(f), filename);
    f.reviews.push(human());
    assert.equal(admissionDecision(f).risk, 'sensitive', filename);
  }
});
test('renamed paths, large patches and hidden credential operations remain sensitive', () => {
  for (const change of [
    { previous_filename: 'app/pages/account.vue' },
    { changes: 501 },
    { patch: '+localStorage.setItem()' },
    { patch: '+fetch(url)' },
    { filename: 'app/composables/useThing.ts', patch: '+const t = process.env.TOKEN' },
    { filename: 'app/stores/useProgressStore.ts' },
    { filename: 'app/utils/guard.ts', patch: '-if (!session) throw new Error()' },
    { patch: "+navigator.sendBeacon('https://example.invalid', body)" },
    { patch: '+new WebSocket(url)' },
    { filename: 'app/server/api/thing.get.ts' },
    { filename: 'app/plugins/thing.client.ts' },
  ]) {
    const f = fixture();
    Object.assign(f.files[0], change);
    assert.throws(() => admissionDecision(f), JSON.stringify(change));
  }
});
test('network context, callable references and mixed helpers keep sensitive approval', () => {
  for (const change of [
    { patch: ' fetch(\n-  oldEndpoint,\n+  newEndpoint,\n   options\n )' },
    { patch: '+fetch (endpoint)' },
    { patch: '+fetch?.(endpoint)' },
    { patch: '+fetch<Response>(endpoint)' },
    { patch: '+tarkovApiFetch<FetchResponse<T>>(query)' },
    { patch: '+const send = fetch;\n+send(endpoint)' },
    { patch: '+send("https://example.invalid")' },
    { patch: ' if (!session) return;\n-apply(oldValue);\n+apply(newValue);' },
    { patch: '+++ session.retries;' },
    { patch: '--- session.retries;' },
    { filename: 'app/utils/profileVisibility.ts', patch: "-.eq('user_id', userId)\n+.limit(100)" },
    { filename: 'app/composables/useAppInitialization.ts', patch: '-if (staleUser) return;' },
    { filename: 'app/stores/useUiStore.ts', patch: '+const state = ref()' },
  ]) {
    const f = fixture();
    Object.assign(f.files[0], change);
    assert.equal(classifyRisk(f.files).sensitive, true, JSON.stringify(change));
    assert.throws(() => admissionDecision(f), JSON.stringify(change));
    f.reviews.push(human());
    assert.equal(admissionDecision(f).risk, 'sensitive', JSON.stringify(change));
  }
});
test('ordinary UI code and review-only volume stay low risk', () => {
  for (const files of [
    [{ filename: 'app/components/StatusTone.vue', changes: 15, patch: '-a\n+b' }],
    [{ filename: 'DESIGN.md', changes: 5, patch: '+See https://example.com' }],
    [
      {
        filename: 'app/features/tasks/TaskCard.vue',
        changes: 2,
        patch: ' const existingStyle = "green"\n+const x = 1',
      },
    ],
    [
      { filename: 'app/components/ui/StatusTabBar.vue', changes: 300, patch: '+<div />' },
      { filename: 'app/components/ui/__tests__/helpers.ts', changes: 400, patch: '+const x = 1' },
    ],
    [
      { filename: 'app/components/ui/StatusTabBar.vue', changes: 300, patch: '+<div />' },
      {
        filename: 'app/components/ui/__tests__/StatusTabBar.test.ts',
        changes: 400,
        patch: '+it()',
      },
    ],
  ]) {
    assert.equal(classifyRisk(files).sensitive, false, files[0].filename);
  }
  assert.equal(
    classifyRisk([{ filename: 'app/components/A.vue', changes: 501, patch: '+<div />' }]).sensitive,
    true
  );
  assert.equal(classifyRisk([{ filename: 'AGENTS.md', changes: 1, patch: '+x' }]).sensitive, true);
});
test('explicit sensitive command authenticates permission and immutable SHA', () => {
  const f = fixture();
  f.files[0].filename = 'supabase/migrations/new.sql';
  const command = {
    id: 22,
    body: `/approve-sensitive ${head}`,
    user: { id: 7, login: 'maintainer', type: 'User' },
  };
  f.comments = [command];
  assert.equal(admissionDecision(f).sensitiveApprovalId, 22);
  for (const change of [
    { body: `/approve-sensitive ${base}` },
    { user: { type: 'Bot', login: 'maintainer' } },
    { body: `/approve-sensitive ${head}\n` },
    { user: { type: 'User', login: 'stranger' } },
  ]) {
    f.comments = [{ ...command, ...change }];
    assert.throws(() => admissionDecision(f));
  }
  f.comments = [command];
  f.reviews = [];
  assert.throws(() => admissionDecision(f));
});
test('draft/closed/no-files candidates fail closed', () => {
  for (const change of [{ draft: true }, { state: 'closed' }, { head: { sha: 'short' } }]) {
    const f = fixture();
    Object.assign(f.pr, change);
    assert.throws(() => admissionDecision(f));
  }
  assert.throws(() => classifyRisk([]));
});
test('dependencies permit exact patch/minor only without new packages/scripts or auth clients', () => {
  const before = {
    scripts: { test: 'test' },
    dependencies: { vue: '3.5.1', '@supabase/supabase-js': '2.0.0' },
    devDependencies: { vitest: '4.0.0' },
  };
  const after = structuredClone(before);
  after.dependencies.vue = '3.6.0';
  assert.equal(safeDependencyManifests(before, after), true);
  for (const version of [
    '4.0.0',
    '^3.6.0',
    'https://bad',
    '3.5.0',
    '3.6.0-beta',
    '03.6.0',
    '3.999999999999999999999.0',
  ]) {
    const changed = structuredClone(before);
    changed.dependencies.vue = version;
    assert.equal(safeDependencyManifests(before, changed), false, version);
  }
  for (const change of [
    { dependencies: { ...after.dependencies, new: '1.0.0' } },
    { dependencies: { ...after.dependencies, '@supabase/supabase-js': '2.0.1' } },
    { scripts: { postinstall: 'exec' } },
  ])
    assert.equal(safeDependencyManifests(before, { ...after, ...change }), false);
});
function manifestsGithub(before, after) {
  return {
    rest: {
      repos: {
        getContent: async ({ ref }) => ({
          data: {
            type: 'file',
            encoding: 'base64',
            size: 200,
            content: Buffer.from(JSON.stringify(ref === base ? before : after)).toString('base64'),
          },
        }),
      },
    },
  };
}
function releaseFixture() {
  const f = fixture();
  f.pr.user = { id: 41898282, type: 'Bot' };
  f.pr.head.ref = 'wip/release-1.2.4-123-1';
  f.files = ['package.json', 'CHANGELOG.md'].map((filename) => ({
    filename,
    status: 'modified',
    changes: 2,
    patch: 'version notes',
  }));
  const before = {
    version: '1.2.3',
    private: true,
    scripts: { build: 'build' },
    dependencies: { vue: '3.5.1' },
  };
  const after = { ...before, version: '1.2.4' };
  return { f, before, after };
}
test('generated own-version release assets admit only canonical bot branch and version-only manifest', async () => {
  const { f, before, after } = releaseFixture();
  assert.throws(() => admissionDecision(f)); // Before the narrow metadata proof this is held.
  f.releaseSafe = await releaseAssetsEligibility(manifestsGithub(before, after), f.pr, f.files);
  assert.equal(admissionDecision(f).risk, 'low');
  for (const change of [
    { dependencies: { vue: '4.0.0' } },
    { scripts: { postinstall: 'exec' } },
    { private: false },
    { version: '1.2.5' },
  ]) {
    f.releaseSafe = await releaseAssetsEligibility(
      manifestsGithub(before, { ...after, ...change }),
      f.pr,
      f.files
    );
    assert.throws(() => admissionDecision(f));
  }
  assert.equal(safeReleaseManifest(before, { ...before, version: '2.0.0' }, '2.0.0'), true);
  for (const version of ['^1.2.4', '1.2.4-beta', '999999999999999999999.2.4', '01.2.4', '1.2.2'])
    assert.equal(safeReleaseManifest(before, { ...before, version }, version), false);
});
test('release/dependency paths cannot rename sensitive files or add/delete assets into an exception', async () => {
  const { f, before, after } = releaseFixture();
  for (const change of [
    { status: 'renamed', previous_filename: 'supabase/migrations/danger.sql' },
    { status: 'removed' },
    { status: 'added' },
    { previous_filename: 'app/plugins/auth.ts' },
  ]) {
    const files = [{ ...f.files[0], ...change }, f.files[1]];
    assert.equal(
      await releaseAssetsEligibility(manifestsGithub(before, after), f.pr, files),
      false
    );
    assert.equal(classifyRisk(files, true).sensitive, true);
    const pr = {
      ...f.pr,
      user: { id: 49699333 },
      head: { ...f.pr.head, ref: 'dependabot/npm_and_yarn/testing-tooling-hash' },
    };
    assert.equal(
      await dependencyEligibility(manifestsGithub(before, after), pr, files.slice(0, 1)),
      false
    );
  }
});
test('ordinary metadata, non-bot author, foreign branch and extra executable paths remain held', async () => {
  const { f, before, after } = releaseFixture();
  for (const change of [
    { user: { id: 7, type: 'User' } },
    { head: { ...f.pr.head, ref: 'fix/release-1.2.4' } },
    { head: { ...f.pr.head, repo: { full_name: 'fork/repo' } } },
    { head: { ...f.pr.head, ref: 'wip/release-1.2.4-0-1' } },
  ])
    assert.equal(
      await releaseAssetsEligibility(
        manifestsGithub(before, after),
        { ...f.pr, ...change },
        f.files
      ),
      false
    );
  assert.equal(
    await releaseAssetsEligibility(manifestsGithub(before, after), f.pr, [
      ...f.files,
      { filename: 'app/plugins/auth.ts', status: 'modified' },
    ]),
    false
  );
});
function simpleLock(version = '1.0.0', name = 'ordinary') {
  return `lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n\nimporters:\n  .:\n    dependencies:\n      ${name}:\n        specifier: ${version}\n        version: ${version}\n\npackages:\n  ${name}@${version}:\n    resolution: {integrity: sha512-AAAA}\n    engines: {node: '>=18'}\n\nsnapshots:\n  ${name}@${version}: {}\n`;
}
test('native lock proof admits known ordinary patches and refuses auth, major, edges and controls', () => {
  const before = simpleLock();
  const after = simpleLock('1.0.1');
  assert.equal(safeLockfileChange(before, after), true);
  for (const next of [
    simpleLock('2.0.0'),
    simpleLock('1.0.1', 'jose'),
    after.replace('autoInstallPeers: true', 'autoInstallPeers: false'),
    after.replace('sha512-AAAA', 'sha512-AAAA, tarball: https://bad'),
    after.replace("node: '>=18'", "node: '>=20'"),
    after.replace('ordinary@1.0.1: {}', 'ordinary@1.0.1: {}\n  ordinary@1.0.1: {}'),
  ])
    assert.equal(safeLockfileChange(before, next), false);
  assert.equal(safeLockfileChange(simpleLock('1.0.0', 'jose'), simpleLock('1.0.1', 'jose')), false);
  const edges = before.replace(
    'ordinary@1.0.0: {}',
    'ordinary@1.0.0:\n    dependencies:\n      leaf: 1.0.0'
  );
  assert.equal(safeLockfileChange(edges, edges.replace('leaf: 1.0.0', 'leaf: 2.0.0')), false);
  assert.equal(safeLockfileChange(edges, edges.replace('leaf: 1.0.0', 'jose: 1.0.1')), false);
  assert.equal(
    safeLockfileChange(edges, edges.replace('leaf: 1.0.0', 'leaf: https://registry/pkg/1.0.1')),
    false
  );
  assert.equal(safeLockfileChange(before, 'unclassified lock output'), false);
});
// Real Dependabot lock rewrites (#1348-#1350) against main c549aa25, trimmed to the packages they
// touch or reference. pnpm deduplicated records, re-hashed peer contexts and relinked stripe
// against a new @types/node, which the old one-for-one pairing rejected.
const DEPENDABOT_LOCKS = new URL('./fixtures/dependabot-locks/', import.meta.url);
const dependabotBase = () => readFileSync(new URL('main-c549aa25.lock', DEPENDABOT_LOCKS), 'utf8');
function applyZeroContextPatch(text, patch) {
  const lines = text.split('\n');
  let offset = 0;
  for (const hunk of patch.split(/^(?=@@ )/m).filter((part) => part.startsWith('@@ '))) {
    const [, start, count = '1'] = /^@@ -(\d+)(?:,(\d+))? /.exec(hunk);
    const body = hunk.split('\n').slice(1);
    const removed = body.filter((line) => line.startsWith('-')).map((line) => line.slice(1));
    const added = body.filter((line) => line.startsWith('+')).map((line) => line.slice(1));
    const index = Number(start) - (Number(count) === 0 ? 0 : 1) + offset;
    assert.deepEqual(lines.slice(index, index + removed.length), removed, hunk.split('\n')[0]);
    lines.splice(index, removed.length, ...added);
    offset += added.length - removed.length;
  }
  return lines.join('\n');
}
function dependabotLock(name) {
  return applyZeroContextPatch(
    dependabotBase(),
    readFileSync(new URL(`${name}.patch`, DEPENDABOT_LOCKS), 'utf8')
  );
}
test('real Dependabot dedupe, peer-hash and sensitive-relink lock rewrites admit', () => {
  for (const name of [
    'pr-1348-testing-tooling',
    'pr-1349-typescript-and-types',
    'pr-1350-tailwind-tooling',
  ]) {
    const after = dependabotLock(name);
    assert.notEqual(after, dependabotBase(), name);
    assert.equal(safeLockfileChange(dependabotBase(), after), true, name);
  }
});
test('real Dependabot lock rewrites still hold tampering, new identities, dangling edges and sensitive moves', () => {
  const before = dependabotBase();
  const testing = dependabotLock('pr-1348-testing-tooling');
  const types = dependabotLock('pr-1349-typescript-and-types');
  const postcss = dependabotLock('pr-1350-tailwind-tooling');
  const surviving = /( {2}'@nuxt\/devtools-kit@3\.4\.3':\n {4}resolution: \{integrity: sha512-)m/;
  assert.match(testing, surviving);
  const stripeKey = 'stripe@22.6.2(@types/node@26.6.5)';
  assert.ok(types.includes(stripeKey));
  for (const [label, after] of [
    ['surviving integrity', testing.replace(surviving, '$1n')],
    [
      'dangling peer hash',
      testing.replace(
        'version: 4.3.4(feeafea108a446fa17bcbfcc101731b4)',
        'version: 4.3.4(00000000000000000000000000000000)'
      ),
    ],
    [
      'unknown transitive peer shape',
      testing.replace('      - happy-dom\n', '      - happy-dom: 1.0.0\n'),
    ],
    [
      'new package identity',
      postcss
        .replace(
          '\nsnapshots:\n',
          '\n  brand-new@1.0.0:\n    resolution: {integrity: sha512-AAAA}\n\nsnapshots:\n'
        )
        .replace('\n  stylehacks@', '\n  brand-new@1.0.0: {}\n\n  stylehacks@'),
    ],
    [
      'sensitive re-resolution',
      types
        .replaceAll('stripe@22.6.2', 'stripe@22.6.3')
        .replaceAll('version: 22.6.2(', 'version: 22.6.3('),
    ],
    ['controls', postcss.replace('autoInstallPeers: true', 'autoInstallPeers: false')],
  ]) {
    assert.notEqual(after, before, label);
    assert.equal(safeLockfileChange(before, after), false, label);
  }
});
test('lock proof holds sensitive removals, sensitive peer moves and downgrades', () => {
  const pair = simpleLock().replace(
    '\nsnapshots:\n',
    '\n  jose@1.0.0:\n    resolution: {integrity: sha512-AAAA}\n\n  jose@1.0.1:\n    resolution: {integrity: sha512-BBBB}\n\nsnapshots:\n  jose@1.0.0: {}\n\n  jose@1.0.1: {}\n'
  );
  const peered = pair
    .replace('version: 1.0.0', 'version: 1.0.0(jose@1.0.0)')
    .replace('  ordinary@1.0.0: {}', '  ordinary@1.0.0(jose@1.0.0): {}');
  assert.equal(
    safeLockfileChange(peered, peered.replaceAll('(jose@1.0.0)', '(jose@1.0.1)')),
    false
  );
  const dropped = pair.replace('\n  jose@1.0.1:\n    resolution: {integrity: sha512-BBBB}\n', '');
  assert.equal(safeLockfileChange(pair, dropped.replace('\n  jose@1.0.1: {}\n', '\n')), false);
  const edges = simpleLock('1.0.1').replace(
    '  ordinary@1.0.1: {}',
    '  leaf@1.0.0: {}\n\n  leaf@1.0.1: {}\n\n  ordinary@1.0.1:\n    dependencies:\n      leaf: 1.0.1'
  );
  assert.equal(safeLockfileChange(edges, edges.replace('leaf: 1.0.1', 'leaf: 1.0.0')), false);
  const jose = pair.replace(
    '  ordinary@1.0.0: {}',
    '  ordinary@1.0.0:\n    dependencies:\n      jose: 1.0.0'
  );
  assert.equal(safeLockfileChange(jose, jose.replace('jose: 1.0.0', 'jose: 1.0.1')), false);
  const single = pair
    .replace('\n  jose@1.0.1:\n    resolution: {integrity: sha512-BBBB}\n', '')
    .replace('\n  jose@1.0.1: {}\n', '\n');
  assert.equal(safeLockfileChange(single, pair), false);
  const orphan = simpleLock().replace(
    '  ordinary@1.0.0: {}',
    '  ordinary@1.0.0: {}\n\n  ordinary@1.0.1: {}'
  );
  assert.equal(safeLockfileChange(simpleLock(), orphan), false);
  const leaves =
    '  leaf@1.0.0: {}\n\n  leaf@1.0.1: {}\n\n  ordinary@1.0.0:\n    dependencies:\n      leaf: 1.0.0';
  const under = (name) =>
    simpleLock('1.0.0', name).replace(`  ${name}@1.0.0: {}`, leaves.replaceAll('ordinary', name));
  assert.equal(
    safeLockfileChange(under('ordinary'), under('ordinary').replace('leaf: 1.0.0', 'leaf: 1.0.1')),
    true
  );
  assert.equal(
    safeLockfileChange(under('jose'), under('jose').replace('leaf: 1.0.0', 'leaf: 1.0.1')),
    false
  );
  const named = simpleLock().replace(
    '  ordinary@1.0.0: {}',
    '  ordinary@1.0.0:\n    dependencies:\n      specifier: 1.0.0'
  );
  assert.equal(
    safeLockfileChange(
      named,
      named.replace(
        'dependencies:\n      specifier: 1.0.0',
        'dependencies:\n      specifier: 1.0.1'
      )
    ),
    false
  );
});
// Synthetic lock with one root importer edge; each package gets an integrity record.
function graphLock(edge, packages, snapshots) {
  const record = (key) => `  '${key}':\n    resolution: {integrity: sha512-AAAA}`;
  const snapshot = ([key, body]) => `  '${key}':${body ? `\n${body}` : ' {}'}`;
  return `lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n\nimporters:\n  .:\n    dependencies:\n      ordinary:\n        specifier: ^1.0.0\n        version: ${edge}\n\npackages:\n\n${packages.map(record).join('\n\n')}\n\nsnapshots:\n\n${Object.entries(snapshots).map(snapshot).join('\n\n')}\n`;
}
test('lock proof holds dangling removals, unsafe peer switches, hashed and malformed peers', () => {
  const peers = ['peer@1.0.0', 'peer@1.0.1', 'peer@2.0.0'];
  const variants = {
    'ordinary@1.0.0(peer@1.0.0)': '    dependencies:\n      peer: 1.0.0',
    'ordinary@1.0.0(peer@1.0.1)': '    dependencies:\n      peer: 1.0.1',
    'ordinary@1.0.0(peer@2.0.0)': '    dependencies:\n      peer: 2.0.0',
    'peer@1.0.0': '',
    'peer@1.0.1': '',
    'peer@2.0.0': '',
  };
  const lock = (edge) => graphLock(edge, ['ordinary@1.0.0', ...peers], variants);
  assert.equal(safeLockfileChange(lock('1.0.0(peer@1.0.0)'), lock('1.0.0(peer@1.0.1)')), true);
  for (const [from, to] of [
    ['1.0.0(peer@1.0.0)', '1.0.0(peer@2.0.0)'],
    ['1.0.0(peer@1.0.1)', '1.0.0(peer@1.0.0)'],
  ])
    assert.equal(safeLockfileChange(lock(from), lock(to)), false, `${from} -> ${to}`);
  const kept = graphLock('1.0.0', ['ordinary@1.0.0', 'jose@1.0.0'], {
    'ordinary@1.0.0': '',
    'jose@1.0.0': '',
  });
  const orphaned = graphLock('1.0.0', ['jose@1.0.0'], { 'jose@1.0.0': '' });
  assert.equal(safeLockfileChange(kept, orphaned), false);
  const unlinked = graphLock('1.0.0', ['ordinary@1.0.0', 'jose@1.0.0'], { 'ordinary@1.0.0': '' });
  assert.equal(safeLockfileChange(kept, unlinked), false);
  const [hashA, hashB] = ['a', 'b'].map((digit) => `(${digit.repeat(32)})`);
  const hashedJose = (hash) =>
    graphLock('1.0.0', ['ordinary@1.0.0', 'jose@1.0.0'], {
      [`jose@1.0.0${hash}`]: '',
      'ordinary@1.0.0': `    dependencies:\n      jose: 1.0.0${hash}`,
    });
  assert.equal(safeLockfileChange(hashedJose(hashA), hashedJose(hashB)), false);
  const hashedVariants = {
    [`ordinary@1.0.0${hashA}`]: '',
    [`ordinary@1.0.0${hashB}`]: '',
    'peer@1.0.0': '',
    'peer@2.0.0': '',
  };
  const hashedLock = (edge) =>
    graphLock(edge, ['ordinary@1.0.0', 'peer@1.0.0', 'peer@2.0.0'], hashedVariants);
  assert.equal(safeLockfileChange(hashedLock(`1.0.0${hashA}`), hashedLock(`1.0.0${hashB}`)), false);
  const rehashed = (hash, peer) =>
    graphLock(`1.0.0${hash}`, ['ordinary@1.0.0', `peer@${peer}`], {
      [`ordinary@1.0.0${hash}`]: `    dependencies:\n      peer: ${peer}`,
      [`peer@${peer}`]: '',
    });
  assert.equal(safeLockfileChange(rehashed(hashA, '1.0.0'), rehashed(hashB, '1.0.1')), true);
  assert.equal(safeLockfileChange(rehashed(hashA, '1.0.0'), rehashed(hashB, '2.0.0')), false);
  // A new hashed target that derives only from a different, major-peer variant still holds.
  const hashC = `(${'c'.repeat(32)})`;
  const majorVariant = {
    [`ordinary@1.0.0${hashC}`]: '    dependencies:\n      peer: 2.0.0',
    'peer@1.0.0': '',
    'peer@2.0.0': '',
  };
  const packagesWithPeers = ['ordinary@1.0.0', 'peer@1.0.0', 'peer@2.0.0'];
  const switchedFrom = graphLock(`1.0.0${hashA}`, packagesWithPeers, {
    [`ordinary@1.0.0${hashA}`]: '    dependencies:\n      peer: 1.0.0',
    ...majorVariant,
  });
  const switchedTo = graphLock(`1.0.0${hashB}`, packagesWithPeers, {
    [`ordinary@1.0.0${hashB}`]: '    dependencies:\n      peer: 2.0.0',
    ...majorVariant,
  });
  assert.equal(safeLockfileChange(switchedFrom, switchedTo), false);
  const leafLock = (edge, leafPackages, leafSnapshots) =>
    graphLock('1.0.0', ['ordinary@1.0.0', ...leafPackages], {
      'ordinary@1.0.0': `    dependencies:\n      leaf: ${edge}`,
      ...Object.fromEntries(leafSnapshots.map((key) => [key, ''])),
    });
  const leaves = ['leaf@1.0.0', 'leaf@1.0.1'];
  const leafBefore = leafLock('1.0.0', leaves, leaves);
  assert.equal(safeLockfileChange(leafBefore, leafLock('1.0.1', leaves, leaves)), true);
  assert.equal(safeLockfileChange(leafBefore, leafLock('1.0.1', leaves, ['leaf@1.0.0'])), false);
  assert.equal(safeLockfileChange(leafBefore, leafLock('1.0.0', ['leaf@1.0.0'], leaves)), false);
  const single = ['leaf@1.0.0'];
  assert.equal(
    safeLockfileChange(leafLock('1.0.0', single, single), leafLock('1.0.1', single, single)),
    false
  );
  const malformed = graphLock('1.0.0(not-a-peer)', ['ordinary@1.0.0'], {
    'ordinary@1.0.0(not-a-peer)': '',
  });
  const plain = graphLock('1.0.0', ['ordinary@1.0.0'], { 'ordinary@1.0.0': '' });
  assert.equal(safeLockfileChange(plain, malformed), false);
  // A hashed peer cycle (a package and its own test environment, as in #1348) re-hashes together.
  const cycle = ([own, env], leaf) =>
    graphLock(`1.0.0${own}`, ['ordinary@1.0.0', 'env@1.0.0', `leaf@${leaf}`], {
      [`ordinary@1.0.0${own}`]: `    dependencies:\n      env: 1.0.0${env}\n      leaf: ${leaf}`,
      [`env@1.0.0${env}`]: `    dependencies:\n      ordinary: 1.0.0${own}`,
      [`leaf@${leaf}`]: '',
    });
  const [hashD, hashE] = ['d', 'e'].map((digit) => `(${digit.repeat(32)})`);
  const cycleBefore = cycle([hashA, hashB], '1.0.0');
  assert.equal(safeLockfileChange(cycleBefore, cycle([hashD, hashE], '1.0.1')), true);
  assert.equal(safeLockfileChange(cycleBefore, cycle([hashD, hashE], '2.0.0')), false);
});
// The live-lock tests derive their subjects from the current pnpm-lock.yaml, so routine
// dependency updates that move or drop a particular package do not break them.
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bumpPatch = (version, delta) =>
  version.replace(/\.(\d+)$/, (_, patch) => `.${Number(patch) + delta}`);
function lockVersions(lock, name) {
  const record = new RegExp(`^ {2}${escapeRegExp(name)}@(\\d+\\.\\d+\\.\\d+):`, 'gm');
  return [...new Set([...lock.matchAll(record)].map((match) => match[1]))];
}
// Rewrites every resolution of name@from to `to`: keys, peer suffixes, `name: from` edges and
// importer `version:` entries, so the result stays internally consistent for direct dependencies.
function retargetPackage(lock, name, from, to) {
  const id = escapeRegExp(name);
  const version = escapeRegExp(from);
  return lock
    .replace(new RegExp(`(?<![\\w@/.-])${id}@${version}(?![\\w.])`, 'g'), `${name}@${to}`)
    .replace(new RegExp(`^( +)${id}: ${version}(?=\\(|$)`, 'gm'), `$1${name}: ${to}`)
    .replace(
      new RegExp(`(^ {6}'?${id}'?:\\n {8}specifier: .*\\n {8}version: )${version}(?=\\(|$)`, 'gm'),
      `$1${to}`
    );
}
function isDirectDependency(lock, name) {
  const importers = lock.slice(lock.indexOf('\nimporters:\n'), lock.indexOf('\npackages:\n'));
  return new RegExp(`^ {6}'?${escapeRegExp(name)}'?:$`, 'm').test(importers);
}
// An unscoped, non-sensitive, transitive-only package with one resolved version, an empty
// snapshot, at least one dependent edge, and no existing record at the next patch version.
const SENSITIVE_NAME = /supabase|stripe|auth|session|jose|jwt|oauth|passport|credential/i;
function isOrdinaryCandidate(lock, { name, version, next }) {
  const edge = new RegExp(`^ +${escapeRegExp(name)}: ${escapeRegExp(version)}$`, 'm');
  return [
    !SENSITIVE_NAME.test(name),
    !isDirectDependency(lock, name),
    lockVersions(lock, name).length === 1,
    edge.test(lock),
    !lock.includes(`${name}@${next}`),
  ].every(Boolean);
}
function ordinaryLockCandidate(lock) {
  const snapshots = lock.slice(lock.indexOf('\nsnapshots:\n'));
  const candidates = [...snapshots.matchAll(/^ {2}([a-z0-9][\w.-]*)@(\d+\.\d+\.\d+): \{\}$/gm)].map(
    ([, name, version]) => ({ name, version, next: bumpPatch(version, 1) })
  );
  return candidates.find((candidate) => isOrdinaryCandidate(lock, candidate)) ?? null;
}
test('known ordinary resolution changes work within the complete current PNPM lock including empty snapshots', () => {
  const before = readFileSync('pnpm-lock.yaml', 'utf8');
  const candidate = ordinaryLockCandidate(before);
  assert.ok(candidate, 'the current lock has an ordinary empty-snapshot package with an edge');
  const after = retargetPackage(before, candidate.name, candidate.version, candidate.next);
  assert.notEqual(before, after);
  assert.equal(safeLockfileChange(before, after), true);
});
test('genuine Supabase CLI jose transitive patch remains sensitive with an unchanged manifest', async () => {
  // Build forward from the resolved jose to a synthetic next patch, so any current version works.
  const before = readFileSync('pnpm-lock.yaml', 'utf8');
  const [current] = lockVersions(before, 'jose');
  assert.ok(current, 'the current lock resolves jose');
  const next = bumpPatch(current, 1);
  const integrity = (version) =>
    new RegExp(
      `(\\n {2}jose@${escapeRegExp(version)}:\\n {4}resolution: \\{integrity: )sha512-[\\w+/=]+`
    );
  assert.match(before, integrity(current));
  const after = retargetPackage(before, 'jose', current, next).replace(
    integrity(next),
    `$1sha512-${'A'.repeat(86)}==`
  );
  assert.notEqual(before, after);
  assert.equal(safeLockfileChange(before, after), false);
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  const pr = {
    ...fixture().pr,
    user: { id: 49699333, type: 'Bot' },
    head: { ...fixture().pr.head, ref: 'dependabot/npm_and_yarn/remaining-npm-hash' },
  };
  const files = [
    { filename: 'pnpm-lock.yaml', status: 'modified', changes: 8, patch: 'auth patch' },
  ];
  const github = {
    rest: {
      repos: {
        getContent: async ({ path, ref }) =>
          assetData(
            path === 'package.json' ? JSON.stringify(manifest) : ref === base ? before : after
          ),
      },
    },
  };
  assert.equal(await dependencyEligibility(github, pr, files), false);
  assert.equal(
    await dependencyEligibility(github, pr, [
      ...files,
      { filename: 'pnpm-workspace.yaml', status: 'modified' },
    ]),
    false
  );
});
function assetData(text) {
  return {
    data: {
      type: 'file',
      encoding: 'base64',
      size: Buffer.byteLength(text),
      content: Buffer.from(text).toString('base64'),
    },
  };
}
test('generated version assets cannot join a queue based on newer main; ordinary behind heads remain eligible', async () => {
  const { f } = releaseFixture();
  const github = {
    rest: { git: { getCommit: async () => ({ data: { parents: [{ sha: base }] } }) } },
  };
  await requireReleaseSource(github, repo, f.pr, { base_sha: base }, f.files);
  await assert.rejects(requireReleaseSource(github, repo, f.pr, { base_sha: queued }, f.files));
  await requireReleaseSource(github, repo, fixture().pr, { base_sha: queued }, fixture().files);
});
test('thread pagination is complete and refuses stalled/missing page data', async () => {
  const pages = [
    {
      nodes: Array.from({ length: 100 }, () => ({ isResolved: true })),
      pageInfo: { hasNextPage: true, endCursor: 'next' },
    },
    { nodes: [{ isResolved: false }], pageInfo: { hasNextPage: false } },
  ];
  const github = {
    graphql: async (query, args) => {
      assert.match(query, /reviewThreads/);
      return { repository: { pullRequest: { reviewThreads: pages[args.cursor ? 1 : 0] } } };
    },
  };
  assert.equal((await reviewThreads(github, repo, 1)).length, 101);
  github.graphql = async () => ({
    repository: { pullRequest: { reviewThreads: { nodes: [], pageInfo: { hasNextPage: true } } } },
  });
  await assert.rejects(reviewThreads(github, repo, 1));
  github.graphql = async () => ({});
  await assert.rejects(reviewThreads(github, repo, 1));
});
function queueFixture() {
  const pr = fixture().pr;
  const group = {
    head_ref: 'refs/heads/gh-readonly-queue/main/pr-1-abcdef',
    head_sha: queued,
    base_ref: 'refs/heads/main',
    base_sha: base,
  };
  const state = {
    ref: queued,
    main: base,
    parents: [base],
    comparison: { status: 'ahead', ahead_by: 1, behind_by: 0 },
    commitRequests: [],
    rules: queueRules(),
    entry: {
      position: 1,
      baseCommit: { oid: base },
      headCommit: { oid: queued },
      pullRequest: { number: 1, headRefOid: head },
    },
  };
  const github = {
    rest: {
      git: {
        getRef: async ({ ref }) => ({
          data: { object: { sha: ref === 'heads/main' ? state.main : state.ref } },
        }),
        getCommit: async ({ commit_sha }) => {
          state.commitRequests.push(commit_sha);
          return { data: { parents: state.parents.map((sha) => ({ sha })) } };
        },
      },
      repos: {
        compareCommits: async ({ base: from, head: to }) => {
          assert.deepEqual([from, to], [base, queued]);
          return { data: state.comparison };
        },
      },
    },
    paginate: async (route, params) => {
      assert.equal(route, queueRulesRoute);
      assert.deepEqual(params, { ...repo, branch: 'main', per_page: 100 });
      return state.rules;
    },
    graphql: async (query) => {
      assert.doesNotMatch(query, /configuration|\bmergeQueue\s*\{/);
      return { repository: { pullRequest: { headRefOid: head, mergeQueueEntry: state.entry } } };
    },
  };
  return { github, pr, group, state };
}
test('queue admission proves live ref, single squash commit on main and exact queued entry', async () => {
  const f = queueFixture();
  await queueIdentity(f.github, repo, f.group, f.pr);
  assert.deepEqual(f.state.commitRequests, [queued]);
  for (const change of [
    { ref: head },
    { main: head },
    { parents: [head] },
    { parents: [base, head] },
    { comparison: { status: 'diverged', ahead_by: 1, behind_by: 1 } },
    { comparison: { status: 'ahead', ahead_by: 2, behind_by: 0 } },
    { entry: null },
    { entry: { ...f.state.entry, headCommit: { oid: head } } },
    { entry: { ...f.state.entry, position: 2 } },
  ]) {
    const changed = queueFixture();
    Object.assign(changed.state, change);
    await assert.rejects(queueIdentity(changed.github, repo, changed.group, changed.pr));
  }
  for (const change of [
    { head_ref: 'refs/heads/main' },
    { base_ref: 'refs/heads/other' },
    { head_ref: 'refs/heads/gh-readonly-queue/main/pr-2-abcdef' },
  ])
    await assert.rejects(queueIdentity(f.github, repo, { ...f.group, ...change }, f.pr));
  f.state.rules[0].parameters.max_entries_to_build = 2;
  await assert.rejects(queueIdentity(f.github, repo, f.group, f.pr));
  const merge = queueFixture();
  merge.state.rules[0].parameters.merge_method = 'MERGE';
  await assert.rejects(queueIdentity(merge.github, repo, merge.group, merge.pr), /squash/);
});
test('queue configuration remains fail-closed through the public effective-rules read', async () => {
  for (const change of [
    (f) => {
      f.state.rules = [];
    },
    (f) => {
      f.state.rules.push(structuredClone(f.state.rules[0]));
    },
    (f) => {
      f.state.rules[0].ruleset_source_type = 'Organization';
    },
    (f) => {
      f.state.rules[0].ruleset_source = 'foreign/repo';
    },
    (f) => {
      f.state.rules[0].parameters.max_entries_to_merge = 2;
    },
    (f) => {
      f.state.rules[0].parameters.min_entries_to_merge = 2;
    },
    (f) => {
      f.state.rules[0].parameters.grouping_strategy = 'HEADGREEN';
    },
    (f) => {
      f.state.rules[0].parameters.check_response_timeout_minutes = 120;
    },
    (f) => {
      f.github.paginate = async () => {
        throw new Error('REST unavailable');
      };
    },
  ]) {
    const f = queueFixture();
    change(f);
    await assert.rejects(queueIdentity(f.github, repo, f.group, f.pr));
  }
});
test('queue metadata errors identify the denied field without exposing request credentials', async () => {
  const f = queueFixture();
  f.github.graphql = async () => {
    const error = new Error('sensitive request diagnostic');
    error.errors = [{ type: 'FORBIDDEN', path: ['repository', 'pullRequest', 'mergeQueueEntry'] }];
    error.request = { headers: { authorization: 'not-a-real-token' } };
    throw error;
  };
  await assert.rejects(queueIdentity(f.github, repo, f.group, f.pr), (error) => {
    assert.match(error.message, /repository\.pullRequest\.mergeQueueEntry/);
    assert.doesNotMatch(error.message, /sensitive request|authorization|not-a-real-token/);
    return true;
  });
});
function bindingFixture() {
  const run = {
    id: 9,
    run_attempt: 1,
    repository: { full_name: 'example/repo' },
    head_branch: 'main',
    event: 'workflow_run',
    path: '.github/workflows/review-admission.yml',
    status: 'completed',
    conclusion: 'success',
  };
  const status = {
    context: 'Review Admission',
    state: 'success',
    creator: { id: 41898282, type: 'Bot' },
    target_url: 'https://github.com/example/repo/actions/runs/9',
  };
  const receipt = {
    schema: 1,
    number: 1,
    repository: 'example/repo',
    headSha: head,
    statusSha: head,
    approved: true,
    runId: 9,
    runAttempt: 1,
    workflowSourceSha: base,
    review: { commit: head },
  };
  const github = {
    paginate: async () => [status],
    rest: {
      repos: { listCommitStatusesForRef: 'statuses' },
      actions: { getWorkflowRun: async () => ({ data: run }) },
    },
  };
  return { github, run, status, receipt };
}
test('binding rejects spoofed status, untrusted workflow event and stale head/attempt receipts', async () => {
  const f = bindingFixture();
  await admissionRun(f.github, repo, head);
  validateAdmissionReceipt(f.receipt, repo, head, f.run, 1);
  for (const change of [
    { state: 'failure' },
    { creator: { id: 1, type: 'Bot' } },
    { target_url: 'https://github.com/fork/repo/actions/runs/9' },
  ]) {
    const changed = bindingFixture();
    Object.assign(changed.status, change);
    await assert.rejects(admissionRun(changed.github, repo, head));
  }
  for (const change of [
    { path: '.github/workflows/other.yml' },
    { event: 'merge_group' },
    { event: 'check_suite' },
    { event: 'workflow_dispatch', head_branch: 'candidate' },
    { repository: { full_name: 'fork/repo' } },
    { conclusion: 'failure' },
    { status: 'in_progress' },
  ]) {
    const changed = bindingFixture();
    Object.assign(changed.run, change);
    await assert.rejects(admissionRun(changed.github, repo, head));
  }
  for (const change of [
    { approved: false },
    { headSha: base },
    { statusSha: base },
    { runAttempt: 2 },
    { repository: 'fork/repo' },
    { review: { commit: base } },
  ])
    assert.throws(() =>
      validateAdmissionReceipt({ ...f.receipt, ...change }, repo, head, f.run, 1)
    );
});
function archive(receipt, filename = `${head}.json`) {
  return execFileSync(
    'python3',
    [
      '-c',
      'import io,json,sys,zipfile; data=json.load(sys.stdin); buffer=io.BytesIO(); archive=zipfile.ZipFile(buffer,"w"); archive.writestr(data["filename"],json.dumps(data["receipt"])); archive.close(); sys.stdout.buffer.write(buffer.getvalue())',
    ],
    { input: JSON.stringify({ receipt, filename }) }
  );
}
test('only authenticated pending/missing status or incomplete trusted publisher is retryable', async () => {
  const absent = bindingFixture();
  absent.github.paginate = async () => [];
  await assert.rejects(admissionRun(absent.github, repo, head), AdmissionPending);
  for (const change of [
    { status: { state: 'pending' } },
    { run: { status: 'queued' } },
    { run: { status: 'in_progress' } },
  ]) {
    const f = bindingFixture();
    Object.assign(f.status, change.status);
    Object.assign(f.run, change.run);
    await assert.rejects(admissionRun(f.github, repo, head), AdmissionPending);
  }
  for (const change of [
    { status: { state: 'failure' } },
    { status: { state: 'error' } },
    { status: { state: 'pending', creator: { id: 1, type: 'Bot' } } },
    { run: { status: 'in_progress', path: 'wrong' } },
    { run: { status: 'completed', conclusion: 'failure' } },
    { run: { status: 'unexpected' } },
  ]) {
    const f = bindingFixture();
    Object.assign(f.status, change.status);
    Object.assign(f.run, change.run);
    await assert.rejects(
      admissionRun(f.github, repo, head),
      (error) => !(error instanceof AdmissionPending)
    );
  }
  const f = bindingFixture();
  f.github.paginate = async () => {
    throw new Error('API failure');
  };
  await assert.rejects(
    admissionRun(f.github, repo, head),
    (error) => !(error instanceof AdmissionPending)
  );
});
test('expected dispatch blocks stale green/failure and authenticates the exact completed publisher', async () => {
  for (const state of ['success', 'failure']) {
    const f = bindingFixture();
    f.status.state = state;
    const expected = { ...f.run, id: 11, event: 'workflow_dispatch', status: 'in_progress' };
    f.github.rest.actions.getWorkflowRun = async ({ run_id }) => ({
      data: run_id === 11 ? expected : f.run,
    });
    await assert.rejects(admissionRun(f.github, repo, head, 11), AdmissionPending);
    expected.status = 'completed';
    expected.conclusion = 'success';
    await assert.rejects(
      admissionRun(f.github, repo, head, 11),
      (error) => !(error instanceof AdmissionPending)
    );
    f.status.state = 'success';
    f.status.target_url = 'https://github.com/example/repo/actions/runs/11';
    assert.equal((await admissionRun(f.github, repo, head, 11)).id, 11);
    expected.head_branch = 'candidate';
    await assert.rejects(
      admissionRun(f.github, repo, head, 11),
      (error) => !(error instanceof AdmissionPending)
    );
  }
});
test('binding consumes exact JSON artifact and rejects missing/untrusted/ambiguous provenance', async () => {
  const f = bindingFixture();
  const zip = archive(f.receipt);
  f.github.paginate = async (endpoint) =>
    endpoint === 'statuses'
      ? [f.status]
      : [
          {
            id: 2,
            name: `review-admission-${head}`,
            expired: false,
            size_in_bytes: zip.byteLength,
          },
        ];
  Object.assign(f.github.rest.actions, {
    listWorkflowRunArtifacts: 'artifacts',
    downloadArtifact: async () => ({ data: zip }),
  });
  f.github.rest.repos.compareCommits = async () => ({ data: { status: 'ahead' } });
  assert.equal(
    (await requireReviewAdmission({ github: f.github, repo, head, number: 1 })).approved,
    true
  );
  await assert.rejects(
    requireReviewAdmission({ github: f.github, repo, head, number: 2 }),
    /PR number/
  );
  await assert.rejects(
    requireReviewAdmission({ github: f.github, repo, head }),
    /positive PR number/
  );
  f.github.rest.repos.compareCommits = async () => ({ data: { status: 'diverged' } });
  await assert.rejects(requireReviewAdmission({ github: f.github, repo, head, number: 1 }));
  await assert.rejects(readAdmissionArchive(archive(f.receipt, 'wrong.json'), head));
  await assert.rejects(readAdmissionArchive(Buffer.from('not a zip'), head));
  f.github.paginate = async (endpoint) => (endpoint === 'statuses' ? [f.status] : []);
  await assert.rejects(requireReviewAdmission({ github: f.github, repo, head, number: 1 }));
});
function publishingFixture() {
  const f = fixture();
  const statuses = [];
  const github = {
    reviewAdmissionIssuer: {
      appId: 15368,
      botId: 41898282,
      installationId: null,
      queueAllowed: false,
    },
    paginate: async (endpoint) => f[endpoint],
    graphql: async () => ({
      repository: {
        pullRequest: { reviewThreads: { nodes: f.threads, pageInfo: { hasNextPage: false } } },
      },
    }),
    rest: {
      pulls: { get: async () => ({ data: f.pr }), listFiles: 'files', listReviews: 'reviews' },
      issues: { listComments: 'comments' },
      checks: { listForRef: 'checks' },
      repos: {
        getCollaboratorPermissionLevel: async () => ({ data: { permission: 'write' } }),
        createCommitStatus: async (data) => {
          statuses.push(data);
        },
      },
    },
  };
  return { f, github, statuses, context: { repo, runId: 9, serverUrl: 'https://github.com' } };
}
function breakPublication(f, mode) {
  if (mode === 'files') f.f.pr.changed_files = 2;
  if (mode === 'api')
    f.github.paginate = async () => {
      throw new Error('tool failure');
    };
  if (mode === 'head') {
    let count = 0;
    f.github.rest.pulls.get = async () => ({
      data: ++count === 1 ? f.f.pr : { ...f.f.pr, head: { sha: base } },
    });
  }
}
test('publication fails closed on truncation, API errors and live head changes', async () => {
  for (const mode of ['files', 'api', 'head']) {
    const f = publishingFixture();
    breakPublication(f, mode);
    await assert.rejects(
      evaluateAdmission({ github: f.github, context: f.context, number: 1, source: base })
    );
    assert.equal(f.statuses.at(-1).state, 'failure');
    assert.ok(!f.statuses.some((status) => status.state === 'success'));
  }
});
async function withReceiptDirectory(check) {
  const directory = mkdtempSync(join(tmpdir(), 'admission-publication-'));
  const previous = process.cwd();
  const attempt = process.env.GITHUB_RUN_ATTEMPT;
  const gitDirectory = process.env.GIT_DIR;
  const fixtureGit = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
    encoding: 'utf8',
  }).trim();
  process.chdir(directory);
  process.env.GITHUB_RUN_ATTEMPT = '1';
  process.env.GIT_DIR = fixtureGit;
  try {
    await check();
  } finally {
    process.chdir(previous);
    restoreAttempt(attempt);
    if (gitDirectory === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = gitDirectory;
    rmSync(directory, { recursive: true, force: true });
  }
}
function restoreAttempt(attempt) {
  if (attempt === undefined) delete process.env.GITHUB_RUN_ATTEMPT;
  else process.env.GITHUB_RUN_ATTEMPT = attempt;
}
test('successful publication records exact receipt while final refreshed findings revoke admission', async () => {
  await withReceiptDirectory(async () => {
    const f = publishingFixture();
    const receipt = await evaluateAdmission({
      github: f.github,
      context: f.context,
      number: 1,
      source: base,
    });
    assert.equal(f.statuses.at(-1).state, 'pending');
    f.context.payload = { pull_request: { number: 1 } };
    f.f.artifacts = [{ name: `review-admission-${head}`, expired: false }];
    f.github.rest.actions = { listWorkflowRunArtifacts: 'artifacts' };
    await publishReviewAdmission({ github: f.github, context: f.context, sha: head });
    assert.equal(f.statuses.at(-1).state, 'success');
    assert.equal(receipt.headSha, head);
    assert.equal(receipt.runAttempt, 1);
    assert.deepEqual(
      JSON.parse(readFileSync(`review-admission-evidence/${head}.json`, 'utf8')),
      receipt
    );
    const changed = publishingFixture();
    let count = 0;
    changed.github.graphql = async () => ({
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: ++count === 1 ? [] : [{ isResolved: false, isOutdated: false }],
            pageInfo: { hasNextPage: false },
          },
        },
      },
    });
    await assert.rejects(
      evaluateAdmission({
        github: changed.github,
        context: changed.context,
        number: 1,
        source: base,
      })
    );
    assert.equal(changed.statuses.at(-1).state, 'failure');
  });
});
test('publisher cannot turn failed/missing evidence upload into success', async () => {
  await withReceiptDirectory(async () => {
    const f = publishingFixture();
    await evaluateAdmission({ github: f.github, context: f.context, number: 1, source: base });
    f.context.payload = { pull_request: { number: 1 } };
    f.f.artifacts = [];
    f.github.rest.actions = { listWorkflowRunArtifacts: 'artifacts' };
    await assert.rejects(
      publishReviewAdmission({ github: f.github, context: f.context, sha: head })
    );
    assert.equal(f.statuses.at(-1).state, 'failure');
    assert.ok(!f.statuses.some((status) => status.state === 'success'));
  });
});
function signalPull() {
  return {
    number: 1,
    url: 'https://api.github.com/repos/example/repo/pulls/1',
    head: { sha: head },
    base: { ref: 'main', repo: { url: 'https://api.github.com/repos/example/repo' } },
  };
}
function signalFixture(f = publishingFixture()) {
  const run = {
    id: 2,
    run_attempt: 1,
    head_sha: head,
    status: 'completed',
    conclusion: 'success',
    event: 'pull_request_review',
    pull_requests: [signalPull()],
    path: '.github/workflows/review-admission-signal.yml',
    repository: { full_name: 'example/repo' },
  };
  f.context.eventName = 'workflow_run';
  f.context.payload = { workflow_run: { ...run } };
  f.github.rest.actions = {
    getWorkflowRunAttempt: async () => ({ data: run }),
    listJobsForWorkflowRunAttempt: 'jobs',
  };
  f.f.jobs = [
    {
      name: 'Admission signal',
      head_sha: head,
      run_id: 2,
      run_attempt: 1,
      status: 'completed',
      conclusion: 'success',
    },
  ];
  return { ...f, run };
}
test('review signals bind service-owned PR identity independently of signal commit SHA', async () => {
  for (const event of ['pull_request_review', 'pull_request_review_comment']) {
    for (const change of [
      (f) => {
        f.f.reviews = [];
      },
      (f) => {
        f.f.reviews.push(human('CHANGES_REQUESTED'));
      },
      (f) => {
        f.f.threads = [{ isResolved: false, isOutdated: false }];
      },
    ]) {
      const f = signalFixture(queuedControlFixture());
      f.run.event = event;
      f.run.head_sha = 'd'.repeat(40); // A delayed signal can refer to a previous head or a synthetic merge commit.
      f.context.payload.workflow_run = { ...f.run };
      f.f.jobs[0].head_sha = f.run.head_sha;
      change(f);
      await assert.rejects(
        runReviewAdmission({ github: f.github, context: f.context, core: f.core })
      );
      assert.equal(f.statuses.filter((item) => item.sha === head).at(-1).state, 'failure');
      assert.equal(f.statuses.filter((item) => item.sha === queued).at(-1).state, 'failure');
    }
  }
});
test('service-linked review and native queue signals still prepare both current receipts', async () => {
  for (const event of ['pull_request_review', 'merge_group']) {
    const f = signalFixture(queuedControlFixture());
    f.run.event = event;
    f.run.head_sha = event === 'merge_group' ? queued : 'd'.repeat(40);
    f.run.head_branch = 'gh-readonly-queue/main/pr-1-abcdef';
    f.context.payload.workflow_run = { ...f.run };
    f.f.jobs[0].head_sha = f.run.head_sha;
    const outputs = {};
    f.core.setOutput = (name, value) => {
      outputs[name] = value;
    };
    await withReceiptDirectory(async () => {
      await runReviewAdmission({ github: f.github, context: f.context, core: f.core });
      assert.deepEqual(outputs, { admission_sha: head, queue_sha: queued });
    });
  }
});
test('delayed obsolete queue signals cannot revoke a successful replacement or current head', async () => {
  for (const replacement of [queued, null]) {
    const f = signalFixture(queuedControlFixture());
    f.run.event = 'merge_group';
    f.run.head_sha = 'd'.repeat(40);
    f.run.head_branch = 'gh-readonly-queue/main/pr-1-123abc';
    f.context.payload.workflow_run = { ...f.run };
    f.f.jobs[0].head_sha = f.run.head_sha;
    f.statuses.push({ sha: head, state: 'success' });
    if (replacement === null) {
      f.f.refs = [];
      f.q.state.entry = null;
    }
    const before = structuredClone(f.statuses);
    const outputs = {};
    f.core.setOutput = (name, value) => {
      outputs[name] = value;
    };
    await assert.rejects(
      runReviewAdmission({ github: f.github, context: f.context, core: f.core }),
      /Requested queue group is no longer current/
    );
    assert.deepEqual(f.statuses, before);
    assert.deepEqual(outputs, {});
  }
});
test('review signal rejects missing, ambiguous or foreign PR links without guessing from run SHA', async () => {
  for (const pulls of [
    [],
    undefined,
    [signalPull(), signalPull()],
    [{ ...signalPull(), url: 'https://api.github.com/repos/fork/repo/pulls/1' }],
    [
      {
        ...signalPull(),
        base: { ref: 'main', repo: { url: 'https://api.github.com/repos/fork/repo' } },
      },
    ],
    [{ ...signalPull(), base: { ...signalPull().base, ref: 'develop' } }],
  ]) {
    const f = signalFixture();
    f.run.pull_requests = pulls;
    await assert.rejects(runReviewAdmission({ github: f.github, context: f.context, core: {} }));
    assert.equal(f.statuses.length, 0);
  }
});
function suiteSignalFixture() {
  const f = signalFixture(queuedControlFixture());
  f.run.event = 'check_suite';
  f.run.head_branch = 'main';
  f.run.head_sha = base; // This event runs in the default-branch context.
  f.run.pull_requests = [];
  f.context.payload.workflow_run = { ...f.run };
  f.f.jobs[0].head_sha = base;
  f.f.artifacts = [
    { id: 42, name: 'review-admission-signal-1', size_in_bytes: 500, expired: false },
  ];
  f.suite = {
    id: 55,
    url: 'https://api.github.com/repos/example/repo/check-suites/55',
    app: { id: 347564 },
    status: 'completed',
    head_sha: head,
    pull_requests: [signalPull()],
  };
  f.github.rest.actions.listWorkflowRunArtifacts = 'artifacts';
  f.github.rest.actions.downloadArtifact = async () => ({
    data: archive({ suiteId: 55 }, 'signal.json'),
  });
  f.github.rest.checks.getSuite = async () => ({ data: f.suite });
  return f;
}
test('provider signal authenticates locator via suite API and revokes current head and active queue', async () => {
  for (const mapping of ['linked', 'head']) {
    const f = suiteSignalFixture();
    if (mapping === 'head') {
      f.suite.pull_requests = [];
      f.github.rest.pulls.list = 'pulls';
      f.f.pulls = [signalPull()];
    }
    f.f.reviews.push(human('CHANGES_REQUESTED'));
    await assert.rejects(
      runReviewAdmission({ github: f.github, context: f.context, core: f.core })
    );
    assert.equal(f.statuses.filter((item) => item.sha === head).at(-1).state, 'failure');
    assert.equal(f.statuses.filter((item) => item.sha === queued).at(-1).state, 'failure');
  }
});
function stepCore() {
  const notices = [];
  const outputs = {};
  return {
    notices,
    outputs,
    notice: (message) => notices.push(message),
    setOutput: (name, value) => {
      outputs[name] = value;
    },
  };
}
test('workflow step ends green for policy holds after failing every scope status', async () => {
  for (const hold of [
    [(f) => f.f.reviews.push(human('CHANGES_REQUESTED')), /Changes requested remain/],
    [(f) => (f.f.threads = [{ isResolved: false, isOutdated: false }]), /Unresolved review/],
    [(f) => (f.f.reviews = []), /Completed exact-head independent review/],
    [(f) => (f.f.pr.draft = true), /PR must be open and ready/],
  ]) {
    const f = signalFixture(queuedControlFixture());
    hold[0](f);
    const core = stepCore();
    await runReviewAdmissionStep({ github: f.github, context: f.context, core });
    assert.equal(f.statuses.filter((item) => item.sha === head).at(-1).state, 'failure');
    assert.equal(f.statuses.filter((item) => item.sha === queued).at(-1).state, 'failure');
    assert.match(core.notices.join('\n'), hold[1]);
    assert.equal(core.outputs.admission_sha, undefined);
    assert.equal(core.outputs.queue_sha, undefined);
  }
});
test('workflow step still fails for integrity errors and for holds after a receipt output', async () => {
  const identity = signalFixture();
  identity.run.pull_requests = [];
  await assert.rejects(
    runReviewAdmissionStep({
      github: identity.github,
      context: identity.context,
      core: stepCore(),
    }),
    /Signal PR identity is missing or ambiguous/
  );
  // Findings appear after the PR head was admitted but before the queue group is evaluated.
  const raced = signalFixture(queuedControlFixture());
  const core = stepCore();
  const record = core.setOutput;
  core.setOutput = (name, value) => {
    record(name, value);
    if (name === 'admission_sha') raced.f.reviews.push(human('CHANGES_REQUESTED'));
  };
  await withReceiptDirectory(async () => {
    await assert.rejects(
      runReviewAdmissionStep({ github: raced.github, context: raced.context, core }),
      /Changes requested remain/
    );
  });
  assert.equal(core.outputs.admission_sha, head);
  assert.equal(raced.statuses.filter((item) => item.sha === head).at(-1).state, 'failure');
  assert.equal(raced.statuses.filter((item) => item.sha === queued).at(-1).state, 'failure');
  // Without the hold distinction every denial would fail the run again.
  const mutant = await importMutationSource(
    'review-admission.mjs',
    'if (!(error instanceof AdmissionHeld) || receiptOutput(outputs)) throw error;',
    'throw error;'
  );
  const held = signalFixture(queuedControlFixture());
  held.f.reviews = [];
  await assert.rejects(
    mutant.runReviewAdmissionStep({ github: held.github, context: held.context, core: stepCore() })
  );
});
test('untrusted suite locator cannot supply approval, provider identity or ambiguous PR mapping', async () => {
  for (const change of [
    { id: 56 },
    { app: { id: 15368 } },
    { status: 'in_progress' },
    { url: 'https://api.github.com/repos/fork/repo/check-suites/55' },
    { pull_requests: [signalPull(), signalPull()] },
  ]) {
    const f = suiteSignalFixture();
    Object.assign(f.suite, change);
    await assert.rejects(
      runReviewAdmission({ github: f.github, context: f.context, core: f.core })
    );
    assert.equal(f.statuses.length, 1); // Only the seeded old status; nothing was published.
  }
  for (const artifacts of [
    [],
    [{ id: 42, name: 'review-admission-signal-2', size_in_bytes: 500 }],
    [{ id: 42, name: 'review-admission-signal-1', size_in_bytes: 500, expired: true }],
  ]) {
    const f = suiteSignalFixture();
    f.f.artifacts = artifacts;
    await assert.rejects(
      runReviewAdmission({ github: f.github, context: f.context, core: f.core })
    );
    assert.equal(f.statuses.length, 1);
  }
});
test('suite signal fails closed for wrong source branch, ambiguous head lookup or API errors', async () => {
  const branch = suiteSignalFixture();
  branch.run.head_branch = 'feature';
  await assert.rejects(
    runReviewAdmission({ github: branch.github, context: branch.context, core: branch.core })
  );
  assert.equal(branch.statuses.length, 1);
  const ambiguous = suiteSignalFixture();
  ambiguous.suite.pull_requests = [];
  ambiguous.github.rest.pulls.list = 'pulls';
  ambiguous.f.pulls = [signalPull(), signalPull()];
  await assert.rejects(
    runReviewAdmission({
      github: ambiguous.github,
      context: ambiguous.context,
      core: ambiguous.core,
    })
  );
  assert.equal(ambiguous.statuses.length, 1);
  const broken = suiteSignalFixture();
  broken.github.rest.checks.getSuite = async () => {
    throw new Error('provider API unavailable');
  };
  await assert.rejects(
    runReviewAdmission({ github: broken.github, context: broken.context, core: broken.core })
  );
  assert.equal(broken.statuses.length, 1);
});
test('provider suites on merge-queue commits select no target and leave every status unchanged', async () => {
  const f = suiteSignalFixture();
  Object.assign(f.suite, {
    head_sha: queued,
    head_branch: `gh-readonly-queue/main/pr-1-${base}`,
    pull_requests: [],
  });
  f.github.rest.pulls.list = 'pulls';
  f.f.pulls = [signalPull()];
  const notices = [];
  const outputs = {};
  const core = {
    notice: (message) => notices.push(message),
    setOutput: (name, value) => {
      outputs[name] = value;
    },
  };
  await runReviewAdmission({ github: f.github, context: f.context, core });
  assert.equal(f.statuses.length, 1); // Only the seeded status; nothing pending or failed.
  assert.deepEqual(outputs, {});
  assert.match(notices.join('\n'), /merge-queue commit is not review evidence/);
  // Only an authenticated provider suite on a queue ref with no linked PR is ignored.
  for (const change of [
    { app: { id: 15368 } },
    { head_branch: `gh-readonly-queue/develop/pr-1-${base}` },
    { head_branch: 'gh-readonly-queue/main/pr-1' },
    { head_branch: `gh-readonly-queue/main/pr-0-${base}` },
    { head_branch: `gh-readonly-queue/main/pr-01-${base}` },
    { head_branch: 'gh-readonly-queue/main/pr-1-abcdef' },
    { pull_requests: [signalPull(), signalPull()] },
  ]) {
    const held = suiteSignalFixture();
    Object.assign(held.suite, {
      head_sha: queued,
      head_branch: `gh-readonly-queue/main/pr-1-${base}`,
      pull_requests: [],
      ...change,
    });
    held.github.rest.pulls.list = 'pulls';
    held.f.pulls = [signalPull()];
    await assert.rejects(
      runReviewAdmission({ github: held.github, context: held.context, core: held.core }),
      /identity mismatch|missing or ambiguous/
    );
    assert.equal(held.statuses.length, 1);
  }
});
test('signal regression controls detect synthetic-SHA targeting and provider identity bypass', async () => {
  const old = await importMutationSource(
    'review-admission.mjs',
    'return linkedPullTarget(run.pull_requests, context.repo);',
    'return run.pull_requests.filter(pr => pr.head.sha === run.head_sha).map(pr => ({ number: pr.number }));'
  );
  const f = signalFixture(queuedControlFixture());
  f.run.head_sha = 'd'.repeat(40);
  f.context.payload.workflow_run = { ...f.run };
  f.f.jobs[0].head_sha = f.run.head_sha;
  f.f.reviews = [];
  await assert.rejects(
    old.runReviewAdmission({ github: f.github, context: f.context, core: f.core })
  );
  assert.equal(f.statuses.at(-1).state, 'success'); // Mutant leaves the queue's seeded green untouched.
  const forged = await importMutationSource(
    'review-admission.mjs',
    '[347564, 1082092].includes(suite.app?.id)',
    'true'
  );
  const wrong = suiteSignalFixture();
  wrong.suite.app.id = 15368;
  wrong.f.reviews = [];
  await assert.rejects(
    forged.runReviewAdmission({ github: wrong.github, context: wrong.context, core: wrong.core })
  );
  assert.equal(wrong.statuses.at(-1).state, 'failure'); // Removing identity guard enters publication scope.
});
test('controller rejects wrong signal workflow/repository/event/attempt or unsuccessful signal jobs', async () => {
  for (const change of [
    { path: '.github/workflows/ci.yml' },
    { repository: { full_name: 'fork/repo' } },
    { event: 'workflow_run' },
    { event: 'check_suite' },
    { run_attempt: 2 },
    { head_sha: base },
    { conclusion: 'failure' },
  ]) {
    const f = signalFixture();
    Object.assign(f.run, change);
    await assert.rejects(runReviewAdmission({ github: f.github, context: f.context, core: {} }));
    assert.equal(f.statuses.length, 0);
  }
  const f = signalFixture();
  f.f.jobs[0].conclusion = 'skipped';
  await assert.rejects(runReviewAdmission({ github: f.github, context: f.context, core: {} }));
  assert.equal(f.statuses.length, 0);
});
function queuedControlFixture() {
  const f = publishingFixture();
  const q = queueFixture();
  f.github.reviewAdmissionIssuer = {
    appId: 987654,
    botId: 987655,
    installationId: 987656,
    queueAllowed: true,
  };
  f.context.eventName = 'issue_comment';
  f.context.payload = {
    action: 'deleted',
    issue: { number: 1, pull_request: {} },
    comment: { body: `/approve-sensitive ${head}` },
  };
  f.github.rest.git = { ...q.github.rest.git, listMatchingRefs: 'refs' };
  f.github.rest.repos.compareCommits = q.github.rest.repos.compareCommits;
  f.f.refs = [{ ref: q.group.head_ref, object: { sha: queued } }];
  f.github.graphql = async (query) =>
    query.includes('mergeQueueEntry')
      ? q.github.graphql(query)
      : {
          repository: {
            pullRequest: {
              reviewThreads: { nodes: f.f.threads, pageInfo: { hasNextPage: false } },
            },
          },
        };
  f.statuses.push({ sha: queued, state: 'success' });
  return { ...f, q, core: { setOutput: () => {}, notice: () => {} } };
}
test('revoked sensitive approval and changes requested invalidate an already-green queue group', async () => {
  for (const mode of ['approval', 'review']) {
    const f = queuedControlFixture();
    if (mode === 'approval') f.f.files[0].filename = 'supabase/migrations/important.sql';
    else f.f.reviews.push(human('CHANGES_REQUESTED'));
    await assert.rejects(
      runReviewAdmission({ github: f.github, context: f.context, core: f.core })
    );
    assert.equal(f.statuses.filter((status) => status.sha === head).at(-1).state, 'failure');
    assert.equal(f.statuses.filter((status) => status.sha === queued).at(-1).state, 'failure');
  }
});
test('healthy PR evidence prepares and publishes separate authenticated head and queue receipts', async () => {
  await withReceiptDirectory(async () => {
    const f = queuedControlFixture();
    const outputs = {};
    f.core.setOutput = (key, value) => {
      outputs[key] = value;
    };
    await runReviewAdmission({ github: f.github, context: f.context, core: f.core });
    assert.deepEqual(outputs, { admission_sha: head, queue_sha: queued });
    assert.equal(f.statuses.filter((status) => status.sha === queued).at(-1).state, 'pending');
    f.f.artifacts = [head, queued].map((sha) => ({
      name: `review-admission-${sha}`,
      expired: false,
    }));
    f.github.rest.actions = { listWorkflowRunArtifacts: 'artifacts' };
    await publishReviewScope({ github: f.github, context: f.context, head, queued });
    assert.equal(f.statuses.filter((status) => status.sha === queued).at(-1).state, 'success');
    assert.equal(
      JSON.parse(readFileSync(`review-admission-evidence/${queued}.json`, 'utf8')).headSha,
      head
    );
  });
});
function awaitingBuildFixture(entry = {}) {
  const f = queuedControlFixture();
  f.q.state.entry = {
    ...f.q.state.entry,
    position: 2,
    state: 'QUEUED',
    headCommit: null,
    ...entry,
  };
  f.f.refs = [];
  const outputs = {};
  f.core.setOutput = (key, value) => {
    outputs[key] = value;
  };
  return { ...f, outputs };
}
const lastStatus = (f, sha) => f.statuses.filter((status) => status.sha === sha).at(-1);
test('an entry still waiting for its single build slot admits the exact PR head only', async () => {
  // Stale refs from an earlier queue attempt stay in revocation scope but are never the group.
  const stale = { ref: 'refs/heads/gh-readonly-queue/main/pr-1-0123', object: { sha: queued } };
  for (const refs of [[], [stale]]) {
    const f = awaitingBuildFixture();
    f.f.refs = refs;
    await withReceiptDirectory(() =>
      runReviewAdmission({ github: f.github, context: f.context, core: f.core })
    );
    assert.deepEqual(f.outputs, { admission_sha: head });
    assert.equal(lastStatus(f, head).state, 'pending');
    assert.ok(f.statuses.every((status) => status.state !== 'failure'));
  }
});
test('queue discovery still fails closed for entries without a provable integration commit', async () => {
  for (const [entry, message] of [
    [{ state: 'AWAITING_CHECKS' }, /no integration commit/],
    [{ state: 'UNMERGEABLE' }, /no integration commit/],
    [{ state: undefined }, /no integration commit/],
    [{ headCommit: { oid: queued } }, /integration ref is missing or ambiguous/],
  ]) {
    const f = awaitingBuildFixture(entry);
    await assert.rejects(
      runReviewAdmission({ github: f.github, context: f.context, core: f.core }),
      message
    );
    assert.equal(lastStatus(f, head).state, 'failure');
    assert.equal(f.outputs.admission_sha, undefined);
  }
  const missing = awaitingBuildFixture();
  delete missing.q.state.entry.headCommit;
  await assert.rejects(
    runReviewAdmission({ github: missing.github, context: missing.context, core: missing.core }),
    /integration metadata missing/
  );
  const unbuilt = queueFixture();
  unbuilt.state.entry = { ...unbuilt.state.entry, state: 'QUEUED', headCommit: null };
  await assert.rejects(
    queueIdentity(unbuilt.github, repo, unbuilt.group, unbuilt.pr),
    /does not identify this integration commit/
  );
});
test('regression assertions detect a reintroduced unbuilt-entry state bypass', async () => {
  const mutant = await importMutationSource(
    'review-admission-api.mjs',
    "entry.state === 'QUEUED'",
    'true'
  );
  const f = awaitingBuildFixture({ state: 'AWAITING_CHECKS' });
  const { pr } = f.q;
  await assert.rejects(activeQueueGroup(f.github, repo, pr, []), /no integration commit/);
  assert.equal(await mutant.activeQueueGroup(f.github, repo, pr, []), null);
});
test('regression assertions detect reintroduced head-only revocation and manifest-only dependency bypasses', async () => {
  const scopeMutant = await importMutationSource(
    'review-admission.mjs',
    'const shas = [...new Set([pr.head.sha, ...refs.map((ref) => ref.object.sha)])];',
    'const shas = [pr.head.sha];'
  );
  const f = queuedControlFixture();
  f.f.files[0].filename = 'supabase/migrations/important.sql';
  await assert.rejects(
    scopeMutant.runReviewAdmission({ github: f.github, context: f.context, core: f.core })
  );
  assert.throws(
    () =>
      assert.equal(f.statuses.filter((status) => status.sha === queued).at(-1).state, 'failure'),
    assert.AssertionError
  );
  const dependencyMutant = await importMutationSource(
    'review-admission-dependencies.mjs',
    'return safeLockfileChange(oldLock, newLock);',
    'return true;'
  );
  const pr = {
    ...fixture().pr,
    user: { id: 49699333, type: 'Bot' },
    head: { ...fixture().pr.head, ref: 'dependabot/npm_and_yarn/remaining-npm-hash' },
  };
  const manifest = { dependencies: { ordinary: '1.0.0' } };
  const github = {
    rest: {
      repos: {
        getContent: async ({ path, ref }) =>
          assetData(
            path === 'package.json'
              ? JSON.stringify(manifest)
              : simpleLock(ref === base ? '6.2.11' : '6.2.12', 'jose')
          ),
      },
    },
  };
  const files = [{ filename: 'pnpm-lock.yaml', status: 'modified' }];
  assert.equal(await dependencyEligibility(github, pr, files), false);
  assert.equal(await dependencyMutant.dependencyEligibility(github, pr, files), true);
});
test('original admission assertions reject reintroduced review, thread and sensitive bypasses', async () => {
  const original = readFileSync('scripts/ci/review-admission-policy.mjs', 'utf8');
  const mutations = [
    {
      before: 'review.commit_id === head',
      after: 'true',
      change: (f) => {
        f.reviews[0].commit_id = base;
      },
    },
    {
      before: 'review.user?.id === provider.botId',
      after: 'true',
      change: (f) => {
        f.reviews[0].user.id = 55;
      },
    },
    {
      before: '!threads.some((thread) => !thread.isResolved && !thread.isOutdated)',
      after: 'true',
      change: (f) => {
        f.threads = [{ isResolved: false, isOutdated: false }];
      },
    },
    {
      before: 'if (!sensitive) return;',
      after: 'return;',
      change: (f) => {
        f.files[0].filename = 'supabase/migrations/new.sql';
      },
    },
    {
      before: "return /Actionable comments posted: 0\\*\\*/.test(review.body ?? '');",
      after: 'return true;',
      change: (f) => {
        f.reviews[0].user.id = 136622811;
        f.reviews[0].body = '**Actionable comments posted: 1**';
      },
    },
  ];
  for (const mutation of mutations) await admissionMutation(original, mutation);
});
async function admissionMutation(original, mutation) {
  assert.ok(original.includes(mutation.before), mutation.before);
  const mutant = await importMutationSource(
    'review-admission-policy.mjs',
    mutation.before,
    mutation.after
  );
  const f = fixture();
  mutation.change(f);
  assert.throws(() => admissionDecision(f));
  assert.throws(() => assert.throws(() => mutant.admissionDecision(f)), assert.AssertionError);
}
function importMutationSource(filename, before, after) {
  const original = readFileSync(`scripts/ci/${filename}`, 'utf8');
  assert.ok(original.includes(before), before);
  const source = original
    .replace(before, after)
    .replace(
      /from '(\.\/[^']+)'/g,
      (match, path) => `from '${new URL(`../ci/${path.slice(2)}`, import.meta.url).href}'`
    );
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
test('original queue and binding assertions reject reintroduced identity/attempt bypasses', async () => {
  const mutations = [
    {
      before: 'live.object.sha === group.head_sha',
      change: (f) => {
        f.state.ref = head;
      },
    },
    {
      before: 'main.object.sha === group.base_sha',
      change: (f) => {
        f.state.main = head;
      },
    },
    {
      before: 'entry.headCommit?.oid === sha',
      change: (f) => {
        f.state.entry.headCommit.oid = head;
      },
    },
    {
      before: 'entry.pullRequest.headRefOid === pr.head.sha',
      change: (f) => {
        f.state.entry.pullRequest.headRefOid = base;
      },
    },
    {
      before: 'await requireQueueConfiguration(github, repo)',
      change: (f) => {
        f.state.rules[0].parameters.max_entries_to_build = 2;
      },
    },
  ];
  for (const mutation of mutations) await queueMutation(mutation);
  const f = bindingFixture();
  f.status.creator.id = 1;
  const appMutant = await importMutationSource(
    'review-admission-api.mjs',
    'status.creator.id === expectedBot',
    'true'
  );
  await assert.rejects(admissionRun(f.github, repo, head));
  await assert.rejects(
    async () => assert.rejects(appMutant.admissionRun(f.github, repo, head)),
    assert.AssertionError
  );
  const attemptMutant = await importMutationSource(
    'review-admission-api.mjs',
    'receipt.runAttempt === run.run_attempt',
    'true'
  );
  const wrong = { ...f.receipt, runAttempt: 2 };
  assert.throws(() => validateAdmissionReceipt(wrong, repo, head, f.run, 1));
  assert.throws(
    () => assert.throws(() => attemptMutant.validateAdmissionReceipt(wrong, repo, head, f.run, 1)),
    assert.AssertionError
  );
});
async function queueMutation(mutation) {
  const f = queueFixture();
  mutation.change(f);
  const mutant = await importMutationSource('review-admission-api.mjs', mutation.before, 'true');
  await assert.rejects(queueIdentity(f.github, repo, f.group, f.pr));
  await assert.rejects(
    async () => assert.rejects(mutant.queueIdentity(f.github, repo, f.group, f.pr)),
    assert.AssertionError
  );
}
test('trusted workflow isolates candidate signals, status writes and artifact evidence', () => {
  const workflow = readFileSync('.github/workflows/review-admission.yml', 'utf8');
  assert.match(workflow, /permissions: \{\}/);
  assert.match(workflow, /workflow_run:/);
  assert.ok(!workflow.includes('  merge_group:'));
  assert.ok(!workflow.includes('  pull_request_review:'));
  assert.ok(!workflow.includes('  check_suite:'));
  assert.match(workflow, /workflows: \[Review Admission Signal\]/);
  const job = jobBlock(workflow, 'admission');
  assertAdmissionSecurity(workflow);
  assert.match(job, /ref: main/);
  assert.match(job, /persist-credentials: false/);
  assert.match(job, /if-no-files-found: error/);
  assert.ok(!workflow.includes('pnpm install'));
  assert.match(job, /environment:\n      name: review-admission\n      deployment: false/);
  assert.equal(
    (
      job.match(
        /REVIEW_ADMISSION_PRIVATE_KEY: \$\{\{ secrets.REVIEW_ADMISSION_PRIVATE_KEY \}\}/g
      ) ?? []
    ).length,
    2
  );
  assert.equal(
    (job.match(/createReviewPublisher\(\{ github, context, core \}\)/g) ?? []).length,
    2
  );
  assert.match(workflow, /review-admission-\$\{\{ steps.evaluate.outputs.admission_sha/);
  assert.ok(
    workflow.indexOf('Upload exact-head admission receipt') <
      workflow.indexOf('Publish verified admission after evidence upload')
  );
  assert.match(workflow, /overwrite: true/);
  const signal = readFileSync('.github/workflows/review-admission-signal.yml', 'utf8');
  assert.match(signal, /name: Review Admission Signal/);
  assert.match(signal, /merge_group:/);
  assert.match(signal, /permissions: \{\}/);
  assert.ok(!signal.includes('statuses: write'));
  assert.ok(!signal.includes('checkout'));
  assert.ok(!signal.includes('environment:'));
  assert.ok(!signal.includes('workflow_run:'));
  assert.match(signal, /name: review-admission-signal-\$\{\{ github.run_attempt \}\}/);
  assert.match(signal, /path: signal.json/);
  assert.match(signal, /SUITE_ID: \$\{\{ github.event.check_suite.id \}\}/);
  assert.match(
    signal,
    /!startsWith\(github\.event\.check_suite\.head_branch, 'gh-readonly-queue\/'\)\)$/m
  );
  assert.match(signal, /if-no-files-found: error/);
  assert.ok(!signal.includes('secrets.'));
});
const appIds = { appId: 987654, botId: 987655, installationId: 987656, queueAllowed: true };
const appEnv = {
  REVIEW_ADMISSION_APP_ID: '987654',
  REVIEW_ADMISSION_BOT_ID: '987655',
  REVIEW_ADMISSION_INSTALLATION_ID: '987656',
};
const signingKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
function issuerFixture() {
  const env = {
    ...appEnv,
    REVIEW_ADMISSION_PRIVATE_KEY: signingKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
  const installation = {
    id: appIds.installationId,
    app_id: appIds.appId,
    account: { login: repo.owner },
    repository_selection: 'selected',
    suspended_at: null,
  };
  const repository = { id: 5, full_name: 'example/repo' };
  const responses = {
    '/app': {
      id: appIds.appId,
      slug: 'isolated-admission',
      permissions: { statuses: 'write', metadata: 'read' },
    },
    '/users/isolated-admission%5Bbot%5D': { id: appIds.botId, type: 'Bot' },
    '/app/installations/987656': structuredClone(installation),
    '/repos/example/repo/installation': structuredClone(installation),
    '/app/installations/987656/access_tokens': {
      token: 'synthetic-private-installation-token',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      permissions: { statuses: 'write', metadata: 'read' },
      repository_selection: 'selected',
      repositories: [repository],
    },
    [`/repos/example/repo/statuses/${head}`]: { id: 1 },
  };
  const calls = [];
  const metadataCalls = [];
  const masked = [];
  const args = {
    github: {
      graphql: async () => 'retained',
      paginate: async () => 'retained',
      rest: {
        users: {
          getByUsername: async (params) => {
            metadataCalls.push(params);
            return { data: responses['/users/isolated-admission%5Bbot%5D'] };
          },
        },
        repos: {
          get: async () => ({ data: repository }),
          createCommitStatus: async () =>
            assert.fail('Generic Actions cannot publish configured App status.'),
        },
      },
    },
    context: { repo, ref: 'refs/heads/main', eventName: 'workflow_dispatch' },
    core: { setSecret: (value) => masked.push(value) },
    env,
    fetchImpl: async (url, options) => {
      assert.equal(new URL(url).origin, 'https://api.github.com');
      assert.equal(options.redirect, 'error');
      calls.push({ path: new URL(url).pathname, options });
      assert.ok(Object.hasOwn(responses, new URL(url).pathname));
      return { ok: true, json: async () => responses[new URL(url).pathname] };
    },
  };
  return { args, calls, metadataCalls, masked, responses, repository };
}
test('publisher uses authenticated metadata when anonymous bot lookup is denied', async (t) => {
  const f = issuerFixture();
  const timeout = AbortSignal.timeout;
  const deadlines = new WeakMap();
  t.mock.method(AbortSignal, 'timeout', (milliseconds) => {
    const signal = timeout(milliseconds);
    deadlines.set(signal, milliseconds);
    return signal;
  });
  const fetchImpl = f.args.fetchImpl;
  f.args.fetchImpl = async (url, options) => {
    if (new URL(url).pathname.startsWith('/users/'))
      return { ok: false, status: 403, headers: new Headers({ 'x-ratelimit-remaining': '0' }) };
    return fetchImpl(url, options);
  };
  const github = await createReviewPublisher(f.args);
  assert.equal(f.metadataCalls.length, 1);
  assert.equal(f.metadataCalls[0].username, 'isolated-admission[bot]');
  assert.equal(deadlines.get(f.metadataCalls[0].request?.signal), 15000);
  assert.deepEqual(github.reviewAdmissionIssuer, appIds);
  assert.ok(f.calls.every((call) => call.options.headers.Authorization));
});
test('publisher bot lookup fails closed without anonymous fallback or retry and retains safe diagnostics', async () => {
  for (const status of [403, 404, 429, undefined]) {
    const f = issuerFixture();
    f.args.github.rest.users.getByUsername = async (params) => {
      f.metadataCalls.push(params);
      throw Object.assign(new Error(f.args.env.REVIEW_ADMISSION_PRIVATE_KEY), {
        status,
        response: {
          headers: {
            'x-github-request-id': 'ABCD:1234:5678',
            'x-ratelimit-limit': '5000',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1792323600',
            'retry-after': '60',
            authorization: 'synthetic-private-installation-token',
          },
          data: { message: f.args.env.REVIEW_ADMISSION_PRIVATE_KEY },
        },
      });
    };
    await assert.rejects(createReviewPublisher(f.args), (error) => {
      assert.match(error.message, /Review publisher API GET \/users\/isolated-admission%5Bbot%5D/);
      if (status) assert.ok(error.message.includes(`HTTP ${status}`));
      else assert.match(error.message, /request failed/);
      for (const detail of [
        'x-github-request-id=ABCD:1234:5678',
        'x-ratelimit-limit=5000',
        'x-ratelimit-remaining=0',
        'x-ratelimit-reset=1792323600',
        'retry-after=60',
      ])
        assert.ok(error.message.includes(detail));
      assert.ok(!error.message.includes(f.args.env.REVIEW_ADMISSION_PRIVATE_KEY));
      assert.ok(!error.message.includes('synthetic-private-installation-token'));
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(f.metadataCalls.length, 1);
    assert.ok(!f.calls.some((call) => call.path.endsWith('/access_tokens')));
    assert.ok(!f.calls.some((call) => call.path.startsWith('/users/')));
  }
});
test('publisher HTTP diagnostics whitelist bounded provider metadata and omit unsafe values', async () => {
  for (const unsafe of [false, true]) {
    const f = issuerFixture();
    const secret = f.args.env.REVIEW_ADMISSION_PRIVATE_KEY;
    f.args.fetchImpl = async () => ({
      ok: false,
      status: 403,
      headers: {
        get: (name) =>
          ({
            'x-github-request-id': unsafe ? secret : 'ABCD:1234',
            'x-ratelimit-remaining': unsafe ? secret : '0',
            'retry-after': unsafe ? '9'.repeat(100) : '60',
            authorization: secret,
          })[name],
      },
      json: () => assert.fail('Publisher must not read arbitrary error bodies.'),
    });
    await assert.rejects(createReviewPublisher(f.args), (error) => {
      assert.match(error.message, /Review publisher API GET \/app returned HTTP 403/);
      assert.ok(!error.message.includes(secret));
      assert.equal(error.message.includes('x-ratelimit-remaining=0'), !unsafe);
      assert.equal(error.message.includes('retry-after=60'), !unsafe);
      assert.ok(error.message.length < 300);
      return true;
    });
  }
});
test('dedicated App publisher validates identity, mints scoped token and only replaces status writer', async () => {
  const f = issuerFixture();
  const github = await createReviewPublisher(f.args);
  assert.deepEqual(github.reviewAdmissionIssuer, appIds);
  assert.equal(github.graphql, f.args.github.graphql);
  assert.equal(github.paginate, f.args.github.paginate);
  assert.equal(github.rest.repos.get, f.args.github.rest.repos.get);
  const tokenCall = f.calls.find((call) => call.path.endsWith('/access_tokens'));
  assert.deepEqual(JSON.parse(tokenCall.options.body), {
    repository_ids: [5],
    permissions: { statuses: 'write' },
  });
  const signedJwt = f.calls[0].options.headers.Authorization.slice(7);
  const parts = signedJwt.split('.');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
  assert.equal(claims.iss, '987654');
  assert.ok(claims.exp - claims.iat <= 600);
  assert.equal(
    verify(
      'RSA-SHA256',
      Buffer.from(parts.slice(0, 2).join('.')),
      signingKeys.publicKey,
      Buffer.from(parts[2], 'base64url')
    ),
    true
  );
  await github.rest.repos.createCommitStatus({
    ...repo,
    sha: head,
    context: 'Review Admission',
    state: 'success',
  });
  assert.equal(
    f.calls.at(-1).options.headers.Authorization,
    'Bearer synthetic-private-installation-token'
  );
  assert.ok(f.masked.includes(f.args.env.REVIEW_ADMISSION_PRIVATE_KEY));
  assert.ok(f.masked.includes(signedJwt));
  assert.ok(f.masked.includes('synthetic-private-installation-token'));
  for (const params of [
    { ...repo, sha: head, context: 'Other' },
    { ...repo, sha: 'bad', context: 'Review Admission' },
    { ...repo, repo: 'foreign', sha: head, context: 'Review Admission' },
  ])
    await assert.rejects(github.rest.repos.createCommitStatus(params));
});
test('App publisher rejects wrong identities, installation, repository and excessive token scopes', async () => {
  for (const change of [
    (f) => {
      f.responses['/app'].id = 1;
    },
    (f) => {
      f.responses['/app'].permissions.actions = 'write';
    },
    (f) => {
      f.responses['/users/isolated-admission%5Bbot%5D'].id = 1;
    },
    (f) => {
      f.responses['/users/isolated-admission%5Bbot%5D'].type = 'User';
    },
    (f) => {
      f.responses['/app/installations/987656'].id = 1;
    },
    (f) => {
      f.responses['/repos/example/repo/installation'].app_id = 1;
    },
    (f) => {
      f.responses['/repos/example/repo/installation'].account.login = 'foreign';
    },
    (f) => {
      f.responses['/repos/example/repo/installation'].repository_selection = 'all';
    },
    (f) => {
      f.responses['/repos/example/repo/installation'].suspended_at = '2026-10-14';
    },
    (f) => {
      f.repository.full_name = 'foreign/repo';
    },
    (f) => {
      f.responses['/app/installations/987656/access_tokens'].repositories = [
        { id: 6, full_name: 'foreign/repo' },
      ];
    },
    (f) => {
      f.responses['/app/installations/987656/access_tokens'].permissions.contents = 'write';
    },
    (f) => {
      f.responses['/app/installations/987656/access_tokens'].expires_at = 'bad';
    },
  ]) {
    const f = issuerFixture();
    change(f);
    await assert.rejects(createReviewPublisher(f.args));
  }
});
test('partial App setup, missing key, generic issuer and untrusted execution fail closed', async () => {
  assert.equal(publisherConfig({}), null);
  for (const env of [
    { REVIEW_ADMISSION_APP_ID: '987654' },
    { ...appEnv, REVIEW_ADMISSION_APP_ID: '15368' },
    { ...appEnv, REVIEW_ADMISSION_BOT_ID: '41898282' },
    { ...appEnv, REVIEW_ADMISSION_BOT_ID: '0' },
  ])
    assert.throws(() => publisherConfig(env));
  for (const change of [
    (f) => {
      delete f.args.env.REVIEW_ADMISSION_PRIVATE_KEY;
    },
    (f) => {
      f.args.context.ref = 'refs/heads/candidate';
    },
    (f) => {
      f.args.context.eventName = 'merge_group';
    },
  ]) {
    const f = issuerFixture();
    change(f);
    await assert.rejects(createReviewPublisher(f.args));
    assert.equal(f.calls.length, 0);
  }
  const f = issuerFixture();
  f.args.fetchImpl = async () => ({
    ok: true,
    json: async () => {
      throw new Error(f.args.env.REVIEW_ADMISSION_PRIVATE_KEY);
    },
  });
  await assert.rejects(createReviewPublisher(f.args), {
    message: 'Review publisher API response is invalid.',
  });
});
test('legacy staging publishes head evidence but cannot admit queued commits', async () => {
  await withReceiptDirectory(async () => {
    const f = queuedControlFixture();
    f.github = await createReviewPublisher({ github: f.github, context: f.context, env: {} });
    assert.equal(f.github.reviewAdmissionIssuer.queueAllowed, false);
    await assert.rejects(
      runReviewAdmission({ github: f.github, context: f.context, core: f.core }),
      /dedicated protected App publisher/
    );
    assert.equal(f.statuses.filter((item) => item.sha === queued).at(-1).state, 'failure');
    const ordinary = publishingFixture();
    ordinary.github = await createReviewPublisher({
      github: ordinary.github,
      context: ordinary.context,
      env: {},
    });
    const receipt = await evaluateAdmission({
      github: ordinary.github,
      context: ordinary.context,
      number: 1,
      source: base,
    });
    assert.equal(receipt.issuer.queueAllowed, false);
  });
});
async function withAppEnv(check) {
  const previous = Object.fromEntries(Object.keys(appEnv).map((name) => [name, process.env[name]]));
  Object.assign(process.env, appEnv);
  try {
    await check();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}
test('configured binding rejects generic Actions forgery and mismatched issuer receipt', async () => {
  await withAppEnv(async () => {
    const f = bindingFixture();
    await assert.rejects(admissionRun(f.github, repo, head), /configured publisher/);
    f.status.creator.id = appIds.botId;
    await admissionRun(f.github, repo, head);
    assert.throws(() => validateAdmissionReceipt(f.receipt, repo, head, f.run, 1));
    f.receipt.issuer = appIds;
    validateAdmissionReceipt(f.receipt, repo, head, f.run, 1);
    assert.throws(() => requireReceiptIssuer({ issuer: { ...appIds, installationId: 1 } }));
    process.env.REVIEW_ADMISSION_BOT_ID = '';
    f.github.paginate = async () => [];
    await assert.rejects(
      admissionRun(f.github, repo, head),
      (error) => !(error instanceof AdmissionPending)
    );
  });
});
test('App guard regressions are detected when app, bot, token scope or receipt binding is removed', async () => {
  for (const [before, change] of [
    [
      'app.id === config.appId',
      (f) => {
        f.responses['/app'].id = 1;
      },
    ],
    [
      "bot.id === config.botId && bot.type === 'Bot'",
      (f) => {
        f.responses['/users/isolated-admission%5Bbot%5D'].id = 1;
      },
    ],
    [
      'data.id === config.installationId && data.app_id === config.appId',
      (f) => {
        f.responses['/app/installations/987656'].app_id = 1;
      },
    ],
    [
      'token.repositories[0].id === repository.id &&\n      token.repositories[0].full_name === repository.full_name',
      (f) => {
        f.responses['/app/installations/987656/access_tokens'].repositories = [
          { id: 6, full_name: 'foreign/repo' },
        ];
      },
    ],
  ]) {
    const f = issuerFixture();
    change(f);
    await assert.rejects(createReviewPublisher(f.args));
    const mutant = await importMutationSource('review-admission-issuer.mjs', before, 'true');
    await assert.rejects(
      async () => assert.rejects(mutant.createReviewPublisher(f.args)),
      assert.AssertionError
    );
  }
  const receiptMutant = await importMutationSource(
    'review-admission-issuer.mjs',
    'actual.installationId === expected.installationId',
    'true'
  );
  const wrong = { issuer: { ...appIds, installationId: 1 } };
  assert.throws(() => requireReceiptIssuer(wrong, appEnv));
  assert.throws(
    () => assert.throws(() => receiptMutant.requireReceiptIssuer(wrong, appEnv)),
    assert.AssertionError
  );
});
test('queue issuer and generic App identity guards detect removed isolation', async () => {
  const mutant = await importMutationSource(
    'review-admission-issuer.mjs',
    'github.reviewAdmissionIssuer?.queueAllowed === true',
    'true'
  );
  const legacy = { reviewAdmissionIssuer: { queueAllowed: false } };
  const { requireQueueIssuer } = await import('../ci/review-admission-issuer.mjs');
  assert.throws(() => requireQueueIssuer(legacy));
  assert.throws(
    () => assert.throws(() => mutant.requireQueueIssuer(legacy)),
    assert.AssertionError
  );
  const configMutant = await importMutationSource(
    'review-admission-issuer.mjs',
    'ids[0] !== LEGACY.appId && ids[1] !== LEGACY.botId',
    'true'
  );
  const generic = { ...appEnv, REVIEW_ADMISSION_APP_ID: '15368' };
  assert.throws(() => publisherConfig(generic));
  assert.throws(
    () => assert.throws(() => configMutant.publisherConfig(generic)),
    assert.AssertionError
  );
});
function commentPayload(change = {}) {
  return {
    action: 'created',
    issue: { number: 1, pull_request: {} },
    comment: { body: '' },
    changes: { body: { from: '' } },
    ...change,
  };
}
function admissionJobAllowsComment(source, payload, policy = relevantComment) {
  assert.ok(
    !/^concurrency:/m.test(source),
    'Unrelated comments must be filtered before joining a queue.'
  );
  assert.match(
    source,
    /^ {4}concurrency:\n {6}group: review-admission-publication\n {6}queue: max\n {6}cancel-in-progress: false$/m
  );
  const job = jobBlock(source, 'admission');
  const expression = job.match(/ {4}if: >-\n([\s\S]*?) {4}concurrency:/)[1].trim();
  const evaluate = new Function(
    'github',
    'needs',
    'startsWith',
    'contains',
    'fromJSON',
    `return (${expression});`
  );
  return Boolean(
    evaluate(
      { event_name: 'issue_comment', event: payload },
      { filter: { outputs: { relevant: String(policy(payload)) } } },
      (value, prefix) => typeof value === 'string' && value.startsWith(prefix),
      (values, value) => values.includes(value),
      JSON.parse
    )
  );
}
test('only sensitive approval comments and their edits/deletions enter serialized admission', async () => {
  const source = readFileSync('.github/workflows/review-admission.yml', 'utf8');
  for (const payload of [
    commentPayload(),
    commentPayload({ comment: { body: 'Thanks for the fix' } }),
    commentPayload({ comment: { body: `Example: /approve-sensitive ${head}` } }),
    commentPayload({
      action: 'edited',
      comment: { body: 'New unrelated comment' },
      changes: { body: { from: 'Old unrelated comment' } },
    }),
  ]) {
    assert.equal(relevantComment(payload), false);
    assert.equal(admissionJobAllowsComment(source, payload), false);
    const f = queuedControlFixture();
    f.context.payload = payload;
    await runReviewAdmission({ github: f.github, context: f.context, core: f.core });
    assert.equal(f.statuses.length, 1); // Seeded queue status is untouched by an unrelated comment.
  }
  for (const payload of [
    commentPayload({ comment: { body: `/approve-sensitive ${head}`, author_association: 'NONE' } }),
    commentPayload({ action: 'deleted', comment: { body: `/approve-sensitive ${head}` } }),
    ...[' ', '\t'].flatMap((prefix) => [
      commentPayload({ comment: { body: `${prefix}/approve-sensitive ${head}` } }),
      commentPayload({
        action: 'deleted',
        comment: { body: `${prefix}/approve-sensitive ${head}` },
      }),
      commentPayload({
        action: 'edited',
        comment: { body: 'Withdrawn' },
        changes: { body: { from: `${prefix}/approve-sensitive ${head}` } },
      }),
    ]),
    commentPayload({
      action: 'edited',
      comment: { body: 'Approval withdrawn' },
      changes: { body: { from: `/approve-sensitive ${head}` } },
    }),
  ]) {
    assert.equal(relevantComment(payload), true);
    assert.equal(admissionJobAllowsComment(source, payload), true);
    const f = queuedControlFixture();
    f.context.payload = payload;
    f.f.files[0].filename = 'supabase/migrations/important.sql';
    await assert.rejects(
      runReviewAdmission({ github: f.github, context: f.context, core: f.core })
    );
    assert.equal(f.statuses.filter((item) => item.sha === queued).at(-1).state, 'failure');
  }
});
test('comment filter regression controls detect old-body revocation loss and workflow-level contention', async () => {
  const mutant = await importMutationSource(
    'review-admission.mjs',
    '[payload.comment?.body, payload.changes?.body?.from]',
    '[payload.comment?.body]'
  );
  const payload = commentPayload({
    action: 'edited',
    comment: { body: 'Withdrawn' },
    changes: { body: { from: `/approve-sensitive ${head}` } },
  });
  assert.equal(relevantComment(payload), true);
  assert.throws(() => assert.equal(mutant.relevantComment(payload), true), assert.AssertionError);
  const source = readFileSync('.github/workflows/review-admission.yml', 'utf8');
  const jobBlock = source.match(/^ {4}concurrency:\n(?: {6}[^\n]*\n)*/m)[0];
  const global = jobBlock
    .split('\n')
    .map((line) => line.slice(4))
    .join('\n');
  const globalMutant = global + source.replace(jobBlock, '');
  assert.throws(
    () => admissionJobAllowsComment(globalMutant, commentPayload()),
    assert.AssertionError
  );
  const unfiltered = source.replace("needs.filter.outputs.relevant == 'true' && (", '(');
  assert.equal(admissionJobAllowsComment(source, commentPayload()), false);
  assert.equal(admissionJobAllowsComment(unfiltered, commentPayload()), true);
  assert.equal(admissionJobAllowsComment(source, payload), true);
  assert.equal(admissionJobAllowsComment(source, payload, mutant.relevantComment), false);
});
test('whitespace approval revocation guards detect restoring raw startsWith filters', async () => {
  const mutant = await importMutationSource(
    'review-admission-attestation.mjs',
    'body.trimStart().startsWith(`${command} `)',
    'body.startsWith(`${command} `)'
  );
  const source = readFileSync('.github/workflows/review-admission.yml', 'utf8');
  for (const command of ['/approve', '/approve-sensitive']) {
    for (const prefix of [' ', '\t']) {
      const body = `${prefix}${command} ${head}`;
      for (const payload of [
        commentPayload({ action: 'deleted', comment: { body } }),
        commentPayload({
          action: 'edited',
          comment: { body: 'Withdrawn' },
          changes: { body: { from: body } },
        }),
      ]) {
        assert.equal(relevantComment(payload), true);
        assert.equal(admissionJobAllowsComment(source, payload), true);
      }
      assert.equal(mutant.approvalCommandPrefix(body), false);
    }
  }
});
test('Cubic dependency regressions hold changed package identities, JWT transitives and 0.x breaking minors', async () => {
  const named = simpleLock('2.0.0', '@scope/1.0.0');
  assert.equal(safeLockfileChange(named, named.replaceAll('@scope/1.0.0', '@scope/1.0.1')), false);
  assert.equal(
    safeLockfileChange(simpleLock('1.0.0', 'jsonwebtoken'), simpleLock('1.0.1', 'jsonwebtoken')),
    false
  );
  const { safeVersion } = await import('../ci/review-admission-version.mjs');
  assert.equal(safeVersion('0.2.0', '0.3.0'), false);
  assert.equal(safeVersion('0.2.0', '0.2.1'), true);
});
test('Cubic deleted review authors do not crash admission or erase requested changes', () => {
  const f = fixture();
  f.reviews.unshift({ id: 1, user: null, state: 'APPROVED', commit_id: head });
  assert.equal(admissionDecision(f).approved, true);
  f.reviews.unshift({ id: 2, user: null, state: 'CHANGES_REQUESTED', commit_id: head });
  assert.throws(() => admissionDecision(f), /Changes requested remain/);
  f.reviews.push({ id: 30, user: null, state: 'APPROVED', commit_id: head });
  assert.throws(() => admissionDecision(f), /Changes requested remain/);
});
test('Cubic admission receipt cannot be reused for a second PR on the same head', () => {
  const f = bindingFixture();
  f.receipt.number = 1;
  assert.throws(() => validateAdmissionReceipt(f.receipt, repo, head, f.run, 2), /PR number/);
});
function assertPermissionMap(job, expected) {
  const lines = permissionsBlock(job, '    ')
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .sort();
  assert.deepEqual(lines, expected.map((line) => line.trim()).sort());
}
function assertAdmissionSecurity(workflow) {
  const job = jobBlock(workflow, 'admission');
  assertPermissionMap(job, [
    'actions: read',
    'checks: read',
    'contents: read',
    'issues: read',
    'pull-requests: read',
    'statuses: write',
  ]);
  for (const name of [
    'Evaluate current immutable review evidence',
    'Publish verified admission after evidence upload',
  ]) {
    const step = workflowStep(job, name);
    assert.match(
      step,
      /REVIEW_ADMISSION_PRIVATE_KEY: \$\{\{ secrets.REVIEW_ADMISSION_PRIVATE_KEY \}\}/
    );
    assert.match(step, /createReviewPublisher\(\{ github, context, core \}\)/);
  }
  const filter = jobBlock(workflow, 'filter');
  assert.doesNotMatch(filter, /statuses: write|secrets\.|environment:|concurrency:/);
  assertPermissionMap(filter, ['actions: read', 'contents: read']);
  assert.match(filter, /ref: main/);
  assert.match(filter, /filterAdmission\(\{ github, context \}\)/);
}
function assertOldAdmissionMapGuard(name, changed) {
  if (name !== 'admission') return;
  // The former admission guard only required the status-write line.
  assert.match(permissionsBlock(changed, '    '), /^ {6}statuses: write$/m);
}
test('Cubic admission permission maps reject added or broadened token scopes in either trusted job', () => {
  const source = readFileSync('.github/workflows/review-admission.yml', 'utf8');
  for (const name of ['filter', 'admission']) {
    const job = jobBlock(source, name);
    for (const [before, after] of [
      ['      contents: read', '      contents: write'],
      ['      actions: read', '      actions: write'],
      ['      contents: read', '      contents: read\n      deployments: write'],
    ]) {
      const changed = job.replace(before, after);
      assert.notEqual(changed, job);
      assertOldAdmissionMapGuard(name, changed);
      assert.throws(
        () => assertAdmissionSecurity(source.replace(job, changed)),
        assert.AssertionError
      );
    }
  }
});
test('Cubic security assertions reject unrelated-job substitutes for admission permissions or key steps', () => {
  const source = readFileSync('.github/workflows/review-admission.yml', 'utf8');
  assertAdmissionSecurity(source);
  const unrelated =
    '\n  unrelated:\n    permissions:\n      statuses: write\n    steps:\n      - name: unrelated\n        env:\n          REVIEW_ADMISSION_PRIVATE_KEY: ${{ secrets.REVIEW_ADMISSION_PRIVATE_KEY }}\n';
  assert.throws(() =>
    assertAdmissionSecurity(source.replace('      statuses: write\n', '') + unrelated)
  );
  assert.throws(() =>
    assertAdmissionSecurity(
      source.replace(
        '          REVIEW_ADMISSION_PRIVATE_KEY: ${{ secrets.REVIEW_ADMISSION_PRIVATE_KEY }}\n',
        ''
      ) + unrelated
    )
  );
});
test('Cubic event filtering skips unsuccessful signals and uses the exact comment predicate before serialization', async () => {
  for (const conclusion of ['failure', 'cancelled', 'skipped', null]) {
    const f = signalFixture();
    f.context.payload.workflow_run.conclusion = conclusion;
    assert.equal(await filterAdmission({ github: f.github, context: f.context }), false);
  }
  const skipped = signalFixture();
  skipped.f.jobs[0].conclusion = 'skipped';
  await assert.rejects(filterAdmission({ github: skipped.github, context: skipped.context }));
  for (const body of [
    `Example: /approve-sensitive ${head}`,
    `/approve-sensitive ${head}`,
    `\t/approve-sensitive ${head}`,
  ]) {
    const payload = commentPayload({ comment: { body } });
    assert.equal(
      await filterAdmission({ context: { eventName: 'issue_comment', payload } }),
      relevantComment(payload)
    );
  }
});
test('Cubic guard mutations expose unknown peer names, JWT, 0.x, PR reuse and anonymous-request bypasses', async () => {
  const peer = simpleLock()
    .replace('version: 1.0.0', 'version: 1.0.0(@scope/1.0.0@2.0.0)')
    .replace('ordinary@1.0.0: {}', 'ordinary@1.0.0(@scope/1.0.0@2.0.0): {}');
  const renamed = peer.replaceAll('@scope/1.0.0', '@scope/1.0.1');
  assert.equal(safeLockfileChange(peer, renamed), false);
  const names = await importMutationSource(
    'review-admission-lock.mjs',
    '.every((match) => packages.has(`${match[1]}@${match[2]}`));',
    '.every(() => true);'
  );
  assert.equal(names.safeLockfileChange(peer, renamed), true);
  const jwt = await importMutationSource('review-admission-lock.mjs', '|jsonwebtoken', '');
  assert.equal(
    jwt.safeLockfileChange(
      simpleLock('1.0.0', 'jsonwebtoken'),
      simpleLock('1.0.1', 'jsonwebtoken')
    ),
    true
  );
  const zero = await importMutationSource(
    'review-admission-version.mjs',
    'before[0] !== 0 || before[1] === after[1]',
    'true'
  );
  assert.equal(zero.safeVersion('0.2.0', '0.3.0'), true);
  const receipt = await importMutationSource(
    'review-admission-api.mjs',
    'receipt.number === number',
    'true'
  );
  const f = bindingFixture();
  assert.throws(() => validateAdmissionReceipt(f.receipt, repo, head, f.run, 2));
  receipt.validateAdmissionReceipt(f.receipt, repo, head, f.run, 2);
  const anonymous = await importMutationSource(
    'review-admission-policy.mjs',
    "if (review.state === 'CHANGES_REQUESTED') latest.set(review, review);",
    ''
  );
  const evidence = fixture();
  evidence.reviews.push({ user: null, state: 'CHANGES_REQUESTED' });
  assert.throws(() => admissionDecision(evidence), /Changes requested/);
  assert.equal(anonymous.admissionDecision(evidence).approved, true);
});
test('Cubic prefilter mutations cannot silently admit quoted commands or failed signals', async () => {
  const comments = await importMutationSource(
    'review-admission.mjs',
    'return relevantPrComment(context.payload);',
    'return true;'
  );
  const context = {
    eventName: 'issue_comment',
    payload: commentPayload({ comment: { body: `Example: /approve-sensitive ${head}` } }),
  };
  assert.equal(await filterAdmission({ context }), false);
  assert.equal(await comments.filterAdmission({ context }), true);
  const signals = await importMutationSource(
    'review-admission.mjs',
    "if (context.payload.workflow_run.conclusion !== 'success') return false;",
    ''
  );
  const f = signalFixture();
  f.context.payload.workflow_run.conclusion = 'failure';
  assert.equal(await filterAdmission({ github: f.github, context: f.context }), false);
  assert.equal(await signals.filterAdmission({ github: f.github, context: f.context }), true);
});
test('shared automation helper sends the captured PR number and dispatch run into the CLI', (t) => {
  const f = automationFixture(t);
  const script = new URL('../ci/github-ci-gate.sh', import.meta.url).pathname;
  const result = f.shell(`source '${script}'; wait_for_review_admission "$PR_NUMBER" "$HEAD_SHA"`);
  assert.equal(result.status, 0, result.stderr);
  const event = f.events().find((item) => item.type === 'admission');
  assert.equal(event.number, f.env.PR_NUMBER);
  assert.equal(event.runId, '777');
});
function boundedAdmissionUnzip(source, mode, expectedCode) {
  const directory = mkdtempSync(join(tmpdir(), 'admission-unzip-bound-'));
  writeFileSync(
    join(directory, 'unzip'),
    `#!/usr/bin/env python3
import os, signal, sys, time
signal.signal(signal.SIGTERM, signal.SIG_IGN)
mode = ${JSON.stringify(mode)}
if mode.startswith('extraction') and sys.argv[1] == '-Z1':
  print(${JSON.stringify(`${head}.json`)}, flush=True)
else:
  if not mode.endswith('quiet'): os.write(1, b'x' * (2 * 1024 * 1024))
  while True: time.sleep(1)
`,
    { mode: 0o755 }
  );
  const rewritten = source.replace(
    /from '(\.\/[^']+)'/g,
    (_, path) => `from '${new URL(`../ci/${path.slice(2)}`, import.meta.url).href}'`
  );
  const url = `data:text/javascript;base64,${Buffer.from(rewritten).toString('base64')}`;
  const harness = `import { readAdmissionArchive } from ${JSON.stringify(url)};
try { await readAdmissionArchive(Buffer.from('fixture archive'), ${JSON.stringify(head)}); process.exitCode = 2; }
catch (error) { if (error.code === ${JSON.stringify(expectedCode)}) console.log('bounded'); else process.exitCode = 3; }`;
  const allowed = ['PATH', 'HOME', 'USER', 'SHELL', 'TZ', 'LANG', 'LC_ALL'];
  const env = Object.fromEntries(
    allowed
      .filter((name) => process.env[name] !== undefined)
      .map((name) => [name, process.env[name]])
  );
  env.PATH = `${directory}:${dirname(process.execPath)}:/usr/bin:/bin`;
  env.TMPDIR = directory;
  try {
    // GNU timeout terminates this owned process group, including the TERM-ignoring fixture.
    const output = execFileSync(
      'timeout',
      ['--signal=KILL', '2s', process.execPath, '--input-type=module', '-e', harness],
      {
        env,
        encoding: 'utf8',
        maxBuffer: 8192,
        timeout: 4000,
        killSignal: 'SIGKILL',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    return { output, signal: null };
  } catch (error) {
    return { output: error.stdout?.toString() ?? '', signal: error.signal };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
test('admission unzip listing and extraction have hard deadlines and forced termination', () => {
  const source = readFileSync('scripts/ci/review-admission-archive.mjs', 'utf8');
  const calls = source.split("execFileSync('unzip',").slice(1);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    const fields = call.split('\n  })')[0];
    assert.equal(
      fields.includes('timeout: 10000'),
      true,
      'Each unzip call needs the ten-second bound.'
    );
    assert.equal(
      fields.includes("killSignal: 'SIGKILL'"),
      true,
      'Each unzip call must force termination.'
    );
  }
  for (const mode of ['listing', 'extraction']) {
    assert.equal(boundedAdmissionUnzip(source, mode, 'ENOBUFS').output, 'bounded\n');
    const term = source.replaceAll("killSignal: 'SIGKILL'", "killSignal: 'SIGTERM'");
    assert.equal(boundedAdmissionUnzip(term, mode, 'ENOBUFS').signal, 'SIGKILL');
  }
  // Scale only the in-memory fixture deadline; the exact production value is checked above.
  const fast = source.replaceAll('timeout: 10000', 'timeout: 100');
  for (const mode of ['listing-quiet', 'extraction-quiet']) {
    assert.equal(boundedAdmissionUnzip(fast, mode, 'ETIMEDOUT').output, 'bounded\n');
    const unlimited = fast.replaceAll('timeout: 100', 'timeout: 0');
    assert.equal(boundedAdmissionUnzip(unlimited, mode, 'ETIMEDOUT').signal, 'SIGKILL');
  }
});
const codeRabbitComment = JSON.parse(
  readFileSync(new URL('./fixtures/coderabbit-clean-comment.json', import.meta.url), 'utf8')
);
function commentReviewFixture() {
  const f = fixture();
  f.reviews = [];
  f.comments = [
    {
      ...codeRabbitComment,
      body: codeRabbitComment.body.replaceAll('97ee413a714f39e94ee8aaba7e22c8c86e70e5c3', head),
    },
  ];
  return f;
}
test('captured CodeRabbit issue-comment completion admits only its exact reviewed head', () => {
  const f = commentReviewFixture();
  assert.deepEqual(admissionDecision(f).review, {
    provider: 'CodeRabbit',
    reviewId: codeRabbitComment.id,
    commit: head,
    kind: 'issue-comment',
  });
});
test('CodeRabbit comment identity, completion and unambiguous coverage fail closed', () => {
  const mutations = [
    (c) => {
      c.user = { ...c.user, id: 55 };
    },
    (c) => {
      c.user = { ...c.user, type: 'User' };
    },
    (c) => {
      c.user = { ...c.user, login: 'imposter[bot]' };
    },
    (c) => {
      c.id = 0;
    },
    (c) => {
      c.updated_at = null;
    },
    (c) => {
      c.created_at = 'invalid';
    },
    (c) => {
      c.updated_at = '2020-01-01T00:00:00Z';
    },
    (c) => {
      c.body = c.body.replaceAll(head, base);
    },
    (c) => {
      c.body = c.body.replace('"sourceCommitId":"' + head + '"', '"sourceCommitId":"' + base + '"');
    },
    (c) => {
      c.body = c.body.replace(
        '"coveredCommitId":"' + head + '"',
        '"coveredCommitId":"' + base + '"'
      );
    },
    (c) => {
      c.body = c.body.replace('"kind":"reviewed"', '"kind":"inherited"');
    },
    (c) => {
      c.body = c.body.replace('"kind":"reviewed"', '"kind":"reviewed","kind":"reviewed"');
    },
    (c) => {
      c.body = c.body.replace('final_review_risk_coverage:{', 'final_review_risk_coverage:broken{');
    },
    (c) => {
      c.body = c.body.replace('<!-- recent_review_end -->', '');
    },
    (c) => {
      c.body = c.body.replace('<!-- final_review_risk_end -->', '');
    },
    (c) => {
      c.body += '\n' + c.body;
    },
    (c) => {
      c.body = c.body
        .split('\n')
        .map((line) => '> ' + line)
        .join('\n');
    },
    (c) => {
      c.body = '```\n' + c.body + '\n```';
    },
    (c) => {
      c.body = c.body.replace(
        'No actionable comments were generated in the recent review. 🎉',
        'Review in progress'
      );
    },
    (c) => {
      c.body = c.body.replace('⚪ Minimal', '🔴 High');
    },
    (c) => {
      c.body += '\n**Actionable comments posted: 1**';
    },
    (c) => {
      c.body += '\nOutside diff range comments: 1';
    },
    (c) => {
      c.body += '\nReview skipped';
    },
    (c) => {
      c.body += '\n1 issue found in another file.';
    },
    (c) => {
      c.body += '\nReview incomplete';
    },
    (c) => {
      c.body = c.body.replace(
        '**Merge Risk:** **⚪ Minimal**',
        '**Merge Risk:** **🔴 High**\n**Merge Risk:** **⚪ Minimal**'
      );
    },
  ];
  mutations.push(
    (c) => {
      c.body += '\n<!-- review_in_progress_start -->';
    },
    (c) => {
      c.body = c.body.replace('final_review_risk_coverage:', 'unsupported_coverage:');
    }
  );
  for (const fence of ['```', '  ```', '~~~']) {
    mutations.push((c) => {
      c.body = fence + '\n' + c.body + '\n' + fence;
    });
    mutations.push((c) => {
      c.body = fence + '\n' + c.body;
    });
  }
  mutations.push((c) => {
    c.body += '\nOutside diff range comments (1)';
  });
  for (const mutate of mutations) {
    const f = commentReviewFixture();
    mutate(f.comments[0]);
    assert.throws(
      () => admissionDecision(f),
      /Completed exact-head independent review/,
      String(mutate)
    );
  }
  const f = commentReviewFixture();
  f.comments.push(structuredClone(f.comments[0]));
  assert.throws(() => admissionDecision(f), /Completed exact-head independent review/);
  f.comments[1].body = '<!-- recent_review_start -->\nReview in progress';
  assert.throws(() => admissionDecision(f), /Completed exact-head independent review/);
});
test('CodeRabbit comment completion cannot bypass findings, review checks or sensitive approval', () => {
  const f = commentReviewFixture();
  f.threads = [{ isResolved: false, isOutdated: false }];
  assert.throws(() => admissionDecision(f), /Unresolved review findings/);
  f.threads = [];
  f.reviews = [human('CHANGES_REQUESTED')];
  assert.throws(() => admissionDecision(f), /Changes requested/);
  f.reviews = [
    {
      ...fixture().reviews[0],
      user: { id: 136622811, type: 'Bot' },
      body: '**Actionable comments posted: 1**',
    },
  ];
  assert.throws(() => admissionDecision(f), /Completed exact-head independent review/);
  f.reviews = [];
  f.checks = [{ app: { id: 347564 }, head_sha: head, status: 'in_progress', conclusion: null }];
  assert.throws(() => admissionDecision(f), /Completed exact-head independent review/);
  f.checks = [];
  f.files[0].filename = 'scripts/ci/review-admission-policy.mjs';
  assert.throws(() => admissionDecision(f), /exact-head collaborator approval/);
  f.comments.push({
    user: { login: 'maintainer', type: 'User' },
    id: 20,
    body: `/approve-sensitive ${head}`,
  });
  assert.equal(admissionDecision(f).risk, 'sensitive');
});
test('only authenticated CodeRabbit completion lifecycle events additionally wake admission', async () => {
  for (const action of ['created', 'edited', 'deleted']) {
    const payload = {
      action,
      issue: { pull_request: {} },
      comment: structuredClone(codeRabbitComment),
    };
    assert.equal(await filterAdmission({ context: { eventName: 'issue_comment', payload } }), true);
    payload.comment.body = 'Completion removed';
    payload.changes = { body: { from: codeRabbitComment.body } };
    assert.equal(await filterAdmission({ context: { eventName: 'issue_comment', payload } }), true);
    payload.comment.user.id = 55;
    assert.equal(
      await filterAdmission({ context: { eventName: 'issue_comment', payload } }),
      false
    );
    payload.comment.user = { ...codeRabbitComment.user };
    delete payload.changes;
    assert.equal(
      await filterAdmission({ context: { eventName: 'issue_comment', payload } }),
      false
    );
  }
});
test('comment evidence reaches the receipt and a withdrawn completion revokes publication', async () => {
  await withReceiptDirectory(async () => {
    const f = publishingFixture();
    Object.assign(f.f, commentReviewFixture());
    const originalGraphql = f.github.graphql;
    f.github.graphql = async (query, variables) =>
      query.includes('... on IssueComment')
        ? { node: graphComment(f.f.comments.find((comment) => comment.node_id === variables.id)) }
        : originalGraphql(query, variables);
    const receipt = await evaluateAdmission({
      github: f.github,
      context: f.context,
      number: 1,
      source: base,
    });
    assert.equal(receipt.review.kind, 'issue-comment');
    assert.equal(receipt.review.reviewId, codeRabbitComment.id);
    f.context.payload = { pull_request: { number: 1 } };
    f.f.artifacts = [{ name: `review-admission-${head}`, expired: false }];
    f.github.rest.actions = { listWorkflowRunArtifacts: 'artifacts' };
    await publishReviewAdmission({ github: f.github, context: f.context, sha: head });
    assert.equal(f.statuses.at(-1).state, 'success');
    f.f.comments = [];
    await assert.rejects(
      publishReviewAdmission({ github: f.github, context: f.context, sha: head }),
      /Completed exact-head independent review/
    );
    assert.equal(f.statuses.at(-1).state, 'failure');
  });
});
test('CodeRabbit review rejects foreign or missing edit provenance', () => {
  for (const change of [
    { lastEditedAt: undefined },
    { lastEditedAt: 'invalid', editor: null },
    { lastEditedAt: '2026-10-17T22:55:26Z', editor: { __typename: 'User', login: 'maintainer' } },
    {
      lastEditedAt: '2026-10-17T22:55:26Z',
      editor: { __typename: 'Bot', databaseId: 55, login: 'coderabbitai' },
    },
    { lastEditedAt: null, editor: { __typename: 'User', login: 'maintainer' } },
  ]) {
    const f = commentReviewFixture();
    Object.assign(f.comments[0], change);
    assert.throws(() => admissionDecision(f), /Completed exact-head independent review/);
  }
});
test('CodeRabbit positive counts with leading zeroes and full-body risk contradictions reject', () => {
  for (const extra of [
    '**Actionable comments posted: 01**',
    'Outside diff range comments: 001',
    '01 issues found in another file',
    '**Merge Risk:** **🔴 High**',
    'Merge Risk: High',
    '<summary><strong>Merge Risk:</strong> <strong>🔴 High</strong></summary>',
  ]) {
    const f = commentReviewFixture();
    f.comments[0].body += '\n' + extra;
    assert.throws(() => admissionDecision(f), /Completed exact-head independent review/);
  }
});
test('CodeRabbit captured completion also accepts CRLF line endings', () => {
  const f = commentReviewFixture();
  f.comments[0].body = f.comments[0].body.replaceAll('\n', '\r\n');
  assert.equal(admissionDecision(f).review.kind, 'issue-comment');
});
function graphComment(comment = codeRabbitComment) {
  return {
    __typename: 'IssueComment',
    id: comment.node_id,
    databaseId: comment.id,
    fullDatabaseId: String(comment.id),
    author: { __typename: 'Bot', databaseId: 136622811, login: 'coderabbitai' },
    editor: comment.editor,
    lastEditedAt: comment.lastEditedAt,
    body: comment.body,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
  };
}
test('CodeRabbit snapshot binds body and actor provenance in the same GraphQL response', async () => {
  const f = commentReviewFixture();
  const snapshot = graphComment(f.comments[0]);
  const github = {
    graphql: async (_query, variables) => {
      assert.equal(variables.id, codeRabbitComment.node_id);
      return { node: snapshot };
    },
  };
  // The REST body differs; only the fresh GraphQL body may authorize this head.
  f.comments[0].body = f.comments[0].body.replaceAll(head, base);
  const comments = await readCodeRabbitComments(github, f.comments);
  assert.equal(admissionDecision({ ...f, comments }).approved, true);
  snapshot.body += '\n**Actionable comments posted: 01**';
  f.comments[0].body = comments[0].body;
  const changed = await readCodeRabbitComments(github, f.comments);
  assert.throws(
    () => admissionDecision({ ...f, comments: changed }),
    /Completed exact-head independent review/
  );
});
test('CodeRabbit snapshots reject missing identity, foreign author/editor and missing provenance', async () => {
  for (const change of [
    { id: 'different-node' },
    { fullDatabaseId: '55' },
    { __typename: 'Issue' },
    { author: { __typename: 'Bot', databaseId: 55, login: 'coderabbitai' } },
    { author: { __typename: 'User', databaseId: 136622811, login: 'coderabbitai' } },
    { editor: null },
    { editor: { __typename: 'User', login: 'maintainer' } },
    { lastEditedAt: undefined },
    { lastEditedAt: null, editor: undefined },
  ]) {
    const f = commentReviewFixture();
    const github = {
      graphql: async () => ({ node: { ...graphComment(f.comments[0]), ...change } }),
    };
    await assert.rejects(async () => {
      const comments = await readCodeRabbitComments(github, f.comments);
      admissionDecision({ ...f, comments });
    });
  }
  const f = commentReviewFixture();
  const missing = { graphql: async () => ({ node: null }) };
  await assert.rejects(readCodeRabbitComments(missing, f.comments), /snapshot identity/);
  const unedited = {
    graphql: async () => ({
      node: { ...graphComment(f.comments[0]), lastEditedAt: null, editor: null },
    }),
  };
  const comments = await readCodeRabbitComments(unedited, f.comments);
  assert.equal(admissionDecision({ ...f, comments }).approved, true);
});
test('CodeRabbit full comment IDs preserve safe REST numbers beyond GraphQL Int range', async () => {
  const f = commentReviewFixture();
  const snapshot = {
    ...graphComment(f.comments[0]),
    databaseId: null,
    fullDatabaseId: String(f.comments[0].id),
  };
  const github = {
    graphql: async (query) => {
      assert.match(query, /id fullDatabaseId body/);
      assert.doesNotMatch(query, /id databaseId body/);
      return { node: snapshot };
    },
  };
  const comments = await readCodeRabbitComments(github, f.comments);
  const review = admissionDecision({ ...f, comments }).review;
  assert.equal(review.reviewId, 6241906527);
  assert.equal(typeof review.reviewId, 'number');
});
test('CodeRabbit full comment IDs reject mismatched, absent and unsafe identifiers', async () => {
  for (const fullId of [
    undefined,
    null,
    '',
    6241906527,
    '55',
    '06241906527',
    '6241906527.0',
    '9007199254740993',
  ]) {
    const f = commentReviewFixture();
    const github = {
      graphql: async () => ({ node: { ...graphComment(f.comments[0]), fullDatabaseId: fullId } }),
    };
    await assert.rejects(readCodeRabbitComments(github, f.comments), /snapshot identity/);
  }
  for (const restId of [undefined, null, 0, -1, 1.5, '6241906527', Number.MAX_SAFE_INTEGER + 1]) {
    const f = commentReviewFixture();
    f.comments[0].id = restId;
    const github = { graphql: async () => ({ node: graphComment(f.comments[0]) }) };
    await assert.rejects(readCodeRabbitComments(github, f.comments), /snapshot identity/);
  }
});
