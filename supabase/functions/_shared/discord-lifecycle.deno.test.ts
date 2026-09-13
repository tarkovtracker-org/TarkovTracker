import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1';
import { discordRoleCleanup } from './discord-lifecycle.ts';
import { ProviderFailure } from './provider-http.ts';
const config = {
  guildId: 'synthetic-guild',
  token: 'synthetic-token',
  managedRoleIds: ['linked', 'supporter', 'tier'],
};
Deno.test(
  'Discord cleanup removes only the configured application roles; repeats are idempotent',
  async () => {
    const paths: string[] = [];
    const remove = discordRoleCleanup(config, (input, init) => {
      paths.push(String(input));
      assertEquals(init?.method, 'DELETE');
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    await remove('synthetic-user');
    await remove('synthetic-user');
    assertEquals(paths.length, 6);
    assertEquals(paths.slice(0, 3), paths.slice(3));
    assertEquals(
      paths.map((path) => path.split('/').at(-1)),
      ['linked', 'supporter', 'tier', 'linked', 'supporter', 'tier']
    );
  }
);
for (const code of [10007, 10011]) {
  Deno.test(`Discord confirmed absence ${code} completes`, async () => {
    const remove = discordRoleCleanup(config, () =>
      Promise.resolve(Response.json({ code }, { status: 404 }))
    );
    await remove('synthetic-user');
  });
}
for (const status of [401, 403, 404]) {
  Deno.test(`Discord ${status} without confirmed absence is blocked`, async () => {
    const remove = discordRoleCleanup(config, () =>
      Promise.resolve(Response.json({ code: 10004 }, { status }))
    );
    const error = await assertRejects(() => remove('synthetic-user'), ProviderFailure);
    assertEquals(error.retryable, false);
  });
}
for (const status of [429, 500, 503]) {
  Deno.test(`Discord ${status} remains retryable`, async () => {
    const remove = discordRoleCleanup(config, () =>
      Promise.resolve(Response.json({ retry_after: 75 }, { status }))
    );
    const error = await assertRejects(() => remove('synthetic-user'), ProviderFailure);
    assertEquals(error.retryable, true);
    assertEquals(error.retryAfterSeconds, 75);
  });
}
Deno.test(
  'Discord transport failure retries after a partial removal without logging the payload',
  async () => {
    let calls = 0;
    const remove = discordRoleCleanup(config, () => {
      calls++;
      if (calls === 2) return Promise.reject(new Error('private provider response'));
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    const error = await assertRejects(() => remove('synthetic-user'), ProviderFailure);
    assertEquals(error.code, 'discord_transport');
    assertEquals(error.retryable, true);
    await remove('synthetic-user');
    assertEquals(calls, 5);
  }
);
Deno.test(
  'Discord missing historical identity or role configuration cannot silently complete',
  async () => {
    let calls = 0;
    const fetcher = () => {
      calls++;
      return Promise.resolve(new Response(null, { status: 204 }));
    };
    const remove = discordRoleCleanup(config, fetcher);
    const error = await assertRejects(() => remove(''), ProviderFailure);
    assertEquals(error.retryable, false);
    assertEquals(calls, 0);
    assertThrows(
      () => discordRoleCleanup({ ...config, managedRoleIds: [] }, fetcher),
      ProviderFailure
    );
  }
);
Deno.test('Non-JSON Discord permission failure remains blocked', async () => {
  const remove = discordRoleCleanup(config, () =>
    Promise.resolve(new Response('Denied', { status: 403 }))
  );
  const error = await assertRejects(() => remove('synthetic-user'), ProviderFailure);
  assertEquals(error.retryable, false);
});
