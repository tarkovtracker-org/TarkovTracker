import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
const root = process.cwd();
const script = join(root, 'scripts/prod-db');
const directory = mkdtempSync(join(tmpdir(), 'prod-db-'));
const migration = join(directory, 'migration.sql');
const unsafeMigration = join(directory, 'unsafe-migration.sql');
const literalMigration = join(directory, 'literal-migration.sql');
const malformedMigration = join(directory, 'malformed-migration.sql');
const fakeSupabase = join(directory, 'supabase');
writeFileSync(
  migration,
  `-- comments should not affect classification\nalter table public.events add column created_at timestamptz;\ncreate index concurrently idx_events_created_at on public.events(created_at);\n`
);
writeFileSync(unsafeMigration, "DO $$ BEGIN EXECUTE format('select %s', '1'); END $$;");
writeFileSync(
  literalMigration,
  "update public.events set status = 'ready--still-literal;drop table ignored';"
);
writeFileSync(malformedMigration, "update public.events set status = 'unterminated;");
writeFileSync(
  fakeSupabase,
  `#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const args = process.argv.slice(2);
const sql = args.at(-1) ?? '';
const password = process.env.PGPASSFILE ? readFileSync(process.env.PGPASSFILE, 'utf8') : '';
if (process.env.FAKE_SUPABASE_FAIL === 'true') {
  console.error(\`failure password=\${password} url=\${process.env.PROD_DB_URL}\`);
  process.exit(1);
}
let data = [{
  database: 'postgres',
  observer_role: 'pi_prod_observer',
  observer_application_name: process.env.PGAPPNAME,
  statement_stats_reset: null,
  io_stats_reset: null,
  default_transaction_read_only: 'on',
  statement_timeout: '15s',
  lock_timeout: '1s',
  is_superuser: process.env.FAKE_SUPABASE_UNSAFE === 'true',
  can_create_database: false,
  can_create_role: false,
  can_replicate: false,
  can_bypass_rls: false,
  is_write_role: false,
  has_table_write: false,
  can_create_in_public: false,
  can_create_in_database: false,
  custom_config: 'secret-setting',
  arguments: args,
  password_received: password.includes('observer\\\\:secret'),
  pgpass_database_matches_username: password.includes(':pi_prod_observer:pi_prod_observer:'),
  pgpass_file_received: Boolean(process.env.PGPASSFILE),
  pgpass_path: process.env.PGPASSFILE,
  prod_db_url_received: Boolean(process.env.PROD_DB_URL),
}];
if (process.env.FAKE_SUPABASE_INCOMPLETE === 'true') delete data[0].lock_timeout;
if (sql.includes('pg_catalog.pg_attribute')) {
  data = [{ column_name: 'id' }, { column_name: 'email' }];
}
if (process.env.FAKE_SUPABASE_NOISE === 'true') process.stdout.write('[warn] diagnostic\\n');
process.stdout.write(JSON.stringify({ rows: data }));
`
);
chmodSync(fakeSupabase, 0o755);
afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});
function run(args, extraEnv = {}) {
  return execFileSync(script, args, {
    cwd: root,
    env: {
      ...process.env,
      PROD_DB_SUPABASE_BIN: fakeSupabase,
      PROD_DB_TARGET: 'local',
      ...extraEnv,
    },
    encoding: 'utf8',
  });
}
describe('prod-db observer', () => {
  it('keeps the tracked wrapper executable', () => {
    expect(statSync(script).mode & 0o111).not.toBe(0);
  });
  it('returns normalized JSON for health', () => {
    const result = JSON.parse(run(['health']));
    expect(result.ok).toBe(true);
    expect(result.operation).toBe('health');
    expect(result.target).toBe('local');
    expect(result.data.rows[0]).toHaveProperty('database');
    expect(result.observation.observer_application_name).toBe('pi-prod-observer');
    expect(result.observation).toHaveProperty('statement_stats_reset');
    expect(result.observation).toHaveProperty('io_stats_reset');
    expect(result.data.rows[0].custom_config).toBe('[REDACTED]');
  });
  it('keeps samples bounded and excludes sensitive columns', () => {
    const result = JSON.parse(run(['sample', '--table', 'user_progress', '--limit', '20']));
    expect(result.ok).toBe(true);
    expect(result.operation).toBe('sample');
    const query = result.data.rows[0].arguments.at(-1);
    expect(query).toContain('"id"');
    expect(query).not.toContain('email');
  });
  it('rejects sensitive distributions', () => {
    expect(() => run(['distribution', '--table', 'user_progress', '--column', 'email'])).toThrow(
      'distribution is not available for column'
    );
  });
  it('rejects invalid distribution column identifiers', () => {
    expect(() =>
      run(['distribution', '--table', 'user_progress', '--column', 'user_id;drop'])
    ).toThrow('invalid column');
  });
});
describe('prod-db migration preflight', () => {
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
  it('does not split comments or semicolons inside SQL string literals', () => {
    const result = JSON.parse(run(['preflight', '--migration', literalMigration]));
    expect(result.migration.classification.statement_count).toBe(1);
    expect(result.migration.classification.contains_data_change).toBe(true);
    expect(result.migration.classification.contains_ddl).toBe(false);
    expect(result.migration.classification.has_unclassified_statement).toBe(false);
  });
  it('fails closed for malformed SQL string literals', () => {
    const result = JSON.parse(run(['preflight', '--migration', malformedMigration]));
    expect(result.migration.classification.has_malformed_literal).toBe(true);
    expect(result.assessment).toBe('incomplete');
    expect(result.risk).toBe('unknown');
  });
});
describe('prod-db command boundary', () => {
  it('rejects transaction-pooler connection URLs', () => {
    expect(() =>
      run(['health'], {
        PROD_DB_TARGET: 'primary',
        PROD_DB_URL: 'postgresql://pi_prod_observer:secret@example.test:6543/postgres',
      })
    ).toThrow('transaction pooler');
  });
  it('rejects credentials supplied through URL query parameters', () => {
    expect(() =>
      run(['health'], {
        PROD_DB_TARGET: 'primary',
        PROD_DB_URL:
          'postgresql://pi_prod_observer:secret@example.test:5432/postgres?password=leaked',
      })
    ).toThrow('credentials must use URL userinfo');
  });
  it('requires TLS for primary connections', () => {
    expect(() =>
      run(['health'], {
        PROD_DB_TARGET: 'primary',
        PROD_DB_URL: 'postgresql://pi_prod_observer:secret@example.test:5432/postgres',
      })
    ).toThrow('must set sslmode');
  });
  it('matches the pgpass database to the libpq default', () => {
    const result = JSON.parse(
      run(['health'], {
        PROD_DB_TARGET: 'primary',
        PROD_DB_URL: 'postgresql://pi_prod_observer:observer%3Asecret@example.test?sslmode=require',
      })
    );
    expect(result.data.rows[0].pgpass_database_matches_username).toBe(true);
  });
  it('keeps credentials out of child arguments and redacts command failures', () => {
    const connection =
      'postgresql://pi_prod_observer:observer%3Asecret@example.test:5432/postgres?sslmode=require';
    const result = JSON.parse(
      run(['health'], { PROD_DB_TARGET: 'primary', PROD_DB_URL: connection })
    );
    expect(result.data.rows[0].arguments.join(' ')).not.toContain('observer:secret');
    expect(result.data.rows[0].password_received).toBe(true);
    expect(result.data.rows[0].pgpass_file_received).toBe(true);
    expect(existsSync(result.data.rows[0].pgpass_path)).toBe(false);
    expect(result.data.rows[0].prod_db_url_received).toBe(false);
    let failure;
    try {
      run(['health'], {
        FAKE_SUPABASE_FAIL: 'true',
        PROD_DB_TARGET: 'primary',
        PROD_DB_URL: connection,
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).not.toContain('observer:secret');
    expect(failure.message).not.toContain(String.raw`observer\:secret`);
  });
  it('ignores bracket-prefixed CLI noise before JSON output', () => {
    const result = JSON.parse(run(['health'], { FAKE_SUPABASE_NOISE: 'true' }));
    expect(result.ok).toBe(true);
  });
});
describe('prod-db canary', () => {
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
  it('rejects an unsafe observer role before running the canary reports', () => {
    expect(() => run(['canary'], { FAKE_SUPABASE_UNSAFE: 'true' })).toThrow(
      'unsafe observer configuration: observer role is a superuser'
    );
  });
  it('fails closed when observer health fields are missing', () => {
    expect(() => run(['canary'], { FAKE_SUPABASE_INCOMPLETE: 'true' })).toThrow(
      'incomplete observer health report; missing: lock_timeout'
    );
  });
});
