BEGIN;

SELECT plan(16);

CREATE TEMP TABLE team_disband_fixture AS
SELECT
  '00000000-0000-0000-0000-000000000731'::UUID AS owner_id,
  '00000000-0000-0000-0000-000000000732'::UUID AS member_id,
  '00000000-0000-0000-0000-000000000733'::UUID AS outsider_id,
  '00000000-0000-0000-0000-000000000734'::UUID AS team_id,
  '00000000-0000-0000-0000-000000000735'::UUID AS second_team_id;

CREATE TEMP TABLE team_disband_privilege_fixture AS
SELECT
  'public.disband_team(uuid,uuid)'::TEXT AS function_signature,
  'EXECUTE'::TEXT AS privilege;

INSERT INTO auth.users (id, email)
VALUES
  ((SELECT owner_id FROM team_disband_fixture), 'team-disband-owner@example.invalid'),
  ((SELECT member_id FROM team_disband_fixture), 'team-disband-member@example.invalid'),
  ((SELECT outsider_id FROM team_disband_fixture), 'team-disband-outsider@example.invalid');

SELECT ok(
  NOT has_function_privilege(
    'anon',
    (SELECT function_signature FROM team_disband_privilege_fixture),
    (SELECT privilege FROM team_disband_privilege_fixture)
  ),
  'anonymous callers cannot disband teams'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    (SELECT function_signature FROM team_disband_privilege_fixture),
    (SELECT privilege FROM team_disband_privilege_fixture)
  ),
  'authenticated callers cannot disband teams directly'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    (SELECT function_signature FROM team_disband_privilege_fixture),
    (SELECT privilege FROM team_disband_privilege_fixture)
  ),
  'the service role can disband teams'
);

INSERT INTO public.teams (id, name, join_code, max_members, owner_id, game_mode)
VALUES (
  (SELECT team_id FROM team_disband_fixture),
  'Disband test team',
  'disband-test-code',
  5,
  (SELECT owner_id FROM team_disband_fixture),
  'pvp'
);

INSERT INTO public.team_memberships (team_id, user_id, role, game_mode)
VALUES
  ((SELECT team_id FROM team_disband_fixture), (SELECT owner_id FROM team_disband_fixture), 'owner', 'pvp'),
  ((SELECT team_id FROM team_disband_fixture), (SELECT member_id FROM team_disband_fixture), 'member', 'pvp');

SELECT is(
  (SELECT pvp_team_id FROM public.user_system WHERE user_id = (SELECT owner_id FROM team_disband_fixture)),
  (SELECT team_id FROM team_disband_fixture),
  'the owner team reference exists before disbanding'
);
SELECT is(
  (SELECT pvp_team_id FROM public.user_system WHERE user_id = (SELECT member_id FROM team_disband_fixture)),
  (SELECT team_id FROM team_disband_fixture),
  'the member team reference exists before disbanding'
);

INSERT INTO public.team_events (team_id, event_type, initiated_by)
VALUES ((SELECT team_id FROM team_disband_fixture), 'team_created', (SELECT owner_id FROM team_disband_fixture));

SELECT is(
  public.disband_team(
    (SELECT team_id FROM team_disband_fixture),
    (SELECT owner_id FROM team_disband_fixture)
  ),
  TRUE,
  'the owner can disband the team'
);
SELECT is(
  (SELECT COUNT(*)::INTEGER FROM public.teams WHERE id = (SELECT team_id FROM team_disband_fixture)),
  0,
  'disbanding removes the team'
);
SELECT is(
  (SELECT COUNT(*)::INTEGER FROM public.team_memberships WHERE team_id = (SELECT team_id FROM team_disband_fixture)),
  0,
  'disbanding removes every membership'
);
SELECT is(
  (SELECT COUNT(*)::INTEGER FROM public.team_events WHERE team_id = (SELECT team_id FROM team_disband_fixture)),
  0,
  'disbanding removes team events with the team'
);
SELECT is(
  (SELECT pvp_team_id FROM public.user_system WHERE user_id = (SELECT owner_id FROM team_disband_fixture)),
  NULL::UUID,
  'disbanding clears the owner team reference'
);
SELECT is(
  (SELECT pvp_team_id FROM public.user_system WHERE user_id = (SELECT member_id FROM team_disband_fixture)),
  NULL::UUID,
  'disbanding clears every member team reference'
);

INSERT INTO public.teams (id, name, join_code, max_members, owner_id, game_mode)
VALUES (
  (SELECT second_team_id FROM team_disband_fixture),
  'Disband authorization test team',
  'disband-auth-test-code',
  5,
  (SELECT owner_id FROM team_disband_fixture),
  'pvp'
);

SELECT throws_ok(
  $$SELECT public.disband_team(
    '00000000-0000-0000-0000-000000000735'::UUID,
    '00000000-0000-0000-0000-000000000733'::UUID
  )$$,
  'Only team owners can disband this team',
  'a non-owner cannot disband a team'
);
SELECT is(
  (SELECT COUNT(*)::INTEGER FROM public.teams WHERE id = (SELECT second_team_id FROM team_disband_fixture)),
  1,
  'a rejected disband leaves the team intact'
);
SELECT throws_ok(
  $$SELECT public.disband_team(
    '00000000-0000-0000-0000-000000000736'::UUID,
    '00000000-0000-0000-0000-000000000731'::UUID
  )$$,
  'Team not found',
  'disbanding an unknown team returns a not found error'
);
SELECT is(
  public.disband_team(
    (SELECT second_team_id FROM team_disband_fixture),
    (SELECT owner_id FROM team_disband_fixture)
  ),
  TRUE,
  'the owner can disband a team after a rejected attempt'
);
SELECT is(
  (SELECT COUNT(*)::INTEGER FROM public.teams WHERE id = (SELECT second_team_id FROM team_disband_fixture)),
  0,
  'the authorized disband removes the second team'
);

SELECT * FROM finish();

ROLLBACK;
