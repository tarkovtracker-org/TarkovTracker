// Pure briefing model for `change-brief.mjs`. All filesystem, Git, and Fallow access goes through
// the injected `io` object so tests can exercise the model without a checkout.
import { classifyPaths } from './validation-plan.mjs';
const codePattern = /\.(?:[cm]?[jt]sx?|vue)$/;
const testPattern =
  /(?:^|\/)__tests__\/|\.(?:test|spec)\.[cm]?[jt]sx?$|^scripts\/workflow-tests\/[^/]+\.mjs$|-tests\.mjs$/;
// Non-JavaScript files that load scripts or reference modules by path (workflows, config, SQL).
const pathReferenceSpecs = [
  '.github/',
  '.husky/',
  'package.json',
  '*.yml',
  '*.yaml',
  '*.toml',
  'supabase/*.sql',
];
// Markdown that can own behavior. `.cubic/` and the changelog are not sources (root AGENTS.md).
const docSpecs = ['*.md', ':!.cubic/', ':!CHANGELOG.md', ':!app/locales/'];
const codeSearchSpecs = ['app', 'shared', 'workers/api-gateway/src', 'tests', 'scripts'];
const maxListed = 12;
const maxBroaderTests = 25;
const alwaysOutsideGraph =
  'Never in any graph: runtime string lookups (i18n keys, Supabase RPC/table names, KV keys, upstream field names).';
export const isCodePath = (path) => codePattern.test(path);
export const isTestPath = (path) => isCodePath(path) && testPattern.test(path);
const isSourcePath = (path) => !isTestPath(path);
const stripExtension = (path) => path.replace(/\.[^./]+$/, '');
const stem = (path) => stripExtension(path.split('/').pop());
const directory = (path) => path.split('/').slice(0, -1).join('/');
const unique = (values) => [...new Set(values)];
const without = (items, excluded) => {
  const skip = new Set(excluded);
  return items.filter((item) => !skip.has(item));
};
const append = (map, key, values) => map.set(key, [...(map.get(key) || []), ...values]);
const normalizeGenerated = (path) => path.replace(/^(?:\.\.\/)+/, '');
export const kebabCase = (name) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
/** Maps component file -> registered names from `.nuxt/components.d.ts`. */
export function parseComponentMap(text) {
  const map = new Map();
  const pattern =
    /^export const (\w+): (?:LazyComponent<)?typeof import\("([^"]+\.vue)"\)\['default'\]/gm;
  for (const [, name, file] of text.matchAll(pattern))
    append(map, normalizeGenerated(file), [name]);
  return map;
}
const exposedName = (specifier) =>
  specifier
    .trim()
    .split(/\s+as\s+/)
    .pop();
/** Maps module path without extension -> auto-imported names from `.nuxt/imports.d.ts`. */
export function parseAutoImportMap(text) {
  const map = new Map();
  for (const [, names, file] of text.matchAll(/^export \{([^}]+)\} from '(\.\.\/[^']+)'/gm)) {
    append(map, stripExtension(normalizeGenerated(file)), names.split(',').map(exposedName));
  }
  return map;
}
const ancestorInstructions = (path) =>
  path
    .split('/')
    .slice(0, -1)
    .map((_, index, parts) => `${parts.slice(0, index + 1).join('/')}/AGENTS.md`);
