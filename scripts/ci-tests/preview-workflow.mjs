import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  jobBlock,
  permissionsBlock,
  workflowEvent,
  workflowStep,
} from './helpers/workflow-blocks.mjs';
const read = (path) => readFileSync(path, 'utf8');
const TRUSTED_REF = 'ref: ${{ github.event.repository.default_branch }}';
/** Every checkout in the controller must pin the default branch; candidate code never runs. */
function assertTrustedBoundary(workflow) {
  const checkouts = [
    ...workflow.matchAll(
      /uses: actions\/checkout@[a-f0-9]{40}[^\n]*\n([\s\S]*?)(?=\n {6}- |\n {2}\S)/g
    ),
  ];
  assert.ok(checkouts.length >= 4, 'every job checks out trusted code');
  for (const [, block] of checkouts) {
    assert.ok(block.includes(TRUSTED_REF), block);
    assert.ok(block.includes('persist-credentials: false'), block);
  }
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.event\.pull_request\.head/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.event\.workflow_run\.head/);
  assert.doesNotMatch(workflow, /repository: \$\{\{ github\.event\.pull_request\.head\.repo/);
  const deploy = jobBlock(workflow, 'deploy');
  assert.match(deploy, /^ {6}name: \$\{\{ needs\.plan\.outputs\.environment \}\}$/m);
  assert.match(
    workflowStep(deploy, 'Install pinned deployment tooling'),
    /pnpm install --frozen-lockfile --ignore-scripts/
  );
  const upload = workflowStep(deploy, 'Upload verified output to the Pages preview environment');
  // Pages commands reject --config paths; the trusted default-branch config is discovered
  // from the repo root of the checked-out workspace instead.
  assert.doesNotMatch(upload, /--config/);
  assert.match(upload, /--project-name tarkovtracker/);
  assert.match(upload, /--branch "\$PREVIEW_BRANCH"/);
  assert.match(upload, /preview-\*\) ;;/);
  assert.match(upload, /\[ "\$PREVIEW_BRANCH" != "main" \]/);
  assert.match(upload, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_PAGES_API_TOKEN \}\}/);
  assert.match(upload, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ vars\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  const verifyDeployment = workflowStep(deploy, 'Verify deployment record');
  assert.match(
    verifyDeployment,
    /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_PAGES_API_TOKEN \}\}/
  );
  assert.match(verifyDeployment, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ vars\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  assert.doesNotMatch(deploy, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(upload, /pnpm run|node scripts\/preview\/build/);
  // Smoke tests run without Cloudflare credentials, against the unique deployment URL.
  const smoke = jobBlock(workflow, 'smoke');
  assert.doesNotMatch(smoke, /CLOUDFLARE_/);
  assert.doesNotMatch(smoke, /environment:/);
  assert.match(smoke, /PREVIEW_URL: \$\{\{ needs\.deploy\.outputs\.url \}\}/);
  assert.match(smoke, /playwright test --config scripts\/preview\/smoke\/playwright\.config\.mjs/);
  assert.match(workflowStep(smoke, 'Retain smoke evidence'), /retention-days: 30/);
  assert.match(workflowStep(deploy, 'Retain deployment evidence'), /retention-days: 30/);
  assert.match(
    workflowStep(deploy, 'Retain deployment evidence'),
    /name: preview-deployment-\$\{\{ steps\.verify\.outputs\.head_sha/,
    'run-owned deployment evidence must be keyed by the previewed SHA'
  );
}
test('preview controller runs trusted code only and isolates credentials per job', () => {
  const workflow = read('.github/workflows/preview.yml');
  assertTrustedBoundary(workflow);
  // Only the two reporting jobs may write statuses; the deploy and smoke jobs cannot.
  for (const job of ['plan', 'result'])
    assert.match(permissionsBlock(jobBlock(workflow, job), '    '), /^ {6}statuses: write$/m);
  for (const job of ['deploy', 'smoke'])
    assert.doesNotMatch(permissionsBlock(jobBlock(workflow, job), '    '), /statuses: write/);
  assert.doesNotMatch(workflow, /contents: write|pull-requests: write|id-token: write/);
  const events = [
    'opened',
    'synchronize',
    'reopened',
    'ready_for_review',
    'converted_to_draft',
    'closed',
  ];
  assert.match(
    workflowEvent(workflow, 'pull_request_target'),
    new RegExp(`types: \\[${events.join(', ')}\\]`)
  );
  assert.match(
    workflowEvent(workflow, 'workflow_run'),
    /workflows: \[CI\]\n\s+types: \[completed\]/
  );
  assert.doesNotMatch(workflowEvent(workflow, 'workflow_run'), /requested/);
  assert.match(workflowEvent(workflow, 'workflow_dispatch'), /run_id:/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(jobBlock(workflow, 'deploy'), /if: needs\.plan\.outputs\.action == 'deploy'/);
  assert.match(
    jobBlock(workflow, 'result'),
    /if: always\(\) && needs\.plan\.outputs\.action != 'ignore'/
  );
  assert.match(jobBlock(workflow, 'result'), /publishControllerFailure/);
  // The cancelled branch must emit the supersession notice and return before the failure and
  // result publisher paths, so a superseded run can never publish a status.
  const resultScript = workflowStep(jobBlock(workflow, 'result'), 'Publish Preview Result');
  const cancelledAt = resultScript.indexOf("PLAN_RESULT === 'cancelled'");
  const noticeAt = resultScript.indexOf('superseded by a newer run');
  const returnAt = resultScript.indexOf('return;', cancelledAt);
  const failAt = resultScript.indexOf("core.setFailed('Preview planning did not succeed.')");
  const publishAt = resultScript.indexOf('await publishResult');
  assert.ok(cancelledAt !== -1, 'cancellation branch missing');
  assert.ok(noticeAt > cancelledAt, 'supersession notice must follow the cancelled check');
  assert.ok(returnAt > noticeAt, 'cancelled branch must return before any publication');
  assert.ok(failAt > returnAt, 'planning failure path must come after the cancelled branch');
  assert.ok(publishAt > failAt, 'result publication must follow the guard clauses');
  assert.doesNotMatch(workflow, /name: Preview Result/);
});
test('tampering with the controller boundary is detected', () => {
  const workflow = read('.github/workflows/preview.yml');
  const mutations = [
    [TRUSTED_REF, 'ref: ${{ github.event.workflow_run.head_sha }}'],
    [
      '--project-name tarkovtracker',
      '--project-name tarkovtracker --config "$RUNNER_TEMP/preview-dist/wrangler.toml"',
    ],
    ['pnpm install --frozen-lockfile --ignore-scripts', 'pnpm install --frozen-lockfile'],
    ['[ "$PREVIEW_BRANCH" != "main" ]', 'true'],
    ['name: ${{ needs.plan.outputs.environment }}', 'name: preview'],
  ];
  for (const [before, after] of mutations) {
    const changed = workflow.replace(before, after);
    assert.notEqual(changed, workflow, before);
    assert.throws(() => assertTrustedBoundary(changed), before);
  }
});
test('the Pages preview environment carries no production bindings or identifiers', () => {
  const toml = read('wrangler.toml');
  const preview = toml.slice(toml.indexOf('[env.preview.vars]'));
  assert.ok(preview.length > 0);
  assert.doesNotMatch(
    preview,
    /kv_namespaces|durable_objects|STRIPE_PRICE|supabase\.co|G-[A-Z0-9]{6,}|price_/
  );
  for (const key of [
    'APP_URL',
    'GA_MEASUREMENT_ID',
    'CLARITY_PROJECT_ID',
    'NUXT_PUBLIC_CLIENT_LOG_SINK_URL',
    'NUXT_PUBLIC_TURNSTILE_SITE_KEY',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
  ])
    assert.match(preview, new RegExp(`^${key} = ""$`, 'm'), key);
  assert.match(preview, /^NODE_ENV = "production"$/m);
  // Production configuration remains intact.
  const production = toml.slice(0, toml.indexOf('[env.preview.vars]'));
  assert.match(production, /\[\[durable_objects\.bindings\]\]/);
  assert.match(production, /\[\[kv_namespaces\]\]/);
  assert.match(production, /^APP_URL = "https:\/\/tarkovtracker\.org"$/m);
});
test('the Validate job builds once through the profile step and uploads a preview artifact', () => {
  const ci = read('.github/workflows/ci.yml');
  const validate = jobBlock(ci, 'validate');
  const profile = workflowStep(validate, 'Resolve build profile');
  assert.match(profile, /run: node scripts\/preview\/build-profile\.mjs/);
  assert.match(profile, /EVENT_NAME: \$\{\{ github\.event_name \}\}/);
  assert.match(profile, /REF_NAME: \$\{\{ github\.ref_name \}\}/);
  // Deployment credentials never reach the candidate build.
  assert.doesNotMatch(validate, /CLOUDFLARE_/);
  const build = workflowStep(validate, 'Build');
  assert.match(build, /^ {8}run: pnpm run build$/m);
  assert.doesNotMatch(build, /^ {8}env:/m);
  const manifest = workflowStep(validate, 'Write preview manifest');
  assert.match(manifest, /if: steps\.profile\.outputs\.profile == 'preview'/);
  assert.match(
    manifest,
    /HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/
  );
  const upload = workflowStep(validate, 'Upload preview build');
  assert.match(upload, /if: steps\.profile\.outputs\.profile == 'preview'/);
  assert.match(upload, /name: pages-preview/);
  assert.match(upload, /retention-days: 7/);
  assert.match(upload, /if-no-files-found: error/);
  assert.ok(validate.indexOf('Resolve build profile') < validate.indexOf('name: Build\n'));
  assert.ok(validate.indexOf('name: Build\n') < validate.indexOf('Write preview manifest'));
  assert.ok(validate.indexOf('Write preview manifest') < validate.indexOf('Upload preview build'));
  const pkg = JSON.parse(read('package.json'));
  assert.match(
    pkg.devDependencies['@playwright/test'],
    /^\d+\.\d+\.\d+$/,
    'Playwright is pinned exactly'
  );
});
test('shared gate scripts wait for both authoritative gates with a 60-minute bound', () => {
  const gate = read('scripts/github-ci-gate.sh');
  assert.match(gate, /readonly GATE_WAIT_ATTEMPTS=360/);
  assert.match(gate, /wait_for_preview_result\(\)/);
  assert.match(gate, /select\(\.context == "Preview Result"\)/);
  // The staged gate authenticates the reported success against run-owned state: exact-SHA
  // status bound to a trusted-revision controller run with a successful result publication
  // and the deployment evidence artifact for the exact previewed SHA.
  assert.match(gate, /preview_result_binding\(\)/);
  // GitHub reports the controller path and main branch separately.
  assert.match(
    gate,
    /\.path == "\.github\/workflows\/preview\.yml" and \.event == "workflow_dispatch"/
  );
  assert.match(gate, /\.head_branch == "main" and \.head_repository\.full_name == \$repo/);
  assert.match(gate, /prefix="https:\/\/github\.com\/\$GITHUB_REPOSITORY\/actions\/runs\/"/);
  assert.match(gate, /Publish preview result" and \.conclusion == "success"/);
  assert.match(gate, /preview-deployment-\\\(\$sha\)/);
  assert.match(gate, /request_preview_after_dispatched_ci\(\)/);
  assert.match(gate, /timeout 60m gh run watch "\$run_id".*--exit-status/);
  assert.match(gate, /wait_for_ci_result "\$sha"/);
  assert.match(gate, /gh workflow run preview\.yml.*--ref main.*"run_id=\$run_id"/);
  assert.match(
    read('scripts/crowdin-pr.sh'),
    /dispatch_ci locales\n\s+request_preview_after_dispatched_ci "\$HEAD_SHA"\n\s+wait_for_preview_result "\$HEAD_SHA"/
  );
  assert.match(
    read('scripts/release-commit.sh'),
    /request_preview_after_dispatched_ci "\$release_sha"\nwait_for_preview_result "\$release_sha"/
  );
  assert.doesNotMatch(read('scripts/crowdin-pr.sh'), /^\s*wait_for_ci_result /m);
  assert.doesNotMatch(read('scripts/release-commit.sh'), /^wait_for_ci_result /m);
  for (const name of ['crowdin', 'release'])
    assert.match(
      jobBlock(read(`.github/workflows/${name}.yml`), name === 'crowdin' ? 'sync' : 'release'),
      /timeout-minutes: 90/
    );
});
