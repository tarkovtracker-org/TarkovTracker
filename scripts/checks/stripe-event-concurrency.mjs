// Multi-connection regression against the isolated Supabase Docker database only.
// No connection URL, production credentials or remote target is accepted.
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
const event = `evt_isolated_${user}`;
const application = `stripe_fence_holder_${user}`;
const claimantApplication = `stripe_fence_claimant_${user}`;
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
function query(statement) {
  const result = spawnSync('docker', [...psql, '-c', statement], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function runConnection(statement) {
  const child = spawn('docker', [...psql, '-c', statement]);
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
function startHolder(token, rollback) {
  const headers = JSON.stringify({
    'x-stripe-event-id': event,
    'x-stripe-claim-token': token,
    'x-supporter-credit-version': '1',
  });
  return runConnection(`BEGIN; SET application_name='${application}';
    SELECT set_config('request.headers','${headers}',true);
    UPDATE public.supporters SET tier='chad' WHERE user_id='${user}';
    SELECT pg_sleep(4); ${rollback ? 'SELECT 1/0;' : ''} COMMIT;`);
}
async function waitFor(statement, expected) {
  const deadline = Date.now() + 6000;
  while (query(statement) !== expected) {
    assert.ok(Date.now() < deadline, 'Timed out waiting for database transaction');
    await delay(25);
  }
}
function assertStaleRejected(token) {
  const headers = JSON.stringify({
    'x-stripe-event-id': event,
    'x-stripe-claim-token': token,
    'x-supporter-credit-version': '1',
  });
  const statement = `BEGIN; SELECT set_config('request.headers','${headers}',true);
    UPDATE public.supporters SET tier='timmy' WHERE user_id='${user}'; COMMIT;`;
  const result = spawnSync('docker', [...psql, '-c', statement], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Stripe event claim is no longer current/);
}
async function checkReplacement(rollback) {
  query(`DELETE FROM public.stripe_events WHERE event_id='${event}';
    UPDATE public.supporters SET tier='scav' WHERE user_id='${user}';`);
  const token = JSON.parse(query(`SELECT public.claim_stripe_event('${event}','test')`)).token;
  query(
    `UPDATE public.stripe_events SET lease_expires_at=clock_timestamp()+interval '1.5 seconds' WHERE event_id='${event}'`
  );
  const holder = startHolder(token, rollback);
  await waitFor(
    `SELECT count(*) FROM pg_stat_activity WHERE application_name='${application}' AND wait_event='PgSleep'`,
    '1'
  );
  await waitFor(
    `SELECT (lease_expires_at <= clock_timestamp())::text FROM public.stripe_events WHERE event_id='${event}'`,
    'true'
  );
  const started = performance.now();
  const claimant = runConnection(
    `SET application_name='${claimantApplication}'; SELECT public.claim_stripe_event('${event}','test')`
  );
  // Observe actual PostgreSQL lock wait while the holder owns the row. Timing
  // alone cannot prove that claim replacement is fenced by the billing write.
  await waitFor(
    `SELECT count(*) FROM pg_stat_activity WHERE application_name='${claimantApplication}' AND wait_event_type='Lock' AND wait_event='transactionid'`,
    '1'
  );
  const claimResult = await claimant;
  assert.equal(claimResult.code, 0, claimResult.stderr);
  const replacement = JSON.parse(claimResult.stdout.trim().split('\n').at(-1));
  const elapsed = performance.now() - started;
  const result = await holder;
  assert.equal(replacement.outcome, 'claimed');
  assert.notEqual(replacement.token, token);
  assert.equal(result.code === 0, !rollback, result.stderr);
  assert.equal(
    query(`SELECT tier FROM public.supporters WHERE user_id='${user}'`),
    rollback ? 'scav' : 'chad'
  );
  assertStaleRejected(token);
  console.log(
    `PASS receipt replacement waits for ${rollback ? 'rollback' : 'commit'} across lease expiry; stale subsequent write rejected (${Math.round(elapsed)}ms)`
  );
}
function createFixture() {
  query(`BEGIN; INSERT INTO auth.users(id,email) VALUES ('${user}','stripe-${user}@example.invalid');
    INSERT INTO public.supporters(user_id,type,tier) VALUES ('${user}','one_time','scav'); COMMIT;`);
}
async function withFixture(run, setup = createFixture) {
  let created = false;
  try {
    setup();
    created = true;
    await run();
  } finally {
    if (created) {
      query(`DELETE FROM public.supporters WHERE user_id='${user}'; DELETE FROM auth.users WHERE id='${user}';
        DELETE FROM public.stripe_events WHERE event_id='${event}';`);
    }
  }
}
async function assertFailedSetupPreservesExisting() {
  // A nested invocation collides with this run's existing fixture. Its setup
  // fails before ownership is established, so it must leave those rows intact.
  await assert.rejects(
    withFixture(() => {}, createFixture),
    /duplicate key/
  );
  assert.equal(query(`SELECT count(*) FROM auth.users WHERE id='${user}'`), '1');
  assert.equal(query(`SELECT tier FROM public.supporters WHERE user_id='${user}'`), 'scav');
  console.log(`PASS failed setup preserves pre-existing fixture ${user}`);
}
await withFixture(async () => {
  await assertFailedSetupPreservesExisting();
  await checkReplacement(false);
  await checkReplacement(true);
});
