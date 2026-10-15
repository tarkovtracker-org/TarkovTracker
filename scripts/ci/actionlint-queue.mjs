import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const queuedFiles = new Map([
  ['.github/workflows/preview-retention.yml', 'pages-preview-lifecycle'],
  ['.github/workflows/release-promotion-queue.yml', 'release-promotion-queue'],
]);
const specializedNormalizers = new Map([
  ['.github/workflows/preview.yml', normalizePreviewWorkflow],
  ['.github/workflows/review-admission.yml', normalizeAdmissionWorkflow],
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
  const expected =
    '    concurrency:\n      group: review-admission-publication\n      queue: max\n      cancel-in-progress: false\n';
  const jobs = matchingBlock(source, /^jobs:\n(?:[ \t]+[^\n]*\n|[ \t]*\n)*/m);
  const job = matchingBlock(jobs, /^ {2}admission:\n(?:[ \t]{4,}[^\n]*\n|[ \t]*\n)*/m);
  const block = matchingBlock(job, /^ {4}concurrency:\n(?:[ \t]{6,}[^\n]*\n)*/m);
  if (block !== expected) throw new Error(`Invalid admission job concurrency: ${filename}`);
  requireSingleConcurrency(source, filename);
  return source.replace(expected, expected.replace('      queue: max', ''));
}
function matchingBlock(source, pattern) {
  return source.match(pattern)?.[0] ?? '';
}
function requireSingleConcurrency(source, filename) {
  const occurrences = source.match(/^[ \t]*concurrency:/gm) ?? [];
  if (occurrences.length !== 1) throw new Error(`Ambiguous admission job concurrency: ${filename}`);
}
/** Run unchanged native checks, extending only the strictly validated serialization blocks. */
function lintWorkflow(binary, filename) {
  const source = readFileSync(filename, 'utf8');
  const normalized = normalizeQueueWorkflow(source, filename);
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
