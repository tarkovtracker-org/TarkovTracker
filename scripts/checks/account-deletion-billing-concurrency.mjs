// Runs only against the local Supabase Docker container, with disposable account fixtures.
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
assert.equal(context.status, 0, context.stderr);
assert.ok(isLocalEndpoint(context.stdout.trim()), 'Docker context must use a local socket');
const dockerArgs = ['--host', process.env.DOCKER_HOST || context.stdout.trim()];
const project = readFileSync('supabase/config.toml', 'utf8').match(
  /^project_id\s*=\s*"([\w-]+)"/m
)?.[1];
assert.ok(project, 'Missing local Supabase project');
const psql = [
  ...dockerArgs,
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
const holderName = `deletion_holder_${user}`;
const waiterName = `deletion_waiter_${user}`;
const pendingConnections = new Set();
const pendingChildren = new Set();
function query(sql) {
  const result = spawnSync('docker', [...psql, '-c', sql], { encoding: 'utf8', env: dockerEnv });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function connection(sql) {
  return collect(
    spawn('docker', [...psql, '-c', `SET statement_timeout='90s'; ${sql}`], { env: dockerEnv })
  );
}
function collect(child) {
  pendingChildren.add(child);
  let output = '';
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    output += data;
  });
  const done = new Promise((resolve) => {
    child.on('error', (error) => resolve({ code: -1, output: error.message }));
    child.on('close', (code) => resolve({ code, output }));
  });
  pendingConnections.add(done);
  void done.finally(() => {
    pendingConnections.delete(done);
    pendingChildren.delete(child);
  });
  return done;
}
async function waitFor(sql, signal) {
  const deadline = Date.now() + 6000;
  while (query(sql) !== '1') {
    assert.ok(Date.now() < deadline, 'Timed out waiting for actual database lock');
    await delay(25, undefined, { signal });
  }
}
const activity = (name, condition) =>
  `SELECT count(*) FROM pg_stat_activity WHERE application_name='${name}' AND ${condition}`;
// Holding stdin open is the release barrier; deadlines only abort a broken test.
async function heldTransaction(sql) {
  const args = [...psql];
  args.splice(dockerArgs.length + 1, 0, '-i');
  const child = spawn('docker', args, { env: dockerEnv });
  child.stdin.on('error', () => {}); // Process exit is checked through collect().
  const timer = setTimeout(() => child.kill('SIGKILL'), 95_000);
  const done = collect(child).finally(() => clearTimeout(timer));
  const observation = new AbortController();
  child.stdin.write(`SET application_name='${holderName}_pending'; SET statement_timeout='90s';
    SET idle_in_transaction_session_timeout='90s'; BEGIN; ${sql}; SET application_name='${holderName}';\n`);
  try {
    await Promise.race([
      waitFor(activity(holderName, "state='idle in transaction'"), observation.signal),
      done.then((result) => assert.fail(result.output || 'Holder exited before acquiring locks')),
    ]);
  } catch (error) {
    child.stdin.end('ROLLBACK;\n');
    throw error;
  } finally {
    observation.abort();
  }
  return {
    release: (sql = 'COMMIT;') => {
      child.stdin.end(sql + '\n');
      return done;
    },
  };
}
const activation = `INSERT INTO public.supporters(user_id,stripe_customer_id,stripe_subscription_id,status,type)
  VALUES ('${user}','cus_${user}','sub_${user}','active','subscription')`;
