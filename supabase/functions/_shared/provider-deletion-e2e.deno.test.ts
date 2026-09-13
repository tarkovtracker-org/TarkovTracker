/** Real Auth/Edge/DB lifecycle with explicitly mocked external provider transports. */
import { assertEquals } from 'jsr:@std/assert@1';
import { createClient } from '@supabase/supabase-js';
import { runStagingProviderBatch } from './staging-provider-runner.ts';
const enabled = Deno.env.get('TT_B_LOCAL_AUTH_TEST') === '1';
Deno.test({
  name: 'Approved period-end deletion, withdrawal, lost response, Discord retry, and Auth completion',
  ignore: !enabled,
  fn: async () => {
    const config = JSON.parse(await Deno.readTextFile('/tmp/tt-b-status.json'));
    assertEquals(config.API_URL, 'http://127.0.0.1:59321');
    assertEquals(config.DB_URL, 'postgresql://postgres:postgres@127.0.0.1:59322/postgres');
    const inspected = await new Deno.Command('docker', {
      args: ['inspect', 'supabase_db_tt-b-http-disposable', '--format', '{{json .Config.Labels}}'],
      stdout: 'piped',
    }).output();
    assertEquals(
      JSON.parse(new TextDecoder().decode(inspected.stdout))['com.supabase.cli.project'],
      'tt-b-http-disposable'
    );
    const db = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userClient = createClient(config.API_URL, config.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const email = `synthetic-${crypto.randomUUID()}@example.invalid`,
      password = 'Synthetic-Test-Auth-123!';
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
    assertEquals(created.error, null);
    const uid = created.data.user!.id;
    const session = await userClient.auth.signInWithPassword({ email, password });
    assertEquals(session.error, null);
    const token = session.data.session!.access_token;
    const suffix = uid.replaceAll('-', '');
    const customer = 'cus_' + suffix,
      subscription = 'sub_' + suffix;
    const insert = await db.from('supporters').insert({
      user_id: uid,
      type: 'subscription',
      status: 'active',
      tier: 'scav',
      stripe_customer_id: customer,
      stripe_subscription_id: subscription,
      discord_user_id: '777' + suffix.slice(0, 12),
      has_ever_supported: true,
    });
    assertEquals(insert.error, null);
    const rpc = async (name: string, args: Record<string, unknown>) => await db.rpc(name, args);
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
      const writer = process.stdin.getWriter();
      await writer.write(new TextEncoder().encode(query));
      await writer.close();
      const output = await process.output();
      assertEquals(output.code, 0);
      return new TextDecoder().decode(output.stdout).trim();
    };
    const edge = async (name: string, body: unknown = {}) => {
      const response = await fetch(config.API_URL + '/functions/v1/' + name, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          apikey: config.ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    let providerStatus = 'active',
      scheduled = false,
      cancellations = 0,
      lost = true,
      discordDown = true,
      discordDeletes = 0;
    const providerFetch: typeof fetch = (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === 'discord.com') {
        assertEquals(init?.method, 'DELETE');
        discordDeletes++;
        return Promise.resolve(
          discordDown
            ? Response.json({ message: 'synthetic outage' }, { status: 503 })
            : new Response(null, { status: 204 })
        );
      }
      assertEquals(url.hostname, 'api.stripe.com');
      if (url.pathname.endsWith('/invoices') || url.pathname.endsWith('/charges'))
        return Promise.resolve(Response.json({ data: [], has_more: false }));
      if (url.pathname.endsWith('/subscriptions'))
        return Promise.resolve(Response.json({ data: [{ id: subscription }], has_more: false }));
      assertEquals(url.pathname, '/v1/subscriptions/' + subscription);
      if (init?.method === 'POST') {
        assertEquals(init.body, 'cancel_at_period_end=true');
        scheduled = true;
        cancellations++;
        if (lost) {
          lost = false;
          return Promise.reject(new TypeError('synthetic response lost after provider commit'));
        }
      }
      return Promise.resolve(
        Response.json({
          id: subscription,
          customer,
          status: providerStatus,
          cancel_at_period_end: scheduled,
        })
      );
    };
    const runnerConfig = {
      stripeTestKey: 'sk_test_synthetic',
      discordToken: 'synthetic',
      guildId: 'synthetic',
      roles: { linked: 'linked', supporter: 'supporter', tiers: { scav: 'scav' } },
    };
    const due = () =>
      sql(
        `UPDATE private.lifecycle_work SET available_at=clock_timestamp() WHERE user_id='${uid}' AND state IN ('waiting','retryable'); UPDATE public.account_deletion_jobs SET next_run_at=clock_timestamp() WHERE user_id='${uid}' AND status='pending'; UPDATE public.account_deletion_attempts SET attempted_at=clock_timestamp()-interval '2 days' WHERE user_id='${uid}';`
      );
    assertEquals((await edge('account-delete')).status, 202);
    assertEquals(
      (await db.rpc('account_lifecycle_status', { p_user_id: uid })).data.state,
      'provider_wait'
    );
    await runStagingProviderBatch(rpc, 'stripe_cleanup', runnerConfig, providerFetch, 25);
    assertEquals(cancellations, 1);
    assertEquals((await db.auth.admin.getUserById(uid)).error, null);
    assertEquals(
      (await db.rpc('account_lifecycle_status', { p_user_id: uid })).data.can_cancel,
      true
    );
    assertEquals((await edge('account-deletion-state', { action: 'cancel' })).status, 200);
    assertEquals(
      (await db.rpc('account_lifecycle_status', { p_user_id: uid })).data.state,
      'cancelled'
    );
    assertEquals(scheduled, true);
    await due();
    assertEquals((await edge('account-delete')).status, 202);
    await due();
    await runStagingProviderBatch(rpc, 'stripe_cleanup', runnerConfig, providerFetch, 25);
    assertEquals(cancellations, 1);
    assertEquals((await db.auth.admin.getUserById(uid)).error, null);
    providerStatus = 'canceled';
    await due();
    await runStagingProviderBatch(rpc, 'stripe_cleanup', runnerConfig, providerFetch, 25);
    await due();
    assertEquals((await edge('account-delete')).status, 202);
    assertEquals(
      (await db.rpc('account_lifecycle_status', { p_user_id: uid })).data.state,
      'prepared'
    );
    await runStagingProviderBatch(rpc, 'discord_cleanup', runnerConfig, providerFetch, 25);
    assertEquals((await db.auth.admin.getUserById(uid)).error, null);
    assertEquals(
      (await db.rpc('account_lifecycle_status', { p_user_id: uid })).data.can_cancel,
      false
    );
    discordDown = false;
    await due();
    await runStagingProviderBatch(rpc, 'discord_cleanup', runnerConfig, providerFetch, 25);
    await due();
    const completed = await edge('account-delete');
    assertEquals(completed.status, 200);
    assertEquals(completed.body.success, true);
    assertEquals((await db.auth.admin.getUserById(uid)).error?.status, 404);
    assertEquals(
      (await db.rpc('account_lifecycle_status', { p_user_id: uid })).data.state,
      'completed'
    );
    assertEquals(cancellations, 1);
    assertEquals(discordDeletes > 0, true);
  },
});
