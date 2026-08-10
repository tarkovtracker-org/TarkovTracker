#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  /^(?:email|phone|full_name|address|token|secret|password|metadata|payload|content|ip|user_agent|token_value|token_hash|progress|data|state|settings|preferences|config|custom_config)$/i;
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
const HEALTH_SQL = `select
  current_database() as database,
  current_user as role,
  inet_server_addr()::text as server_address,
  inet_server_port() as server_port,
  current_setting('default_transaction_read_only') as default_transaction_read_only,
  current_setting('statement_timeout') as statement_timeout,
  current_setting('lock_timeout') as lock_timeout,
  r.rolsuper as is_superuser,
  r.rolcreatedb as can_create_database,
  r.rolcreaterole as can_create_role,
  r.rolreplication as can_replicate,
  r.rolbypassrls as can_bypass_rls,
  pg_has_role(current_user, 'pg_write_all_data', 'member') as is_write_role,
  has_schema_privilege(current_user, 'public', 'create') as can_create_in_public,
  has_database_privilege(current_user, current_database(), 'create') as can_create_in_database,
  exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private')
      and c.relkind in ('r', 'p')
      and has_table_privilege(current_user, c.oid, 'insert,update,delete,truncate,references,trigger')
  ) as has_table_write
from pg_catalog.pg_roles r
where r.rolname = current_user`;
const RESERVED_SQL_WORDS = new Set([
  'alter',
  'analyze',
  'call',
  'cluster',
  'comment',
  'copy',
  'create',
  'delete',
  'do',
  'drop',
  'grant',
  'insert',
  'merge',
  'refresh',
  'reindex',
  'revoke',
  'truncate',
  'update',
  'vacuum',
]);
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
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = getOptionValue(args[index + 1]);
    const hasValue = value !== true;
    values.set(key, value);
    index += Number(hasValue);
  }
  return values;
}
function getOptionValue(value) {
  if (typeof value !== 'string') return true;
  return value.startsWith('--') ? true : value;
}
function getTarget() {
  const target = process.env.PROD_DB_TARGET ?? 'primary';
  if (target === 'local') return { flag: '--local', label: 'local' };
  if (target === 'primary') return getPrimaryTarget();
  throw new Error(`unsupported PROD_DB_TARGET: ${target}`);
}
function getPrimaryTarget() {
  const connectionString = process.env.PROD_DB_URL;
  if (!connectionString)
    throw new Error(
      'PROD_DB_URL is required for the primary target; use PROD_DB_TARGET=local for local inspection'
    );
  const parsed = parseConnectionUrl(connectionString);
  const { username, password } = validateConnectionUrl(parsed);
  parsed.password = '';
  return {
    flag: '--db-url',
    value: parsed.toString(),
    label: 'primary',
    password,
    connection: {
      host: parsed.hostname,
      port: parsed.port || '5432',
      database: decodeURIComponent(parsed.pathname.slice(1)) || 'postgres',
      username,
    },
  };
}
function parseConnectionUrl(connectionString) {
  try {
    return new URL(connectionString);
  } catch {
    throw new Error('PROD_DB_URL must be a valid PostgreSQL connection URL');
  }
}
function validateConnectionUrl(parsed) {
  validateConnectionProtocol(parsed);
  validateConnectionPort(parsed);
  validateCredentialParameters(parsed);
  const username = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  validateCredentialPresence(username, password);
  validateObserverUsername(username);
  validateObserverPassword(password);
  return { username, password };
}
function validateConnectionProtocol(parsed) {
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol))
    throw new Error('PROD_DB_URL must use the postgres:// or postgresql:// scheme');
}
function validateConnectionPort(parsed) {
  if (parsed.port === '6543')
    throw new Error(
      'PROD_DB_URL must not use the transaction pooler; use a direct or session-mode connection'
    );
}
function validateCredentialPresence(username, password) {
  if (!username || !password)
    throw new Error('PROD_DB_URL must include the dedicated observer username and password');
}
function validateObserverPassword(password) {
  if (/[\r\n]/.test(password)) throw new Error('PROD_DB_URL password must not contain line breaks');
}
function validateCredentialParameters(parsed) {
  const sensitiveParameters = ['password', 'passfile', 'sslpassword', 'servicefile'];
  if (sensitiveParameters.some((parameter) => parsed.searchParams.has(parameter)))
    throw new Error('PROD_DB_URL credentials must use URL userinfo, not query parameters');
}
function validateObserverUsername(username) {
  if (/^(?:postgres|supabase_admin|service_role|admin)$/i.test(username))
    throw new Error('PROD_DB_URL must use a dedicated non-admin observer role');
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
  try {
    return JSON.parse(output);
  } catch {
    return parseJsonAfterCliNoise(output, command);
  }
}
function parseJsonAfterCliNoise(output, command) {
  const lines = output.split('\n');
  const candidates = lines
    .map((line, index) => ({ index, line: line.trim() }))
    .filter(({ line }) => ['{', '['].includes(line[0]))
    .reverse()
    .map(({ index }) => tryParseJson(lines.slice(index).join('\n')));
  const parsed = candidates.find((candidate) => candidate !== undefined);
  if (parsed !== undefined) return parsed;
  throw new Error(`Supabase CLI returned invalid JSON for ${command}`);
}
function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
function redactValue(key, value) {
  if (isSensitiveKey(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redactValue('', item));
  if (isObject(value)) return redactObject(value);
  return value;
}
function isSensitiveKey(key) {
  return typeof key === 'string' && SENSITIVE_COLUMN_PATTERN.test(key);
}
function isObject(value) {
  return value !== null && typeof value === 'object';
}
function redactObject(value) {
  return Object.fromEntries(
    Object.entries(value).map(([key, childValue]) => [key, redactValue(key, childValue)])
  );
}
function getCommandEnvironment() {
  if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,62}$/.test(OBSERVER_APPLICATION_NAME)) {
    throw new Error(
      'PROD_DB_APPLICATION_NAME must be 1-63 characters using letters, digits, _, ., or -'
    );
  }
  const environment = { ...process.env };
  delete environment.PROD_DB_URL;
  delete environment.PGPASSWORD;
  delete environment.PGPASSFILE;
  delete environment.SUPABASE_DB_PASSWORD;
  return { ...environment, PGAPPNAME: OBSERVER_APPLICATION_NAME };
}
function escapePgpass(value) {
  return value.replaceAll('\\', String.raw`\\`).replaceAll(':', String.raw`\:`);
}
async function getCommandContext(target) {
  const environment = getCommandEnvironment();
  if (!target.password) return { environment, cleanup: async () => {} };
  const directory = await mkdtemp(join(tmpdir(), 'prod-db-credential-'));
  const pgpassFile = join(directory, 'pgpass');
  const fields = [
    target.connection.host,
    target.connection.port,
    target.connection.database,
    target.connection.username,
    target.password,
  ];
  await writeFile(pgpassFile, `${fields.map(escapePgpass).join(':')}\n`, { mode: 0o600 });
  environment.PGPASSFILE = pgpassFile;
  return {
    environment,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}
function sanitizeCommandError(error, target) {
  let detail = error instanceof Error ? error.message : String(error);
  const secrets = [
    process.env.PROD_DB_URL,
    target.password,
    encodeURIComponent(target.password ?? ''),
  ]
    .filter((value) => typeof value === 'string' && value.length > 0)
    .sort((left, right) => right.length - left.length);
  for (const secret of secrets) detail = detail.replaceAll(secret, '[REDACTED]');
  return detail;
}
function getCommandLimits() {
  return {
    timeout: parseBoundedInteger('PROD_DB_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, 1_000, 120_000),
    maxOutputBytes: parseBoundedInteger(
      'PROD_DB_MAX_OUTPUT_BYTES',
      DEFAULT_MAX_OUTPUT_BYTES,
      1_024,
      10_000_000
    ),
  };
}
function parseBoundedInteger(name, fallback, minimum, maximum) {
  const value = Number(process.env[name] ?? fallback);
  const invalid = [!Number.isInteger(value), value < minimum, value > maximum].some(Boolean);
  if (invalid) throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  return value;
}
async function runRawQuery(sql, label) {
  const target = getTarget();
  const { timeout, maxOutputBytes } = getCommandLimits();
  const args = ['db', 'query', target.flag];
  if (target.value) args.push(target.value);
  args.push('--output', 'json', sql);
  const command = await getCommandContext(target);
  try {
    const { stdout } = await execFileAsync(SUPABASE_BIN, args, {
      cwd: fileURLToPath(ROOT),
      env: command.environment,
      timeout,
      maxBuffer: maxOutputBytes,
    });
    return parseJsonOutput(stdout, label);
  } catch (error) {
    const detail = sanitizeCommandError(error, target);
    throw new Error(`${label} failed: ${detail}`);
  } finally {
    await command.cleanup();
  }
}
function firstRow(data) {
  return rowsOf(data)[0] ?? {};
}
async function getObservation() {
  const data = await runRawQuery(
    `select
  now() as captured_at,
  current_database() as database,
  current_user as observer_role,
  current_setting('application_name', true) as observer_application_name,
  (select stats_reset from pg_stat_database where datname = current_database()) as database_stats_reset,
  to_regclass('pg_stat_statements_info') is not null as has_statement_stats,
  (select stats_reset from pg_stat_bgwriter) as io_stats_reset`,
    'observation'
  );
  const observation = firstRow(data);
  let statementStatsReset = null;
  if (observation.has_statement_stats) {
    const statementData = await runRawQuery(
      'select stats_reset as statement_stats_reset from pg_stat_statements_info',
      'statement-observation'
    );
    statementStatsReset = firstRow(statementData).statement_stats_reset ?? null;
  }
  delete observation.has_statement_stats;
  return redactValue('', { ...observation, statement_stats_reset: statementStatsReset });
}
async function runSupabase(args, label) {
  if (args.length > MAX_COMMAND_ARGS)
    throw new Error(`internal command exceeded ${MAX_COMMAND_ARGS} arguments`);
  const target = getTarget();
  const { timeout, maxOutputBytes } = getCommandLimits();
  const commandArgs = ['inspect', 'db', ...args, target.flag];
  if (target.value) commandArgs.push(target.value);
  commandArgs.push('--output-format', 'json');
  const command = await getCommandContext(target);
  try {
    const observation = await getObservation();
    const { stdout } = await execFileAsync(SUPABASE_BIN, commandArgs, {
      cwd: fileURLToPath(ROOT),
      env: command.environment,
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
    const detail = sanitizeCommandError(error, target);
    throw new Error(`${label} failed: ${detail}`);
  } finally {
    await command.cleanup();
  }
}
async function runQuery(sql, label) {
  const normalizedSql = normalizeMigrationSql(sql);
  if (isUnsafeSql(normalizedSql)) throw new Error(`${label} rejected unsafe SQL`);
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
function isUnsafeSql(sql) {
  const words = sql.toLowerCase().match(/[a-z_]+/g) ?? [];
  const hasReservedWord = words.some((word) => RESERVED_SQL_WORDS.has(word));
  const hasReservedPhrase = /\bset\s+role\b|\bsecurity\s+definer\b/i.test(sql);
  return (
    hasReservedWord || hasReservedPhrase || UNSAFE_SQL_PATTERNS.some((pattern) => pattern.test(sql))
  );
}
function validateCanaryHealth(report) {
  const health = firstRow(report.data);
  const checks = [
    [health.is_superuser, 'observer role is a superuser'],
    [health.can_create_database, 'observer role can create databases'],
    [health.can_create_role, 'observer role can create roles'],
    [health.can_replicate, 'observer role can replicate'],
    [health.can_bypass_rls, 'observer role can bypass RLS'],
    [health.is_write_role, 'observer role inherits pg_write_all_data'],
    [health.has_table_write, 'observer role can write application tables'],
    [health.can_create_in_public, 'observer role can create objects in public'],
    [health.can_create_in_database, 'observer role can create schemas'],
    [health.default_transaction_read_only !== 'on', 'default_transaction_read_only is not on'],
    [/^0(?:ms|s|min)?$/.test(health.statement_timeout ?? ''), 'statement_timeout is not bounded'],
    [/^0(?:ms|s|min)?$/.test(health.lock_timeout ?? ''), 'lock_timeout is not bounded'],
  ];
  const failures = checks.filter(([failed]) => failed).map(([, message]) => message);
  if (failures.length > 0) throw new Error(`unsafe observer configuration: ${failures.join('; ')}`);
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
  if (operation === 'count') return runCount(schema, relation);
  if (operation === 'sample') return runSample(schema, relation, safeTable, limit);
  return runDistribution(safeTable, column, limit);
}
function runCount(schema, relation) {
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
async function runSample(schema, relation, safeTable, limit) {
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
  const rows = rowsOf(columns.data);
  if (rows.length === 0) throw new Error(`table not found or has no visible columns: ${safeTable}`);
  const selectedColumns = rows
    .map((row) => row.column_name)
    .filter((name) => typeof name === 'string' && SAFE_SAMPLE_COLUMN_PATTERN.test(name))
    .map((name) => `"${name.replaceAll('"', '""')}"`);
  if (selectedColumns.length === 0)
    throw new Error(`no non-sensitive sample columns available for ${safeTable}`);
  return runQuery(
    `select ${selectedColumns.join(', ')} from ${safeTable} limit ${limit}`,
    'sample'
  );
}
function runDistribution(safeTable, column, limit) {
  const safeColumn = validateIdentifier(column, 'column').split('.').at(-1);
  if (!SAFE_DISTRIBUTION_COLUMN_PATTERN.test(safeColumn))
    throw new Error(`distribution is not available for column: ${safeColumn}`);
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
  const match = /^(\d+(?:\.\d+)?)\s*(bytes|kB|MB|GB|TB)$/i.exec(value.trim());
  if (!match) return null;
  const multipliers = { bytes: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 };
  return Number(match[1]) * multipliers[match[2].toLowerCase()];
}
function normalizeMigrationSql(source) {
  let normalized = '';
  let index = 0;
  while (index < source.length) {
    const token = getMaskedSqlToken(source, index);
    if (!token) {
      normalized += source[index];
      index += 1;
      continue;
    }
    normalized += source.slice(index, token.end).replace(/[^\n]/g, ' ');
    if (token.malformed) normalized += "'";
    index = token.end;
  }
  return normalized;
}
function getMaskedSqlToken(source, index) {
  const lineComment = getDelimitedSqlToken(source, index, '--', '\n', 0);
  if (lineComment) return lineComment;
  const blockComment = getDelimitedSqlToken(source, index, '/*', '*/', 2);
  if (blockComment) return blockComment;
  if (source[index] !== "'") return undefined;
  return getSqlLiteralToken(source, index);
}
function getDelimitedSqlToken(source, index, opening, closing, closingLength) {
  if (!source.startsWith(opening, index)) return undefined;
  const end = source.indexOf(closing, index + opening.length);
  return { end: end === -1 ? source.length : end + closingLength };
}
function getSqlLiteralToken(source, start) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] !== "'") {
      index += 1;
      continue;
    }
    if (source[index + 1] === "'") {
      index += 2;
      continue;
    }
    return { end: index + 1, malformed: false };
  }
  return { end: source.length, malformed: true };
}
function extractMigrationRelations(source) {
  const normalizedSource = normalizeMigrationSql(source);
  const identifier = String.raw`([a-zA-Z_][a-zA-Z0-9_$]*(?:\.[a-zA-Z_][a-zA-Z0-9_$]*)?)`;
  const patterns = [
    new RegExp(
      String.raw`\b(?:alter\s+table|drop\s+table|truncate\s+table)\s+(?:if\s+(?:not\s+)?exists\s+)?${identifier}`,
      'gi'
    ),
    new RegExp(String.raw`\bcreate\s+(?:unique\s+)?index\s+\S+\s+on\s+${identifier}`, 'gi'),
    new RegExp(String.raw`\b(?:update|delete\s+from|insert\s+into)\s+${identifier}`, 'gi'),
    new RegExp(String.raw`\bfrom\s+${identifier}`, 'gi'),
    new RegExp(String.raw`\bjoin\s+${identifier}`, 'gi'),
  ];
  const matches = patterns.flatMap((pattern) => [...normalizedSource.matchAll(pattern)]);
  const relations = matches.map((match) => normalizeRelation(match[1])).filter(Boolean);
  return [...new Set(relations)].sort((left, right) => left.localeCompare(right));
}
function normalizeRelation(value) {
  const relation = value.replace(/^public\./i, 'public.');
  const ignored = ['select', 'where', 'set', 'values', 'using', 'on'];
  if (ignored.includes(relation.toLowerCase())) return undefined;
  return relation.includes('.') ? relation : `public.${relation}`;
}
function classifyMigration(source) {
  const normalized = normalizeMigrationSql(source).toLowerCase();
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
  const hasMalformedLiteral = normalized.includes("'");
  const hasDynamicSql = /\b(?:execute|format)\b/.test(normalized);
  const supportedStatementPrefixes = [
    'alter table',
    'create index',
    'create unique index',
    'delete from',
    'drop table',
    'insert into',
    'comment on',
    'grant',
    'reset',
    'revoke',
    'select',
    'set',
    'truncate table',
    'update',
  ];
  const hasUnclassifiedStatement = statementTexts.some(
    (statement) => !supportedStatementPrefixes.some((prefix) => statement.startsWith(prefix))
  );
  const incomplete = [
    unsupported_constructs.length > 0,
    hasQuotedIdentifier,
    hasMalformedLiteral,
    hasDynamicSql,
    hasUnclassifiedStatement,
    statementTexts.length > 1,
  ].some(Boolean);
  const classification = getMigrationClassification(normalized, {
    unsupported_constructs,
    hasQuotedIdentifier,
    hasMalformedLiteral,
    hasDynamicSql,
    hasUnclassifiedStatement,
    statementCount: statementTexts.length,
  });
  return formatMigrationClassification(classification, incomplete);
}
function getMigrationClassification(normalized, details) {
  return {
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
    unsupported_constructs: details.unsupported_constructs,
    has_quoted_identifier: details.hasQuotedIdentifier,
    has_malformed_literal: details.hasMalformedLiteral,
    has_dynamic_sql: details.hasDynamicSql,
    has_unclassified_statement: details.hasUnclassifiedStatement,
    statement_count: details.statementCount,
  };
}
function formatMigrationClassification(classification, incomplete) {
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
  const reports = await runPreflightReports();
  const reportData = Object.fromEntries(reports.map((report) => [report.operation, report.data]));
  const observation = await getReportObservation(reports);
  const affectedRelations = getAffectedRelations(relations, reportData);
  const risks = getMigrationRisks(classification, affectedRelations);
  const assessment = getPreflightAssessment(classification, risks);
  return {
    ok: true,
    operation: 'preflight',
    target: getTarget().label,
    generated_at: new Date().toISOString(),
    observation,
    migration: { path: migrationPath, bytes: Buffer.byteLength(source), relations, classification },
    affected_relations: affectedRelations,
    assessment: assessment.status,
    risk: assessment.risk,
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
async function runPreflightReports() {
  const operations = [
    ['table-stats', 'table-stats'],
    ['index-stats', 'index-stats'],
    ['traffic-profile', 'traffic'],
    ['vacuum-stats', 'vacuum'],
    ['outliers', 'outliers'],
    ['locks', 'locks'],
    ['blocking', 'blocking'],
  ];
  const reports = [];
  for (const [command, label] of operations) reports.push(await runSupabase([command], label));
  return reports;
}
async function getReportObservation(reports) {
  const observation = reports.map((report) => report.observation).find(Boolean);
  return observation ?? getObservation();
}
function getPreflightAssessment(classification, risks) {
  if (classification.assessment === 'incomplete') return { status: 'incomplete', risk: 'unknown' };
  if (risks.length > 0) return { status: 'evidence_only', risk: 'high' };
  return { status: 'evidence_only', risk: 'requires_review' };
}
function getAffectedRelations(relations, reports) {
  const rows = {
    tables: rowsOf(reports['table-stats']),
    indexes: rowsOf(reports['index-stats']),
    traffic: rowsOf(reports.traffic),
    vacuum: rowsOf(reports.vacuum),
  };
  return relations.map((relation) => getAffectedRelation(relation, rows));
}
function matchesRelation(value, relation) {
  return value === relation || value === relation.replace(/^public\./, '');
}
function getAffectedRelation(relation, rows) {
  const table = rows.tables.find((row) => matchesRelation(row.name, relation));
  const indexes = rows.indexes.filter((row) => matchesRelation(row.table, relation));
  const traffic = rows.traffic.filter((row) => matchesTrafficRelation(row, relation));
  const vacuum = rows.vacuum.find((row) => matchesRelation(row.name, relation));
  return {
    relation,
    table_stats: nullable(table),
    index_stats: indexes,
    traffic,
    vacuum_stats: nullable(vacuum),
    estimated_table_size_bytes: parseRelationSize(table, 'table_size'),
    estimated_index_size_bytes: parseRelationSize(table, 'index_size'),
  };
}
function matchesTrafficRelation(row, relation) {
  return matchesRelation(row.table, relation) || matchesRelation(row.name, relation);
}
function nullable(value) {
  return value ?? null;
}
function parseRelationSize(table, key) {
  return parseSizeBytes(table ? table[key] : undefined);
}
function getMigrationRisks(classification, affectedRelations) {
  const expensiveOperation = [
    classification.contains_data_change,
    classification.contains_table_rewrite_risk,
    classification.contains_index_build,
  ].some(Boolean);
  const rules = [
    [
      classification.assessment === 'incomplete',
      'Static migration classification is incomplete; treat operational risk as unknown and require manual review.',
    ],
    [
      classification.contains_data_change,
      'Migration changes existing data and requires an independently reviewed operational strategy.',
    ],
    [
      classification.contains_table_rewrite_risk,
      'ALTER TABLE may rewrite or lock an existing relation; verify PostgreSQL version-specific behavior.',
    ],
    [
      classification.contains_index_build && !classification.contains_concurrent_index,
      'A non-concurrent index build can block writes on an active table.',
    ],
    [
      classification.contains_index_build && classification.contains_concurrent_index,
      'Concurrent index creation avoids the main write lock but requires extra time, I/O, and disk space.',
    ],
    [
      expensiveOperation && !classification.contains_timeout,
      'No statement_timeout was detected; add an explicit timeout for expensive operations where appropriate.',
    ],
    [
      classification.contains_transaction_control,
      'Transaction-control statements need explicit review because the deployment runner controls migration transactions.',
    ],
    [
      affectedRelations.some((item) => item.table_stats === null),
      'At least one referenced relation was not found in the observer table report; confirm whether it is new, renamed, or inaccessible.',
    ],
  ];
  return rules.filter(([applies]) => applies).map(([, message]) => message);
}
async function runCanaryCommand() {
  const results = [await runQuery(HEALTH_SQL, 'health')];
  validateCanaryHealth(results[0]);
  for (const operation of CANARY_OPERATIONS)
    results.push(await runSupabase([INSPECTION_COMMANDS.get(operation)], operation));
  return {
    ok: true,
    operation: 'canary',
    target: getTarget().label,
    generated_at: new Date().toISOString(),
    observation: results[0]?.observation ?? (await getObservation()),
    checks: results.map(({ operation, observation, data }) => ({ operation, observation, data })),
    notes: [
      'Telemetry-only canary; no application rows, samples, distributions, or migration preflight were executed.',
    ],
  };
}
async function runPreflightCommand(values) {
  const migration = values.get('migration');
  if (typeof migration !== 'string') return usage('preflight requires --migration <path>');
  return runPreflight(migration);
}
function getTableArgument(operation, values) {
  const table = values.get('table');
  if (typeof table !== 'string') return usage(`${operation} requires --table <table>`);
  return table;
}
async function runSampleCommand(values) {
  const table = getTableArgument('sample', values);
  if (!table) return undefined;
  const limit = parsePositiveInteger(
    String(values.get('limit') ?? MAX_SAMPLE_LIMIT),
    'limit',
    MAX_SAMPLE_LIMIT
  );
  return runTableData('sample', table, undefined, limit);
}
async function runDistributionCommand(values) {
  const table = getTableArgument('distribution', values);
  if (!table) return undefined;
  const column = values.get('column');
  if (typeof column !== 'string') return usage('distribution requires --column <column>');
  const limit = parsePositiveInteger(
    String(values.get('limit') ?? MAX_DISTRIBUTION_LIMIT),
    'limit',
    MAX_DISTRIBUTION_LIMIT
  );
  return runTableData('distribution', table, column, limit);
}
async function runCountCommand(values) {
  const table = getTableArgument('count', values);
  if (!table) return undefined;
  return runTableData('count', table, undefined, MAX_SAMPLE_LIMIT);
}
const COMMAND_HANDLERS = new Map([
  ['canary', runCanaryCommand],
  ['health', () => runQuery(HEALTH_SQL, 'health')],
  ['schema', runSchema],
  ['preflight', runPreflightCommand],
  ['sample', runSampleCommand],
  ['distribution', runDistributionCommand],
  ['count', runCountCommand],
  ...[...INSPECTION_COMMANDS].map(([operation, command]) => [
    operation,
    () => runSupabase([command], operation),
  ]),
]);
async function main() {
  const [operation, ...rest] = process.argv.slice(2);
  if (isHelpOperation(operation)) return usage();
  const handler = COMMAND_HANDLERS.get(operation);
  if (!handler) return usage(`unknown operation: ${operation}`);
  const result = await handler(parseArgs(rest));
  console.log(JSON.stringify(result));
}
function isHelpOperation(operation) {
  return operation === undefined || ['--help', '-h'].includes(operation);
}
try {
  await main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
