BEGIN;

SELECT plan(17);

CREATE TEMP TABLE prestige_progress_fixture AS
SELECT
  '00000000-0000-0000-0000-000000000771'::UUID AS user_id,
  private.active_season_number() AS active_season,
  TIMESTAMPTZ '2026-08-03 12:00:00+00' AS archived_at,
  jsonb_build_object(
    'pvp', jsonb_build_object(
      'displayName', 'Prestige PvP',
      'level', 79,
      'prestigeLevel', 2,
      'progressEpoch', 2
    ),
    'pve', jsonb_build_object(
      'displayName', 'Preserved PvE',
      'level', 52,
      'prestigeLevel', 0,
      'progressEpoch', 0
    ),
    'seasonal', jsonb_build_object(
      'displayName', 'Preserved Seasonal',
      'level', 31,
      'prestigeLevel', 0,
      'progressEpoch', 0
    )
  ) AS initial_modes,
  jsonb_build_object(
    'displayName', 'Reset PvP',
    'level', 1,
    'prestigeLevel', 3,
    'progressEpoch', 3
  ) AS reset_pvp,
  jsonb_build_object(
    'displayName', 'Rolled back PvE',
    'level', 60,
    'prestigeLevel', 0,
    'progressEpoch', 0
  ) AS changed_pve;

INSERT INTO auth.users (id, email)
VALUES ((SELECT user_id FROM prestige_progress_fixture), 'prestige-progress@example.invalid');

GRANT SELECT ON prestige_progress_fixture TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT user_id::TEXT FROM prestige_progress_fixture),
  TRUE
);
SELECT lives_ok(
  $$SELECT public.sync_user_game_mode_progress(
    'pvp'::TEXT,
    3::INTEGER,
    771771::BIGINT,
    (SELECT initial_modes FROM prestige_progress_fixture),
    (SELECT active_season FROM prestige_progress_fixture)
  )$$,
  'the prestige fixture starts with all three modes materialized'
);
RESET ROLE;

CREATE TEMP TABLE prestige_preserved_snapshot AS
SELECT
  (
    SELECT pve_data
    FROM public.user_progress
    WHERE user_id = fixture.user_id
  ) AS legacy_pve,
  (
    SELECT progress_data
    FROM public.user_game_mode_progress
    WHERE user_id = fixture.user_id
      AND game_mode = 'pve'
      AND season_number = 0
  ) AS mode_pve,
  (
    SELECT progress_data
    FROM public.user_game_mode_progress
    WHERE user_id = fixture.user_id
      AND game_mode = 'seasonal'
      AND season_number = fixture.active_season
  ) AS mode_seasonal
FROM prestige_progress_fixture AS fixture;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT user_id::TEXT FROM prestige_progress_fixture),
  TRUE
);
SELECT lives_ok(
  $$SELECT public.archive_prestige_run_and_reset_progress(
    'pvp'::TEXT,
    2::INTEGER,
    3::INTEGER,
    (SELECT initial_modes->'pvp' FROM prestige_progress_fixture),
    '{"reason":"prestige"}'::JSONB,
    (SELECT archived_at FROM prestige_progress_fixture),
    'pvp'::TEXT,
    4::INTEGER,
    773773::BIGINT,
    (SELECT reset_pvp FROM prestige_progress_fixture),
    (SELECT initial_modes->'pve' FROM prestige_progress_fixture)
  )$$,
  'the current 11-argument PvP prestige RPC succeeds'
);
RESET ROLE;

SELECT results_eq(
  $$SELECT mode, prestige_from, prestige_to, archived_progress, summary, created_at
    FROM public.user_prestige_runs
    WHERE user_id = (SELECT user_id FROM prestige_progress_fixture)$$,
  $$SELECT
      'pvp'::TEXT,
      2::INTEGER,
      3::INTEGER,
      public.sanitize_user_progress_mode_data(initial_modes->'pvp'),
      '{"reason":"prestige"}'::JSONB,
      archived_at
    FROM prestige_progress_fixture$$,
  'PvP prestige archives the completed run'
);
SELECT is(
  (SELECT pvp_data FROM public.user_progress
   WHERE user_id = (SELECT user_id FROM prestige_progress_fixture)),
  (SELECT public.sanitize_user_progress_mode_data(reset_pvp) FROM prestige_progress_fixture),
  'PvP prestige resets the legacy PvP mirror'
);
SELECT is(
  (
    SELECT progress_data
    FROM public.user_game_mode_progress
    WHERE user_id = (SELECT user_id FROM prestige_progress_fixture)
      AND game_mode = 'pvp'
      AND season_number = 0
  ),
  (SELECT public.sanitize_user_progress_mode_data(reset_pvp) FROM prestige_progress_fixture),
  'PvP prestige resets normalized PvP progress'
);
SELECT is(
  (SELECT pve_data FROM public.user_progress
   WHERE user_id = (SELECT user_id FROM prestige_progress_fixture)),
  (SELECT legacy_pve FROM prestige_preserved_snapshot),
  'PvP prestige preserves the legacy PvE mirror'
);
SELECT is(
  (
    SELECT progress_data
    FROM public.user_game_mode_progress
    WHERE user_id = (SELECT user_id FROM prestige_progress_fixture)
      AND game_mode = 'pve'
      AND season_number = 0
  ),
  (SELECT mode_pve FROM prestige_preserved_snapshot),
  'PvP prestige preserves normalized PvE progress'
);
SELECT is(
  (
    SELECT progress_data
    FROM public.user_game_mode_progress
    WHERE user_id = (SELECT user_id FROM prestige_progress_fixture)
      AND game_mode = 'seasonal'
      AND season_number = (SELECT active_season FROM prestige_progress_fixture)
  ),
  (SELECT mode_seasonal FROM prestige_preserved_snapshot),
  'PvP prestige preserves active Seasonal progress'
);
SELECT is(
  (
    SELECT jsonb_build_object(
      'currentGameMode', current_game_mode,
      'gameEdition', game_edition,
      'tarkovUid', tarkov_uid
    )
    FROM public.user_progress
    WHERE user_id = (SELECT user_id FROM prestige_progress_fixture)
  ),
  '{"currentGameMode":"pvp","gameEdition":4,"tarkovUid":773773}'::JSONB,
  'PvP prestige applies the replacement account metadata'
);