async function claimWins() {
  const holder = await heldTransaction(`SELECT public.claim_account_deletion_job('${user}',true)`);
  const waiter = connection(`SET application_name='${waiterName}'; ${activation};`);
  await waitFor(activity(waiterName, "wait_event_type='Lock'"));
  assert.equal((await holder.release()).code, 0);
  const result = await waiter;
  assert.notEqual(result.code, 0);
  assert.match(result.output, /account_deletion_in_progress/);
  assert.equal(query(`SELECT count(*) FROM public.supporters WHERE user_id='${user}'`), '0');
  console.log('PASS deletion claim holds Auth row; observed activation lock wait then rejection');
}
async function activationWins() {
  query(`DELETE FROM public.account_deletion_jobs WHERE user_id='${user}'`);
  const holder = await heldTransaction(activation);
  const waiter = connection(
    `SET application_name='${waiterName}'; SELECT public.claim_account_deletion_job('${user}',true);`
  );
  await waitFor(activity(waiterName, "wait_event_type='Lock'"));
  assert.equal((await holder.release()).code, 0);
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
    'PASS activation holds Auth row; observed deletion lock wait and stale snapshot rejection'
  );
}
function prepareBilling() {
  query(`DELETE FROM public.account_deletion_jobs WHERE user_id='${user}';
    DELETE FROM public.supporters WHERE user_id='${user}';
    DELETE FROM public.account_billing_subscriptions WHERE user_id='${user}'; ${activation};
    SELECT public.claim_account_deletion_job('${user}',true);`);
}
const clearBilling = (
  ids
) => `SELECT public.clear_ended_deletion_subscription('${user}', 'sub_${user}', 'cus_${user}',
  (SELECT claim_token FROM public.account_deletion_jobs WHERE user_id='${user}'), ${ids})`;
