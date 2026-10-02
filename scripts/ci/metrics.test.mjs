import { describe, expect, it } from 'vitest';
import {
  assertComparable,
  classifyPath,
  compareSnapshots,
  countLines,
  renderComparison,
  summarizeHealth,
  summarizeLoc,
} from './metrics-lib.mjs';
const report = (overrides = {}) => ({
  findings: [
    { severity: 'critical', crap: 120 },
    { severity: 'high', crap: 30 },
    { severity: 'high' },
    { severity: 'moderate', crap: 12 },
  ],
  file_scores: [{ crap_max: 120, crap_above_threshold: 2 }],
  summary: {
    functions_above_threshold: 4,
    max_crap_threshold: 30,
    coverage_model: 'istanbul',
  },
  vital_signs: {
    maintainability_avg: 88.5,
    avg_cyclomatic: 2.7,
    p90_cyclomatic: 5,
    duplication_pct: 0.1,
    counts: { dead_exports: 3 },
  },
  health_score: { score: 77, grade: 'B' },
  ...overrides,
});
const snapshot = (runtime, health) => ({
  loc: {
    runtime: { files: 1, lines: runtime },
    tests: { files: 1, lines: 50 },
    tooling: { files: 1, lines: 10 },
    migrations: { files: 1, lines: 5 },
  },
  health,
});
describe('classifyPath', () => {
  it.each([
    ['app/stores/useTarkov.ts', 'runtime'],
    ['app/features/tasks/TaskCard.vue', 'runtime'],
    ['shared/utils/seasonNumber.ts', 'runtime'],
    ['workers/api-gateway/src/handlers/progress.ts', 'runtime'],
    ['supabase/functions/account-delete/index.ts', 'runtime'],
    ['app/stores/__tests__/useTarkov.test.ts', 'tests'],
    ['workers/api-gateway/src/__tests__/gateway.test.ts', 'tests'],
    ['tests/test-setup.ts', 'tests'],
    ['scripts/ci/metrics.test.mjs', 'tests'],
    ['app/tests/helper.ts', 'tests'],
    ['scripts/ci/metrics.mjs', 'tooling'],
    ['supabase/migrations/20260804043342_normalize.sql', 'migrations'],
  ])('puts %s in %s', (path, category) => {
    expect(classifyPath(path)).toBe(category);
  });
  it.each([
    'app/locales/en.json',
    'docs/api.md',
    'nuxt.config.ts',
    'app/testing/helper.json',
    'workers/api-gateway/wrangler.toml',
  ])('ignores %s', (path) => {
    expect(classifyPath(path)).toBeUndefined();
  });
});
describe('countLines', () => {
  it.each([
    ['', 0],
    ['one', 1],
    ['one\n', 1],
    ['one\ntwo', 2],
    ['one\ntwo\n', 2],
  ])('counts %j as %i lines', (text, lines) => {
    expect(countLines(text)).toBe(lines);
  });
});
describe('summarizeLoc', () => {
  it('totals files and lines per category and drops unclassified paths', () => {
    expect(
      summarizeLoc([
        { path: 'app/a.ts', lines: 10 },
        { path: 'app/b.vue', lines: 5 },
        { path: 'app/__tests__/a.test.ts', lines: 7 },
        { path: 'docs/a.md', lines: 100 },
      ])
    ).toEqual({
      tests: { files: 1, lines: 7 },
      runtime: { files: 2, lines: 15 },
      tooling: { files: 0, lines: 0 },
      migrations: { files: 0, lines: 0 },
    });
  });
});
describe('summarizeHealth', () => {
  it('includes CRAP below reporting thresholds and honors per-file threshold counts', () => {
    const health = summarizeHealth(
      report({
        findings: [],
        file_scores: [
          { crap_max: 12, crap_above_threshold: 1 },
          { crap_max: 20, crap_above_threshold: 2 },
        ],
      })
    );
    expect(health.crap).toEqual({ model: 'istanbul', above_threshold: 3, max: 20 });
  });
  it('extracts the score, severity counts, vitals, and CRAP from a Fallow report', () => {
    expect(summarizeHealth(report())).toEqual({
      score: 77,
      grade: 'B',
      critical: 1,
      high: 2,
      moderate: 1,
      functions_above_threshold: 4,
      maintainability_avg: 88.5,
      avg_cyclomatic: 2.7,
      p90_cyclomatic: 5,
      duplication_pct: 0.1,
      dead_exports: 3,
      crap: { model: 'istanbul', above_threshold: 2, max: 120 },
    });
  });
  it('reports missing fields as null instead of zero', () => {
    const health = summarizeHealth({});
    expect(health.score).toBeNull();
    expect(health.dead_exports).toBeNull();
    expect(health.crap).toEqual({ model: 'unknown', above_threshold: null, max: null });
  });
});
describe('compareSnapshots', () => {
  const base = snapshot(100, summarizeHealth(report()));
  it('marks lower complexity and fewer runtime lines as better', () => {
    const head = snapshot(
      90,
      summarizeHealth(
        report({ findings: [], file_scores: [], health_score: { score: 80, grade: 'B' } })
      )
    );
    const rows = Object.fromEntries(compareSnapshots(base, head).map((row) => [row.key, row]));
    expect(rows['loc.runtime.lines']).toMatchObject({ delta: -10, verdict: 'better' });
    expect(rows['health.score']).toMatchObject({ delta: 3, verdict: 'better' });
    expect(rows['health.critical']).toMatchObject({ delta: -1, verdict: 'better' });
    expect(rows['health.crap.max']).toMatchObject({ delta: -120, verdict: 'better' });
  });
  it('marks regressions as worse and keeps test volume neutral', () => {
    const head = snapshot(110, summarizeHealth(report({ health_score: { score: 70 } })));
    head.loc.tests.lines = 80;
    const rows = Object.fromEntries(compareSnapshots(base, head).map((row) => [row.key, row]));
    expect(rows['loc.runtime.lines'].verdict).toBe('worse');
    expect(rows['health.score'].verdict).toBe('worse');
    expect(rows['loc.tests.lines']).toMatchObject({ delta: 30, verdict: 'changed' });
    expect(rows['health.critical'].verdict).toBe('same');
  });
  it('does not invent a delta when either side lacks a value', () => {
    const rows = compareSnapshots(base, snapshot(100, summarizeHealth({})));
    expect(rows.find((row) => row.key === 'health.score')).toMatchObject({
      base: 77,
      head: null,
      delta: null,
      verdict: 'n/a',
    });
  });
});
describe('assertComparable', () => {
  const withModel = (model) =>
    snapshot(1, summarizeHealth(report({ summary: { coverage_model: model } })));
  it('accepts snapshots that share a CRAP model', () => {
    expect(() =>
      assertComparable(withModel('static_estimated'), withModel('static_estimated'))
    ).not.toThrow();
  });
  it('rejects different analyzer configurations', () => {
    const base = { ...withModel('static_estimated'), analysis_config: 'before' };
    const head = { ...withModel('static_estimated'), analysis_config: 'after' };
    expect(() => assertComparable(base, head)).toThrow('Fallow configurations differ');
  });
  it('rejects a measured head against an estimated base', () => {
    expect(() => assertComparable(withModel('static_estimated'), withModel('istanbul'))).toThrow(
      'CRAP models differ (base static_estimated, head istanbul)'
    );
  });
});
describe('renderComparison', () => {
  it('labels working-tree evidence explicitly', () => {
    expect(
      renderComparison([], { base: 'a', head: 'a', crapModel: 'static_estimated', dirty: true })
    ).toContain('Head includes uncommitted working-tree changes.');
  });
  it('renders a Markdown table with signed changes', () => {
    const base = snapshot(100, summarizeHealth(report()));
    const markdown = renderComparison(compareSnapshots(base, snapshot(90, base.health)), {
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      crapModel: 'static_estimated',
    });
    expect(markdown).toContain('Base `aaaaaaaaaaaa` → head `bbbbbbbbbbbb`');
    expect(markdown).toContain('CRAP model: static_estimated.');
    expect(markdown).toContain('| Runtime LOC | 100 | 90 | -10 | ✅ better |');
    expect(markdown).toContain('| Health score | 77 | 77 | 0 | same |');
    expect(markdown).not.toContain('uncommitted');
  });
});
