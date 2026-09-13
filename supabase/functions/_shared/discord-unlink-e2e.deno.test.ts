/** Supported Auth unlink fixtures -> real RPC worker -> mocked Discord API. */
import { assertEquals, assertExists } from 'jsr:@std/assert@1';
import { createClient } from '@supabase/supabase-js';
import { runStagingProviderBatch } from './staging-provider-runner.ts';
Deno.test({
  name: 'Worker retries and completes roles after real Auth identity disappears',
  ignore: Deno.env.get('TT_B_LOCAL_AUTH_TEST') !== '1',
  fn: async () => {
    const config = JSON.parse(await Deno.readTextFile('/tmp/tt-b-status.json'));
    assertEquals(config.API_URL, 'http://127.0.0.1:59321');
    assertEquals(config.DB_URL, 'postgresql://postgres:postgres@127.0.0.1:59322/postgres');
    const target = await new Deno.Command('docker', {
      args: ['inspect', 'supabase_db_tt-b-http-disposable', '--format', '{{json .Config.Labels}}'],
      stdout: 'piped',
    }).output();
    assertEquals(
      JSON.parse(new TextDecoder().decode(target.stdout))['com.supabase.cli.project'],
      'tt-b-http-disposable'
    );
    const fixtures = JSON.parse(
      await Deno.readTextFile('/tmp/tt-b-lifecycle-validation/identity-fixtures.json')
    );
    const db = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const rpc = async (name: string, args: Record<string, unknown>) => await db.rpc(name, args);
    const uid = fixtures.unlinked_user;
    const user = await db.auth.admin.getUserById(uid);
    assertEquals(user.error, null);
    assertExists(user.data.user);
    assertEquals(
      user.data.user.identities?.some((i) => i.provider === 'discord'),
      false
    );
    const sql = async (query: string) => {
      const cmd = new Deno.Command('docker', {
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
      const writer = cmd.stdin.getWriter();
      await writer.write(new TextEncoder().encode(query));
      await writer.close();
      const result = await cmd.output();
      assertEquals(result.code, 0);
      return new TextDecoder().decode(result.stdout).trim();
    };
    let unavailable = true,
      calls = 0;
    const mock: typeof fetch = () => {
      calls++;
      return Promise.resolve(
        unavailable
          ? Response.json({ message: 'unavailable' }, { status: 503 })
          : Response.json({ code: 10007 }, { status: 404 })
      );
    };
    const runner = {
      stripeTestKey: 'sk_test_synthetic',
      discordToken: 'synthetic',
      guildId: 'synthetic',
      roles: { linked: 'linked', supporter: 'supporter', tiers: { scav: 'scav' } },
    };
    await runStagingProviderBatch(rpc, 'discord_cleanup', runner, mock, 25);
    assertEquals(
      await sql(
        `SELECT count(*)>0 FROM private.lifecycle_work WHERE user_id='${uid}' AND kind='discord_cleanup' AND state='retryable'`
      ),
      't'
    );
    unavailable = false;
    await sql(
      `UPDATE private.lifecycle_work SET available_at=clock_timestamp() WHERE user_id='${uid}' AND state='retryable'`
    );
    await runStagingProviderBatch(rpc, 'discord_cleanup', runner, mock, 25);
    assertEquals(
      await sql(
        `SELECT count(*) FROM private.lifecycle_work WHERE user_id='${uid}' AND kind='discord_cleanup' AND state<>'completed'`
      ),
      '0'
    );
    const previous = calls;
    await runStagingProviderBatch(rpc, 'discord_cleanup', runner, mock, 25);
    assertEquals(calls, previous);
    assertEquals((await db.auth.admin.getUserById(uid)).error, null);
  },
});
