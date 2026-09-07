import { assertEquals } from 'jsr:@std/assert';
import { isMembershipConflict } from './team-create-error.ts';
Deno.test('recognizes the already-member race raised by create_team_with_owner', () => {
  assertEquals(
    isMembershipConflict({
      code: 'P0001',
      message: 'You are already a member of a team for this game mode',
    }),
    true
  );
});
Deno.test('recognizes membership constraint violations in either error field', () => {
  for (const field of ['message', 'details']) {
    assertEquals(
      isMembershipConflict({
        code: '23505',
        [field]: 'duplicate key violates team_memberships_user_mode_unique',
      }),
      true
    );
  }
});
Deno.test('does not classify other database failures as membership conflicts', () => {
  for (const error of [
    null,
    {},
    { code: 'P0001', message: 'Not authenticated' },
    { code: '23505', message: 'teams_name_key' },
    { code: 'XX000', message: 'team_memberships_user_mode_unique' },
    { code: 'XX000', message: 'You are already a member of a team for this game mode' },
  ]) {
    assertEquals(isMembershipConflict(error), false);
  }
});
