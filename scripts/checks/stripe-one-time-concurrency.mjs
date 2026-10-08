// Isolated local database only; no URL or remote credentials are accepted.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
const project = readFileSync('supabase/config.toml', 'utf8').match(
  /^project_id\s*=\s*"([\w-]+)"/m
)?.[1];
const container = process.argv[2] ?? `supabase_db_${project}`;
assert.match(container, /^supabase_db_[\w-]+$/);
const user = randomUUID();
const application = `one_time_holder_${user}`;
const waiter = `one_time_waiter_${user}`;
const event = `evt_one_time_${user}`;
const prefix = `pi_concurrency_${user.replaceAll('-', '')}`;
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
];
function query(sql) {
  const result = spawnSync('docker', [...psql, '-c', sql], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function connection(sql) {
  const child = spawn('docker', [...psql, '-c', sql]);
  let stderr = '';
  let stdout = '';
  child.stderr.on('data', (data) => {
    stderr += data;
  });
  child.stdout.on('data', (data) => {
    stdout += data;
  });
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr, stdout }));
  });
}
async function until(sql, expected) {
  const deadline = Date.now() + 6000;
  while (query(sql) !== expected) {
    assert.ok(Date.now() < deadline, 'Timed out waiting for database lock');
    await delay(25);
  }
}
function fulfill(id) {
  return `SELECT public.fulfill_one_time_supporter('${prefix}_${id}', '2026-10-07 00:00:00+00',
    '{"user_id":"${user}","tier":"scav","amount_total":400}')`;
}
async function race(label, id, totalDays, rollback = false) {
  const baseline = Number(
    query(`SELECT extract(epoch FROM coalesce(
    (SELECT expires_at FROM public.supporters WHERE user_id='${user}'), now()))`)
  );
  const receiptCount = Number(
    query(`SELECT count(*) FROM private.stripe_one_time_payments WHERE user_id='${user}'`)
  );
  const holder =
    connection(`BEGIN; SET application_name='${application}'; SET LOCAL ROLE service_role;
    ${fulfill(`${id}_a`)}; SELECT pg_sleep(3); ${rollback ? 'SELECT 1/0;' : ''} COMMIT;`);
  await until(
    `SELECT count(*) FROM pg_stat_activity WHERE application_name='${application}' AND wait_event='PgSleep'`,
    '1'
  );
  const other = connection(
    `SET application_name='${waiter}'; SET ROLE service_role; ${fulfill(`${id}_b`)}`
  );
  await until(
    `SELECT count(*) FROM pg_stat_activity WHERE application_name='${waiter}' AND wait_event='advisory'`,
    '1'
  );
  const [first, second] = await Promise.all([holder, other]);
  assert.equal(first.code === 0, !rollback, first.stderr);
  assert.equal(second.code, 0, second.stderr);
  const expiry = Number(
    query(`SELECT extract(epoch FROM expires_at) FROM public.supporters WHERE user_id='${user}'`)
  );
  const addedDays = rollback ? 30 : 60;
  assert.ok(
    Math.abs(expiry - baseline - addedDays * 86400) < 1,
    'Each committed payment adds its full period'
  );
  assert.equal(
    Number(query(`SELECT count(*) FROM private.stripe_one_time_payments WHERE user_id='${user}'`)),
    receiptCount + (rollback ? 1 : 2)
  );
  console.log(`PASS ${label}: actual per-user advisory lock wait; ${totalDays} days retained`);
}
let created = false;
try {
  query(`INSERT INTO auth.users(id,email) VALUES ('${user}','one-time-${user}@example.invalid')`);
  created = true;
  await race('simultaneous first payments', 'first', 60);
  await race('simultaneous existing-row payments', 'existing', 120);
  await race('failed holder rolls back its receipt and entitlement', 'rollback', 150, true);
  assert.equal(
    query(`SELECT count(*) FROM private.stripe_one_time_payments WHERE user_id='${user}'`),
    '5'
  );
  assert.equal(
    query(
      `SELECT count(*) FROM private.stripe_one_time_payments WHERE payment_id='${prefix}_rollback_a'`
    ),
    '0'
  );
  const token = JSON.parse(query(`SELECT public.claim_stripe_event('${event}','test')`)).token;
  query(
    `UPDATE public.stripe_events SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE event_id='${event}'`
  );
  const holder = connection(`BEGIN; SET application_name='${application}';
    SELECT pg_advisory_xact_lock(hashtext('supporter-one-time'), hashtext('${user}'));
    SELECT pg_sleep(2); COMMIT;`);
  await until(
    `SELECT count(*) FROM pg_stat_activity WHERE application_name='${application}' AND wait_event='PgSleep'`,
    '1'
  );
  const headers = JSON.stringify({ 'x-stripe-event-id': event, 'x-stripe-claim-token': token });
  const stale = await connection(`SET statement_timeout='800ms'; SET ROLE service_role;
    SELECT set_config('request.headers','${headers}',false); ${fulfill('stale')}`);
  assert.notEqual(stale.code, 0);
  assert.match(stale.stderr, /Stripe event claim is no longer current/);
  assert.equal((await holder).code, 0);
  assert.equal(
    query(
      `SELECT count(*) FROM private.stripe_one_time_payments WHERE payment_id='${prefix}_stale'`
    ),
    '0'
  );
  console.log('PASS stale claim fails before waiting on a held per-user advisory lock');
} finally {
  if (created)
    query(`DELETE FROM public.supporters WHERE user_id='${user}';
    DELETE FROM auth.users WHERE id='${user}'; DELETE FROM public.stripe_events WHERE event_id='${event}'`);
}
