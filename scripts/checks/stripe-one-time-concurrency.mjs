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
function verifyCutover() {
  const migration = readFileSync(
    'supabase/migrations/20261007063801_atomic_one_time_supporter_fulfillment.sql',
    'utf8'
  );
  const gate = migration.match(/DO \$cutover\$[\s\S]*?\$cutover\$;/)?.[0];
  assert.ok(gate, 'Cutover precondition must exist');
  query(gate);
  query(`INSERT INTO public.supporters(user_id, tier, status, type, expires_at)
    VALUES ('${user}', 'scav', 'active', 'one_time', now() + interval '30 days')`);
  const rejected = spawnSync('docker', [...psql, '-c', gate], { encoding: 'utf8' });
  assert.notEqual(
    rejected.status,
    0,
    'A previously fulfilled legacy timed payment must block rollout'
  );
  assert.match(rejected.stderr, /Reconcile legacy timed one-time payments/);
  query(`DELETE FROM public.supporters WHERE user_id='${user}'`);
  console.log(
    'PASS cutover accepts an empty timed-payment history and rejects a legacy fulfilled payment'
  );
}
async function subscriptionPair(label, holderSql, waiterSql) {
  const baseline = Number(
    query(`SELECT extract(epoch FROM coalesce(one_time_remaining, one_time_expires_at - now()))
    FROM public.supporters WHERE user_id='${user}'`)
  );
  const holder =
    connection(`BEGIN; SET application_name='${application}'; SET LOCAL ROLE service_role;
    ${holderSql}; SELECT pg_sleep(3); COMMIT;`);
  await until(
    `SELECT count(*) FROM pg_stat_activity WHERE application_name='${application}' AND wait_event='PgSleep'`,
    '1'
  );
  const other = connection(`SET application_name='${waiter}'; SET ROLE service_role; ${waiterSql}`);
  await until(
    `SELECT count(*) FROM pg_stat_activity WHERE application_name='${waiter}'
    AND wait_event IN ('transactionid','tuple')`,
    '1'
  );
  const [first, second] = await Promise.all([holder, other]);
  assert.equal(first.code, 0, first.stderr);
  assert.equal(second.code, 0, second.stderr);
  const expiry = Number(
    query(`SELECT extract(epoch FROM coalesce(one_time_remaining, one_time_expires_at - now()))
    FROM public.supporters WHERE user_id='${user}'`)
  );
  assert.ok(
    Math.abs(expiry - baseline - 30 * 86400) < 5,
    'Subscription transition preserves every committed paid period'
  );
  console.log(`PASS ${label}: actual row-lock wait; independent credit retains the payment`);
}
async function subscriptionRaces() {
  const activate = `UPDATE public.supporters SET type='subscription',status='active',tier='chad',
    expires_at=NULL,stripe_subscription_id='sub_concurrency_${user.replaceAll('-', '')}' WHERE user_id='${user}'`;
  const end = `UPDATE public.supporters SET status='expired',tier='supporter',expires_at=now(),
    stripe_subscription_id=NULL WHERE user_id='${user}'`;
  await subscriptionPair('subscription starts before donation', activate, fulfill('sub_start'));
  await subscriptionPair('donation commits before subscription end', fulfill('sub_end_after'), end);
  query(activate);
  await subscriptionPair('subscription ends before donation', end, fulfill('sub_end_before'));
  assert.equal(
    query(`SELECT type || ':' || status FROM public.supporters WHERE user_id='${user}'`),
    'one_time:active'
  );
}
async function chargebackRace() {
  const customer = `cus_concurrency_${user.replaceAll('-', '')}`;
  query(`UPDATE public.supporters SET stripe_customer_id='${customer}' WHERE user_id='${user}'`);
  const holder = connection(`BEGIN; SET application_name='${application}';
    SELECT pg_advisory_xact_lock(hashtext('supporter-chargeback'), hashtext('${customer}'));
    SELECT pg_sleep(3); SELECT public.disqualify_supporter_customer('${customer}', '${user}'); COMMIT;`);
  await until(
    `SELECT count(*) FROM pg_stat_activity WHERE application_name='${application}' AND wait_event='PgSleep'`,
    '1'
  );
  const payment = connection(
    `SET application_name='${waiter}'; SET ROLE service_role; ${fulfill('chargeback')}`
  );
  await until(
    `SELECT count(*) FROM pg_stat_activity WHERE application_name='${waiter}' AND wait_event='advisory'`,
    '1'
  );
  const [denied, paid] = await Promise.all([holder, payment]);
  assert.equal(denied.code, 0, denied.stderr);
  assert.equal(paid.code, 0, paid.stderr);
  assert.equal(
    query(`SELECT has_ever_supported FROM public.supporters WHERE user_id='${user}'`),
    'f'
  );
  query(`DELETE FROM private.supporter_chargebacks WHERE customer_id='${customer}'`);
  console.log('PASS chargeback and fulfillment serialize without deadlock; denial remains durable');
}
let created = false;
try {
  query(`INSERT INTO auth.users(id,email) VALUES ('${user}','one-time-${user}@example.invalid')`);
  created = true;
  verifyCutover();
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
  await subscriptionRaces();
  await chargebackRace();
} finally {
  if (created)
    query(`DELETE FROM private.supporter_chargebacks WHERE customer_id='cus_concurrency_${user.replaceAll('-', '')}';
     DELETE FROM public.supporters WHERE user_id='${user}';
    DELETE FROM auth.users WHERE id='${user}'; DELETE FROM public.stripe_events WHERE event_id='${event}'`);
}
