import { readFileSync } from 'node:fs';
import { deploymentRecordErrors } from './deployment.mjs';
import { PAGES_PROJECT, PRODUCTION_BRANCH, previewBranchName } from './profile.mjs';
import {
  liveQueueAliases,
  pendingPreviews,
  previewStatus,
  queueRefAbsent,
  retentionRun,
  controllerWorkflow,
} from './retention-api.mjs';
const PREFIX = `gh-readonly-queue/${PRODUCTION_BRANCH}/`;
const MIN_AGE_MS = 48 * 60 * 60 * 1000;
const DELETE_BUDGET = 10;
const SCAN_BUDGET = 50;
const TERMINAL = new Set(['success', 'failure', 'error']);
function trustedQueue(run, repository) {
  return [
    run.event === 'merge_group',
    run.path === '.github/workflows/ci.yml',
    run.head_repository?.full_name === repository,
    run.repository?.full_name === repository,
    typeof run.head_branch === 'string' && run.head_branch.startsWith(PREFIX),
    /^[0-9a-f]{40}$/.test(String(run.head_sha)),
    Number.isSafeInteger(run.id),
    Number.isFinite(Date.parse(run.created_at)),
  ].every(Boolean);
}
function deploymentIdentity(record, run) {
  return {
    deploymentId: record.id,
    headSha: run.head_sha,
    previewBranch: previewBranchName({ branch: run.head_branch }),
  };
}
function matchesRun(record, run) {
  return deploymentRecordErrors(record, deploymentIdentity(record, run)).length === 0;
}
function oldEnough(record, now) {
  const created = Date.parse(record.created_on);
  return Number.isFinite(created) && created <= now - MIN_AGE_MS;
}
function candidate(record, run, now) {
  const valid = [
    matchesRun(record, run),
    oldEnough(record, now),
    run.status === 'completed',
    Date.parse(record.created_on) >= Date.parse(run.created_at),
  ];
  return valid.every(Boolean) ? { deployment: record, run } : null;
}
function requireProject(project) {
  if (!project) throw new Error('Missing Pages project.');
  const matches = [project.name === PAGES_PROJECT, project.production_branch === PRODUCTION_BRANCH];
  if (!matches.every(Boolean)) throw new Error('Pages retention project identity mismatch.');
  return protectedProjectIds(project);
}
function protectedProjectIds(project) {
  const canonical = project.canonical_deployment?.id;
  if (typeof canonical !== 'string') throw new Error('Missing canonical deployment identity.');
  return new Set([canonical, project.latest_deployment?.id].filter(Boolean));
}
function scanInventory(records, now, protectedIds, cycle) {
  const unique = new Set(records.map((record) => record.id));
  if (unique.size !== records.length) throw new Error('Duplicate Pages deployment inventory.');
  const candidates = records
    .filter((record) => scanEligible(record, now, protectedIds))
    .toSorted((a, b) => Date.parse(a.created_on) - Date.parse(b.created_on));
  const batches = Math.max(1, Math.ceil(candidates.length / SCAN_BUDGET));
  const start = (cycle % batches) * SCAN_BUDGET;
  return candidates.slice(start, start + SCAN_BUDGET);
}
function scanEligible(record, now, protectedIds) {
  return [
    !protectedIds.has(record.id),
    oldEnough(record, now),
    /^preview-gh-readonly-[0-9a-f]{8}$/.test(String(record.deployment_trigger?.metadata?.branch)),
    /^[0-9a-f]{40}$/.test(String(record.deployment_trigger?.metadata?.commit_hash)),
  ].every(Boolean);
}
function deploymentProvenance(record) {
  const metadata = record.deployment_trigger.metadata;
  const match =
    /^Actions preview for ([0-9a-f]{40}) CI ([1-9][0-9]*) controller ([1-9][0-9]*)$/.exec(
      metadata.commit_message
    );
  if (!match || match[1] !== metadata.commit_hash) return null;
  const ids = [Number(match[2]), Number(match[3])];
  if (!ids.every(Number.isSafeInteger)) return null;
  return { sourceId: ids[0], controllerId: ids[1] };
}
async function cachedRun(options, id, cache) {
  if (!cache.has(id)) cache.set(id, await retentionRun(options.github, options.repo, id));
  return cache.get(id);
}
function trustedController(controller, source, repository, record) {
  return [
    controller.path === '.github/workflows/preview.yml',
    controller.event === 'workflow_dispatch',
    controller.head_branch === PRODUCTION_BRANCH,
    controller.repository?.full_name === repository,
    controller.head_repository?.full_name === repository,
    controller.status === 'completed',
    /^[0-9a-f]{40}$/.test(String(controller.head_sha)),
    new RegExp(`^Preview CI ${source.id} request [0-9]+$`).test(controller.display_title),
    Date.parse(record.created_on) >= Date.parse(controller.created_at),
  ].every(Boolean);
}
async function authenticatedRuns(options, record, binding, cache) {
  const run = await cachedRun(options, binding.sourceId, cache);
  const controller = await cachedRun(options, binding.controllerId, cache);
  const repository = `${options.repo.owner}/${options.repo.repo}`;
  const identities = [
    run.id === binding.sourceId,
    controller.id === binding.controllerId,
    trustedQueue(run, repository),
    trustedController(controller, run, repository, record),
  ];
  if (!identities.every(Boolean)) return null;
  const workflow = await controllerWorkflow(options.github, options.repo, controller.head_sha);
  if (!lifecycleTextMatches(workflow)) return null;
  return candidate(record, run, options.now);
}
async function provenance(options, record, cache) {
  const binding = deploymentProvenance(record);
  if (!binding) return null;
  return authenticatedRuns(options, record, binding, cache);
}
function workflowLifecycleBlock(text) {
  return text.match(/^concurrency:\n(?: {2}[^\n]*\n)*/m)?.[0] ?? '';
}
function historicalLifecycleTextMatches(text) {
  return (
    workflowLifecycleBlock(text) ===
    'concurrency:\n  group: pages-preview-lifecycle\n  queue: max\n  cancel-in-progress: false\n'
  );
}
function scopedLifecycleTextMatches(text) {
  const group =
    "  group: ${{ inputs.queue && 'pages-preview-lifecycle' || format('preview-ci-{0}', inputs.run_id) }}\n";
  return [
    [
      `concurrency:\n${group}  queue: max\n  cancel-in-progress: false\n`,
      `concurrency:\n${group}  queue: \${{ inputs.queue && 'max' || 'single' }}\n  cancel-in-progress: \${{ !inputs.queue }}\n`,
    ].includes(workflowLifecycleBlock(text)),
    / {6}queue:\n {8}description:[^\n]*\n {8}required: false\n {8}type: boolean\n {8}default: false\n/.test(
      text
    ),
    (text.match(/QUEUE_INPUT: \$\{\{ inputs.queue \}\}/g) ?? []).length === 2,
    text.includes('run_id: process.env.RUN_ID_INPUT, queue: process.env.QUEUE_INPUT'),
    /queue: process.env.QUEUE_INPUT,\n +destination:/.test(text),
  ].every(Boolean);
}
function lifecycleTextMatches(text) {
  return historicalLifecycleTextMatches(text) || scopedLifecycleTextMatches(text);
}
function requireLifecycleText(text) {
  if (!lifecycleTextMatches(text))
    throw new Error('Pages retention requires shared lifecycle concurrency.');
}
/** Queue Preview workflows and historical failed-job reruns remain serialized through reporting. */
export function requireRetentionLifecycle(workspace) {
  for (const file of ['preview.yml', 'preview-retention.yml'])
    requireLifecycleText(readFileSync(`${workspace}/.github/workflows/${file}`, 'utf8'));
}
async function unneeded({ github, repo }, selected) {
  const [absent, pending, aliases] = await Promise.all([
    queueRefAbsent(github, repo, selected.run.head_branch),
    pendingPreviews(github, repo),
    liveQueueAliases(github, repo, previewBranchName),
  ]);
  const alias = deploymentIdentity(selected.deployment, selected.run).previewBranch;
  if ([!absent, aliases.includes(alias)].some(Boolean)) return false;
  if (await protectivePending({ github, repo }, pending)) return false;
  const status = await previewStatus(github, repo, selected.run.head_sha);
  return terminalStatus(status);
}
function ordinaryPendingController(run, repository) {
  return [
    run.path === '.github/workflows/preview.yml',
    run.event === 'workflow_dispatch',
    run.head_branch === PRODUCTION_BRANCH,
    run.repository?.full_name === repository,
    run.head_repository?.full_name === repository,
    /^[0-9a-f]{40}$/.test(String(run.head_sha)),
  ].every(Boolean);
}
function ordinarySource(run, repository) {
  return [
    run.path === '.github/workflows/ci.yml',
    ['pull_request', 'workflow_dispatch'].includes(run.event),
    run.repository?.full_name === repository,
    ordinaryHeadRepository(run, repository),
    run.status === 'completed',
    run.conclusion === 'success',
    /^[0-9a-f]{40}$/.test(String(run.head_sha)),
    typeof run.head_branch === 'string' && !run.head_branch.startsWith(PREFIX),
  ].every(Boolean);
}
async function protectivePending(options, runs) {
  const repository = `${options.repo.owner}/${options.repo.repo}`;
  if (runs.length > SCAN_BUDGET) return true;
  for (const run of runs) {
    if (!(await ordinaryPending(options, run, repository))) return true;
  }
  return false;
}
function ordinaryHeadRepository(run, repository) {
  if (run.event === 'workflow_dispatch') return run.head_repository?.full_name === repository;
  return /^[^/]+\/[^/]+$/.test(String(run.head_repository?.full_name));
}
function pendingSourceId(run) {
  const match = /^Preview CI ([1-9][0-9]*) request [0-9]+$/.exec(run.display_title);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
}
async function ordinaryPending(options, run, repository) {
  if (!ordinaryPendingController(run, repository)) return false;
  const id = pendingSourceId(run);
  if (!id) return false;
  const source = await retentionRun(options.github, options.repo, id);
  return source.id === id && ordinarySource(source, repository);
}
function terminalStatus(status) {
  return [TERMINAL.has(status?.state), status?.creator?.login === 'github-actions[bot]'].every(
    Boolean
  );
}
function sameRecord(current, selected, now) {
  if (!current || current.created_on !== selected.deployment.created_on) return false;
  return matchesRun(current, selected.run) && oldEnough(current, now);
}
async function removeCandidate(options, selected) {
  const protectedIds = requireProject(await options.pages.project());
  if (protectedIds.has(selected.deployment.id)) return false;
  const current = await options.pages.deployment(selected.deployment.id);
  if (!sameRecord(current, selected, options.now)) return false;
  if (!(await unneeded(options, selected))) return false;
  await options.pages.remove(selected.deployment.id);
  return true;
}
async function processRecord(options, record, cache, report) {
  const selected = await provenance(options, record, cache);
  if (!selected) {
    report.retained.push({ id: record.id, reason: 'unverified_provenance' });
    return;
  }
  if (!(await unneeded(options, selected))) {
    report.retained.push({ id: record.id, reason: 'live_or_pending' });
    return;
  }
  report.eligible.push(selected.deployment.id);
  await applyCandidate(options, selected, report);
}
async function applyCandidate(options, selected, report) {
  if (!options.apply) return;
  if (await removeCandidate(options, selected)) report.deleted.push(selected.deployment.id);
}
async function processInventory(options, records, report) {
  const cache = new Map();
  for (const record of records) {
    if (report.eligible.length >= DELETE_BUDGET) break;
    report.examined++;
    await processRecord(options, record, cache, report);
  }
}
/** Dry-run by default. Unknown evidence throws or retains; never fall back to prefix-only deletes. */
export async function retainQueuePreviews({
  github,
  repo,
  pages,
  workspace,
  apply = false,
  now = Date.now(),
}) {
  if (!Number.isFinite(now)) throw new Error('Invalid retention clock.');
  if (apply) requireRetentionLifecycle(workspace);
  const options = { github, repo, pages, now, apply };
  const protectedIds = requireProject(await pages.project());
  const discovered = await pages.discover(now);
  const records = scanInventory(discovered.records, now, protectedIds, discovered.discovery.cycle);
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    minimumAgeHours: 48,
    budget: DELETE_BUDGET,
    scanBudget: SCAN_BUDGET,
    discovery: discovered.discovery,
    examined: 0,
    retained: [],
    eligible: [],
    deleted: [],
  };
  await processInventory(options, records, report);
  return report;
}
