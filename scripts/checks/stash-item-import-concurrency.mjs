// Real account/mode row-lock coverage against this checkout's local Docker database only.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
const isLocalEndpoint = (endpoint) => /^(unix:\/\/\/|npipe:\/\/\/\/\.\/pipe\/)/.test(endpoint);
if (process.env.DOCKER_HOST)
  assert.ok(isLocalEndpoint(process.env.DOCKER_HOST), 'DOCKER_HOST must use a local socket');
const dockerEnv = { ...process.env };
for (const name of [
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_TLS',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
])
  delete dockerEnv[name];
const context = spawnSync(
  'docker',
  [
    'context',
    'inspect',
    ...(process.env.DOCKER_CONTEXT ? [process.env.DOCKER_CONTEXT] : []),
    '--format',
    '{{(index .Endpoints "docker").Host}}',
  ],
  { encoding: 'utf8', env: dockerEnv }
);
assert.equal(context.status, 0, context.error?.message || context.stderr);
assert.ok(isLocalEndpoint(context.stdout.trim()), 'Docker context must use a local socket');
const dockerArgs = ['--host', process.env.DOCKER_HOST || context.stdout.trim()];
const project = readFileSync('supabase/config.toml', 'utf8').match(
  /^project_id\s*=\s*"([\w-]+)"/m
)?.[1];
assert.ok(project);
const container = `supabase_db_${project}`;
const user = randomUUID();
const prefix = `stash_import_${user}`;
const children = new Set();
const args = ['psql', '-U', 'postgres', '-d', 'postgres', '-X', '-At', '-v', 'ON_ERROR_STOP=1'];
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
function query(sql) {
  const result = spawnSync('docker', [...dockerArgs, 'exec', container, ...args, '-c', sql], {
    encoding: 'utf8',
    env: dockerEnv,
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  return result.stdout.trim();
}
function connection(name, sql, keepOpen = false) {
  const child = spawn('docker', [...dockerArgs, 'exec', '-i', container, ...args], {
    env: dockerEnv,
  });
  children.add(child);
  let output = '';
  child.stdout.on('data', (data) => (output += data));
  child.stderr.on('data', (data) => (output += data));
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      children.delete(child);
      resolve({ code, output });
    });
  });
  child.stdin.write(
    `SET statement_timeout='15s'; SET idle_in_transaction_session_timeout='30s';
     SET application_name=${literal(name)}; SET request.jwt.claim.sub=${literal(user)}; ${sql};\n`
  );
  if (!keepOpen) child.stdin.end();
  return { child, done };
}
async function observe(name, condition, pending) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    if (
      query(
        `SELECT count(*) FROM pg_stat_activity WHERE application_name=${literal(name)} AND ${condition}`
      ) === '1'
    )
      return;
    assert.ok(Date.now() < deadline, 'Expected database lock/session state was not observed');
    await Promise.race([
      delay(25),
      pending.then((result) => assert.fail(result.output || 'Session exited before expected lock')),
    ]);
  }
}
function status(result) {
  assert.equal(result.code, 0, result.output);
  const line = result.output.split(/\r?\n/).find((entry) => entry.startsWith('{'));
  assert.ok(line, result.output);
  return JSON.parse(line).status;
}
const snapshot = () =>
  query(
    `SELECT progress_data FROM public.user_game_mode_progress
     WHERE user_id=${literal(user)} AND game_mode='pvp' AND season_number=0`
  );
const commit = (expected, id, hash, mode = 'pvp') =>
  `SELECT public.commit_stash_item_import(${literal(mode)},0,${literal(id)},${literal(hash)},
    ${expected === null ? 'NULL' : `${literal(expected)}::jsonb`},
    '[{"id":"concurrent-objective","type":"task","count":1,"needed":2}]')`;
const hold = () =>
  connection(
    `${prefix}_holder`,
    `BEGIN; SELECT user_id FROM public.user_progress WHERE user_id=${literal(user)} FOR UPDATE`,
    true
  );
