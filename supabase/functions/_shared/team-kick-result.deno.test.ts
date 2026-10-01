import { assertEquals } from 'jsr:@std/assert';
import { kickTeamResponse } from './team-kick-result.ts';
Deno.test('kicked maps to no failure', () => {
  assertEquals(kickTeamResponse('kicked'), null);
});
Deno.test('business failures keep the legacy status codes', () => {
  assertEquals(kickTeamResponse('not_found')?.status, 404);
  assertEquals(kickTeamResponse('not_member')?.status, 404);
  assertEquals(kickTeamResponse('not_owner')?.status, 403);
  assertEquals(kickTeamResponse('self')?.status, 400);
  assertEquals(kickTeamResponse('cooldown')?.status, 429);
});
Deno.test('unknown results fail closed with 500', () => {
  assertEquals(kickTeamResponse('unexpected')?.status, 500);
  assertEquals(kickTeamResponse(null)?.status, 500);
});
