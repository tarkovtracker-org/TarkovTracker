/** Opt-in fixed disposable Supabase transport test. No external provider configuration. */
import { assertEquals } from 'jsr:@std/assert@1';
import { createClient } from '@supabase/supabase-js';
import { runAccountDeletion } from './account-deletion-workflow.ts';
import { claimDeletionJob, type AccountDeletionClient } from './account-deletion-lifecycle.ts';
const enabled = Deno.env.get('TT_B_LOCAL_AUTH_TEST') === '1';
for (const failure of ['response_lost', 'transient_before_delete']) {
  Deno.test({
    name: `Real local Auth workflow: ${failure}`,
    ignore: !enabled,
    fn: async () => {
      const config = JSON.parse(await Deno.readTextFile('/tmp/tt-b-status.json'));
      assertEquals(config.API_URL, 'http://127.0.0.1:59321');
      assertEquals(config.DB_URL, 'postgresql://postgres:postgres@127.0.0.1:59322/postgres');
      const supabase = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const created = await supabase.auth.admin.createUser({
        email: `synthetic-${crypto.randomUUID()}@example.invalid`,
        password: 'Synthetic-Auth-Test-123!',
        email_confirm: true,
      });
      assertEquals(created.error, null);
      const userId = created.data.user!.id;
      let calls = 0;
      const client = {
        from: supabase.from.bind(supabase),
        rpc: supabase.rpc.bind(supabase),
        auth: {
          admin: {
            deleteUser: async (id: string) => {
              calls++;
              if (calls === 1 && failure === 'transient_before_delete')
                return { error: { status: 503, code: 'synthetic_transport' } };
              const result = await supabase.auth.admin.deleteUser(id);
              if (calls === 1) {
                assertEquals(result.error, null);
                return { error: { status: 503, code: 'synthetic_response_lost' } };
              }
              return result;
            },
          },
        },
      } as unknown as AccountDeletionClient;
      const claim = await claimDeletionJob(client, userId, true);
      assertEquals(claim.error, null);
      const result = await runAccountDeletion(client, userId, claim.claimToken!, () =>
        Promise.resolve()
      );
      assertEquals(result.status, 'completed');
      assertEquals(calls, 2);
      const absent = await supabase.auth.admin.getUserById(userId);
      assertEquals(absent.error?.status, 404);
      const status = await supabase.rpc('account_lifecycle_status', { p_user_id: userId });
      assertEquals(status.data.state, 'completed');
      const repeated = await runAccountDeletion(client, userId, claim.claimToken!, () =>
        Promise.resolve()
      );
      assertEquals(repeated.status, 'lease_lost');
      assertEquals(calls, 2);
    },
  });
}
Deno.test({
  name: 'Database deadlock response parks a fenced retry before any Auth deletion',
  ignore: !enabled,
  fn: async () => {
    const config = JSON.parse(await Deno.readTextFile('/tmp/tt-b-status.json'));
    assertEquals(config.API_URL, 'http://127.0.0.1:59321');
    assertEquals(config.DB_URL, 'postgresql://postgres:postgres@127.0.0.1:59322/postgres');
    const db = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const created = await db.auth.admin.createUser({
      email: `deadlock-${crypto.randomUUID()}@example.invalid`,
      password: 'Synthetic-Auth-123!',
      email_confirm: true,
    });
    assertEquals(created.error, null);
    const uid = created.data.user!.id;
    let inject = true;
    let deletes = 0;
    const client = {
      from: db.from.bind(db),
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === 'prepare_account_deletion' && inject) {
          inject = false;
          return { data: null, error: { code: '40P01', message: 'synthetic deadlock response' } };
        }
        return await db.rpc(name, args);
      },
      auth: {
        admin: {
          deleteUser: (id: string) => {
            deletes++;
            return db.auth.admin.deleteUser(id);
          },
        },
      },
    } as unknown as AccountDeletionClient;
    const first = await claimDeletionJob(client, uid, true);
    assertEquals((await runAccountDeletion(client, uid, first.claimToken!)).status, 'failed');
    assertEquals(deletes, 0);
    const sql = async (query: string) => {
      const process = new Deno.Command('docker', {
        args: [
          'exec',
          '-i',
          'supabase_db_tt-b-http-disposable',
          'psql',
          '-X',
          '-qAt',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-v',
          'ON_ERROR_STOP=1',
        ],
        stdin: 'piped',
        stdout: 'piped',
        stderr: 'piped',
      }).spawn();
      const input = process.stdin.getWriter();
      await input.write(new TextEncoder().encode(query));
      await input.close();
      const result = await process.output();
      assertEquals(result.code, 0);
      return new TextDecoder().decode(result.stdout).trim();
    };
    const target = await new Deno.Command('docker', {
      args: ['inspect', 'supabase_db_tt-b-http-disposable', '--format', '{{json .Config.Labels}}'],
      stdout: 'piped',
    }).output();
    assertEquals(
      JSON.parse(new TextDecoder().decode(target.stdout))['com.supabase.cli.workdir'],
      '/tmp/tt-b-http'
    );
    const job = JSON.parse(
      await sql(
        `SELECT row_to_json(j) FROM (SELECT status,next_run_at,attempts FROM public.account_deletion_jobs WHERE user_id='${uid}') j`
      )
    );
    assertEquals(job.status, 'failed');
    assertEquals(job.attempts, 1);
    assertEquals(Date.parse(job.next_run_at) > Date.now(), true);
    // Advance only this synthetic application's retry clock, through the disposable DB fixture connection.
    await sql(
      `UPDATE public.account_deletion_jobs SET next_run_at=clock_timestamp() WHERE user_id='${uid}'`
    );
    const next = await claimDeletionJob(client, uid, false);
    assertEquals(next.claimed, true);
    assertEquals((await runAccountDeletion(client, uid, next.claimToken!)).status, 'completed');
    assertEquals((await runAccountDeletion(client, uid, first.claimToken!)).status, 'lease_lost');
    assertEquals(deletes, 1);
  },
});
