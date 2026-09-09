BEGIN;

SELECT plan(17);

CREATE TEMP TABLE seasonal_progress_fixture AS
SELECT
  '00000000-0000-0000-0000-000000000761'::UUID AS synced_user_id,
  '00000000-0000-0000-0000-000000000762'::UUID AS viewer_id,
  '00000000-0000-0000-0000-000000000763'::UUID AS outsider_id,
  '00000000-0000-0000-0000-000000000764'::UUID AS team_id,
  private.active_season_number() AS active_season,
  (private.active_season_number() + 1)::SMALLINT AS rollover_active_season,
  jsonb_build_object(
    'pvp', jsonb_build_object(
      'displayName', 'Synced PvP',
      'level', 11,
      'taskCompletions', jsonb_build_object('pvp-task', jsonb_build_object('complete', true))
    ),
    'pve', jsonb_build_object(
      'displayName', 'Synced PvE',
      'level', 22,
      'taskCompletions', jsonb_build_object('pve-task', jsonb_build_object('complete', true))
    ),
    'seasonal', jsonb_build_object(
      'displayName', 'Synced Seasonal',
      'level', 33,
      'taskCompletions', jsonb_build_object(
        'complete-task', jsonb_build_object('complete', true),
        'incomplete-task', jsonb_build_object('complete', false)
      )
    )
  ) AS initial_modes,
  jsonb_build_object(
    'pvp', jsonb_build_object('displayName', 'Stale input PvP', 'level', 44),
    'pve', jsonb_build_object('displayName', 'Stale input PvE', 'level', 55),
    'seasonal', jsonb_build_object('displayName', 'Stale Seasonal', 'level', 66)
  ) AS stale_modes,
  jsonb_build_object(
    'pvp', jsonb_build_object('displayName', 'Omitted season PvP', 'level', 45),
    'pve', jsonb_build_object('displayName', 'Omitted season PvE', 'level', 56),
    'seasonal', jsonb_build_object('displayName', 'Unstamped Seasonal', 'level', 67)
  ) AS omitted_season_modes;

INSERT INTO auth.users (id, email)
VALUES
  ((SELECT synced_user_id FROM seasonal_progress_fixture), 'seasonal-synced@example.invalid'),
  ((SELECT viewer_id FROM seasonal_progress_fixture), 'seasonal-viewer@example.invalid'),
  ((SELECT outsider_id FROM seasonal_progress_fixture), 'seasonal-outsider@example.invalid');

INSERT INTO public.teams (id, name, join_code, max_members, owner_id, game_mode)
VALUES (
  (SELECT team_id FROM seasonal_progress_fixture),
  'Seasonal progress test team',
  'seasonal-progress-test-code',
  5,
  (SELECT viewer_id FROM seasonal_progress_fixture),
  'seasonal'
);

INSERT INTO public.team_memberships (team_id, user_id, role, game_mode)
VALUES
  (
    (SELECT team_id FROM seasonal_progress_fixture),
    (SELECT viewer_id FROM seasonal_progress_fixture),
    'owner',
    'seasonal'
  ),
  (
    (SELECT team_id FROM seasonal_progress_fixture),
    (SELECT synced_user_id FROM seasonal_progress_fixture),
    'member',
    'seasonal'
  );

GRANT SELECT ON seasonal_progress_fixture TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT synced_user_id::TEXT FROM seasonal_progress_fixture),
  TRUE
);
SELECT lives_ok(
  $$SELECT public.sync_user_game_mode_progress(
    'seasonal'::TEXT,
    4::INTEGER,
    761761::BIGINT,
    (SELECT initial_modes FROM seasonal_progress_fixture),
    (SELECT active_season FROM seasonal_progress_fixture)
  )$$,
  'an active-season all-mode sync succeeds'
);
RESET ROLE;

CREATE TEMP TABLE seasonal_progress_expected (
  game_mode TEXT NOT NULL,
  season_number SMALLINT NOT NULL,
  progress_data JSONB NOT NULL
);
INSERT INTO seasonal_progress_expected (game_mode, season_number, progress_data)
SELECT
  'pvp',
  0::SMALLINT,
  public.sanitize_user_progress_mode_data(initial_modes->'pvp')
FROM seasonal_progress_fixture
UNION ALL
SELECT
  'pve',
  0::SMALLINT,
  public.sanitize_user_progress_mode_data(initial_modes->'pve')
FROM seasonal_progress_fixture
UNION ALL
SELECT
  'seasonal',
  active_season,
  public.sanitize_user_progress_mode_data(initial_modes->'seasonal')
