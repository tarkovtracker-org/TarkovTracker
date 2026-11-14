// Runs only against the local Supabase Docker container, with disposable account fixtures.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
const project = readFileSync('supabase/config.toml', 'utf8').match(
  /^project_id\s*=\s*"([\w-]+)"/m
)?.[1];
assert.ok(project, 'Missing local Supabase project');
const psql = [
  'exec',
  `supabase_db_${project}`,
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
const user = randomUUID();
const holderName = `deletion_billing_holder_${user}`;
const waiterName = `deletion_billing_waiter_${user}`;
function query(sql) {
  const result = spawnSync('docker', [...psql, '-c', sql], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function connection(sql) {
  const child = spawn('docker', [...psql, '-c', sql]);
  let output = '';
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    output += data;
  });
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });
}
async function waitFor(sql) {
  const deadline = Date.now() + 6000;
  while (query(sql) !== '1') {
    assert.ok(Date.now() < deadline, 'Timed out waiting for actual database lock');
    await delay(25);
  }
}
const activity = (name, condition) =>
  `SELECT count(*) FROM pg_stat_activity WHERE application_name='${name}' AND ${condition}`;
const activation = `INSERT INTO public.supporters(user_id,stripe_customer_id,stripe_subscription_id,status,type)
  VALUES ('${user}','cus_${user}','sub_${user}','active','subscription')`;
async function claimWins() {
  const holder = connection(`BEGIN; SET application_name='${holderName}';
    SELECT public.claim_account_deletion_job('${user}',true); SELECT pg_sleep(3); COMMIT;`);
  await waitFor(activity(holderName, "wait_event='PgSleep'"));
  const waiter = connection(`SET application_name='${waiterName}'; ${activation};`);
  await waitFor(activity(waiterName, "wait_event_type='Lock'"));
  assert.equal((await holder).code, 0);
  const result = await waiter;
  assert.notEqual(result.code, 0);
  assert.match(result.output, /account_deletion_in_progress/);
  assert.equal(query(`SELECT count(*) FROM public.supporters WHERE user_id='${user}'`), '0');
  console.log(
    'PASS deletion claim holds Auth row; concurrent billing activation waits then rejects'
  );
}
async function activationWins() {
  query(`DELETE FROM public.account_deletion_jobs WHERE user_id='${user}'`);
  const holder = connection(
    `BEGIN; SET application_name='${holderName}'; ${activation}; SELECT pg_sleep(3); COMMIT;`
  );
  await waitFor(activity(holderName, "wait_event='PgSleep'"));
  const waiter = connection(
    `SET application_name='${waiterName}'; SELECT public.claim_account_deletion_job('${user}',true);`
  );
  await waitFor(activity(waiterName, "wait_event_type='Lock'"));
  assert.equal((await holder).code, 0);
  assert.equal((await waiter).code, 0);
  assert.equal(
    query(`SELECT public.clear_ended_deletion_subscription('${user}',NULL,NULL,
    (SELECT claim_token FROM public.account_deletion_jobs WHERE user_id='${user}'),ARRAY[]::text[])`),
    'f'
  );
  assert.equal(
    query(`SELECT stripe_subscription_id FROM public.supporters WHERE user_id='${user}'`),
    `sub_${user}`
  );
  console.log(
    'PASS billing activation holds Auth row; deletion waits and rejects its stale verified snapshot'
  );
}
try {
  query(`INSERT INTO auth.users(id,email) VALUES ('${user}','${user}@billing-delete.invalid')`);
  await claimWins();
  await activationWins();
} finally {
  query(`DELETE FROM public.account_deletion_jobs WHERE user_id='${user}';
    DELETE FROM public.supporters WHERE user_id='${user}';
    DELETE FROM public.account_billing_subscriptions WHERE user_id='${user}';
    DELETE FROM auth.users WHERE id='${user}';`);
}
