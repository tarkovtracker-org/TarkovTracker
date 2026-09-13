/** Synthetic transport barrier. Invoked only by identity-unlink-http.py. */
import { assertEquals } from 'jsr:@std/assert@1';
import { discordRoleCleanup } from '../../../supabase/functions/_shared/discord-lifecycle.ts';
const identity = Deno.args[0];
if (!/^\d{1,18}$/.test(identity)) throw new Error('Synthetic identity required');
let calls = 0;
const mock: typeof fetch = async (url, options) => {
  assertEquals(
    String(url),
    `https://discord.com/api/v10/guilds/synthetic/members/${identity}/roles/linked`
  );
  assertEquals(options?.method, 'DELETE');
  calls++;
  if (calls === 1) {
    console.log('IN_FLIGHT');
    const data = new Uint8Array(8);
    await Deno.stdin.read(data);
  }
  return Response.json({ code: 10007 }, { status: 404 });
};
const cleanup = discordRoleCleanup(
  { guildId: 'synthetic', token: 'synthetic', managedRoleIds: ['linked'] },
  mock
);
await cleanup(identity);
await cleanup(identity);
assertEquals(calls, 2);
console.log('IDEMPOTENT_ABSENCE');