FROM seasonal_progress_fixture;

SELECT results_eq(
  $$SELECT game_mode, season_number, progress_data
    FROM public.user_game_mode_progress
    WHERE user_id = (SELECT synced_user_id FROM seasonal_progress_fixture)
    ORDER BY game_mode, season_number$$,
  $$SELECT game_mode, season_number, progress_data
    FROM seasonal_progress_expected
    ORDER BY game_mode, season_number$$,
  'the sync stores PvP and PvE at season zero and Seasonal at the active season'
);
SELECT is(
  (SELECT pvp_data FROM public.user_progress
   WHERE user_id = (SELECT synced_user_id FROM seasonal_progress_fixture)),
  (SELECT progress_data FROM seasonal_progress_expected WHERE game_mode = 'pvp'),
  'the legacy PvP mirror matches normalized PvP progress'
);
SELECT is(
  (SELECT pve_data FROM public.user_progress
   WHERE user_id = (SELECT synced_user_id FROM seasonal_progress_fixture)),
  (SELECT progress_data FROM seasonal_progress_expected WHERE game_mode = 'pve'),
  'the legacy PvE mirror matches normalized PvE progress'
);

CREATE TEMP TABLE seasonal_progress_snapshot AS
SELECT
  (
    SELECT jsonb_agg(to_jsonb(progress) ORDER BY progress.season_number)
    FROM public.user_game_mode_progress AS progress
    WHERE progress.user_id = fixture.synced_user_id
      AND progress.game_mode = 'seasonal'
  ) AS seasonal_rows
FROM seasonal_progress_fixture AS fixture;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT synced_user_id::TEXT FROM seasonal_progress_fixture),
  TRUE
);
SELECT lives_ok(
  $$SELECT public.sync_user_game_mode_progress(
    'pvp'::TEXT,
    9::INTEGER,
    999999::BIGINT,
    (SELECT stale_modes FROM seasonal_progress_fixture),
    ((SELECT active_season FROM seasonal_progress_fixture) - 1)::SMALLINT
  )$$,
  'a stale Seasonal entry does not abort valid persistent-mode changes'
);
RESET ROLE;

SELECT results_eq(
  $$SELECT current_game_mode, game_edition, tarkov_uid, pvp_data, pve_data
    FROM public.user_progress
    WHERE user_id = (SELECT synced_user_id FROM seasonal_progress_fixture)$$,
  $$SELECT
      'pvp'::TEXT,
      9::INTEGER,
      999999::BIGINT,
      public.sanitize_user_progress_mode_data(stale_modes->'pvp'),
      public.sanitize_user_progress_mode_data(stale_modes->'pve')
    FROM seasonal_progress_fixture$$,
  'a stale Seasonal entry still commits account metadata and both legacy mirrors'
);
SELECT results_eq(
  $$SELECT game_mode, season_number, progress_data
    FROM public.user_game_mode_progress
    WHERE user_id = (SELECT synced_user_id FROM seasonal_progress_fixture)
      AND game_mode IN ('pvp', 'pve')
    ORDER BY game_mode, season_number$$,
  $$SELECT
      'pve'::TEXT,
      0::SMALLINT,
      public.sanitize_user_progress_mode_data(stale_modes->'pve')
    FROM seasonal_progress_fixture
    UNION ALL
    SELECT
      'pvp'::TEXT,
      0::SMALLINT,
      public.sanitize_user_progress_mode_data(stale_modes->'pvp')
    FROM seasonal_progress_fixture$$,
  'a stale Seasonal entry still commits both normalized persistent modes'
);
SELECT is(
  (
    SELECT jsonb_agg(to_jsonb(progress) ORDER BY progress.season_number)
    FROM public.user_game_mode_progress AS progress
    WHERE progress.user_id = (SELECT synced_user_id FROM seasonal_progress_fixture)
      AND progress.game_mode = 'seasonal'
  ),
  (SELECT seasonal_rows FROM seasonal_progress_snapshot),
  'a stale Seasonal entry preserves the saved Seasonal row without adding another season'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT synced_user_id::TEXT FROM seasonal_progress_fixture),
  TRUE
);
SELECT lives_ok(
  $$SELECT public.sync_user_game_mode_progress(
    'pve'::TEXT,
    8::INTEGER,
    888888::BIGINT,
    (SELECT omitted_season_modes FROM seasonal_progress_fixture)
  )$$,
  'omitting the season argument does not abort valid persistent-mode changes'
);
RESET ROLE;

