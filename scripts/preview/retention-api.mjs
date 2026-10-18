import { PAGES_PROJECT, PRODUCTION_BRANCH } from './profile.mjs';
const PAGE_SIZE = 100;
const PAGE_BUDGET = 10;
const PAGES_PAGE_SIZE = 25;
const PAGES_PAGE_BUDGET = 40;
const PREFIX = `heads/gh-readonly-queue/${PRODUCTION_BRANCH}/`;
function requireArray(value) {
  if (!Array.isArray(value)) throw new Error('Retention inventory is not an array.');
  return value;
}
function requireRunPage(data) {
  if (!Number.isSafeInteger(data.total_count) || data.total_count < 0)
    throw new Error('Missing GitHub inventory total.');
  if (data.total_count >= PAGE_SIZE * PAGE_BUDGET)
    throw new Error('GitHub retention inventory reached the search limit.');
  return requireArray(data.workflow_runs);
}
/** Never mistake API/search truncation for an empty or complete inventory. */
async function runs(github, repo, query) {
  const result = [];
  for (let page = 1; page <= PAGE_BUDGET; page++) {
    const { data } = await github.rest.actions.listWorkflowRuns({
      ...repo,
      ...query,
      page,
      per_page: PAGE_SIZE,
    });
    const batch = requireRunPage(data);
    result.push(...batch);
    if (result.length === data.total_count) return result;
    if (batch.length === 0) throw new Error('Incomplete GitHub retention inventory.');
  }
  throw new Error('GitHub retention pagination budget exceeded.');
}
export async function retentionRun(github, repo, runId) {
  const { data } = await github.rest.actions.getWorkflowRun({ ...repo, run_id: runId });
  return data;
}
export async function controllerWorkflow(github, repo, sha) {
  const { data } = await github.rest.repos.getContent({
    ...repo,
    path: '.github/workflows/preview.yml',
    ref: sha,
  });
  if (data.type !== 'file' || data.encoding !== 'base64')
    throw new Error('Unknown historical preview workflow identity.');
  return Buffer.from(data.content, 'base64').toString('utf8');
}
export async function pendingPreviews(github, repo) {
  const statuses = ['queued', 'in_progress', 'waiting', 'pending', 'requested'];
  const batches = await Promise.all(
    statuses.map((status) => runs(github, repo, { workflow_id: 'preview.yml', status }))
  );
  return batches.flat();
}
export async function liveQueueAliases(github, repo, branchName) {
  const response = await github.rest.git.listMatchingRefs({ ...repo, ref: PREFIX });
  if (response.headers?.link) throw new Error('Unexpected paginated queue ref inventory.');
  const refs = requireArray(response.data);
  if (refs.length >= 1000) throw new Error('Queue ref inventory budget exceeded.');
  return refs.map((ref) => checkedAlias(ref, branchName));
}
function checkedAlias(ref, branchName) {
  if (!ref.ref?.startsWith(`refs/${PREFIX}`)) throw new Error('Unexpected queue reference.');
  if (!/^[0-9a-f]{40}$/.test(String(ref.object?.sha))) throw new Error('Malformed queue SHA.');
  return branchName({ branch: ref.ref.slice('refs/heads/'.length) });
}
export async function queueRefAbsent(github, repo, branch) {
  try {
    await github.rest.git.getRef({ ...repo, ref: `heads/${branch}` });
    return false;
  } catch (error) {
    if (error.status === 404) return true;
    throw error;
  }
}
export async function previewStatus(github, repo, sha) {
  const { data, headers } = await github.rest.repos.listCommitStatusesForRef({
    ...repo,
    ref: sha,
    per_page: 100,
  });
  // A target's latest matching status cannot be inferred from a truncated page.
  if (headers?.link) throw new Error('Preview status evidence exceeds one page.');
  const statuses = requireArray(data).filter((status) => status.context === 'Preview Result');
  return statuses.toSorted((a, b) => b.id - a.id)[0] ?? null;
}
/** The Pages client fixes account/project and does not accept candidate URLs or credentials. */
export function retentionPages({ accountId, token, fetchImpl = fetch }) {
  if (!accountId || !token) throw new Error('Missing Pages retention credentials.');
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${PAGES_PROJECT}`;
  async function request(suffix, method = 'GET') {
    const response = await fetchImpl(`${base}${suffix}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Pages retention API returned ${response.status}.`);
    const body = await response.json();
    if (body.success !== true) throw new Error('Pages retention API reported failure.');
    return body;
  }
  return {
    project: async () => (await request('')).result,
    deployment: async (id) => (await request(`/deployments/${encodeURIComponent(id)}`)).result,
    remove: async (id) => request(`/deployments/${encodeURIComponent(id)}?force=true`, 'DELETE'),
    discover: async (now = Date.now()) => pagesDiscovery(request, now),
  };
}
function pagesMetadata(body, page) {
  const info = body.result_info;
  if (!info) throw new Error('Missing Pages retention pagination evidence.');
  const valid = [
    info.page === page,
    info.per_page === PAGES_PAGE_SIZE,
    Number.isSafeInteger(info.total_pages),
    info.total_pages >= 0,
    Number.isSafeInteger(info.total_count),
    info.total_count >= 0,
    info.total_pages === Math.ceil(info.total_count / PAGES_PAGE_SIZE),
  ];
  if (!valid.every(Boolean)) throw new Error('Invalid Pages retention pagination evidence.');
  return { totalPages: info.total_pages, totalCount: info.total_count };
}
function pageRows(body, page, snapshot) {
  const metadata = pagesMetadata(body, page);
  if (JSON.stringify(metadata) !== JSON.stringify(snapshot))
    throw new Error('Pages retention inventory changed during discovery.');
  const records = requireArray(body.result);
  const expected = Math.min(PAGES_PAGE_SIZE, snapshot.totalCount - (page - 1) * PAGES_PAGE_SIZE);
  if (records.length !== expected) throw new Error('Incomplete Pages retention discovery page.');
  return records;
}
function discoveryWindow(snapshot, now) {
  if (!Number.isFinite(now) || now < 0) throw new Error('Invalid Pages discovery clock.');
  const windows = Math.max(1, Math.ceil(snapshot.totalPages / PAGES_PAGE_BUDGET));
  const epoch = Math.floor(now / (60 * 60 * 1000));
  const index = epoch % windows;
  const start = index * PAGES_PAGE_BUDGET + 1;
  return {
    start,
    end: Math.min(start + PAGES_PAGE_BUDGET - 1, snapshot.totalPages),
    cycle: Math.floor(epoch / windows),
    index,
    windows,
  };
}
function discoveryPage(request, page) {
  return request(`/deployments?env=preview&page=${page}&per_page=${PAGES_PAGE_SIZE}`);
}
/** Candidate discovery is a rotating partial window, never evidence that a deployment is absent. */
async function pagesDiscovery(request, now) {
  const first = await discoveryPage(request, 1);
  const snapshot = pagesMetadata(first, 1);
  const window = discoveryWindow(snapshot, now);
  const records = [];
  for (let page = window.start; page <= window.end; page++) {
    const body = page === 1 ? first : await discoveryPage(request, page);
    records.push(...pageRows(body, page, snapshot));
  }
  return {
    records,
    discovery: { ...snapshot, ...window, partial: snapshot.totalPages > PAGES_PAGE_BUDGET },
  };
}
