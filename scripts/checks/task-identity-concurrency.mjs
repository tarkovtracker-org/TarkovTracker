// Real row-lock coverage against this checkout's local Docker database only.
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
assert.ok(project);
const container = `supabase_db_${project}`;
const user = randomUUID();
const profile = randomUUID();
const rpcProfile = randomUUID();
const holderName = `alias_holder_${user}`;
const writerName = `alias_writer_${user}`;
const source = 'placeholder_honest_review';
const target = '6a764077161e4b45b101566e';
const args = ['psql', '-U', 'postgres', '-d', 'postgres', '-X', '-At', '-v', 'ON_ERROR_STOP=1'];
const children = new Set();
function query(sql) {
  const result = spawnSync('docker', [...dockerArgs, 'exec', container, ...args, '-c', sql], {
    encoding: 'utf8',
    env: dockerEnv,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function connection(sql, keepOpen = false) {
  const child = spawn('docker', [...dockerArgs, 'exec', '-i', container, ...args], {
    env: dockerEnv,
  });
  children.add(child);
  let output = '';
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    output += data;
  });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      children.delete(child);
      resolve({ code, output });
    });
  });
  child.stdin.write(
    `SET statement_timeout='15s'; SET idle_in_transaction_session_timeout='30s'; ${sql};\n`
  );
  if (!keepOpen) child.stdin.end();
  return { child, done };
}
async function observe(name, condition, pending) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    if (
      query(
        `SELECT count(*) FROM pg_stat_activity WHERE application_name='${name}' AND ${condition}`
      ) === '1'
    )
      return;
    assert.ok(Date.now() < deadline, 'Expected PostgreSQL lock/session state was not observed');
    await Promise.race([
      delay(25),
      pending.then((result) =>
        assert.fail(result.output || 'Session exited before acquiring/waiting on its lock')
      ),
    ]);
  }
}
const snapshot = (id, complete, timestamp) =>
  JSON.stringify({
    level: 1,
    taskCompletions: { [id]: { complete, timestamp: timestamp ?? undefined } },
  });
async function race(table, key, writeSql, holderTimestamp = 40) {
  query(`UPDATE public.${table} SET progress_data='${snapshot(target, true, 10)}' WHERE ${key}`);
  const holder = connection(
    `BEGIN; UPDATE public.${table} SET progress_data='${snapshot(target, false, holderTimestamp)}' WHERE ${key}; SET application_name='${holderName}'`,
    true
  );
  await observe(holderName, "state='idle in transaction'", holder.done);
  const writer = connection(`SET application_name='${writerName}'; ${writeSql}`);
  await observe(writerName, "wait_event_type='Lock'", writer.done);
  holder.child.stdin.end('COMMIT;\n');
  for (const result of await Promise.all([holder.done, writer.done]))
    assert.equal(result.code, 0, result.output);
  assert.deepEqual(
    JSON.parse(query(`SELECT progress_data->'taskCompletions' FROM public.${table} WHERE ${key}`)),
    {
      [target]: {
        complete: false,
        ...(holderTimestamp === null ? {} : { timestamp: holderTimestamp }),
      },
    }
  );
  console.log(
    `PASS ${table}: observed alias writer waiting on row lock; canonical uncheck retained`
  );
}
const ledger = query(
  "SELECT pg_get_functiondef('private.progress_task_id_aliases()'::regprocedure)"
);
const aliases = {
  schemaVersion: 1,
  modes: {
    regular: { tasks: { [source]: target }, objectives: {} },
    pve: { tasks: {}, objectives: {} },
    'pvp-season': { tasks: {}, objectives: {} },
  },
};
let created = false;
let cleaned = false;
function attemptCleanup(operation) {
  try {
    operation();
  } catch (error) {
    console.error('Task identity fixture cleanup failed:', error);
    process.exitCode = 1;
  }
}
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  attemptCleanup(() =>
    query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name IN ('${holderName}','${writerName}')`
    )
  );
  for (const child of children) attemptCleanup(() => child.kill('SIGKILL'));
  attemptCleanup(() =>
    query(
      `BEGIN; ${ledger}; ${created ? `DELETE FROM auth.users WHERE id='${user}';` : ''} COMMIT;`
    )
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
  query(`BEGIN;
    CREATE OR REPLACE FUNCTION private.progress_task_id_aliases() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $body$ SELECT '${JSON.stringify(aliases)}'::jsonb $body$;
    INSERT INTO auth.users(id,email) VALUES('${user}','${user}@example.invalid');
    INSERT INTO public.supporters(user_id,type,status,expires_at) VALUES('${user}','subscription','active',NULL);
    INSERT INTO public.user_progress(user_id) VALUES('${user}') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_game_mode_progress(user_id,game_mode,season_number,progress_data) VALUES('${user}','pvp',0,'{"level":1}');
    INSERT INTO public.user_game_profiles(id,user_id,label) VALUES('${profile}','${user}','Alias concurrency');
    INSERT INTO public.user_profile_mode_progress(profile_id,user_id,game_mode,season_number,progress_data) VALUES('${profile}','${user}','pvp',0,'{"level":1}');
    INSERT INTO public.user_game_profiles(id,user_id,label) VALUES('${rpcProfile}','${user}','Alias RPC concurrency');
    INSERT INTO public.user_profile_mode_progress(profile_id,user_id,game_mode,season_number,progress_data) VALUES('${rpcProfile}','${user}','pvp',0,'{"level":1}');
    COMMIT;`);
  created = true;
  const key = `user_id='${user}' AND game_mode='pvp'`;
  await race(
    'user_game_mode_progress',
    key,
    `SELECT public.merge_progress_data('${user}','pvp_data','{"${source}":{"complete":true,"timestamp":20}}',NULL,NULL)`
  );
  await race(
    'user_game_mode_progress',
    key,
    `INSERT INTO public.user_game_mode_progress(user_id,game_mode,season_number,progress_data) VALUES('${user}','pvp',0,'${snapshot(source, true, 20)}') ON CONFLICT(user_id,game_mode,season_number) DO UPDATE SET progress_data=EXCLUDED.progress_data`
  );
  await race(
    'user_profile_mode_progress',
    `profile_id='${profile}' AND game_mode='pvp'`,
    `INSERT INTO public.user_profile_mode_progress(profile_id,user_id,game_mode,season_number,progress_data) VALUES('${profile}','${user}','pvp',0,'${snapshot(source, true, 20)}') ON CONFLICT(profile_id,game_mode,season_number) DO UPDATE SET progress_data=EXCLUDED.progress_data`
  );
  await race(
    'user_profile_mode_progress',
    `profile_id='${rpcProfile}' AND game_mode='pvp'`,
    `SELECT set_config('request.jwt.claim.sub','${user}',false); SELECT public.sync_game_profile_progress('${rpcProfile}',1,'{"pvp":${snapshot(source, true, 20)}}',NULL)`,
    null
  );
} finally {
  cleanup();
  process.removeListener('SIGINT', onSigint);
  process.removeListener('SIGTERM', onSigterm);
}
