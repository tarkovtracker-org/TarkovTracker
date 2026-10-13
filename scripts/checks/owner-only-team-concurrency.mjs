// Real sessions against this checkout's isolated Supabase Docker database only.
// No remote URL or credentials are accepted.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
const project = readFileSync('supabase/config.toml', 'utf8').match(
  /^project_id\s*=\s*"([\w-]+)"/m
)?.[1];
assert.ok(project);
const container = `supabase_db_${project}`;
const owner = randomUUID();
const member = randomUUID();
const team = randomUUID();
const holderName = `owner_only_holder_${owner}`;
const joinerName = `owner_only_joiner_${owner}`;
// A held session only stops waiting for its explicit release after this safety bound.
const HOLD_TIMEOUT_MS = 60_000;
const psqlArgs = ['psql', '-U', 'postgres', '-d', 'postgres', '-X', '-At', '-v', 'ON_ERROR_STOP=1'];
const psql = ['exec', container, ...psqlArgs, '-v', 'VERBOSITY=verbose'];
const children = new Set();
function query(sql) {
  const result = spawnSync('docker', [...psql, '-c', sql], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function collect(child) {
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (data) => {
    stdout += data;
  });
  child.stderr.on('data', (data) => {
    stderr += data;
  });
  children.add(child);
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      children.delete(child);
      resolve({ code, stdout, stderr });
    });
  });
}
function connection(sql) {
  return collect(spawn('docker', [...psql, '-c', sql]));
}
async function waitFor(sql, signal, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (query(sql) !== '1') {
    assert.ok(Date.now() < deadline, 'Timed out observing the actual PostgreSQL session state');
    await delay(25, undefined, { signal });
  }
}
const joinSql = `SELECT public.join_team('${team}','owner-only-race-code','${member}')`;
const sweepSql = 'SELECT disbanded FROM private.run_owner_only_team_cleanup()';
function prepareTeam() {
  query(`DELETE FROM public.teams WHERE id='${team}';
    INSERT INTO public.teams(id,name,join_code,owner_id,game_mode,max_members)
      VALUES('${team}','Isolated expiry race','owner-only-race-code','${owner}','pvp',5);
    INSERT INTO public.team_memberships(team_id,user_id,role,game_mode)
      VALUES('${team}','${owner}','owner','pvp');
    UPDATE public.teams SET owner_only_since=clock_timestamp()-interval '8 days',
      owner_only_expires_at=clock_timestamp()-interval '1 day' WHERE id='${team}';`);
}
// The session keeps its transaction (and locks) open until release() is called, regardless of
// runner speed. psql executes stdin statements as they arrive.
async function heldTransaction(sql) {
  const child = spawn('docker', ['exec', '-i', container, ...psqlArgs, '-v', 'VERBOSITY=verbose']);
  const timer = setTimeout(() => child.kill('SIGKILL'), HOLD_TIMEOUT_MS);
  const pending = collect(child).finally(() => clearTimeout(timer));
  const observation = new AbortController();
  // Publish the observed session name after the statement has acquired its locks.
  child.stdin.write(`BEGIN;\n${sql};\nSET application_name='${holderName}';\n`);
  try {
    await Promise.race([
      waitFor(
        `SELECT count(*) FROM pg_stat_activity
          WHERE application_name='${holderName}' AND state='idle in transaction'`,
        observation.signal
      ),
      pending.then((result) => {
        assert.fail(result.stderr || 'Held transaction exited before acquiring its locks');
      }),
    ]);
  } catch (error) {
    clearTimeout(timer);
    child.kill('SIGKILL');
    throw error;
  } finally {
    observation.abort();
  }
  const release = (rollback) => {
    child.stdin.end(rollback ? 'SELECT 1/0;\n' : 'COMMIT;\n');
    return pending;
  };
  return { release };
}
async function joinWins() {
  prepareTeam();
  const holder = await heldTransaction(joinSql);
  assert.equal(query(sweepSql), '0', 'cleanup must skip the team held by joining');
  assert.equal((await holder.release(false)).code, 0);
  assert.equal(query(`SELECT owner_only_since IS NULL FROM public.teams WHERE id='${team}'`), 't');
  assert.equal(query(sweepSql), '0');
  assert.equal(query(`SELECT count(*) FROM public.team_memberships WHERE team_id='${team}'`), '2');
  console.log(
    'PASS join owns team first: cleanup skips locked team; committed join cancels expiry'
  );
}
function assertRolledBackCleanup() {
  assert.equal(query(`SELECT count(*) FROM public.team_memberships WHERE team_id='${team}'`), '2');
  assert.equal(query(`SELECT owner_only_since IS NULL FROM public.teams WHERE id='${team}'`), 't');
}
function assertCommittedCleanup(join) {
  assert.match(join.stderr, /Team not found/);
  assert.equal(query(`SELECT count(*) FROM public.teams WHERE id='${team}'`), '0');
  assert.equal(query(`SELECT count(*) FROM public.team_memberships WHERE team_id='${team}'`), '0');
  assert.equal(
    query(`SELECT pvp_team_id IS NULL FROM public.user_system WHERE user_id='${member}'`),
    't'
  );
}
async function cleanupWins(rollback) {
  prepareTeam();
  // Watermark, not a net count: the batch also prunes receipts older than 30 days.
  const watermark = query('SELECT clock_timestamp()');
  const holder = await heldTransaction(sweepSql);
  const joining = connection(`SET application_name='${joinerName}'; ${joinSql};`);
  await waitFor(
    `SELECT count(*) FROM pg_stat_activity WHERE application_name='${joinerName}' AND wait_event_type='Lock'`
  );
  const [cleanup, join] = await Promise.all([holder.release(rollback), joining]);
  assert.equal(cleanup.code === 0, !rollback, cleanup.stderr);
  assert.equal(join.code === 0, rollback, join.stderr);
  assert.equal(
    query(`SELECT count(*) FROM private.owner_only_team_cleanup_receipts
      WHERE completed_at >= '${watermark}'::timestamptz`),
    rollback ? '0' : '1',
    'receipt must commit or roll back with cleanup'
  );
  if (rollback) assertRolledBackCleanup();
  else assertCommittedCleanup(join);
  console.log(
    `PASS cleanup owns team first: actual join lock wait, ${rollback ? 'failed cleanup rolls back and join succeeds' : 'committed expiry rejects join without dangling membership'}`
  );
}
async function cascadeContention() {
  prepareTeam();
  query(joinSql);
  const holder = await heldTransaction(`SELECT id FROM public.teams WHERE id='${team}' FOR UPDATE`);
  const result = await connection(`DELETE FROM auth.users WHERE id='${member}'`);
  assert.equal((await holder.release(false)).code, 0);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /55P03/);
  assert.equal(query(`SELECT count(*) FROM auth.users WHERE id='${member}'`), '1');
  query(`DELETE FROM auth.users WHERE id='${member}'`);
  assert.equal(
    query(`SELECT owner_only_since IS NOT NULL FROM public.teams WHERE id='${team}'`),
    't'
  );
  console.log(
    'PASS Auth cascade contention aborts with 55P03 without reverse-order wait; retry starts solo clock'
  );
}
// The cleanup gate is database-wide. Refuse a database with any other team so the sweep can
// never initialize or disband rows this harness did not create (supabase:check resets first).
const foreignTeams = Number(query('SELECT count(*) FROM public.teams'));
assert.equal(
  foreignTeams,
  0,
  `Refusing to run: ${foreignTeams} existing team(s). Use a freshly reset local database ` +
    '(pnpm run supabase:check) so cleanup cannot touch unrelated teams.'
);
const original = JSON.parse(query('SELECT row_to_json(c) FROM private.owner_only_team_cleanup c'));
// Pause the scheduled sweep so it cannot race the controlled sessions; restore its flag after.
const cronJob = "FROM cron.job WHERE jobname='owner-only-team-cleanup'";
const cronActive = query(`SELECT coalesce((SELECT active ${cronJob})::text, 'false')`);
const setCronActive = (active) => `SELECT cron.alter_job(jobid, active => ${active}) ${cronJob};`;
let created = false;
function restore() {
  for (const child of children) child.kill('SIGKILL');
  if (!created) return;
  created = false;
  const warning = original.warnings_started_at
    ? `'${original.warnings_started_at}'::timestamptz`
    : 'NULL';
  query(`BEGIN; DELETE FROM public.teams WHERE id='${team}';
    DELETE FROM auth.users WHERE id IN ('${owner}','${member}');
    UPDATE private.owner_only_team_cleanup SET deletion_enabled=${original.deletion_enabled},
      warnings_started_at=${warning};
    ${setCronActive(cronActive)}
    COMMIT;`);
}
for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  process.once(signal, () => {
    try {
      restore();
    } finally {
      process.exit(code);
    }
  });
}
try {
  query(`BEGIN;
    INSERT INTO auth.users(id,email) VALUES('${owner}','${owner}@example.invalid'),('${member}','${member}@example.invalid');
    UPDATE private.owner_only_team_cleanup SET warnings_started_at=clock_timestamp()-interval '8 days',deletion_enabled=true;
    ${setCronActive(false)}
    COMMIT;`);
  created = true;
  // Pausing does not stop a sweep that already started. Cover its 60s statement timeout plus
  // scheduler bookkeeping before creating fixtures; session-observation waits remain shorter.
  await waitFor(
    `SELECT (count(*) = 0)::int FROM cron.job_run_details
      WHERE status NOT IN ('succeeded','failed') AND jobid IN (SELECT jobid ${cronJob})`,
    undefined,
    70_000
  );
  await joinWins();
  await cleanupWins(false);
  await cleanupWins(true);
  await cascadeContention();
} finally {
  restore();
}
