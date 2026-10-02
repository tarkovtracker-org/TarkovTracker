// Pure model for metrics.mjs: classifies files, summarizes Fallow health, and compares snapshots.
const codeExtension = /\.(?:[cm]?[jt]sx?|vue)$/;
const testPath = /(?:^|\/)(?:__tests__|tests)\/|\.(?:test|spec)\.[^/]+$/;
const runtimeRoots = [/^app\//, /^shared\//, /^workers\/[^/]+\/src\//, /^supabase\/functions\//];
const categoryRules = [
  ['tests', (path) => codeExtension.test(path) && testPath.test(path)],
  ['runtime', (path) => codeExtension.test(path) && runtimeRoots.some((root) => root.test(path))],
  ['tooling', (path) => codeExtension.test(path) && path.startsWith('scripts/')],
  ['migrations', (path) => /^supabase\/migrations\/.+\.sql$/.test(path)],
];
export const classifyPath = (path) => categoryRules.find(([, matches]) => matches(path))?.[0];
export const countLines = (text) => {
  if (text.length === 0) return 0;
  const breaks = text.split('\n').length - 1;
  return text.endsWith('\n') ? breaks : breaks + 1;
};
export function summarizeLoc(entries) {
  const totals = Object.fromEntries(categoryRules.map(([name]) => [name, { files: 0, lines: 0 }]));
  for (const { path, lines } of entries) {
    const bucket = totals[classifyPath(path)];
    if (!bucket) continue;
    bucket.files += 1;
    bucket.lines += lines;
  }
  return totals;
}
const countBySeverity = (findings, severity) =>
  findings.filter((finding) => finding.severity === severity).length;
const finiteOrNull = (value) => (Number.isFinite(value) ? value : null);
function summarizeCrap({ findings, summary }) {
  const threshold = finiteOrNull(summary.max_crap_threshold) ?? 30;
  const scores = findings.map((finding) => finding.crap).filter(Number.isFinite);
  return {
    model: summary.coverage_model ?? 'unknown',
    above_threshold: scores.filter((score) => score >= threshold).length,
    max: Math.max(0, ...scores),
  };
}
const vitalFields = ['maintainability_avg', 'avg_cyclomatic', 'p90_cyclomatic', 'duplication_pct'];
export function summarizeHealth(report) {
  const {
    findings = [],
    summary = {},
    vital_signs: vitals = {},
    health_score: score = {},
  } = report;
  return {
    score: finiteOrNull(score.score),
    grade: score.grade ?? null,
    critical: countBySeverity(findings, 'critical'),
    high: countBySeverity(findings, 'high'),
    moderate: countBySeverity(findings, 'moderate'),
    functions_above_threshold: finiteOrNull(summary.functions_above_threshold),
    ...Object.fromEntries(vitalFields.map((field) => [field, finiteOrNull(vitals[field])])),
    dead_exports: finiteOrNull(vitals.counts?.dead_exports),
    crap: summarizeCrap({ findings, summary }),
  };
}
const higherIsBetter = new Set(['health.score', 'health.maintainability_avg']);
// Test volume is reported for context; more or fewer test lines is not a quality signal by itself.
const neutral = new Set(['loc.tests.lines']);
const comparedMetrics = [
  ['Runtime LOC', 'loc.runtime.lines'],
  ['Test LOC', 'loc.tests.lines'],
  ['Tooling LOC', 'loc.tooling.lines'],
  ['Migration LOC', 'loc.migrations.lines'],
  ['Health score', 'health.score'],
  ['Critical findings', 'health.critical'],
  ['High findings', 'health.high'],
  ['Moderate findings', 'health.moderate'],
  ['Functions over threshold', 'health.functions_above_threshold'],
  ['Average maintainability', 'health.maintainability_avg'],
  ['Average cyclomatic', 'health.avg_cyclomatic'],
  ['Duplication %', 'health.duplication_pct'],
  ['Dead exports', 'health.dead_exports'],
  ['CRAP over threshold', 'health.crap.above_threshold'],
  ['Max CRAP', 'health.crap.max'],
];
const readPath = (snapshot, key) =>
  key.split('.').reduce((value, part) => value?.[part], snapshot) ?? null;
const round = (value) => Math.round(value * 100) / 100;
const improvingSign = (key) => (higherIsBetter.has(key) ? 1 : -1);
function verdict(key, delta) {
  if (delta === 0) return 'same';
  if (neutral.has(key)) return 'changed';
  return Math.sign(delta) === improvingSign(key) ? 'better' : 'worse';
}
// Fallow reads coverage/coverage-final.json when present, which changes CRAP and every severity
// count, so a measured snapshot is never compared with an estimated one.
export function assertComparable(base, head) {
  const [before, after] = [base.health.crap.model, head.health.crap.model];
  if (before === after) return;
  throw new Error(
    `CRAP models differ (base ${before}, head ${after}); move coverage/ aside to compare refs`
  );
}
export function compareSnapshots(base, head) {
  return comparedMetrics.map(([label, key]) => {
    const before = readPath(base, key);
    const after = readPath(head, key);
    if (![before, after].every(Number.isFinite)) {
      return { label, key, base: before, head: after, delta: null, verdict: 'n/a' };
    }
    const delta = round(after - before);
    return { label, key, base: before, head: after, delta, verdict: verdict(key, delta) };
  });
}
const signed = (delta) => (delta > 0 ? `+${delta}` : String(delta));
const formatDelta = (delta) => (delta === null ? 'n/a' : signed(delta));
const cell = (value) => value ?? 'n/a';
const verdictMark = {
  better: '✅ better',
  worse: '⚠️ worse',
  same: 'same',
  changed: 'changed',
  'n/a': 'n/a',
};
const formatRow = (row) =>
  `| ${row.label} | ${cell(row.base)} | ${cell(row.head)} | ${formatDelta(row.delta)} | ` +
  `${verdictMark[row.verdict]} |`;
export function renderComparison(rows, meta) {
  const lines = [
    '## Codebase metrics',
    '',
    `Base \`${meta.base.slice(0, 12)}\` → head \`${meta.head.slice(0, 12)}\`. ` +
      `CRAP model: ${meta.crapModel}.`,
    '',
    '| Metric | Base | Head | Change | |',
    '| --- | ---: | ---: | ---: | --- |',
    ...rows.map(formatRow),
  ];
  return `${lines.join('\n')}\n`;
}