async function leaseExpiryHistory() {
  prepareBilling();
  // A real lease expiry is the tested condition, never the holder release mechanism.
  query(
    `UPDATE public.account_deletion_jobs SET updated_at=clock_timestamp()-interval '14 minutes 30 seconds' WHERE user_id='${user}'`
  );
  const holder = await heldTransaction(
    `SELECT 1 FROM public.supporters WHERE user_id='${user}' FOR UPDATE`
  );
  const clearer = connection(
    `SET application_name='${waiterName}'; ${clearBilling(`ARRAY['sub_${user}']::text[]`)};`
  );
  await waitFor(activity(waiterName, "wait_event_type='Lock'"));
  query(`SELECT pg_sleep(LEAST(30,GREATEST(0,extract(epoch FROM updated_at + interval '15 minutes' - clock_timestamp()))))
    FROM public.account_deletion_jobs WHERE user_id='${user}'`);
  assert.equal(
    query(
      `SELECT (updated_at <= clock_timestamp()-interval '15 minutes')::integer FROM public.account_deletion_jobs WHERE user_id='${user}'`
    ),
    '1'
  );
  const recorderName = `${waiterName}_record`;
  const recorder = connection(
    `SET application_name='${recorderName}'; SELECT public.record_account_billing_subscription('${user}','sub_late_${user}');`
  );
  await waitFor(`SELECT ((EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='${recorderName}' AND wait_event_type='Lock'))
    OR EXISTS(SELECT 1 FROM public.account_billing_subscriptions WHERE user_id='${user}' AND stripe_subscription_id='sub_late_${user}'))::integer`);
  assert.equal((await holder.release()).code, 0);
  const results = await Promise.all([clearer, recorder]);
  for (const result of results) assert.equal(result.code, 0, result.output);
  assert.equal(
    query(
      `SELECT count(*) FROM public.account_billing_subscriptions WHERE user_id='${user}' AND stripe_subscription_id='sub_late_${user}'`
    ),
    '1',
    'a subscription recorded across lease expiry must never be erased by stale clearance'
  );
  assert.match(
    results[0].output,
    /(^|\n)f(\n|$)/,
    'clearance must recheck its lease after lock waits'
  );
  console.log(
    'PASS real lease expiry while clearance waits; new subscription identity retained and stale clearance rejected'
  );
}
async function retainedHistoryWhileWaiting() {
  prepareBilling();
  query(`DELETE FROM public.account_billing_subscriptions WHERE user_id='${user}'`);
  const holder = await heldTransaction(
    `UPDATE public.supporters SET status='cancelled' WHERE user_id='${user}'`
  );
  const clearer = connection(
    `SET application_name='${waiterName}'; ${clearBilling('ARRAY[]::text[]')};`
  );
  await waitFor(activity(waiterName, "wait_event_type='Lock'"));
  assert.equal((await holder.release()).code, 0);
  const result = await clearer;
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /(^|\n)f(\n|$)/, 'history must be read after the supporter lock');
  assert.equal(
    query(`SELECT count(*) FROM public.account_billing_subscriptions WHERE user_id='${user}'`),
    '1'
  );
  console.log(
    'PASS unchanged-identity supporter update retains history during the clearance lock wait'
  );
}
async function mutationWaitLeaseExpiry() {
  prepareBilling();
  query(`INSERT INTO private.account_retention(user_id) VALUES ('${user}') ON CONFLICT DO NOTHING;
    UPDATE public.supporters SET has_ever_supported=true WHERE user_id='${user}';
    UPDATE public.account_deletion_jobs SET updated_at=clock_timestamp()-interval '14 minutes 30 seconds' WHERE user_id='${user}'`);
  const holder = await heldTransaction(
    `SELECT 1 FROM private.account_retention WHERE user_id='${user}' FOR UPDATE`
  );
  const clearer = connection(
    `SET application_name='${waiterName}'; ${clearBilling(`ARRAY['sub_${user}']::text[]`)};`
  );
  await waitFor(activity(waiterName, "wait_event_type='Lock'"));
  query(`SELECT pg_sleep(LEAST(30,GREATEST(0,extract(epoch FROM updated_at + interval '15 minutes' - clock_timestamp()))))
    FROM public.account_deletion_jobs WHERE user_id='${user}'`);
  assert.equal(
    query(
      `SELECT (updated_at <= clock_timestamp()-interval '15 minutes')::integer FROM public.account_deletion_jobs WHERE user_id='${user}'`
    ),
    '1'
  );
  assert.equal((await holder.release()).code, 0);
  const result = await clearer;
  assert.notEqual(result.code, 0, 'expiry during a mutation trigger must abort the transaction');
  assert.match(result.output, /account_deletion_lease_expired/);
  assert.equal(
    query(`SELECT stripe_subscription_id FROM public.supporters WHERE user_id='${user}'`),
    `sub_${user}`
  );
  assert.equal(
    query(`SELECT count(*) FROM public.account_billing_subscriptions WHERE user_id='${user}'`),
    '1'
  );
  console.log(
    'PASS lease expiry during a mutation-trigger wait aborts and rolls back billing clearance'
  );
}
async function directDeletionContention() {
  query(`DELETE FROM public.account_deletion_jobs WHERE user_id='${user}'`);
  const holder = await heldTransaction(
    `SELECT 1 FROM public.supporters WHERE user_id='${user}' FOR UPDATE`
  );
  const waiter = connection(
    `SET application_name='${waiterName}'; DELETE FROM auth.users WHERE id='${user}';`
  );
  await waitFor(activity(waiterName, "wait_event_type='Lock'"));
  const results = await Promise.all([
    holder.release(
      `UPDATE public.supporters SET stripe_subscription_id='sub_next_${user}' WHERE user_id='${user}'; COMMIT;`
    ),
    waiter,
  ]);
  assert.ok(results.some((result) => /deadlock detected/.test(result.output)));
  assert.equal(query(`SELECT count(*) FROM auth.users WHERE id='${user}'`), '1');
  assert.ok(
    Number(
      query(`SELECT count(*) FROM public.account_billing_subscriptions WHERE user_id='${user}'`)
    ) > 0
  );
  console.log(
    'PASS direct Auth deletion contention is retryable without deleting account or billing identity'
  );
}
let created = false;
let failure;
try {
  query(`INSERT INTO auth.users(id,email) VALUES ('${user}','${user}@billing-delete.invalid')`);
  created = true;
  await claimWins();
  await activationWins();
  await leaseExpiryHistory();
  await retainedHistoryWhileWaiting();
  await mutationWaitLeaseExpiry();
  await directDeletionContention();
} catch (error) {
  failure = error;
} finally {
  query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name IN
    ('${holderName}','${holderName}_pending','${waiterName}','${waiterName}_record') AND pid <> pg_backend_pid()`);
  for (const child of pendingChildren) child.stdin.end();
  await Promise.allSettled([...pendingConnections]);
  try {
    if (created)
      query(`DELETE FROM public.account_deletion_jobs WHERE user_id='${user}';
    DELETE FROM public.supporters WHERE user_id='${user}';
    DELETE FROM public.account_billing_subscriptions WHERE user_id='${user}';
    DELETE FROM auth.users WHERE id='${user}';`);
  } catch (error) {
    if (!failure) failure = error;
    else console.error('Fixture cleanup also failed:', error);
  }
}
if (failure) throw failure;
