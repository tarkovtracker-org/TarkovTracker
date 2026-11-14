import { assertEquals } from 'jsr:@std/assert@1.0.19';
import {
  hasDeletionConfirmation,
  readDeletionAuthorization,
} from './account-deletion-authorization.ts';
const now = 1_800_000_000;
const issuer = 'https://supabase.invalid/auth/v1';
const validClaims = () => ({
  sub: '00000000-0000-0000-0000-000000009501',
  session_id: '00000000-0000-0000-0000-000000009502',
  role: 'authenticated',
  aud: 'authenticated',
  iss: issuer,
  is_anonymous: false,
  amr: [{ method: 'oauth', timestamp: now - 60 }],
  iat: now,
});
Deno.test('fresh OAuth proof binds the verified subject and session', () => {
  const claims = validClaims();
  assertEquals(readDeletionAuthorization(claims, issuer, now), {
    userId: claims.sub,
    sessionId: claims.session_id,
    authenticatedAt: new Date((now - 60) * 1000).toISOString(),
  });
  assertEquals(
    readDeletionAuthorization({ ...claims, aud: ['authenticated'] }, issuer, now)?.userId,
    claims.sub
  );
});
Deno.test('refreshes and malformed or stale authentication cannot authorize deletion', () => {
  for (const change of [
    { amr: [{ method: 'oauth', timestamp: now - 301 }], iat: now },
    { amr: [{ method: 'token_refresh', timestamp: now }] },
    { amr: [] },
    { amr: null },
    { amr: [null] },
    { amr: [{ method: 'oauth', timestamp: String(now) }] },
    { amr: [{ method: 'oauth', timestamp: now + 31 }] },
    { amr: [{ method: 'oauth', timestamp: now + 0.5 }] },
    { sub: 'not-a-user' },
    { session_id: null },
    { iss: 'https://foreign.invalid/auth/v1' },
    { role: 'service_role' },
    { aud: 'anon' },
    { is_anonymous: true },
  ])
    assertEquals(readDeletionAuthorization({ ...validClaims(), ...change }, issuer, now), null);
});
Deno.test('deletion requires an explicit action and rejects alternate JSON representations', () => {
  assertEquals(hasDeletionConfirmation({ action: 'delete_account' }), true);
  for (const body of [
    null,
    [],
    'delete_account',
    {},
    { action: ['delete_account'] },
    { action: 'deleteAccount' },
  ]) {
    assertEquals(hasDeletionConfirmation(body), false);
  }
});