/** Root AGENTS.md plus every scoped AGENTS.md on the ancestor chain of the given paths. */
export function scopedInstructions(paths, instructionFiles) {
  const available = new Set(instructionFiles);
  const scoped = paths.flatMap(ancestorInstructions).filter((path) => available.has(path));
  return unique(['AGENTS.md', ...scoped]);
}
const runnerFor = (path) => {
  if (path.startsWith('workers/api-gateway/')) return 'gateway';
  if (path.endsWith('.deno.test.ts')) return 'deno';
  return /^scripts\/(?:workflow-tests\/|codex-review\/.*-tests\.mjs$)/.test(path)
    ? 'node'
    : 'vitest';
};
const gatewayRelative = (files) => files.map((file) => file.replace('workers/api-gateway/', ''));
// Relative operands cannot become runner options. Keep filenames out of shell syntax entirely.
const testOperands = (files) => files.map((file) => `./${file}`);
const runnerCommands = {
  vitest: (files) => ({
    executable: 'pnpm',
    args: ['exec', 'vitest', 'run', ...testOperands(files)],
  }),
  gateway: (files) => ({
    executable: 'pnpm',
    args: [
      'exec',
      'vitest',
      'run',
      '--config',
      'workers/api-gateway/vitest.config.ts',
      ...testOperands(gatewayRelative(files)),
    ],
  }),
  node: (files) => ({ executable: 'node', args: ['--test', '--', ...testOperands(files)] }),
  deno: (files) => ({ executable: 'deno', args: ['test', '--', ...testOperands(files)] }),
};
/** Groups test files into shell-independent executable/argv records; never executed by the brief. */
export function testCommands(tests) {
  const groups = new Map();
  for (const test of tests) append(groups, runnerFor(test), [test]);
  return [...groups].map(([runner, files]) => runnerCommands[runner](files));
}
const typedChange = (paths) => paths.some((path) => /\.(?:[cm]?tsx?|vue)$/.test(path));
// Required local checks, in the order AGENTS.md lists them; CI remains authoritative.
const validationRules = [
  { command: 'pnpm run lint', applies: (plan) => plan.full },
  { command: 'pnpm run typecheck', applies: (plan, paths) => plan.full && typedChange(paths) },
  {
    command: 'pnpm run i18n:check',
    applies: (plan, paths) => plan.locales || paths.includes('app/locales/en.json'),
  },
  { command: 'pnpm run test:workflow', applies: (plan) => plan.workflows },
  { command: 'pnpm run lint:fallow', applies: (plan) => plan.full },
  { command: 'pnpm run format:check', applies: () => true },
];
const scopedRules = [
  {
    prefix: 'workers/api-gateway/',
    check:
      'workers/api-gateway/AGENTS.md checks (types:check, typecheck, validate:openapi, test:api-gateway)',
  },
  { prefix: 'supabase/', check: 'supabase/AGENTS.md checks (supabase:check)' },
];
const touchesPrefix = (paths, prefix) => paths.some((path) => path.startsWith(prefix));
/** Required local validation for changing `paths`; `affected` adds scoped checks for consumers. */
export function validationFor(paths, affected = paths) {
  const plan = classifyPaths(paths);
  return {
    full: plan.full,
    previewRequired: plan.previewRequired,
    ciJobs: plan.jobs,
    commands: validationRules
      .filter((rule) => rule.applies(plan, paths))
      .map((rule) => rule.command),
    scoped: scopedRules
      .filter((rule) => touchesPrefix(affected, rule.prefix))
      .map((rule) => rule.check),
  };
}
const evidence = (report, key) => (report.evidence || {})[key]?.data || {};
const listOf = (data, key) => data[key] || [];
const symbolImporters = (report) =>
  listOf(evidence(report, 'trace_export'), 'direct_references').map((ref) => ref.from_file);
const fileImporters = (report) => listOf(evidence(report, 'trace_file'), 'imported_by');
const fallowImporters = (report, target) =>
  target.symbol ? symbolImporters(report) : fileImporters(report);
function componentNames(target, generated) {
  const names = generated.components?.get(target.file);
  return (
    names && {
      reason: 'Nuxt component auto-registration',
      names: [...names, ...names.map(kebabCase)],
    }
  );
}
function autoImportNames(target, generated) {
  const exported = generated.autoImports?.get(stripExtension(target.file)) || [];
  const names = target.symbol ? exported.filter((name) => name === target.symbol) : exported;
  return names.length ? { reason: 'Nuxt auto-import', names } : null;
}
/** Names a consumer could use without an import statement, and why. */
const implicitNames = (target, generated) =>
  componentNames(target, generated) || autoImportNames(target, generated);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function textOnlyConsumers(io, target, importers, implicit) {
  if (!implicit) return [];
  const hits = io.grepFiles(
    ['-w', '-E', implicit.names.map(escapeRegExp).join('|')],
    codeSearchSpecs
  );
  return without(hits, [target.file, ...importers]).filter(isCodePath);
}
const fallowNote = (target, report) =>
  report.error && `Fallow could not analyze ${target.file}: ${report.message}`;
// Fallow resolves most auto-imports itself, so only text hits it did not find are worth a note;
// component template usage is never in its graph, so that note is unconditional.
const implicitNote = (target, implicit, textOnly) =>
  implicit &&
  (textOnly.length > 0 || implicit.reason.includes('component')) &&
  `${target.file}: ${implicit.reason} consumers are text matches on ${implicit.names.slice(0, 4).join(', ')}; Fallow does not model this edge. Confirm each before relying on it.`;
