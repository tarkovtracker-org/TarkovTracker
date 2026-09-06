BEGIN;

SELECT plan(6);

CREATE TEMP TABLE team_creation_atomicity_fixture AS
SELECT '00000000-0000-0000-0000-000000000781'::UUID AS owner_id;

INSERT INTO auth.users (id, email)
VALUES (
  (SELECT owner_id FROM team_creation_atomicity_fixture),
  'team-creation-atomicity@example.invalid'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.user_system
    WHERE user_id = (SELECT owner_id FROM team_creation_atomicity_fixture)
      AND pvp_team_id IS NULL
  ),
  'the owner begins with an empty PvP team pointer'
);

CREATE FUNCTION public.test_648_reject_redundant_pvp_team_pointer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.pvp_team_id IS NOT NULL
    AND NEW.pvp_team_id IS NOT DISTINCT FROM OLD.pvp_team_id THEN
    RAISE EXCEPTION 'test: rejected redundant PvP team pointer update';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.test_648_reject_redundant_pvp_team_pointer()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER zzz_test_648_reject_redundant_pvp_team_pointer
BEFORE UPDATE OF pvp_team_id ON public.user_system
FOR EACH ROW
EXECUTE FUNCTION public.test_648_reject_redundant_pvp_team_pointer();

GRANT SELECT ON team_creation_atomicity_fixture TO service_role;

SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$SELECT public.create_team_with_owner(
    'Atomic rollback test team',
    'atomic-rollback-test-code',
    5,
    (SELECT owner_id FROM team_creation_atomicity_fixture),
    'pvp'
  )$$,
  'test: rejected redundant PvP team pointer update',
  'a failure at the final redundant pointer update aborts the team creation RPC'
);
RESET ROLE;

SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM public.teams
    WHERE owner_id = (SELECT owner_id FROM team_creation_atomicity_fixture)
      AND name = 'Atomic rollback test team'
      AND game_mode = 'pvp'
  ),
  0,
  'the failed team creation rolls back the team row'
);
SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM public.team_memberships
    WHERE user_id = (SELECT owner_id FROM team_creation_atomicity_fixture)
      AND game_mode = 'pvp'
  ),
  0,
  'the failed team creation rolls back the owner membership'
);
SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM public.team_events
    WHERE initiated_by = (SELECT owner_id FROM team_creation_atomicity_fixture)
      AND event_type = 'team_created'
  ),
  0,
  'the failed team creation leaves no team audit event'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.user_system
    WHERE user_id = (SELECT owner_id FROM team_creation_atomicity_fixture)
      AND pvp_team_id IS NULL
  ),
  'the failed team creation restores the owner team pointer'
);

SELECT * FROM finish();

ROLLBACK;
