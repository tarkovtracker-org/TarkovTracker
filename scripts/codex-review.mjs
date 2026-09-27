#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs as parseOptions } from 'node:util';
import { classifyState } from './codex-review-state.mjs';
export { classifyState } from './codex-review-state.mjs';
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const POLL_INTERVAL_MS = 30_000;
function gh(args, options = {}) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}
function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}
function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Could not parse ${label} returned by gh`);
  }
}
function listPages(text, label) {
  try {
    return text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    throw new Error(`${label} pagination returned an unexpected shape`);
  }
}
function fetchState({ repo, pr, runGh, intents, now }) {
  const prefix = `repos/${repo}`;
  const pull = parseJson(runGh(['api', `${prefix}/pulls/${pr}`]), 'pull request');
  const comments = listPages(
    runGh(['api', '--paginate', '--jq', '.[] | @json', `${prefix}/issues/${pr}/comments`]),
    'issue comments'
  );
  const reviews = listPages(
    runGh(['api', '--paginate', '--jq', '.[] | @json', `${prefix}/pulls/${pr}/reviews`]),
    'pull request reviews'
  );
  const requestedReviewers = parseJson(
    runGh(['api', `${prefix}/pulls/${pr}/requested_reviewers`]),
    'requested reviewers'
  );
  return classifyState({ pull, comments, reviews, requestedReviewers, intents }, now);
}
function readIntents(directory, repo, pr) {
  const prefix = `${repo.replaceAll('/', '_')}-${pr}-`;
  let files;
  try {
    files = readdirSync(directory).filter(
      (name) => name.startsWith(prefix) && name.endsWith('.json')
    );
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return files.map((name) => {
    const intent = parseJson(readFileSync(join(directory, name), 'utf8'), 'local request intent');
    if (!/^[0-9a-f]{40}$/i.test(intent.sha) || !Number.isFinite(intent.createdAt)) {
      throw new Error(`Invalid request intent file: ${name}`);
    }
    return intent;
  });
}
function persistIntent(directory, repo, pr, sha, createdAt) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${repo.replaceAll('/', '_')}-${pr}-${sha}.json`);
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify({ repo, pr, sha, createdAt })}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  renameSync(temporaryPath, path);
  return path;
}
function acquireLock(path) {
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
  writeFileSync(
    join(path, 'owner.json'),
    `${JSON.stringify({ pid: process.pid, createdAt: Date.now() })}\n`,
    { mode: 0o600 }
  );
  return true;
}
function usage() {
  return 'Usage: node scripts/codex-review.mjs PR [--repo owner/name] [--request] [--wait-seconds N]';
}
function validateWait(waitSeconds) {
  if (!Number.isSafeInteger(waitSeconds) || waitSeconds < 0 || waitSeconds > 3600) {
    throw new Error('--wait-seconds must be an integer from 0 to 3600');
  }
}
function validateRepo(repo) {
  if (repo && !/^[^/\s]+\/[^/\s]+$/.test(repo)) throw new Error('--repo must be owner/name');
}
function validatePr(positionals) {
  if (positionals.length !== 1 || !/^[1-9]\d*$/.test(positionals[0])) throw new Error(usage());
  const pr = Number(positionals[0]);
  if (!Number.isSafeInteger(pr)) throw new Error(usage());
  return pr;
}
export function parseArgs(argv) {
  const { values, positionals } = parseOptions({
    args: argv,
    allowPositionals: true,
    options: {
      repo: { type: 'string' },
      request: { type: 'boolean', default: false },
      'wait-seconds': { type: 'string', default: '0' },
    },
  });
  const waitSeconds = Number(values['wait-seconds']);
  validateWait(waitSeconds);
  validateRepo(values.repo);
  return {
    request: values.request,
    repo: values.repo ?? null,
    waitSeconds,
    pr: validatePr(positionals),
  };
}
function commandRepo(runGh) {
  const value = runGh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim();
  if (!/^[^/\s]+\/[^/\s]+$/.test(value))
    throw new Error('Could not determine repository owner/name');
  return value;
}
function commonGitDir(runGit) {
  const path = runGit(['rev-parse', '--git-common-dir']);
  return resolve(isAbsolute(path) ? path : join(process.cwd(), path));
}
function outputState(state) {
  const results = {
    clean: 'no findings',
    findings: 'findings recorded',
    unknown: 'findings status unknown',
  };
  if (state.status === 'complete')
    return `Codex review complete for ${state.headSha}: ${results[state.result]}`;
  if (state.status === 'unreviewed') return `No completed Codex review found for ${state.headSha}`;
  return `Codex review ${state.status} for ${state.headSha}: ${state.reason}`;
}
function guardPaths(gitCommon) {
  const stateDirectory = join(gitCommon, 'codex-review-guard');
  return {
    stateDirectory,
    intentDirectory: join(stateDirectory, 'intents'),
    lockPath: join(stateDirectory, 'request.lock'),
  };
}
function dependencies(deps) {
  return {
    runGh: gh,
    runGit: git,
    now: Date.now,
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    ...deps,
  };
}
function contextFor(options, deps) {
  const repo = options.repo ?? commandRepo(deps.runGh);
  const gitCommon = deps.gitCommonDir ?? commonGitDir(deps.runGit);
  return { ...options, ...deps, repo, ...guardPaths(gitCommon) };
}
function observe(context) {
  const intents = readIntents(context.intentDirectory, context.repo, context.pr);
  return fetchState({ ...context, intents, now: context.now() });
}
function postRequest(context, headSha) {
  persistIntent(context.intentDirectory, context.repo, context.pr, headSha, context.now());
  const body = `@codex review\n\n<!-- codex-review-request:${headSha} -->`;
  context.runGh([
    'api',
    `repos/${context.repo}/issues/${context.pr}/comments`,
    '--method',
    'POST',
    '-f',
    `body=${body}`,
  ]);
  context.request = false;
  return {
    status: 'pending',
    headSha,
    reason: 'Codex review requested; completion has not been observed',
  };
}
function lockedRequest(context, previous) {
  const refreshed = observe(context);
  if (refreshed.status !== 'unreviewed') return refreshed;
  if (refreshed.headSha !== previous.headSha) {
    return {
      status: 'unknown',
      headSha: refreshed.headSha,
      reason: 'PR head changed; inspect the new revision before requesting',
    };
  }
  return postRequest(context, refreshed.headSha);
}
function requestOnce(context, state) {
  mkdirSync(context.stateDirectory, { recursive: true });
  if (!acquireLock(context.lockPath)) {
    return {
      status: 'pending',
      headSha: state.headSha,
      reason: 'Another request invocation holds the shared lock',
    };
  }
  try {
    return lockedRequest(context, state);
  } finally {
    rmSync(context.lockPath, { recursive: true, force: true });
  }
}
function step(context) {
  const state = observe(context);
  if (state.status === 'unreviewed' && context.request) return requestOnce(context, state);
  return state;
}
function shouldStop(state, now, deadline) {
  return ['complete', 'unreviewed', 'unknown'].includes(state.status) || now >= deadline;
}
export async function runGuard(options, deps = {}) {
  const context = contextFor(options, dependencies(deps));
  const deadline = context.now() + options.waitSeconds * 1000;
  while (true) {
    const state = step(context);
    if (shouldStop(state, context.now(), deadline))
      return { ...state, message: outputState(state) };
    await context.sleep(Math.min(POLL_INTERVAL_MS, deadline - context.now()));
  }
}
async function main(argv) {
  try {
    const result = await runGuard(parseArgs(argv));
    process.stdout.write(`${result.message}\n`);
    if (result.status !== 'complete') process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`Codex review guard failed closed: ${error.message}\n`);
    process.exitCode = 2;
  }
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(SCRIPT_PATH).href
) {
  await main(process.argv.slice(2));
}
