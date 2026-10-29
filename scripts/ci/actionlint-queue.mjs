import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const queuedFiles = new Map([
  ['.github/workflows/preview-retention.yml', 'pages-preview-lifecycle'],
]);
const specializedNormalizers = new Map([
  ['.github/workflows/preview.yml', normalizePreviewWorkflow],
  ['.github/workflows/review-admission.yml', normalizeAdmissionWorkflow],
  ['.github/workflows/release-promotion-queue.yml', normalizePromotionWorkflow],
]);
/** Validate the documented queue extension before the older native parser sees the workflow. */
export function normalizeQueueWorkflow(source, filename) {
  const specialized = specializedNormalizers.get(filename);
  if (specialized) return specialized(source, filename);
  const group = queuedFiles.get(filename);
  if (!group) return source;
  const concurrency = `concurrency:\n  group: ${group}\n  queue: max\n  cancel-in-progress: false\n`;
  const block = matchingBlock(source, /^concurrency:\n(?:[ \t]+[^\n]*\n)*/m);
  if (block !== concurrency) throw new Error(`Invalid preview lifecycle concurrency: ${filename}`);
  // Preserve line numbers. Every other key/expression/shell check remains native actionlint input.
  return source.replace(concurrency, concurrency.replace('  queue: max', ''));
}
function normalizePreviewWorkflow(source, filename) {
  const expected =
    "concurrency:\n  group: ${{ inputs.queue && 'pages-preview-lifecycle' || format('preview-ci-{0}', inputs.run_id) }}\n  queue: ${{ inputs.queue && 'max' || 'single' }}\n  cancel-in-progress: ${{ !inputs.queue }}\n";
  const block = matchingBlock(source, /^concurrency:\n(?:[ \t]+[^\n]*\n)*/m);
  if (block !== expected) throw new Error(`Invalid preview lifecycle concurrency: ${filename}`);
  return source.replace(
    expected,
    expected.replace("  queue: ${{ inputs.queue && 'max' || 'single' }}", '')
  );
}
function normalizeAdmissionWorkflow(source, filename) {
  return normalizeSerializedJob(source, filename, 'admission', 'review-admission-publication');
}
function normalizePromotionWorkflow(source, filename) {
  return normalizeSerializedJob(source, filename, 'enqueue', 'release-promotion-queue');
}
function normalizeSerializedJob(source, filename, name, group) {
  const expected = `    concurrency:\n      group: ${group}\n      queue: max\n      cancel-in-progress: false\n`;
  const jobs = matchingBlock(source, /^jobs:\n(?:[ \t]+[^\n]*\n|[ \t]*\n)*/m);
  const job = matchingBlock(
    jobs,
    new RegExp(`^ {2}${name}:\\n(?:[ \\t]{4,}[^\\n]*\\n|[ \\t]*\\n)*`, 'm')
  );
  const block = matchingBlock(job, /^ {4}concurrency:\n(?:[ \t]{6,}[^\n]*\n)*/m);
  if (block !== expected) throw new Error(`Invalid serialized job concurrency: ${filename}`);
  requireSingleConcurrency(source, filename);
  return source.replace(expected, expected.replace('      queue: max', ''));
}
function matchingBlock(source, pattern) {
  return source.match(pattern)?.[0] ?? '';
}
function requireSingleConcurrency(source, filename) {
  const occurrences = source.match(/^[ \t]*concurrency:/gm) ?? [];
  if (occurrences.length !== 1)
    throw new Error(`Ambiguous serialized job concurrency: ${filename}`);
}
const publisherJobs = new Map([
  ['.github/workflows/review-admission.yml', ['admission', 'review-admission']],
  // Queue Submitter App key holders (configuration-only `merge-queue` environment).
  ['.github/workflows/crowdin.yml', ['sync', 'merge-queue']],
  ['.github/workflows/dependabot-auto-merge.yml', ['auto-merge', 'merge-queue']],
  ['.github/workflows/release-promotion-queue.yml', ['enqueue', 'merge-queue']],
]);
/** Validate the exact supported environment extension; keep every other native parser check. */
export function normalizePublisherEnvironment(source, filename) {
  const [name, environment] = publisherJobs.get(filename) ?? [];
  if (!name) return source;
  const jobs = matchingBlock(source, /^jobs:\n(?:[ \t]+[^\n]*\n|[ \t]*\n)*/m);
  const job = matchingBlock(
    jobs,
    new RegExp(`^ {2}${name}:\\n(?:[ \\t]{4,}[^\\n]*\\n|[ \\t]*\\n)*`, 'm')
  );
  const block = matchingBlock(job, /^ {4}environment:\n(?:[ \t]{6,}[^\n]*\n)*/m);
  requirePublisherEnvironment(block, filename, environment);
  requireSingleDeploymentExtension(source, filename);
  return source.replace(block, block.replace('      deployment: false', ''));
}
function requirePublisherEnvironment(block, filename, environment) {
  const properties = block.split('\n').slice(1, -1).sort().join('\n');
  const expected = `      deployment: false\n      name: ${environment}`;
  if (properties !== expected)
    throw new Error(`Invalid configuration-only publisher environment: ${filename}`);
}
function requireSingleDeploymentExtension(source, filename) {
  const declarations = source.match(/^[ \t]*deployment:/gm) ?? [];
  if (declarations.length !== 1)
    throw new Error(`Ambiguous publisher deployment extension: ${filename}`);
}
/** Run unchanged native checks, extending only the strictly validated serialization blocks. */
function lintWorkflow(binary, filename) {
  const source = readFileSync(filename, 'utf8');
  const normalized = normalizePublisherEnvironment(
    normalizeQueueWorkflow(source, filename),
    filename
  );
  const args = ['-color', '-stdin-filename', filename, '-'];
  const result = spawnSync(binary, args, {
    input: normalized,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`actionlint failed for ${filename}: ${result.status}`);
}
function workflowEntries() {
  const entries = readdirSync('.github/workflows', { withFileTypes: true }).filter((entry) =>
    /\.ya?ml$/.test(entry.name)
  );
  if (!entries.length) throw new Error('No workflows to lint');
  return entries;
}
function lintEntry(binary, entry) {
  if (!entry.isFile()) throw new Error(`Workflow is not a regular file: ${entry.name}`);
  lintWorkflow(binary, `.github/workflows/${entry.name}`);
}
/** Reject missing tools and nonregular workflow inputs rather than reporting an empty success. */
export function lintQueueWorkflows(binary) {
  if (!binary) throw new Error('Usage: actionlint-queue.mjs <pinned-actionlint-binary>');
  for (const entry of workflowEntries()) lintEntry(binary, entry);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  lintQueueWorkflows(process.argv[2]);