SELECT results_eq(
  $$SELECT current_game_mode, game_edition, tarkov_uid, pvp_data, pve_data
    FROM public.user_progress
    WHERE user_id = (SELECT synced_user_id FROM seasonal_progress_fixture)$$,
  $$SELECT
      'pve'::TEXT,
      8::INTEGER,
      888888::BIGINT,
      public.sanitize_user_progress_mode_data(omitted_season_modes->'pvp'),
      public.sanitize_user_progress_mode_data(omitted_season_modes->'pve')
    FROM seasonal_progress_fixture$$,
  'an omitted season still commits account metadata and both legacy mirrors'
);
SELECT results_eq(
  $$SELECT game_mode, season_number, progress_data
    FROM public.user_game_mode_progress
    WHERE user_id = (SELECT synced_user_id FROM seasonal_progress_fixture)
      AND game_mode IN ('pvp', 'pve')
    ORDER BY game_mode, season_number$$,
  $$SELECT
      'pve'::TEXT,
      0::SMALLINT,
      public.sanitize_user_progress_mode_data(omitted_season_modes->'pve')
    FROM seasonal_progress_fixture
    UNION ALL
    SELECT
      'pvp'::TEXT,
      0::SMALLINT,
      public.sanitize_user_progress_mode_data(omitted_season_modes->'pvp')
    FROM seasonal_progress_fixture$$,
  'an omitted season still commits both normalized persistent modes'
);
SELECT is(
  (
    SELECT jsonb_agg(to_jsonb(progress) ORDER BY progress.season_number)
    FROM public.user_game_mode_progress AS progress
    WHERE progress.user_id = (SELECT synced_user_id FROM seasonal_progress_fixture)
      AND progress.game_mode = 'seasonal'
  ),
  (SELECT seasonal_rows FROM seasonal_progress_snapshot),
  'an omitted season preserves the saved Seasonal row without adding another season'
);

SELECT set_config(
  'test.active_season_number',
  (SELECT rollover_active_season::TEXT FROM seasonal_progress_fixture),
  TRUE
);
CREATE OR REPLACE FUNCTION private.active_season_number()
RETURNS SMALLINT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT current_setting('test.active_season_number')::SMALLINT;
$$;

-- Simulate a rollover inside this transaction so the row written above is genuinely historical.
INSERT INTO public.user_game_mode_progress (user_id, game_mode, season_number, progress_data)
SELECT
  synced_user_id,
  'seasonal',
  rollover_active_season,
  '{"displayName":"Rollover Seasonal","level":44,"taskCompletions":{"rollover-task":{"complete":true}}}'::JSONB
FROM seasonal_progress_fixture;

INSERT INTO public.user_game_mode_progress (user_id, game_mode, season_number, progress_data)
SELECT
  outsider_id,
  'seasonal',
  rollover_active_season,
  '{"displayName":"Outsider Seasonal","level":88}'::JSONB
FROM seasonal_progress_fixture;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT viewer_id::TEXT FROM seasonal_progress_fixture),
  TRUE
);
SELECT results_eq(
  $$SELECT display_name, level, tasks_completed
    FROM public.team_member_mode_summary
    WHERE user_id = (SELECT synced_user_id FROM seasonal_progress_fixture)
      AND game_mode = 'seasonal'
      AND season_number = (SELECT rollover_active_season FROM seasonal_progress_fixture)$$,
  $$VALUES ('Rollover Seasonal'::TEXT, 44::INTEGER, 1::INTEGER)$$,
  'a teammate can read the active row for the shared mode'
);
SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM public.team_member_mode_summary
    WHERE user_id = (SELECT synced_user_id FROM seasonal_progress_fixture)
      AND game_mode = 'seasonal'
      AND season_number = (SELECT active_season FROM seasonal_progress_fixture)
  ),
  0,
  'a teammate cannot read a retained historical Seasonal row'
);
SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM public.team_member_mode_summary
    WHERE user_id = (SELECT synced_user_id FROM seasonal_progress_fixture)
      AND game_mode IN ('pvp', 'pve')
  ),
  0,
  'a teammate cannot read progress from a mode they do not share'
);
SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM public.team_member_mode_summary
    WHERE user_id = (SELECT outsider_id FROM seasonal_progress_fixture)
  ),
  0,
  'a teammate cannot read active progress owned by an outsider'
);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT outsider_id::TEXT FROM seasonal_progress_fixture),
  TRUE
);
SELECT is(
  (
    SELECT COUNT(*)::INTEGER
    FROM public.team_member_mode_summary
    WHERE user_id = (SELECT synced_user_id FROM seasonal_progress_fixture)
  ),
  0,
  'an outsider cannot read any teammate summary rows'
);
RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
