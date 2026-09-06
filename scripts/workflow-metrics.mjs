#!/usr/bin/env node
// Read-only GitHub baseline collector. Requires authenticated gh; emits JSON on stdout.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { classifyPaths } from './validation-plan.mjs';
const exec = promisify(execFile);
const args = process.argv.slice(2);
const options = {
  repo: 'tarkovtracker-org/TarkovTracker',
  count: 20,
  before: new Date().toISOString(),
};
while (args.length) {
  const key = args.shift();
  if (!['--repo', '--count', '--before', '--after'].includes(key) || !args.length)
    throw new Error(
      'Usage: workflow-metrics.mjs [--repo owner/name] [--count 20] [--before ISO] [--after ISO]'
    );
  options[key.slice(2)] = args.shift();
}
options.count = Number(options.count);
if (
  !/^[\w.-]+\/[\w.-]+$/.test(options.repo) ||
  !Number.isInteger(options.count) ||
  options.count < 1 ||
  options.count > 100 ||
  !Number.isFinite(Date.parse(options.before)) ||
  (options.after && !Number.isFinite(Date.parse(options.after)))
)
  throw new Error('Invalid metrics options');
const api = async (path) =>
  JSON.parse(
    (await exec('gh', ['api', `repos/${options.repo}/${path}`], { maxBuffer: 16 * 1024 * 1024 }))
      .stdout
  );
async function fetchPage(path, page, key) {
  const separator = path.includes('?') ? '&' : '?';
  const response = await api(`${path}${separator}per_page=100&page=${page}`);
  return key ? response[key] : response;
}
async function pages(path, key) {
  const result = [];
  for (let page = 1; ; page++) {
    const rows = await fetchPage(path, page, key);
    result.push(...rows);
    if (rows.length < 100) return result;
  }
}
function matchesHead(run, pr) {
  return (
    run.head_branch === pr.head.ref && run.head_repository?.full_name === pr.head.repo?.full_name
  );
}
function isPrRun(run, pr) {
  return run.pull_requests.length
    ? run.pull_requests.some((item) => item.number === pr.number)
    : matchesHead(run, pr);
}
const candidates = [];
for (let page = 1; ; page++) {
  const prs = await api(
    `pulls?state=closed&base=main&sort=updated&direction=desc&per_page=100&page=${page}`
  );
  candidates.push(
    ...prs.filter(
      (pr) =>
        pr.merged_at &&
        Date.parse(pr.merged_at) <= Date.parse(options.before) &&
        (!options.after || Date.parse(pr.merged_at) > Date.parse(options.after))
    )
  );
  candidates.sort((a, b) => Date.parse(b.merged_at) - Date.parse(a.merged_at));
  // updated_at cannot precede merged_at; this proves older pages cannot enter the sample.
  if (
    prs.length < 100 ||
    (!options.after &&
      candidates.length >= options.count &&
      Date.parse(prs.at(-1).updated_at) < Date.parse(candidates[options.count - 1].merged_at))
  )
    break;
  if (options.after && Date.parse(prs.at(-1).updated_at) <= Date.parse(options.after)) break;
}
// Baseline: preceding N; follow-up: first N merged after the rollout boundary.
if (options.after) candidates.reverse();
const selected = candidates.slice(0, options.count);
const duration = (start, end) =>
  start && end ? (Date.parse(end) - Date.parse(start)) / 60000 : null;
const unavailable = [];
async function measuredRun(run) {
  const attempts = [];
  for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
    const jobs = await pages(`actions/runs/${run.id}/attempts/${attempt}/jobs`, 'jobs');
    const executed = jobs.filter(
      (job) => job.started_at && job.completed_at && job.conclusion !== 'skipped'
    );
    attempts.push({
      attempt,
      runner_minutes: executed.reduce(
        (sum, job) => sum + duration(job.started_at, job.completed_at),
        0
      ),
    });
  }
  return {
    id: run.id,
    sha: run.head_sha,
    conclusion: run.conclusion,
    attempts,
    duration_minutes: duration(run.run_started_at, run.updated_at),
  };
}
const records = [];
for (const pr of selected) {
  console.error(`Collecting PR #${pr.number} (${records.length + 1}/${selected.length})`);
  const files = await pages(`pulls/${pr.number}/files`);
  const paths = files.flatMap((file) => [
    file.filename,
    ...(file.previous_filename ? [file.previous_filename] : []),
  ]);
  const plan = classifyPaths(paths);
  const category = plan.full
    ? 'executable'
    : plan.docs && plan.locales
      ? 'documentation-and-translations'
      : plan.locales
        ? 'translations'
        : 'documentation';
  const record = {
    number: pr.number,
    merged_at: pr.merged_at,
    category,
    time_to_merge_minutes: duration(pr.created_at, pr.merged_at),
    correction_pushes: null,
    review_to_correction_minutes: null,
    agent_usage: null,
  };
  try {
    const runs = await pages(
      `actions/workflows/ci.yml/runs?event=pull_request&branch=${encodeURIComponent(pr.head.ref)}&created=${encodeURIComponent(`${pr.created_at}..${pr.merged_at}`)}`,
      'workflow_runs'
    );
    const related = runs.filter((run) => isPrRun(run, pr));
    record.ci_association =
      'PR number when present; otherwise matching head repository and branch within PR lifetime (inferred)';
    related.sort((a, b) => a.id - b.id);
    record.ci_runs = [];
    for (const run of related) record.ci_runs.push(await measuredRun(run));
    const first = related[0];
    record.first_ci_pass = first
      ? (await api(`actions/runs/${first.id}/attempts/1`)).conclusion === 'success'
      : null;
    const releaseRuns = await pages(
      `actions/workflows/release.yml/runs?head_sha=${pr.merge_commit_sha}`,
      'workflow_runs'
    );
    record.release_runs = [];
    for (const run of releaseRuns) record.release_runs.push(await measuredRun(run));
    // After reusable-release rollout, publication jobs are nested inside CI.
    if (!releaseRuns.length) {
      const mainRuns = await pages(
        `actions/workflows/ci.yml/runs?event=push&head_sha=${pr.merge_commit_sha}`,
        'workflow_runs'
      );
      record.release_jobs = [];
      for (const run of mainRuns) {
        const jobs = await pages(`actions/runs/${run.id}/jobs?filter=all`, 'jobs');
        record.release_jobs.push(
          ...jobs
            .filter((job) => /(?:^|\/)\s*Release$/.test(job.name))
            .map((job) => ({
              run_id: run.id,
              conclusion: job.conclusion,
              duration_minutes:
                job.conclusion === 'skipped' ? null : duration(job.started_at, job.completed_at),
            }))
        );
      }
    }
  } catch (error) {
    unavailable.push({ pr: pr.number, reason: error.message.split('\n')[0] });
  }
  records.push(record);
}
console.log(
  JSON.stringify(
    {
      collected_at: new Date().toISOString(),
      ...options,
      definitions: {
        duration_minutes:
          'Workflow started_at to updated_at (completion-time proxy); reruns use latest attempt duration.',
        runner_minutes:
          'Sum of executed job durations over all attempts; excludes queue time and is not billable-minute rounding.',
        first_ci_pass:
          'First attempt of earliest associated CI run succeeded; null when historical association is unavailable.',
        missing_metrics:
          'Correction pushes, review-to-correction time and agent usage require retained event/usage telemetry; not inferred from commit counts.',
      },
      unavailable,
      records,
    },
    null,
    2
  )
);