const generatedNote = (target, generated) =>
  !generated.present &&
  target.file.startsWith('app/') &&
  'Missing .nuxt/*.d.ts: run `pnpm exec nuxt prepare`; auto-import and component checks were skipped.';
const notModule = {
  error: true,
  message: 'not a JavaScript/TypeScript/Vue module (text references only)',
};
const inspectTarget = (io, target) => (isCodePath(target.file) ? io.inspect(target) : notModule);
async function analyzeTarget(io, target, generated) {
  const report = await inspectTarget(io, target);
  const importers = fallowImporters(report, target);
  const implicit = report.error ? null : implicitNames(target, generated);
  const textOnly = textOnlyConsumers(io, target, importers, implicit);
  return {
    target,
    importers,
    textOnly,
    exports: listOf(evidence(report, 'trace_file'), 'exports').map((entry) => entry.name),
    transitive: listOf(evidence(report, 'impact_closure'), 'affected_not_shown'),
    diagnostics: listOf(evidence(report, 'dead_code'), 'workspace_diagnostics'),
    uncertainty: [
      fallowNote(target, report),
      implicitNote(target, implicit, textOnly),
      generatedNote(target, generated),
    ].filter(Boolean),
  };
}
const referencePair = (line, paths) => {
  const file = line.split(':')[0];
  const matched = paths.find((path) => line.includes(path) && path !== file);
  return matched ? { file, references: matched } : null;
};
/** Path-literal references from workflows, config, and SQL, which are outside any import graph. */
function pathReferences(io, paths) {
  const lines = io.grepLines(['-F', ...paths.flatMap((path) => ['-e', path])], pathReferenceSpecs);
  const pairs = lines.map((line) => referencePair(line, paths)).filter(Boolean);
  const keyed = new Map(pairs.map((pair) => [`${pair.file} -> ${pair.references}`, pair]));
  return [...keyed.values()];
}
const docTerms = (analyses) =>
  unique(
    analyses.flatMap(({ target }) => [target.file, `\`${target.symbol || stem(target.file)}\``])
  );
/** Docs that cite a target path or a backticked target name, as file:line anchors. */
function owningDocs(io, analyses) {
  const terms = docTerms(analyses).flatMap((term) => ['-e', term]);
  const anchors = new Map();
  for (const line of io.grepLines(['-n', '-F', ...terms], docSpecs)) {
    const [file, number] = line.split(':');
    append(anchors, file, [Number(number)]);
  }
  return [...anchors].map(([file, lines]) => ({ file, lines: lines.slice(0, 3) }));
}
const besideOwner = (file, owner) =>
  [directory(owner), `${directory(owner)}/__tests__`].includes(directory(file)) &&
  stem(file).startsWith(`${stem(owner)}.`);
const ownersOf = (analysis) => [analysis.target.file, ...analysis.importers.filter(isSourcePath)];
const directTests = (analyses) =>
  unique(analyses.flatMap((analysis) => [...analysis.importers, ...analysis.textOnly])).filter(
    isTestPath
  );
const nearbyTests = (analyses, testFiles) =>
  unique(
    analyses
      .flatMap(ownersOf)
      .flatMap((owner) => testFiles.filter((file) => besideOwner(file, owner)))
  );
/** Tests that import or text-match a target, sit beside a target or consumer, or reach it transitively. */
function candidateTests(io, analyses) {
  const direct = directTests(analyses);
  const nearby = without(nearbyTests(analyses, io.listFiles().filter(isTestPath)), direct);
  const reached = unique(analyses.flatMap((analysis) => analysis.transitive)).filter(isTestPath);
  return {
    direct: direct.sort(),
    nearby: nearby.sort(),
    transitive: without(reached, [...direct, ...nearby]).sort(),
  };
}
const relevantDiagnostic = (diagnostic, paths) =>
  diagnostic.degrades_analysis === true && touchesPrefix(paths, `${diagnostic.path}/`);
const degradedNotes = (analyses, touched) =>
  analyses
    .flatMap((analysis) => analysis.diagnostics)
    .filter((diagnostic) => relevantDiagnostic(diagnostic, touched))
    .map((diagnostic) => `Fallow analysis degraded for ${diagnostic.path}: ${diagnostic.message}`);