let created = false;
let cleaned = false;
function attemptCleanup(operation) {
  try {
    operation();
  } catch (error) {
    console.error('Stash import fixture cleanup failed:', error);
    process.exitCode = 1;
  }
}
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  attemptCleanup(() =>
    query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity
    WHERE application_name LIKE ${literal(`${prefix}%`)} AND pid<>pg_backend_pid()`)
  );
  for (const child of children) attemptCleanup(() => child.kill());
  if (created)
    attemptCleanup(() =>
      query(`
    DELETE FROM public.mutation_rate_limits WHERE subject=${literal(user)}
      AND scope IN ('stash-item-import','progress-sync');
    DELETE FROM auth.users WHERE id=${literal(user)}`)
    );
}
function interrupted(code) {
  cleanup();
  process.exit(code);
}
const onSigint = () => interrupted(130);
const onSigterm = () => interrupted(143);
process.once('SIGINT', onSigint);
process.once('SIGTERM', onSigterm);
try {
  query(`INSERT INTO auth.users(id,email) VALUES(${literal(user)},${literal(`${user}@example.invalid`)});
    SET request.jwt.claim.sub=${literal(user)};
    SELECT public.sync_user_game_mode_progress('pvp',1,NULL,
      '{"pvp":{"level":1,"taskObjectives":{"concurrent-objective":{"count":0,"complete":false,"timestamp":1}}}}',
      private.active_season_number())`);
  created = true;
  const before = snapshot();
  const holder = hold();
  await observe(`${prefix}_holder`, "state='idle in transaction'", holder.done);
  const stale = connection(`${prefix}_stale`, commit(before, randomUUID(), 'a'.repeat(64)));
  await observe(`${prefix}_stale`, "wait_event_type='Lock'", stale.done);
  holder.child.stdin.end(`UPDATE public.user_game_mode_progress SET progress_data=
    jsonb_set(progress_data,'{level}','2') WHERE user_id=${literal(user)} AND game_mode='pvp'
    AND season_number=0; COMMIT;\n`);
  assert.equal((await holder.done).code, 0);
  assert.equal(
    status(await stale.done),
    'conflict',
    'CAS must re-read after the account lock wait'
  );
  assert.equal(
    query(`SELECT count(*) FROM private.stash_item_import_receipts WHERE user_id=${literal(user)}`),
    '0',
    'stale writer must not create a receipt'
  );
  const current = snapshot();
  const blocker = hold();
  await observe(`${prefix}_holder`, "state='idle in transaction'", blocker.done);
  const first = connection(`${prefix}_first`, commit(current, randomUUID(), 'b'.repeat(64)));
  const second = connection(`${prefix}_second`, commit(current, randomUUID(), 'b'.repeat(64)));
  await observe(`${prefix}_first`, "wait_event_type='Lock'", first.done);
  await observe(`${prefix}_second`, "wait_event_type='Lock'", second.done);
  blocker.child.stdin.end('COMMIT;\n');
  assert.equal((await blocker.done).code, 0);
  const statuses = [status(await first.done), status(await second.done)].sort();
  assert.deepEqual(
    statuses,
    ['applied', 'duplicate'],
    'concurrent image copies apply exactly once'
  );
  assert.equal(
    query(`SELECT count(*) FROM private.stash_item_import_receipts WHERE user_id=${literal(user)}`),
    '1'
  );
  assert.equal(JSON.parse(snapshot()).taskObjectives['concurrent-objective'].count, 1);
  const initialBlocker = hold();
  await observe(`${prefix}_holder`, "state='idle in transaction'", initialBlocker.done);
  const initialA = connection(
    `${prefix}_initial_a`,
    commit(null, randomUUID(), 'c'.repeat(64), 'pve')
  );
  const initialB = connection(
    `${prefix}_initial_b`,
    commit(null, randomUUID(), 'd'.repeat(64), 'pve')
  );
  await observe(`${prefix}_initial_a`, "wait_event_type='Lock'", initialA.done);
  await observe(`${prefix}_initial_b`, "wait_event_type='Lock'", initialB.done);
  initialBlocker.child.stdin.end('COMMIT;\n');
  assert.equal((await initialBlocker.done).code, 0);
  assert.deepEqual([status(await initialA.done), status(await initialB.done)].sort(), [
    'applied',
    'conflict',
  ]);
  const receiptId = randomUUID();
  const inFlight = connection(
    `${prefix}_inflight`,
    `BEGIN; ${commit(snapshot(), receiptId, 'e'.repeat(64))}`,
    true
  );
  await observe(`${prefix}_inflight`, "state='idle in transaction'", inFlight.done);
  const recovery = connection(
    `${prefix}_lookup`,
    `SELECT public.get_stash_item_import('pvp',0,${literal(receiptId)})`
  );
  await observe(`${prefix}_lookup`, "wait_event_type='Lock'", recovery.done);
  inFlight.child.stdin.end('COMMIT;\n');
  assert.equal((await inFlight.done).code, 0);
  assert.equal(status(await recovery.done), 'found', 'recovery waits for the in-flight commit');
  query(`INSERT INTO public.mutation_rate_limits(scope,subject,count,reset_at)
    VALUES('stash-item-import',${literal(user)},60,clock_timestamp()+interval '1 minute')
    ON CONFLICT(scope,subject) DO UPDATE SET count=60,reset_at=EXCLUDED.reset_at`);
  const admissionBlocker = hold();
  await observe(`${prefix}_holder`, "state='idle in transaction'", admissionBlocker.done);
  const overQuota = connection(
    `${prefix}_over_quota`,
    commit(snapshot(), randomUUID(), 'f'.repeat(64))
  );
  const denied = await overQuota.done;
  assert.notEqual(denied.code, 0, 'over-quota import must fail');
  assert.match(
    denied.output,
    /Stash item import rate limit exceeded/,
    'admission must deny without waiting for the held account lock'
  );
  admissionBlocker.child.stdin.end('ROLLBACK;\n');
  assert.equal((await admissionBlocker.done).code, 0);
  console.log(
    'Stash import concurrency passed: stale CAS, duplicate image, absent baseline, receipt recovery and early admission.'
  );
} finally {
  cleanup();
  process.removeListener('SIGINT', onSigint);
  process.removeListener('SIGTERM', onSigterm);
}
