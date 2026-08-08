#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
const ROOT = new URL('..', import.meta.url);
const SUPABASE_BIN = process.env.PROD_DB_SUPABASE_BIN ?? 'supabase';
const OBSERVER_APPLICATION_NAME = process.env.PROD_DB_APPLICATION_NAME ?? 'pi-prod-observer';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_000_000;
const MAX_SAMPLE_LIMIT = 20;
const MAX_DISTRIBUTION_LIMIT = 50;
const MAX_COMMAND_ARGS = 8;
const SENSITIVE_COLUMN_PATTERN =
  /^(?:email|phone|full_name|address|token|secret|password|metadata|payload|content|ip|user_agent|token_value|token_hash|progress|data|state|settings|preferences|config)$/i;
const SAFE_SAMPLE_COLUMN_PATTERN =
  /^(?:id|created_at|updated_at|status|type|kind|account_type|game_mode|season_number|count)$/i;
const SAFE_DISTRIBUTION_COLUMN_PATTERN =
  /^(?:status|type|kind|account_type|game_mode|season_number)$/i;
const CANARY_OPERATIONS = ['db-stats', 'role-stats', 'table-stats', 'index-stats', 'outliers'];
const INSPECTION_COMMANDS = new Map([
  ['db-stats', 'db-stats'],
  ['index-stats', 'index-stats'],
  ['table-stats', 'table-stats'],
  ['traffic', 'traffic-profile'],
  ['outliers', 'outliers'],
  ['calls', 'calls'],
  ['locks', 'locks'],
  ['blocking', 'blocking'],
  ['long-running', 'long-running-queries'],
  ['vacuum', 'vacuum-stats'],
  ['bloat', 'bloat'],
  ['role-stats', 'role-stats'],
]);
const RESERVED_SQL_WORDS =
  /\b(?:insert|update|delete|merge|alter|drop|create|grant|revoke|truncate|comment|copy|call|do|refresh|vacuum|analyze|cluster|reindex|set\s+role|security\s+definer)\b/i;