function summarizeAnalysis({ target, importers, textOnly, exports, transitive }) {
  return {
    target: target.symbol ? `${target.file}:${target.symbol}` : target.file,
    consumers: importers.filter(isSourcePath),
    testConsumers: importers.filter(isTestPath),
    textOnlyConsumers: textOnly,
    exports,
    transitiveFiles: transitive.length,
  };
}
/** Builds the complete briefing for one or more targets and any changed paths. */
export async function buildBrief(io, { targets, changedPaths = [], base }) {
  const generated = io.generated();
  const analyses = await io.map(targets, (target) => analyzeTarget(io, target, generated));
  const consumers = unique(analyses.flatMap((analysis) => analysis.importers.filter(isSourcePath)));
  const seeds = unique([...changedPaths, ...targets.map((target) => target.file)]);
  const touched = unique([
    ...seeds,
    ...consumers,
    ...analyses.flatMap((analysis) => analysis.textOnly),
  ]);
  const tests = candidateTests(io, analyses);
  return {
    base,
    unanalyzedChanges: without(
      changedPaths,
      targets.map((target) => target.file)
    ),
    targets: analyses.map(summarizeAnalysis),
    pathReferences: pathReferences(io, unique([...seeds, ...consumers]).slice(0, 60)),
    docs: owningDocs(io, analyses),
    instructions: scopedInstructions(touched, io.instructionFiles()),
    tests: {
      ...tests,
      commands: testCommands([...tests.direct, ...tests.nearby]),
      broaderCommands: testCommands(tests.transitive),
    },
    validation: validationFor(seeds, touched),
    uncertainty: unique([
      ...analyses.flatMap((analysis) => analysis.uncertainty),
      ...degradedNotes(analyses, touched),
    ]),
  };
}
const listed = (items) =>
  items.length > maxListed
    ? [...items.slice(0, maxListed), `… ${items.length - maxListed} more (--format json)`]
    : items;
const section = (title, items) =>
  items.length ? [`## ${title}`, ...items.map((item) => `- ${item}`), ''] : [];
const code = (command) => `\`${command}\``;
const commandRecord = (command) => JSON.stringify(command);
const textOnlyLine = (items) =>
  items.length
    ? [`- text-only consumers, UNVERIFIED (${items.length}): ${listed(items).join(', ')}`]
    : [];
const renderTarget = (summary) => [
  `## ${summary.target}`,
  `- consumers (Fallow graph, ${summary.consumers.length}): ${listed(summary.consumers).join(', ') || 'none'}`,
  ...textOnlyLine(summary.textOnlyConsumers),
  `- tests importing it: ${summary.testConsumers.length}; transitive dependents: ${summary.transitiveFiles}`,
  '',
];
function broaderTests({ transitive, broaderCommands }) {
  if (!transitive.length) return [];
  const summary = `broader: ${transitive.length} tests reach a target transitively`;
  if (transitive.length > maxBroaderTests) return [`${summary} (list: --format json)`];
  return [summary, ...broaderCommands.map(commandRecord)];
}
const testLines = (tests) => [
  ...(tests.commands.length || tests.broaderCommands.length
    ? ['Executable/argv records (JSON data; do not paste into a shell or join arguments):']
    : []),
  ...tests.commands.map(commandRecord),
  `${tests.direct.length} import or text-match a target; ${tests.nearby.length} sit beside a target or consumer`,
  ...broaderTests(tests),
];
const selectionLine = (validation) =>
  `${validation.full ? 'full' : 'reduced'} selection; preview ${validation.previewRequired ? 'required' : 'not applicable'}; CI jobs: ${validation.ciJobs.join(', ')}`;
const validationLines = (validation) => [
  selectionLine(validation),
  ...validation.commands.map(code),
  ...validation.scoped,
  'Advisory only: CI and AGENTS.md remain authoritative.',
];
/** Compact text rendering; every list is capped so the brief stays small. */
export function renderBrief(brief) {
  return [
    `# Change brief${brief.base ? ` (vs ${brief.base})` : ''}`,
    '',
    ...brief.targets.flatMap(renderTarget),
    ...section('Changed paths without graph analysis', listed(brief.unanalyzedChanges)),
    ...section(
      'Referenced by path outside the import graph',
      listed(brief.pathReferences.map(({ file, references }) => `${file} -> ${references}`))
    ),
    ...section(
      'Owning docs (read only these lines)',
      brief.docs.map(({ file, lines }) => `${file}:${lines.join(',')}`)
    ),
    ...section('Scoped instructions', brief.instructions),
    ...section('Candidate tests', testLines(brief.tests)),
    ...section('Required validation', validationLines(brief.validation)),
    ...section('Uncertainty', [...brief.uncertainty, alwaysOutsideGraph]),
  ].join('\n');
}
