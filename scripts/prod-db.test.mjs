import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
const root = process.cwd();
const script = join(root, 'scripts/prod-db');
const directory = mkdtempSync(join(tmpdir(), 'prod-db-'));
const migration = join(directory, 'migration.sql');
const unsafeMigration = join(directory, 'unsafe-migration.sql');
writeFileSync(
  migration,
  `-- comments should not affect classification\nalter table public.events add column created_at timestamptz;\ncreate index concurrently idx_events_created_at on public.events(created_at);\n`
);
writeFileSync(unsafeMigration, "DO $$ BEGIN EXECUTE format('select %s', '1'); END $$;");
chmodSync(script, 0o755);
afterAll(() => {
  try {
    execFileSync('rm', ['-rf', directory]);
  } catch {
    return;
  }
});
function run(args, extraEnv = {}) {
  return execFileSync(script, args, {
    cwd: root,
    env: { ...process.env, PROD_DB_TARGET: 'local', ...extraEnv },
    encoding: 'utf8',
  });
}
describe('prod-db observer', () => {
  it('returns normalized JSON for health', () => {
    const result = JSON.parse(run(['health']));
    expect(result.ok).toBe(true);
    expect(result.operation).toBe('health');
    expect(result.target).toBe('local');
    expect(result.data.rows[0]).toHaveProperty('database');
    expect(result.observation.observer_application_name).toBe('pi-prod-observer');
    expect(result.observation).toHaveProperty('statement_stats_reset');
    expect(result.observation).toHaveProperty('io_stats_reset');
  });
  it('keeps samples bounded and excludes sensitive columns', () => {
    const result = JSON.parse(run(['sample', '--table', 'user_progress', '--limit', '20']));
    expect(result.ok).toBe(true);
    expect(result.operation).toBe('sample');
  });
  it('rejects sensitive distributions', () => {
    expect(() => run(['distribution', '--table', 'user_progress', '--column', 'email'])).toThrow(
      'distribution is not available for column'
    );
  });
  it('rejects unsafe SQL through the internal query guard', () => {
    expect(() =>
      run(['distribution', '--table', 'user_progress', '--column', 'user_id;drop'])
    ).toThrow('invalid column');
  });
  it('builds a migration-aware preflight report without executing the migration', () => {
    const result = JSON.parse(run(['preflight', '--migration', migration]));
    expect(result.operation).toBe('preflight');
    expect(result.migration.relations).toContain('public.events');
    expect(result.migration.classification.contains_ddl).toBe(true);
    expect(result.migration.classification.contains_index_build).toBe(true);
    expect(result.migration.classification.contains_concurrent_index).toBe(true);
    expect(result.migration.classification.statement_count).toBe(2);
    expect(result.assessment).toBe('incomplete');
    expect(result.risk).toBe('unknown');
    expect(result.requires_manual_review).toBe(true);
    expect(result.notes).toContain('This report is advisory and does not execute the migration.');
    expect(readFileSync(migration, 'utf8')).toContain('alter table');
  });
  it('fails closed for dynamic SQL', () => {
    const result = JSON.parse(run(['preflight', '--migration', unsafeMigration]));
    expect(result.assessment).toBe('incomplete');
    expect(result.risk).toBe('unknown');
    expect(result.requires_manual_review).toBe(true);
    expect(result.migration.classification.has_dynamic_sql).toBe(true);
    expect(result.migration.classification.unsupported_constructs.length).toBeGreaterThan(0);
  });
  it('rejects transaction-pooler connection URLs', () => {
    expect(() =>
      run(['health'], {
        PROD_DB_TARGET: 'primary',
        PROD_DB_URL: 'postgresql://pi_prod_observer:secret@example.test:6543/postgres',
      })
    ).toThrow('transaction pooler');
  });
  it('runs a telemetry-only canary without data-shape operations', () => {
    const result = JSON.parse(run(['canary']));
    expect(result.operation).toBe('canary');
    expect(result.checks.map((check) => check.operation)).toEqual([
      'health',
      'db-stats',
      'role-stats',
      'table-stats',
      'index-stats',
      'outliers',
    ]);
    expect(result.notes[0]).toContain('Telemetry-only canary');
  });
});
