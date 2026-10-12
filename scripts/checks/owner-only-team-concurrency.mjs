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
const psql = [
  'exec',
  container,
  'psql',
  '-U',
  'postgres',
  '-d',
  'postgres',
  '-X',
  '-At',
  '-v',
  'ON_ERROR_STOP=1',
  '-v',
  'VERBOSITY=verbose',
];
function query(sql) {
  const result = spawnSync('docker', [...psql, '-c', sql], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function connection(sql) {
  const child = spawn('docker', [...psql, '-c', sql]);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (data) => {
    stdout += data;
  });
  child.stderr.on('data', (data) => {
    stderr += data;
  });
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
async function waitFor(sql) {
  const deadline = Date.now() + 6000;
  while (query(sql) !== '1') {
    assert.ok(Date.now() < deadline, 'Timed out observing the actual PostgreSQL session state');
    await delay(25);
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
async function heldTransaction(sql, rollback) {
  const pending = connection(`BEGIN; SET application_name='${holderName}';
    ${sql}; SELECT pg_sleep(3); ${rollback ? 'SELECT 1/0;' : 'COMMIT;'}`);
  await waitFor(
    `SELECT count(*) FROM pg_stat_activity WHERE application_name='${holderName}' AND wait_event='PgSleep'`
  );
  return { pending };
}
async function joinWins() {
  prepareTeam();
  const { pending } = await heldTransaction(joinSql, false);
  assert.equal(query(sweepSql), '0', 'cleanup must skip the team held by joining');
  assert.equal((await pending).code, 0);
  assert.equal(query(`SELECT owner_only_since IS NULL FROM public.teams WHERE id='${team}'`), 't');
  assert.equal(query(sweepSql), '0');
  assert.equal(query(`SELECT count(*) FROM public.team_memberships WHERE team_id='${team}'`), '2');
  console.log(
    'PASS join owns team first: cleanup skips locked team; committed join cancels expiry'
  );
}
async function cleanupWins(rollback) {
  prepareTeam();
  const { pending } = await heldTransaction(sweepSql, rollback);
  const joining = connection(`SET application_name='${joinerName}'; ${joinSql};`);
  await waitFor(
    `SELECT count(*) FROM pg_stat_activity WHERE application_name='${joinerName}' AND wait_event_type='Lock'`
  );
  const [cleanup, join] = await Promise.all([pending, joining]);
  assert.equal(cleanup.code === 0, !rollback, cleanup.stderr);
  assert.equal(join.code === 0, rollback, join.stderr);
  if (rollback) {
    assert.equal(
      query(`SELECT count(*) FROM public.team_memberships WHERE team_id='${team}'`),
      '2'
    );
    assert.equal(
      query(`SELECT owner_only_since IS NULL FROM public.teams WHERE id='${team}'`),
      't'
    );
  } else {
    assert.match(join.stderr, /Team not found/);
    assert.equal(query(`SELECT count(*) FROM public.teams WHERE id='${team}'`), '0');
    assert.equal(
      query(`SELECT count(*) FROM public.team_memberships WHERE team_id='${team}'`),
      '0'
    );
    assert.equal(
      query(`SELECT pvp_team_id IS NULL FROM public.user_system WHERE user_id='${member}'`),
      't'
    );
  }
  console.log(
    `PASS cleanup owns team first: actual join lock wait, ${rollback ? 'failed cleanup rolls back and join succeeds' : 'committed expiry rejects join without dangling membership'}`
  );
}
async function cascadeContention() {
  prepareTeam();
  query(joinSql);
  const { pending } = await heldTransaction(
    `SELECT id FROM public.teams WHERE id='${team}' FOR UPDATE`,
    false
  );
  const result = await connection(`DELETE FROM auth.users WHERE id='${member}'`);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /55P03/);
  assert.equal((await pending).code, 0);
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
const original = JSON.parse(query('SELECT row_to_json(c) FROM private.owner_only_team_cleanup c'));
let created = false;
try {
  query(`BEGIN;
    INSERT INTO auth.users(id,email) VALUES('${owner}','${owner}@example.invalid'),('${member}','${member}@example.invalid');
    UPDATE private.owner_only_team_cleanup SET warnings_started_at=clock_timestamp()-interval '8 days',deletion_enabled=true;
    COMMIT;`);
  created = true;
  await joinWins();
  await cleanupWins(false);
  await cleanupWins(true);
  await cascadeContention();
} finally {
  if (created) {
    query(`BEGIN; DELETE FROM public.teams WHERE id='${team}';
      DELETE FROM auth.users WHERE id IN ('${owner}','${member}');
      UPDATE private.owner_only_team_cleanup SET deletion_enabled=${original.deletion_enabled},
        warnings_started_at=${original.warnings_started_at ? `'${original.warnings_started_at}'::timestamptz` : 'NULL'};
      COMMIT;`);
  }
}
