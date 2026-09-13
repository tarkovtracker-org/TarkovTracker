/** Opt-in real Stripe TEST MODE, real local Auth/Edge/DB; controlled response-loss faults. */
import { assertEquals } from 'jsr:@std/assert@1';
import { createClient } from '@supabase/supabase-js';
import { runStagingProviderBatch } from './staging-provider-runner.ts';
const enabled = Deno.env.get('TT_B_REAL_STRIPE_TEST') === '1';
for (const fault of ['response_loss', 'completion_loss'])
  Deno.test({
    name: `REAL Stripe ${fault}, withdrawal, confirmed end, and local Auth completion`,
    ignore: !enabled,
    fn: async () => {
      const config = JSON.parse(await Deno.readTextFile('/tmp/tt-b-status.json'));
      assertEquals(config.API_URL, 'http://127.0.0.1:59321');
      assertEquals(config.DB_URL, 'postgresql://postgres:postgres@127.0.0.1:59322/postgres');
      const inspected = await new Deno.Command('docker', {
        args: [
          'inspect',
          'supabase_db_tt-b-http-disposable',
          '--format',
          '{{json .Config.Labels}}',
        ],
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
      const stripe = async (method: string, path: string, params: Record<string, string> = {}) => {
        const args = [method, path, '--stripe-version', '2024-06-20'];
        if (method !== 'get') args.push('--confirm');
        for (const [key, value] of Object.entries(params)) args.push('-d', `${key}=${value}`);
        const output = await new Deno.Command('stripe', {
          args,
          stdout: 'piped',
          stderr: 'piped',
        }).output();
        assertEquals(output.code, 0, 'Stripe fixture request failed (payload omitted)');
        const result = JSON.parse(new TextDecoder().decode(output.stdout));
        assertEquals(Boolean(result.error), false, 'Stripe rejected fixture (payload omitted)');
        if ('livemode' in result) assertEquals(result.livemode, false);
        return result;
      };
      const clock = await stripe('post', '/v1/test_helpers/test_clocks', {
        frozen_time: String(Math.floor(Date.now() / 1000)),
        name: 'Package B provider E2E synthetic',
      });
      const customerObject = await stripe('post', '/v1/customers', {
        test_clock: clock.id,
        source: 'tok_visa',
        description: 'Package B provider E2E synthetic',
      });
      const product = await stripe('post', '/v1/products', {
        name: 'Package B E2E synthetic plan',
      });
      const sub = await stripe('post', '/v1/subscriptions', {
        customer: customerObject.id,
        'items[0][price_data][product]': product.id,
        'items[0][price_data][currency]': 'usd',
        'items[0][price_data][unit_amount]': '100',
        'items[0][price_data][recurring][interval]': 'month',
      });
      assertEquals(sub.status, 'active');
      const customer = customerObject.id,
        subscription = sub.id;
      const insert = await db.from('supporters').insert({
        user_id: uid,
        type: 'subscription',
        status: 'active',
        tier: 'scav',
        stripe_customer_id: customer,
        stripe_subscription_id: subscription,
        has_ever_supported: true,
      });
      assertEquals(insert.error, null);
      let completionLost = fault === 'completion_loss';
      const rpc = async (name: string, args: Record<string, unknown>) => {
        if (name === 'finish_lifecycle_work' && completionLost)
          throw new Error('controlled completion transport loss');
        return await db.rpc(name, args);
      };
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
      let cancellations = 0,
        lost = fault === 'response_loss';
      const providerFetch: typeof fetch = async (input, init) => {
        const url = String(input);
        assertEquals(url.startsWith('https://api.stripe.com/v1/'), true);
        if (init?.method === 'POST') {
          assertEquals(url, `https://api.stripe.com/v1/subscriptions/${subscription}`);
          assertEquals(init.body, 'cancel_at_period_end=true');
          cancellations++;
        }
        const response = await fetch(input, init);
        if (init?.method === 'POST' && lost && response.ok) {
          lost = false;
          await response.arrayBuffer();
          throw new TypeError('Controlled loss after real test-mode Stripe accepted cancellation');
        }
        return response;
      };
      const runnerConfig = {
        stripeTestKey: Deno.env.get('STRIPE_SECRET_KEY') || '',
        discordToken: 'synthetic',
        guildId: 'synthetic',
        roles: { linked: 'linked', supporter: 'supporter', tiers: { scav: 'scav' } },
      };
      const due = () =>
        sql(
          `UPDATE private.lifecycle_work SET available_at='1970-01-01' WHERE user_id='${uid}' AND state IN ('waiting','retryable'); UPDATE public.account_deletion_jobs SET next_run_at=clock_timestamp() WHERE user_id='${uid}' AND status='pending'; UPDATE public.account_deletion_attempts SET attempted_at=clock_timestamp()-interval '2 days' WHERE user_id='${uid}';`
        );
      const runSelectedTasks = async () => {
        const rows = JSON.parse(
          await sql(
            `SELECT coalesce(json_agg(id),'[]') FROM private.lifecycle_work WHERE user_id='${uid}' AND kind='stripe_cleanup' AND (state IN ('received','retryable','waiting') OR (state='processing' AND lease_until<clock_timestamp())) AND (dedupe_key NOT LIKE 'deletion:%' OR generation=(SELECT generation FROM private.lifecycle_requests WHERE user_id='${uid}'))`
          )
        );
        for (const id of rows) {
          await sql(
            `UPDATE private.lifecycle_work SET available_at=(SELECT min(available_at)-interval '1 second' FROM private.lifecycle_work) WHERE id='${id}'`
          );
          const selectedRpc = async (name: string, args: Record<string, unknown>) => {
            const result = await rpc(name, args);
            if (name === 'claim_lifecycle_work')
              assertEquals(
                result.data?.[0]?.id,
                id,
                'Only selected synthetic task may call provider'
              );
            return result;
          };
          await runStagingProviderBatch(
            selectedRpc,
            'stripe_cleanup',
            runnerConfig,
            providerFetch,
            1
          );
        }
      };
      assertEquals((await edge('account-delete')).status, 202);
      assertEquals(
        (await db.rpc('account_lifecycle_status', { p_user_id: uid })).data.state,
        'provider_wait'
      );
      if (fault === 'completion_loss') {
        let stopped = false;
        try {
          await runSelectedTasks();
        } catch {
          stopped = true;
        }
        assertEquals(stopped, true);
        assertEquals(
          await sql(
            `SELECT count(*)>0 FROM private.lifecycle_work WHERE user_id='${uid}' AND kind='stripe_cleanup' AND state='processing'`
          ),
          't'
        );
        assertEquals(
          (await stripe('get', '/v1/subscriptions/' + subscription)).cancel_at_period_end,
          true
        );
        completionLost = false;
        await sql(
          `UPDATE private.lifecycle_work SET lease_until=clock_timestamp()-interval '1 second' WHERE user_id='${uid}' AND state='processing'`
        );
      }
      await runSelectedTasks();
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
      assertEquals(
        (await stripe('get', '/v1/subscriptions/' + subscription)).cancel_at_period_end,
        true
      );
      await due();
      assertEquals((await edge('account-delete')).status, 202);
      await due();
      await runSelectedTasks();
      assertEquals(cancellations, 1);
      assertEquals((await db.auth.admin.getUserById(uid)).error, null);
      const current = await stripe('get', '/v1/subscriptions/' + subscription);
      await stripe('post', `/v1/test_helpers/test_clocks/${clock.id}/advance`, {
        frozen_time: String(current.current_period_end + 1),
      });
      for (let n = 0; n < 40; n++) {
        if ((await stripe('get', '/v1/subscriptions/' + subscription)).status === 'canceled') break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      assertEquals((await stripe('get', '/v1/subscriptions/' + subscription)).status, 'canceled');
      await due();
      await runSelectedTasks();
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
    },
  });