const UNSAFE_SQL_PATTERNS = [
  /;\s*\S/,
  /\bpg_sleep\s*\(/i,
  /\bexplain\s+analyze\b/i,
  /\bselect\s+\*/i,
  /\bfrom\s+(?:pg_catalog\.)?pg_authid\b/i,
  /\bfrom\s+(?:information_schema\.)?columns\b/i,
];
function usage(message) {
  if (message) console.error(`prod-db: ${message}\n`);
  console.error(`Usage:
  scripts/prod-db health
  scripts/prod-db canary
  scripts/prod-db <db-stats|schema|table-stats|index-stats|traffic|outliers|calls|locks|blocking|long-running|vacuum|bloat|role-stats>
  scripts/prod-db sample --table <table> [--limit <1-20>]
  scripts/prod-db distribution --table <table> --column <column> [--limit <1-50>]
  scripts/prod-db count --table <table>
  scripts/prod-db preflight --migration <path>

Canary:
  canary runs telemetry-only production checks; it never reads application rows or runs preflight.

Environment:
  PROD_DB_URL                 Direct observer connection string; required for production.
  PROD_DB_TARGET              primary (default) or local.
  PROD_DB_TIMEOUT_MS          Command timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS}).
  PROD_DB_MAX_OUTPUT_BYTES    Maximum normalized output size (default: ${DEFAULT_MAX_OUTPUT_BYTES}).`);
  process.exitCode = 2;
}
function fail(message) {
  console.error(`prod-db: ${message}`);
  process.exitCode = 1;
}
function parseArgs(args) {
  const values = new Map();
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      values.set(key, true);
      continue;
    }
    values.set(key, value);
    index += 1;
  }
  return { positionals, values };
}
function getTarget() {
  const target = process.env.PROD_DB_TARGET ?? 'primary';
  if (target === 'local') return { flag: '--local', label: 'local' };
  if (target === 'primary') {
    const connectionString = process.env.PROD_DB_URL;
    if (!connectionString) {
      throw new Error(
        'PROD_DB_URL is required for the primary target; use PROD_DB_TARGET=local for local inspection'
      );
    }
    let parsed;
    try {
      parsed = new URL(connectionString);
    } catch {
      throw new Error('PROD_DB_URL must be a valid PostgreSQL connection URL');
    }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
      throw new Error('PROD_DB_URL must use the postgres:// or postgresql:// scheme');
    }
    if (parsed.port === '6543') {
      throw new Error(
        'PROD_DB_URL must not use the transaction pooler; use a direct or session-mode connection'
      );
    }
    if (
      /^(?:postgres|supabase_admin|service_role|admin)$/i.test(decodeURIComponent(parsed.username))
    ) {
      throw new Error('PROD_DB_URL must use a dedicated non-admin observer role');
    }
    return { flag: '--db-url', value: connectionString, label: 'primary' };
  }
  throw new Error(`unsupported PROD_DB_TARGET: ${target}`);
}
function validateIdentifier(value, name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_$]*(?:\.[a-zA-Z_][a-zA-Z0-9_$]*)?$/.test(value)) {
    throw new Error(`invalid ${name}: ${value}`);
  }
  return value;
}
function parsePositiveInteger(value, name, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return parsed;
}
function parseJsonOutput(stdout, command) {
  const output = stdout.trim();
  if (!output) return { rows: [], message: command };
  const lines = output.split('\n');
  const jsonStart = lines.findIndex(
    (line) => line.trim().startsWith('{') || line.trim().startsWith('[')
  );
  if (jsonStart === -1) throw new Error(`Supabase CLI returned non-JSON output for ${command}`);
  try {
    return JSON.parse(lines.slice(jsonStart).join('\n'));
  } catch {
    throw new Error(`Supabase CLI returned invalid JSON for ${command}`);
  }
}
function redactValue(key, value) {
  if (typeof key === 'string' && SENSITIVE_COLUMN_PATTERN.test(key)) {
    return '[REDACTED]';
  }
  if (Array.isArray(value)) return value.map((item) => redactValue('', item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redactValue(childKey, childValue),
      ])
    );
  }
  return value;
}
function getCommandEnvironment() {
  if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,62}$/.test(OBSERVER_APPLICATION_NAME)) {
    throw new Error(
      'PROD_DB_APPLICATION_NAME must be 1-63 characters using letters, digits, _, ., or -'
    );
  }
  return { ...process.env, PGAPPNAME: OBSERVER_APPLICATION_NAME, SUPABASE_DB_PASSWORD: undefined };
}
function getCommandLimits() {
  const timeout = Number(process.env.PROD_DB_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 120_000) {
    throw new Error('PROD_DB_TIMEOUT_MS must be an integer between 1000 and 120000');
  }
  const maxOutputBytes = Number(process.env.PROD_DB_MAX_OUTPUT_BYTES ?? DEFAULT_MAX_OUTPUT_BYTES);
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1_024 || maxOutputBytes > 10_000_000) {
    throw new Error('PROD_DB_MAX_OUTPUT_BYTES must be an integer between 1024 and 10000000');
  }
  return { timeout, maxOutputBytes };
}
async function runRawQuery(sql, label) {
  const target = getTarget();
  const { timeout, maxOutputBytes } = getCommandLimits();
  const args = ['db', 'query', target.flag];
  if (target.value) args.push(target.value);
  args.push('--output', 'json', sql);
  try {
    const { stdout } = await execFileAsync(SUPABASE_BIN, args, {
      cwd: fileURLToPath(ROOT),
      env: getCommandEnvironment(),
      timeout,
      maxBuffer: maxOutputBytes,
    });
    return parseJsonOutput(stdout, label);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed: ${detail}`);
  }
}
function firstRow(data) {
  if (Array.isArray(data)) return data[0] ?? {};
  if (data && Array.isArray(data.rows)) return data.rows[0] ?? {};
  return {};
}
async function getObservation() {
  const data = await runRawQuery(
    `select
  now() as captured_at,
  current_database() as database,
  current_user as observer_role,
  current_setting('application_name', true) as observer_application_name,
  (select stats_reset from pg_stat_database where datname = current_database()) as database_stats_reset,
  (select stats_reset from pg_stat_statements_info) as statement_stats_reset,
  (select stats_reset from pg_stat_bgwriter) as io_stats_reset`,
    'observation'
  );
  return redactValue('', firstRow(data));
}
async function runSupabase(args, label) {
  if (args.length > MAX_COMMAND_ARGS)
    throw new Error(`internal command exceeded ${MAX_COMMAND_ARGS} arguments`);
  const target = getTarget();
  const { timeout, maxOutputBytes } = getCommandLimits();
  const commandArgs = ['inspect', 'db', ...args, target.flag];
  if (target.value) commandArgs.push(target.value);
  commandArgs.push('--output-format', 'json');
  try {
    const observation = await getObservation();
    const { stdout } = await execFileAsync(SUPABASE_BIN, commandArgs, {
      cwd: fileURLToPath(ROOT),
      env: getCommandEnvironment(),
      timeout,
      maxBuffer: maxOutputBytes,
    });
    const data = redactValue('', parseJsonOutput(stdout, label));
    return {
      ok: true,
      operation: label,
      target: target.label,
      generated_at: new Date().toISOString(),
      observation,
      data,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed: ${detail}`);
  }
}
async function runQuery(sql, label) {
  if (RESERVED_SQL_WORDS.test(sql) || UNSAFE_SQL_PATTERNS.some((pattern) => pattern.test(sql))) {
    throw new Error(`${label} rejected unsafe SQL`);
  }
  const target = getTarget();
  try {
    const [data, observation] = await Promise.all([runRawQuery(sql, label), getObservation()]);
    return {
      ok: true,
      operation: label,
      target: target.label,
      generated_at: new Date().toISOString(),
      observation,
      data: redactValue('', data),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed: ${detail}`);
  }
}
function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
async function runSchema() {
  return runQuery(
    `select
  n.nspname as schema,
  c.relname as relation,
  case c.relkind
    when 'r' then 'table'
    when 'p' then 'partitioned_table'
    when 'v' then 'view'
    when 'm' then 'materialized_view'
    when 'f' then 'foreign_table'
    else c.relkind::text
  end as relation_type,
  pg_total_relation_size(c.oid) as total_size_bytes,
  obj_description(c.oid, 'pg_class') as description
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
  and c.relkind in ('r', 'p', 'v', 'm', 'f')
order by pg_total_relation_size(c.oid) desc
limit 500`,
    'schema'
  );
}
async function runTableData(operation, table, column, limit) {
  const qualified = validateIdentifier(table, 'table');
  const [schema, relation] = qualified.includes('.') ? qualified.split('.') : ['public', qualified];
  const safeTable = `${schema}.${relation}`;
  if (operation === 'count') {
    return runQuery(
      `select
  n.nspname as schema,
  c.relname as relation,
  greatest(c.reltuples, 0)::bigint as estimated_row_count
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = ${quoteLiteral(schema)}
  and c.relname = ${quoteLiteral(relation)}
  and c.relkind in ('r', 'p')`,
      'count'
    );
  }
  if (operation === 'sample') {
    const columns = await runQuery(
      `select a.attname as column_name
from pg_catalog.pg_attribute a
join pg_catalog.pg_class c on c.oid = a.attrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = ${quoteLiteral(schema)}
  and c.relname = ${quoteLiteral(relation)}
  and a.attnum > 0
  and not a.attisdropped
order by a.attnum
limit 100`,
      'sample-columns'
    );
    const rows = Array.isArray(columns.data) ? columns.data : columns.data?.rows;
    if (!Array.isArray(rows) || rows.length === 0)
      throw new Error(`table not found or has no visible columns: ${safeTable}`);
    const selectedColumns = rows
      .map((row) => row.column_name)
      .filter((name) => typeof name === 'string' && SAFE_SAMPLE_COLUMN_PATTERN.test(name))
      .map((name) => `\"${name.replaceAll('"', '""')}\"`);
    if (selectedColumns.length === 0)
      throw new Error(`no non-sensitive sample columns available for ${safeTable}`);
    return runQuery(
      `select ${selectedColumns.join(', ')} from ${safeTable} limit ${limit}`,
      'sample'
    );
  }
  const safeColumn = validateIdentifier(column, 'column').split('.').at(-1);
  if (!SAFE_DISTRIBUTION_COLUMN_PATTERN.test(safeColumn)) {
    throw new Error(`distribution is not available for column: ${safeColumn}`);
  }
  return runQuery(
    `select ${safeColumn} as value, count(*)::bigint as count
from ${safeTable}
where ${safeColumn} is not null
group by ${safeColumn}
order by count desc
limit ${limit}`,
    'distribution'
  );
}
function rowsOf(report) {
  if (Array.isArray(report)) return report;
  if (report && Array.isArray(report.rows)) return report.rows;
  return [];
}
function parseSizeBytes(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(bytes|kB|MB|GB|TB)$/i);
  if (!match) return null;
  const multipliers = { bytes: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 };
  return Number(match[1]) * multipliers[match[2].toLowerCase()];
}
function extractMigrationRelations(source) {
  const relations = new Set();
  const normalizedSource = source.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const patterns = [
    /\b(?:alter\s+table|create\s+(?:unique\s+)?index\s+\S+\s+on|drop\s+table|truncate\s+table|update|delete\s+from|insert\s+into)\s+(?:if\s+(?:not\s+)?exists\s+)?([a-zA-Z_][\w$]*(?:\.[a-zA-Z_][\w$]*)?)/gi,
    /\bfrom\s+([a-zA-Z_][\w$]*(?:\.[a-zA-Z_][\w$]*)?)/gi,
    /\bjoin\s+([a-zA-Z_][\w$]*(?:\.[a-zA-Z_][\w$]*)?)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of normalizedSource.matchAll(pattern)) {
      const relation = match[1].replace(/^public\./i, 'public.');
      if (!['select', 'where', 'set', 'values', 'using', 'on'].includes(relation.toLowerCase()))
        relations.add(relation.includes('.') ? relation : `public.${relation}`);
    }
  }
  return [...relations].sort();
}
function classifyMigration(source) {
  const normalized = source
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .toLowerCase();
  const statementTexts = normalized
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
  const unsupportedPatterns = [
    /\bdo\s*\$\$/,
    /\bcreate\s+(?:or\s+replace\s+)?function\b/,
    /\bcreate\s+(?:or\s+replace\s+)?procedure\b/,
    /\bcreate\s+(?:or\s+replace\s+)?trigger\b/,
    /\balter\s+type\b/,
    /\bpartition\b/,
    /\bexecute\s+(?:format\s*\(|\$)/,
    /\bformat\s*\(/,
    /\bcopy\b/,
    /\bextension\b/,
    /\bprepare\b/,
    /\b(?:execute|query)\s+immediate\b/,
    /\bcreate\s+policy\b/,
    /\bcreate\s+view\b/,
    /\bcreate\s+materialized\s+view\b/,
  ];
  const unsupported_constructs = unsupportedPatterns
    .filter((pattern) => pattern.test(normalized))
    .map((pattern) => pattern.source);
  const hasQuotedIdentifier = /["`]/.test(normalized);
  const hasDynamicSql = /\b(?:execute|format)\b/.test(normalized);
  const hasUnclassifiedStatement = statementTexts.some(
    (statement) =>
      !/^(?:alter\s+table|create\s+(?:unique\s+)?index|drop\s+table|truncate\s+table|update|delete\s+from|insert\s+into|select|set|reset|grant|revoke|comment\s+on)\b/.test(
        statement
      )
  );
  const incomplete =
    unsupported_constructs.length > 0 ||
    hasQuotedIdentifier ||
    hasDynamicSql ||
    hasUnclassifiedStatement ||
    statementTexts.length > 1;
  const classification = {
    contains_ddl: /\b(alter|create|drop|truncate|rename)\b/.test(normalized),
    contains_data_change: /\b(insert|update|delete|merge)\b/.test(normalized),
    contains_index_build: /\bcreate\s+(?:unique\s+)?index\b/.test(normalized),
    contains_concurrent_index: /\bcreate\s+(?:unique\s+)?index\s+concurrently\b/.test(normalized),
    contains_table_rewrite_risk:
      /\balter\s+table\b[\s\S]*\b(add\s+column|alter\s+column|set\s+data|type|rewrite)\b/.test(
        normalized
      ),
    contains_transaction_control: /\b(begin|commit|rollback)\b/.test(normalized),
    contains_timeout: /\bstatement_timeout\b/.test(normalized),
    unsupported_constructs,
    has_quoted_identifier: hasQuotedIdentifier,
    has_dynamic_sql: hasDynamicSql,
    has_unclassified_statement: hasUnclassifiedStatement,
    statement_count: statementTexts.length,
  };
  return {
    ...classification,
    assessment: incomplete ? 'incomplete' : 'classified',
    risk: incomplete ? 'unknown' : 'requires_evidence',
    requires_manual_review: incomplete,
    reasons: incomplete
      ? [
          'Migration contains statements or syntax that the static classifier cannot safely classify.',
        ]
      : [],
  };
}
async function runPreflight(migrationPath) {
  const path = new URL(migrationPath, ROOT);
  if (!existsSync(path)) throw new Error(`migration file not found: ${migrationPath}`);
  const source = readFileSync(path, 'utf8');
  const relations = extractMigrationRelations(source);
  const classification = classifyMigration(source);
  const reports = await Promise.all([
    runSupabase(['table-stats'], 'table-stats'),
    runSupabase(['index-stats'], 'index-stats'),
    runSupabase(['traffic-profile'], 'traffic'),
    runSupabase(['vacuum-stats'], 'vacuum'),
    runSupabase(['outliers'], 'outliers'),
    runSupabase(['locks'], 'locks'),
    runSupabase(['blocking'], 'blocking'),
  ]);
  const reportData = Object.fromEntries(reports.map((report) => [report.operation, report.data]));
  const observations = reports.map((report) => report.observation).filter(Boolean);
  const observation = observations[0] ?? (await getObservation());
  const tableRows = rowsOf(reportData['table-stats']);
  const indexRows = rowsOf(reportData['index-stats']);
  const trafficRows = rowsOf(reportData.traffic);
  const vacuumRows = rowsOf(reportData.vacuum);
  const affectedRelations = relations.map((relation) => {
    const table = tableRows.find(
      (row) => row.name === relation || row.name === relation.replace(/^public\./, '')
    );
    const indexes = indexRows.filter(
      (row) => row.table === relation || row.table === relation.replace(/^public\./, '')
    );
    const traffic = trafficRows.filter((row) => row.table === relation || row.name === relation);
    const vacuum = vacuumRows.find((row) => row.name === relation);
    return {
      relation,
      table_stats: table ?? null,
      index_stats: indexes,
      traffic,
      vacuum_stats: vacuum ?? null,
      estimated_table_size_bytes: parseSizeBytes(table?.table_size),
      estimated_index_size_bytes: parseSizeBytes(table?.index_size),
    };
  });
  const risks = [];
  if (classification.assessment === 'incomplete')
    risks.push(
      'Static migration classification is incomplete; treat operational risk as unknown and require manual review.'
    );
  if (classification.contains_data_change)
    risks.push(
      'Migration changes existing data and requires an independently reviewed operational strategy.'
    );
  if (classification.contains_table_rewrite_risk)
    risks.push(
      'ALTER TABLE may rewrite or lock an existing relation; verify PostgreSQL version-specific behavior.'
    );
  if (classification.contains_index_build && !classification.contains_concurrent_index)
    risks.push('A non-concurrent index build can block writes on an active table.');
  if (classification.contains_index_build && classification.contains_concurrent_index)
    risks.push(
      'Concurrent index creation avoids the main write lock but requires extra time, I/O, and disk space.'
    );
  if (
    (classification.contains_data_change ||
      classification.contains_table_rewrite_risk ||
      classification.contains_index_build) &&
    !classification.contains_timeout
  )
    risks.push(
      'No statement_timeout was detected; add an explicit timeout for expensive operations where appropriate.'
    );
  if (classification.contains_transaction_control)
    risks.push(
      'Transaction-control statements need explicit review because the deployment runner controls migration transactions.'
    );
  if (affectedRelations.some((item) => item.table_stats === null))
    risks.push(
      'At least one referenced relation was not found in the observer table report; confirm whether it is new, renamed, or inaccessible.'
    );
  return {
    ok: true,
    operation: 'preflight',
    target: getTarget().label,
    generated_at: new Date().toISOString(),
    observation,
    migration: { path: migrationPath, bytes: Buffer.byteLength(source), relations, classification },
    affected_relations: affectedRelations,
    assessment: classification.assessment === 'incomplete' ? 'incomplete' : 'evidence_only',
    risk:
      classification.assessment === 'incomplete'
        ? 'unknown'
        : risks.length > 0
          ? 'high'
          : 'requires_review',
    requires_manual_review: true,
    risks,
    reports: reportData,
    notes: [
      'This report is advisory and does not execute the migration.',
      'Validate migration semantics and deployment strategy through human review.',
      'Run EXPLAIN without ANALYZE for query planning; EXPLAIN ANALYZE is intentionally unsupported by the observer.',
    ],
  };
}
async function main() {
  const [operation, ...rest] = process.argv.slice(2);
  if (!operation || operation === '--help' || operation === '-h') return usage();
  const { values } = parseArgs(rest);
  if (operation === 'canary') {
    const results = [
      await runQuery(
        `select
  current_database() as database,
  current_user as role,
  inet_server_addr()::text as server_address,
  inet_server_port() as server_port,
  current_setting('default_transaction_read_only') as default_transaction_read_only,
  current_setting('statement_timeout') as statement_timeout,
  current_setting('lock_timeout') as lock_timeout`,
        'health'
      ),
    ];
    for (const canaryOperation of CANARY_OPERATIONS) {
      results.push(await runSupabase([INSPECTION_COMMANDS.get(canaryOperation)], canaryOperation));
    }
    return console.log(
      JSON.stringify({
        ok: true,
        operation: 'canary',
        target: getTarget().label,
        generated_at: new Date().toISOString(),
        observation: results[0]?.observation ?? (await getObservation()),
        checks: results.map(({ operation, observation, data }) => ({
          operation,
          observation,
          data,
        })),
        notes: [
          'Telemetry-only canary; no application rows, samples, distributions, or migration preflight were executed.',
        ],
      })
    );
  }
  if (operation === 'health') {
    const result = await runQuery(
      `select
  current_database() as database,
  current_user as role,
  inet_server_addr()::text as server_address,
  inet_server_port() as server_port,
  current_setting('default_transaction_read_only') as default_transaction_read_only,
  current_setting('statement_timeout') as statement_timeout,
  current_setting('lock_timeout') as lock_timeout`,
      'health'
    );
    return console.log(JSON.stringify(result));
  }
  if (operation === 'schema') return console.log(JSON.stringify(await runSchema()));
  if (operation === 'preflight') {
    const migration = values.get('migration');
    if (typeof migration !== 'string') return usage('preflight requires --migration <path>');
    return console.log(JSON.stringify(await runPreflight(migration)));
  }
  if (operation === 'sample' || operation === 'distribution' || operation === 'count') {
    const table = values.get('table');
    if (typeof table !== 'string') return usage(`${operation} requires --table <table>`);
    const column = values.get('column');
    if (operation === 'distribution' && typeof column !== 'string')
      return usage('distribution requires --column <column>');
    const defaultLimit = operation === 'distribution' ? MAX_DISTRIBUTION_LIMIT : MAX_SAMPLE_LIMIT;
    const limit =
      operation === 'count'
        ? defaultLimit
        : parsePositiveInteger(String(values.get('limit') ?? defaultLimit), 'limit', defaultLimit);
    return console.log(JSON.stringify(await runTableData(operation, table, column, limit)));
  }
  if (INSPECTION_COMMANDS.has(operation)) {
    return console.log(
      JSON.stringify(await runSupabase([INSPECTION_COMMANDS.get(operation)], operation))
    );
  }
  return usage(`unknown operation: ${operation}`);
}
main().catch(fail);