CREATE TEMP TABLE prestige_progress_snapshot AS
SELECT
  (
    SELECT to_jsonb(progress)
    FROM public.user_progress AS progress
    WHERE progress.user_id = fixture.user_id
  ) AS legacy_row,
  (
    SELECT jsonb_agg(to_jsonb(progress) ORDER BY progress.game_mode, progress.season_number)
    FROM public.user_game_mode_progress AS progress
    WHERE progress.user_id = fixture.user_id
  ) AS mode_rows,
  (
    SELECT jsonb_agg(to_jsonb(run) ORDER BY run.created_at, run.id)
    FROM public.user_prestige_runs AS run
    WHERE run.user_id = fixture.user_id
  ) AS prestige_rows
FROM prestige_progress_fixture AS fixture;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT user_id::TEXT FROM prestige_progress_fixture),
  TRUE
);
SELECT throws_ok(
  $$SELECT public.archive_prestige_run_and_reset_progress(
    'pvp'::TEXT,
    3::INTEGER,
    4::INTEGER,
    (SELECT reset_pvp FROM prestige_progress_fixture),
    '{"reason":"must roll back"}'::JSONB,
    TIMESTAMPTZ '2026-08-04 12:00:00+00',
    'pve'::TEXT,
    9::INTEGER,
    999999::BIGINT,
    '"not-an-object"'::JSONB,
    (SELECT changed_pve FROM prestige_progress_fixture)
  )$$,
  'Progress for pvp must be a JSON object',
  'invalid nested sync progress aborts the prestige RPC'
);
RESET ROLE;

SELECT is(
  (
    SELECT jsonb_agg(to_jsonb(run) ORDER BY run.created_at, run.id)
    FROM public.user_prestige_runs AS run
    WHERE run.user_id = (SELECT user_id FROM prestige_progress_fixture)
  ),
  (SELECT prestige_rows FROM prestige_progress_snapshot),
  'a nested sync failure rolls back the new prestige archive'
);
SELECT is(
  (
    SELECT to_jsonb(progress)
    FROM public.user_progress AS progress
    WHERE progress.user_id = (SELECT user_id FROM prestige_progress_fixture)
  ),
  (SELECT legacy_row FROM prestige_progress_snapshot),
  'a nested sync failure rolls back legacy progress and metadata'
);
SELECT is(
  (
    SELECT jsonb_agg(to_jsonb(progress) ORDER BY progress.game_mode, progress.season_number)
    FROM public.user_game_mode_progress AS progress
    WHERE progress.user_id = (SELECT user_id FROM prestige_progress_fixture)
  ),
  (SELECT mode_rows FROM prestige_progress_snapshot),
  'a nested sync failure rolls back every normalized progress change'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT user_id::TEXT FROM prestige_progress_fixture),
  TRUE
);
SELECT throws_ok(
  $$SELECT public.archive_prestige_run_and_reset_progress(
    'seasonal'::TEXT,
    0::INTEGER,
    1::INTEGER,
    (SELECT initial_modes->'seasonal' FROM prestige_progress_fixture),
    '{"reason":"unsupported"}'::JSONB,
    TIMESTAMPTZ '2026-08-05 12:00:00+00',
    'seasonal'::TEXT,
    4::INTEGER,
    773773::BIGINT,
    (SELECT reset_pvp FROM prestige_progress_fixture),
    (SELECT initial_modes->'pve' FROM prestige_progress_fixture)
  )$$,
  'Prestige is not supported for seasonal',
  'Seasonal prestige is rejected'
);
RESET ROLE;

SELECT is(
  (
    SELECT jsonb_agg(to_jsonb(run) ORDER BY run.created_at, run.id)
    FROM public.user_prestige_runs AS run
    WHERE run.user_id = (SELECT user_id FROM prestige_progress_fixture)
  ),
  (SELECT prestige_rows FROM prestige_progress_snapshot),
  'rejected Seasonal prestige does not create an archive'
);
SELECT is(
  (
    SELECT to_jsonb(progress)
    FROM public.user_progress AS progress
    WHERE progress.user_id = (SELECT user_id FROM prestige_progress_fixture)
  ),
  (SELECT legacy_row FROM prestige_progress_snapshot),
  'rejected Seasonal prestige leaves legacy progress unchanged'
);
SELECT is(
  (
    SELECT jsonb_agg(to_jsonb(progress) ORDER BY progress.game_mode, progress.season_number)
    FROM public.user_game_mode_progress AS progress
    WHERE progress.user_id = (SELECT user_id FROM prestige_progress_fixture)
  ),
  (SELECT mode_rows FROM prestige_progress_snapshot),
  'rejected Seasonal prestige leaves normalized progress unchanged'
);

SELECT * FROM finish();

ROLLBACK;
