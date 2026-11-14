import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
const CONFIG = 'supabase/config.toml';
const DB_PORT = /^([ \t]*port[ \t]*=[ \t]*)\d+([ \t]*(?:#[^\n]*)?\r?)$/gm;
const PROJECT = /^([ \t]*project_id[ \t]*=[ \t]*")[\w-]+("[^\n]*)$/gm;
function requirePort(port) {
  if (![Number.isInteger(port), port > 0, port <= 65535].every(Boolean))
    throw new Error('Invalid local database port');
}
function databaseSection(source) {
  const matches = [...source.matchAll(/^\[db\][ \t]*\r?\n[\s\S]*?(?=^\[|(?![\s\S]))/gm)];
  if (matches.length !== 1) throw new Error('Expected one local database section');
  return matches[0];
}
function configuredPort(source) {
  const section = databaseSection(source)[0];
  const port = Number(/^[ \t]*port[ \t]*=[ \t]*(\d+)/m.exec(section)?.[1]);
  requirePort(port);
  return port;
}
function replaceValue(source, pattern, value, label) {
  if ([...source.matchAll(pattern)].length !== 1) throw new Error(`Expected one ${label}`);
  return source.replace(pattern, (_match, prefix, suffix) => `${prefix}${value}${suffix}`);
}
function ciConfig(source, port) {
  requirePort(port);
  const section = databaseSection(source);
  const database = replaceValue(section[0], DB_PORT, port, 'database port');
  const updated =
    source.slice(0, section.index) + database + source.slice(section.index + section[0].length);
  return replaceValue(updated, PROJECT, `ci-${randomUUID()}`, 'local project ID');
}
function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}
const runCommand = (binary, args, options = {}) =>
  spawnSync(binary, args, { encoding: 'utf8', timeout: 10_000, ...options });
function successfulCommand(result) {
  return [!result.error, result.status === 0].every(Boolean);
}
function requireLocalEndpoint(endpoint) {
  if (!/^(unix:\/\/\/|npipe:\/\/\/\/\.\/pipe\/)/.test(endpoint))
    throw new Error('Docker must target a local socket for CI database isolation');
}
function contextEnvironment(env) {
  const result = { ...env };
  for (const name of [
    'DOCKER_HOST',
    'DOCKER_CONTEXT',
    'DOCKER_TLS',
    'DOCKER_TLS_VERIFY',
    'DOCKER_CERT_PATH',
  ])
    delete result[name];
  return result;
}
const contextName = (env) => (env.DOCKER_CONTEXT ? [env.DOCKER_CONTEXT] : []);
function contextEndpoint(env, run) {
  const result = run(
    'docker',
    ['context', 'inspect', ...contextName(env), '--format', '{{(index .Endpoints "docker").Host}}'],
    { env: contextEnvironment(env) }
  );
  if (!successfulCommand(result)) throw new Error('Cannot verify the local Docker context');
  return String(result.stdout ?? '').trim();
}
/** Port selection and Docker must refer to this runner, matching the concurrency-test boundary. */
export function requireLocalDocker(env = process.env, run = runCommand) {
  if (env.DOCKER_HOST) requireLocalEndpoint(env.DOCKER_HOST);
  const endpoint = contextEndpoint(env, run);
  requireLocalEndpoint(endpoint);
  return env.DOCKER_HOST || endpoint;
}
function localDockerEnvironment(env = process.env, inspect = runCommand) {
  return { ...contextEnvironment(env), DOCKER_HOST: requireLocalDocker(env, inspect) };
}
function capture(binary, args, run) {
  const result = run(binary, args);
  if (!successfulCommand(result)) return `${binary}: unavailable`;
  return String(result.stdout ?? '').trimEnd();
}
function dockerOwners(port, run) {
  const output = capture(
    'docker',
    ['ps', '--all', '--format', '{{.ID}}\t{{.Names}}\t{{.Ports}}'],
    run
  );
  if (output === 'docker: unavailable') return output;
  return (
    output
      .split(/\r?\n/)
      .filter((line) => line.includes(`:${port}->`))
      .join('\n') || 'none'
  );
}
/** Read only listener/PID and container ID/name/port data; never dump container environments. */
export function portDiagnostics(port, run = runCommand) {
  requirePort(port);
  return [
    `Listener ownership for local database port ${port}:`,
    capture('ss', ['-ltnp', `( sport = :${port} )`], run),
    'Docker containers publishing that port:',
    dockerOwners(port, run),
  ];
}
const diagnosePort = (port, env = localDockerEnvironment()) =>
  console.error(
    portDiagnostics(port, (binary, args) => runCommand(binary, args, { env })).join('\n')
  );
export function runDatabaseChecks({
  env = process.env,
  inspect = runCommand,
  spawnChild = spawn,
} = {}) {
  const pinned = localDockerEnvironment(env, inspect);
  return new Promise((resolve, reject) => {
    const child = spawnChild('bash', ['scripts/checks/check-supabase-db.sh'], {
      stdio: 'inherit',
      env: pinned,
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
}
async function requireUnchangedConfig(configPath, expected) {
  if ((await readFile(configPath, 'utf8')) !== expected)
    throw new Error('Supabase config changed during CI; preserving the concurrent edit');
}
async function restoreConfig(configPath, updated, original) {
  await requireUnchangedConfig(configPath, updated);
  await writeFile(configPath, original);
}
/** Isolate only the disposable CI checkout; the normal developer command remains unchanged. */
export async function withCiDatabaseConfig({
  configPath = CONFIG,
  run = runDatabaseChecks,
  selectPort = availablePort,
  diagnose = diagnosePort,
  log = console.log,
} = {}) {
  const original = await readFile(configPath, 'utf8');
  diagnose(configuredPort(original));
  const port = await selectPort();
  const updated = ciConfig(original, port);
  await requireUnchangedConfig(configPath, original);
  await writeFile(configPath, updated);
  try {
    log(`Supabase CI uses an isolated project on available port ${port}.`);
    return await run();
  } finally {
    await restoreConfig(configPath, updated, original);
  }
}
function requireCiEnvironment() {
  if (process.env.CI !== 'true')
    throw new Error('CI-only wrapper; use pnpm run supabase:check locally');
  if (['SUPABASE_PROJECT_ID', 'SUPABASE_DB_PORT'].some((name) => process.env[name]))
    throw new Error(
      'CI database isolation forbids project ID or database port environment overrides'
    );
}
async function main() {
  if (process.argv[2] === '--diagnose') {
    const env = localDockerEnvironment();
    return diagnosePort(configuredPort(await readFile(CONFIG, 'utf8')), env);
  }
  if (process.argv.length > 2) throw new Error('Unexpected Supabase CI argument');
  requireCiEnvironment();
  const env = localDockerEnvironment();
  process.exitCode = await withCiDatabaseConfig({
    run: () => runDatabaseChecks({ env }),
    diagnose: (port) => diagnosePort(port, env),
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
