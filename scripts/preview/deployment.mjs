import { PAGES_DOMAIN, PAGES_PROJECT, PRODUCTION_BRANCH } from './profile.mjs';
// Deployment evidence: parse Wrangler's machine-readable output and compare the Cloudflare API
// record with the plan before the deployment URL is handed to the credential-free smoke job.
const DEPLOYMENT_ID_PATTERN = /^[0-9a-f-]{8,64}$/;
/** Locate the detailed Pages deploy record in Wrangler's NDJSON output file. */
export function parseWranglerOutput(ndjson) {
  const records = String(ndjson)
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
  const detailed = records.filter((record) => record.type === 'pages-deploy-detailed');
  if (detailed.length !== 1) throw new Error('Expected exactly one Pages deployment record.');
  return detailed[0];
}
function urlErrors(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return ['deployment URL is malformed'];
  }
  const errors = [];
  if (parsed.protocol !== 'https:') errors.push('deployment URL is not HTTPS');
  if (!parsed.hostname.endsWith(`.${PAGES_DOMAIN}`)) errors.push('deployment URL host mismatch');
  return errors;
}
const IDENTITY_FIELDS = [
  ['project_name', PAGES_PROJECT, 'project mismatch'],
  ['environment', 'preview', 'deployment is not in the preview environment'],
];
function identityFieldErrors(record) {
  return IDENTITY_FIELDS.filter(([field, expected]) => record[field] !== expected).map(
    ([, , message]) => message
  );
}
function deploymentIdErrors(record, expected) {
  const errors = [];
  if (!DEPLOYMENT_ID_PATTERN.test(String(record.id))) errors.push('deployment id is malformed');
  if (record.id !== expected.deploymentId) errors.push('deployment id mismatch');
  return errors;
}
function identityErrors(record, expected) {
  return [...identityFieldErrors(record), ...deploymentIdErrors(record, expected)];
}
function triggerMetadata(record) {
  return record.deployment_trigger?.metadata ?? {};
}
function triggerErrors(record, expected) {
  const metadata = triggerMetadata(record);
  const errors = [];
  if (metadata.branch !== expected.previewBranch) errors.push('deployment branch mismatch');
  if (metadata.branch === PRODUCTION_BRANCH) errors.push('deployment targets production branch');
  if (metadata.commit_hash !== expected.headSha) errors.push('deployment commit mismatch');
  return errors;
}
/** Every discrepancy between the live Cloudflare deployment record and the verified plan. */
export function deploymentRecordErrors(record, expected) {
  return [
    ...identityErrors(record, expected),
    ...triggerErrors(record, expected),
    ...urlErrors(record.url),
  ];
}
export async function fetchDeploymentRecord({ accountId, token, deploymentId, fetchImpl }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${PAGES_PROJECT}/deployments/${encodeURIComponent(deploymentId)}`;
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Cloudflare API returned ${response.status}.`);
  const body = await response.json();
  if (!body.success || !body.result) throw new Error('Cloudflare API reported failure.');
  return body.result;
}
